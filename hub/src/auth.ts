import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Database, Queryable, Row } from "./db.js";
import type { Config } from "./config.js";
import {
  accessMode,
  requireActive,
  requireEligible,
  workspaceEnabled,
} from "./beta-access.js";
import {
  ApiError,
  choice,
  fail,
  hash,
  object,
  safeEqual,
  secret,
  string,
} from "./security.js";

import { resolvePublicLimits, usageSummary } from "./limits.js";

type Provider = "github" | "x";
type Purpose = "login" | "link" | "reauth";
interface Profile {
  id: string;
  handle: string;
  displayName: string;
}
interface Services {
  owner(
    request: FastifyRequest,
    mutation?: boolean,
    allowRemoved?: boolean,
  ): Promise<Row>;
  login(
    reply: FastifyReply,
    request: FastifyRequest,
    found: Row,
    provider?: Provider | "local",
    providerUserId?: string,
  ): Promise<unknown>;
  rate(request: FastifyRequest, bucket: string, max?: number): void;
  cookieName: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
  };
}
const providerOf = (request: FastifyRequest): Provider =>
  choice(
    (request.params as Row).provider,
    ["github", "x"],
    "identity provider",
  );
const xUnavailable =
  "X sign-in is temporarily unavailable. Try again later, or use GitHub if you previously linked it to this workspace.";

export function requireRecentAuthentication(owner: Row): void {
  const at = new Date(owner.authenticated_at).getTime();
  if (
    !Number.isFinite(at) ||
    at > Date.now() + 60_000 ||
    Date.now() - at > 600_000
  )
    fail(403, "Sign in again before changing account access");
}
export function xConfigured(config: Config): boolean {
  return !!(
    config.xLoginEnabled &&
    config.xClientId &&
    config.xClientSecret &&
    config.xBudgetVerified &&
    !config.xAutoRecharge &&
    (config.xMonthlyBudgetUsd ?? 10) > 0 &&
    (config.xMonthlyBudgetUsd ?? 10) <= 10
  );
}
export async function authCapabilities(db: Database, config: Config) {
  const circuit =
    xConfigured(config) &&
    (
      await db.query(
        "SELECT provider FROM auth_provider_circuits WHERE provider='x'",
      )
    ).rows.length > 0;
  return {
    // Compatibility flag means modern workspace availability; registration is separate.
    privateBetaEnabled: workspaceEnabled(config),
    workspaceEnabled: workspaceEnabled(config),
    registrationMode: accessMode(config),
    registrationPaused: !!config.registrationPaused,
    weeklyResearchEnabled: !!config.weeklyResearchEnabled,
    localLoginEnabled: config.localLogin,
    githubLoginEnabled: !!(config.githubClientId && config.githubClientSecret),
    xLoginEnabled: xConfigured(config) && !circuit,
    xLoginUnavailable: !xConfigured(config)
      ? "not-configured"
      : circuit
        ? "provider-unavailable"
        : null,
  };
}
async function identityOwner(
  tx: Queryable,
  cfg: Config,
  provider: Provider,
  profile: Profile,
): Promise<Row> {
  // Serializes provider linking, unlinking and first-login races without matching mutable handles.
  await tx.query("SELECT pg_advisory_xact_lock(71423820)");
  let found = (
    await tx.query(
      "SELECT o.* FROM provider_identities p JOIN owners o ON o.id=p.owner_id WHERE p.provider=$1 AND p.provider_user_id=$2 FOR UPDATE OF o",
      [provider, profile.id],
    )
  ).rows[0];
  if (!found) {
    if (cfg.registrationPaused)
      fail(
        503,
        "New registrations are paused. Existing owners can still sign in.",
      );
    requireEligible(cfg, provider === "github" ? profile.id : null);
    const classification =
      provider === "github" && cfg.betaInternalGithubIds?.includes(profile.id)
        ? "internal"
        : provider === "github" && cfg.betaTestGithubIds?.includes(profile.id)
          ? "test"
          : accessMode(cfg) === "open"
            ? "self-service"
            : "invited";
    found = (
      await tx.query(
        "INSERT INTO owners(id,github_id,handle,display_name,account_classification) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          randomUUID(),
          provider === "github" ? profile.id : null,
          profile.handle,
          profile.displayName,
          classification,
        ],
      )
    ).rows[0];
    const circle = randomUUID();
    await tx.query("INSERT INTO circles(id,owner_id,name) VALUES($1,$2,$3)", [
      circle,
      found.id,
      `${profile.handle}'s circle`,
    ]);
    await tx.query(
      "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'owner')",
      [circle, found.id],
    );
  }
  requireActive(found);
  requireEligible(cfg, found.github_id);
  await tx.query(
    "INSERT INTO provider_identities(provider,provider_user_id,owner_id,handle,display_name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider,provider_user_id) DO UPDATE SET handle=EXCLUDED.handle,display_name=EXCLUDED.display_name",
    [provider, profile.id, found.id, profile.handle, profile.displayName],
  );
  return (
    await tx.query(
      "UPDATE owners SET handle=$2,display_name=$3 WHERE id=$1 RETURNING *",
      [found.id, profile.handle, profile.displayName],
    )
  ).rows[0];
}

export function registerAuth(
  app: FastifyInstance,
  db: Database,
  config: Config,
  s: Services,
) {
  const stateCookie = (provider: Provider) =>
    `${config.production ? "__Host-" : ""}${provider === "github" ? "gbs-oauth-state" : "gbs-x-oauth-state"}`;
  const verifierCookie = (provider: Provider) =>
    `${config.production ? "__Host-" : ""}gbs-${provider}-oauth-verifier`;
  const ready = async (provider: Provider) => {
    if (provider === "github") {
      if (!config.githubClientId || !config.githubClientSecret)
        fail(503, "GitHub OAuth is not configured");
    } else if (
      !xConfigured(config) ||
      (
        await db.query(
          "SELECT provider FROM auth_provider_circuits WHERE provider='x'",
        )
      ).rows.length
    )
      fail(503, xUnavailable);
  };
  const failureRedirect = (
    reply: FastifyReply,
    target: { purpose?: string; return_target?: string },
    code: string,
  ) => {
    const path =
      target.purpose && target.purpose !== "login"
        ? "/workspace/?view=account&auth="
        : target.return_target === "connect"
          ? "/connect/?auth="
          : "/workspace/?auth=";
    return reply.redirect(`${config.origin}${path}${code}`);
  };
  const start = async (
    request: FastifyRequest,
    reply: FastifyReply,
    provider: Provider,
    purpose: Purpose,
    owner?: Row,
  ) => {
    s.rate(request, `oauth-${provider}`, 30);
    const query = object(request.query ?? {}, ["return_to"]);
    const returnTarget =
      purpose === "login" && query.return_to !== undefined
        ? choice(query.return_to, ["connect"], "sign-in return destination")
        : "workspace";
    await ready(provider);
    const state = secret(),
      verifier = secret();
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM oauth_states WHERE expires_at<=now()");
      await tx.query(
        "INSERT INTO oauth_states(state_hash,expires_at,provider,purpose,owner_id,session_hash,verifier_secret_hash,return_target) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          hash(state),
          new Date(Date.now() + 600_000),
          provider,
          purpose,
          owner?.id ?? null,
          owner?.session_hash ?? null,
          hash(verifier),
          returnTarget,
        ],
      );
    });
    reply.setCookie(stateCookie(provider), state, {
      ...s.cookieOptions,
      maxAge: 600,
    });
    reply.setCookie(verifierCookie(provider), verifier, {
      ...s.cookieOptions,
      maxAge: 600,
    });
    const url = new URL(
      provider === "github"
        ? "https://github.com/login/oauth/authorize"
        : "https://x.com/i/oauth2/authorize",
    );
    url.searchParams.set(
      "client_id",
      provider === "github" ? config.githubClientId! : config.xClientId!,
    );
    url.searchParams.set(
      "redirect_uri",
      `${config.origin}/api/auth/${provider}/callback`,
    );
    url.searchParams.set("state", state);
    if (provider === "x") {
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", "tweet.read users.read");
      url.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      url.searchParams.set("code_challenge_method", "S256");
    }
    return purpose === "login" ? reply.redirect(url.href) : { url: url.href };
  };
  async function providerJson(
    provider: Provider,
    url: string,
    init: RequestInit,
  ): Promise<Row> {
    let response: Response;
    try {
      response = await config.fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return fail(
        502,
        provider === "x"
          ? xUnavailable
          : "GitHub authentication is temporarily unavailable",
      );
    }
    // Never persist the provider response or token. A confirmed credit failure opens a durable circuit.
    if (provider === "x" && response.status === 402) {
      await db.query(
        "INSERT INTO auth_provider_circuits(provider,reason) VALUES('x','provider-credit-limit') ON CONFLICT(provider) DO NOTHING",
      );
      fail(503, xUnavailable);
    }
    const readJson = async (): Promise<Row> => {
      const reader = response.body?.getReader();
      if (!reader) fail(502, "Identity provider returned an empty response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader!.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 32_768) {
            await reader!.cancel();
            fail(502, "Identity provider response exceeded its limit");
          }
          chunks.push(next.value);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          fail(502, "Identity provider response was invalid");
        return parsed;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        return fail(502, "Identity provider response was invalid");
      }
    };
    if (!response.ok) {
      if (provider === "x" && response.status === 429) {
        let problem: Row | undefined;
        try {
          problem = await readJson();
        } catch {
          /* Invalid errors never become a trusted billing signal. */
        }
        // X distinguishes a billing/usage cap from an ordinary rate limit by
        // its exact problem type. Never persist provider bodies or infer a cap
        // from free-form detail text, which may contain private information.
        if (
          [
            "https://api.x.com/2/problems/usage-capped",
            "https://api.twitter.com/2/problems/usage-capped",
          ].includes(problem?.type)
        ) {
          await db.query(
            "INSERT INTO auth_provider_circuits(provider,reason) VALUES('x','provider-usage-cap') ON CONFLICT(provider) DO NOTHING",
          );
          fail(503, xUnavailable);
        }
      }
      fail(
        502,
        provider === "x" ? xUnavailable : "GitHub authentication failed",
      );
    }
    return readJson();
  }
  const profileFor = async (
    provider: Provider,
    code: string,
    verifier: string,
  ): Promise<Profile> => {
    const redirect = `${config.origin}/api/auth/${provider}/callback`;
    const token =
      provider === "github"
        ? await providerJson(
            provider,
            "https://github.com/login/oauth/access_token",
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                client_id: config.githubClientId,
                client_secret: config.githubClientSecret,
                code,
                redirect_uri: redirect,
              }),
            },
          )
        : await providerJson(provider, "https://api.x.com/2/oauth2/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${Buffer.from(`${encodeURIComponent(config.xClientId!)}:${encodeURIComponent(config.xClientSecret!)}`).toString("base64")}`,
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirect,
              code_verifier: verifier,
            }).toString(),
          });
    if (
      typeof token.access_token !== "string" ||
      token.access_token.length > 4096
    )
      fail(502, "Identity provider authentication failed");
    const profile = await providerJson(
      provider,
      provider === "github"
        ? "https://api.github.com/user"
        : "https://api.x.com/2/users/me",
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/json",
          "User-Agent": "GrokBot-Social-Hub",
          ...(provider === "github"
            ? { "X-GitHub-Api-Version": "2022-11-28" }
            : {}),
        },
      },
    );
    delete token.access_token;
    const row = provider === "github" ? profile : profile.data;
    const validId =
      provider === "github"
        ? Number.isSafeInteger(row?.id) && row.id > 0
        : typeof row?.id === "string" && /^[1-9][0-9]{0,19}$/.test(row.id);
    const handle = provider === "github" ? row?.login : row?.username;
    if (
      !validId ||
      typeof handle !== "string" ||
      !handle ||
      handle.length > 100 ||
      (row.name != null &&
        (typeof row.name !== "string" || row.name.length > 200))
    )
      fail(502, "Identity provider profile unavailable");
    return { id: String(row.id), handle, displayName: row.name || handle };
  };
  for (const provider of ["github", "x"] as const) {
    app.get(`/api/auth/${provider}`, async (request, reply) => {
      try {
        return await start(request, reply, provider, "login");
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 503)
          return failureRedirect(
            reply,
            {
              return_target:
                (request.query as Row)?.return_to === "connect"
                  ? "connect"
                  : "workspace",
            },
            `${provider}-unavailable`,
          );
        throw error;
      }
    });
    app.get(`/api/auth/${provider}/callback`, async (request, reply) => {
      s.rate(request, `oauth-callback-${provider}`, 40);
      const query = object(request.query, [
        "code",
        "state",
        "iss",
        "error",
        "error_description",
        "error_uri",
      ]);
      if (
        query.iss !== undefined &&
        query.iss !==
          (provider === "github"
            ? "https://github.com/login/oauth"
            : "https://x.com")
      )
        fail(400, "OAuth issuer rejected");
      const state = string(query.state, "OAuth state", 100);
      const cookie = request.cookies[stateCookie(provider)];
      reply.clearCookie(stateCookie(provider), s.cookieOptions);
      reply.clearCookie(verifierCookie(provider), s.cookieOptions);
      if (!cookie || !safeEqual(state, cookie))
        fail(400, "OAuth state rejected");
      const used = (
        await db.query(
          "DELETE FROM oauth_states WHERE state_hash=$1 AND provider=$2 AND expires_at>now() RETURNING *",
          [hash(state), provider],
        )
      ).rows[0];
      if (!used) fail(400, "OAuth state expired or already used");
      const verifier = request.cookies[verifierCookie(provider)] ?? "";
      // GitHub has no PKCE secret exchange; existing clients only carrying the state cookie remain compatible.
      if (
        provider === "x" &&
        (!verifier || !safeEqual(hash(verifier), used.verifier_secret_hash))
      )
        fail(400, "OAuth verifier rejected");
      try {
        if (query.error !== undefined)
          return failureRedirect(reply, used, "denied");
        await ready(provider);
        let current: Row | undefined;
        if (used.purpose !== "login") {
          current = await s.owner(request);
          if (
            current.id !== used.owner_id ||
            current.session_hash !== used.session_hash
          )
            fail(403, "Account changed during identity approval");
          if (used.purpose === "link") requireRecentAuthentication(current);
        }
        const profile = await profileFor(
          provider,
          string(query.code, "OAuth code", 500),
          verifier,
        );
        if (used.purpose === "login") {
          let found: Row;
          try {
            found = await db.transaction((tx) =>
              identityOwner(tx, config, provider, profile),
            );
          } catch (error) {
            if (
              error instanceof ApiError &&
              error.statusCode === 403 &&
              error.message.includes("not invited")
            )
              return reply.redirect(
                `${config.origin}/workspace/?access=invitation-required`,
              );
            throw error;
          }
          await s.login(reply, request, found, provider, profile.id);
          return reply.redirect(
            used.return_target === "connect"
              ? `${config.origin}/connect/`
              : `${config.origin}/workspace`,
          );
        }
        await db.transaction(async (tx) => {
          await tx.query("SELECT pg_advisory_xact_lock(71423820)");
          const own = (
            await tx.query("SELECT * FROM owners WHERE id=$1 FOR UPDATE", [
              current!.id,
            ])
          ).rows[0];
          requireActive(own);
          const session = (
            await tx.query(
              "SELECT * FROM sessions WHERE id_hash=$1 AND owner_id=$2 AND expires_at>now() FOR UPDATE",
              [used.session_hash, own.id],
            )
          ).rows[0];
          if (!session)
            fail(401, "Sign in again before changing account access");
          const identity = (
            await tx.query(
              "SELECT * FROM provider_identities WHERE provider=$1 AND provider_user_id=$2",
              [provider, profile.id],
            )
          ).rows[0];
          if (used.purpose === "reauth") {
            if (!identity || identity.owner_id !== own.id)
              fail(
                403,
                "Sign in using a provider already linked to this workspace",
              );
            await tx.query(
              "UPDATE sessions SET authenticated_at=now(),auth_provider=$2 WHERE id_hash=$1",
              [used.session_hash, provider],
            );
          } else {
            requireRecentAuthentication(session);
            if (identity && identity.owner_id !== own.id)
              fail(409, "This sign-in identity belongs to another workspace");
            const existing = (
              await tx.query(
                "SELECT * FROM provider_identities WHERE owner_id=$1 AND provider=$2",
                [own.id, provider],
              )
            ).rows[0];
            if (existing && existing.provider_user_id !== profile.id)
              fail(
                409,
                "This workspace already has another identity from this provider",
              );
            await tx.query(
              "INSERT INTO provider_identities(provider,provider_user_id,owner_id,handle,display_name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider,provider_user_id) DO NOTHING",
              [
                provider,
                profile.id,
                own.id,
                profile.handle,
                profile.displayName,
              ],
            );
            if (provider === "github")
              await tx.query("UPDATE owners SET github_id=$2 WHERE id=$1", [
                own.id,
                profile.id,
              ]);
          }
        });
        return reply.redirect(
          `${config.origin}/workspace/?view=account&identity=${used.purpose === "link" ? "linked" : "verified"}`,
        );
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.statusCode === 502 || error.statusCode === 503)
          return failureRedirect(
            reply,
            used,
            error.message.startsWith("New registrations")
              ? "registration-paused"
              : `${provider}-unavailable`,
          );
        if (error.statusCode === 401)
          return failureRedirect(reply, used, "session-changed");
        if (error.statusCode === 409)
          return failureRedirect(reply, used, "identity-conflict");
        if (error.statusCode === 403)
          return failureRedirect(
            reply,
            used,
            error.message.startsWith("Sign-in identity changed")
              ? "identity-changed"
              : error.message.startsWith("Account access")
                ? "access-unavailable"
                : "verification-required",
          );
        throw error;
      }
    });
  }
  app.get("/api/account", async (request) => {
    const own = await s.owner(request);
    const providers = (
      await db.query(
        "SELECT provider,handle,created_at FROM provider_identities WHERE owner_id=$1 ORDER BY provider",
        [own.id],
      )
    ).rows;
    const usage = await usageSummary(
      db,
      own.id,
      resolvePublicLimits(config.publicLimits),
    );
    const oldest = (
      await db.query(
        "SELECT min(created_at) AS oldest FROM mission_admissions WHERE owner_id=$1 AND created_at>now()-interval '24 hours'",
        [own.id],
      )
    ).rows[0].oldest;
    return {
      usage: {
        ...usage,
        observedAt: new Date().toISOString(),
        oldestMissionWindowExpiresAt: oldest
          ? new Date(new Date(oldest).getTime() + 86_400_000).toISOString()
          : null,
      },
      owner: {
        id: own.id,
        handle: own.handle,
        displayName: own.display_name,
        classification: own.account_classification,
      },
      providers: providers.map((p) => ({
        provider: p.provider,
        handle: p.handle,
        linkedAt: new Date(p.created_at).toISOString(),
      })),
      authenticatedAt: new Date(own.authenticated_at).toISOString(),
      authProvider: own.auth_provider,
      ...(await authCapabilities(db, config)),
    };
  });
  app.post("/api/account/identities/:provider/link", async (request, reply) => {
    const own = await s.owner(request, true);
    requireRecentAuthentication(own);
    object(request.body ?? {}, []);
    return start(request, reply, providerOf(request), "link", own);
  });
  app.post("/api/account/reauth/:provider", async (request, reply) => {
    const own = await s.owner(request, true);
    object(request.body ?? {}, []);
    const provider = providerOf(request);
    if (
      !(
        await db.query(
          "SELECT provider FROM provider_identities WHERE provider=$1 AND owner_id=$2",
          [provider, own.id],
        )
      ).rows.length
    )
      fail(403, "Use a provider already linked to this workspace");
    return start(request, reply, provider, "reauth", own);
  });
  app.delete("/api/account/identities/:provider", async (request) => {
    const own = await s.owner(request, true);
    requireRecentAuthentication(own);
    object(request.body ?? {}, []);
    const provider = providerOf(request);
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(71423820)");
      requireActive(
        (
          await tx.query("SELECT * FROM owners WHERE id=$1 FOR UPDATE", [
            own.id,
          ])
        ).rows[0],
      );
      const session = (
        await tx.query(
          "SELECT * FROM sessions WHERE id_hash=$1 AND owner_id=$2 AND expires_at>now() FOR UPDATE",
          [own.session_hash, own.id],
        )
      ).rows[0];
      if (!session) fail(401, "Sign in again before changing account access");
      requireRecentAuthentication(session);
      const identities = (
        await tx.query(
          "SELECT provider FROM provider_identities WHERE owner_id=$1",
          [own.id],
        )
      ).rows;
      if (!identities.some((p) => p.provider === provider))
        fail(404, "Linked provider not found");
      if (identities.length <= 1)
        fail(409, "Keep at least one sign-in method linked to this workspace");
      if (provider === "github" && accessMode(config) === "restricted")
        fail(
          409,
          "Keep GitHub linked while this workspace uses restricted GitHub access",
        );
      await tx.query(
        "DELETE FROM provider_identities WHERE owner_id=$1 AND provider=$2",
        [own.id, provider],
      );
      if (provider === "github")
        await tx.query("UPDATE owners SET github_id=NULL WHERE id=$1", [
          own.id,
        ]);
      await tx.query("DELETE FROM oauth_states WHERE owner_id=$1", [own.id]);
      await tx.query("DELETE FROM sessions WHERE owner_id=$1 AND id_hash<>$2", [
        own.id,
        own.session_hash,
      ]);
    });
    return { ok: true };
  });
}
