import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import { randomUUID } from "node:crypto";
import type { Database, Queryable, Row } from "./db.js";
import type { Config } from "./config.js";
import type { Source } from "./contracts.js";
import { failMission, reconcileMissions } from "./lifecycle.js";
import {
  accessMode,
  requireActive,
  requireEligible,
  workspaceEnabled,
} from "./beta-access.js";
import {
  authCapabilities,
  registerAuth,
  requireRecentAuthentication,
} from "./auth.js";
import { registerDevice } from "./device.js";
import { registerAvatars } from "./avatars.js";
import { registerPool } from "./pool.js";
import { isIP } from "node:net";
import {
  registerAccountLifecycle,
  replayClosureJournal,
} from "./account-lifecycle.js";
import { ClosureJournal, journalBlocksBot } from "./closure-journal.js";
import { runMaintenance, measureAdmissionPressure } from "./maintenance.js";
import {
  lockAdmission,
  admitBot,
  admitMission,
  reserveParticipation,
  chargeContent,
  admitCircleJoin,
  resolvePublicLimits,
  PublicLimitError,
  assertActiveOwner,
} from "./limits.js";
import { betaApi, weeklyCapability, validateWeeklySources } from "./beta.js";
import {
  ApiError,
  choice,
  fail,
  hash,
  integer,
  loopback,
  object,
  publicUrl,
  safeEqual,
  secret,
  string,
} from "./security.js";

const id = () => randomUUID();
const iso = (value: unknown) =>
  value == null ? null : new Date(value as string).toISOString();
const ownerView = (r: Row) => ({
  id: r.id,
  handle: r.handle,
  displayName: r.display_name,
});
const botView = (r: Row) => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  role: r.role,
  runtime: r.runtime,
  status: r.status,
  trustLabel: "owner-paired" as const,
  credentialScope: r.credential_scope,
  avatarConfig: r.avatar_config ?? null,
  avatarRevision: r.avatar_revision ?? 0,
  lastSeenAt: iso(r.last_seen_at),
  createdAt: iso(r.created_at),
});
const missionView = (r: Row) => ({
  kind: r.kind ?? "research",
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  brief: r.brief,
  status: r.status,
  visibility: r.visibility,
  maxRounds: r.max_rounds,
  createdAt: iso(r.created_at),
  botIds: r.bot_ids ?? [],
});
const evidenceView = (r: Row) => ({
  id: r.id,
  ownerId: r.owner_id,
  missionId: r.mission_id,
  botId: r.bot_id,
  title: r.title,
  summary: r.summary,
  sourceUrl: r.source_url,
  sources: r.sources,
  visibility: r.visibility,
  createdAt: iso(r.created_at),
});
const evidenceHash = (r: Row) =>
  hash(
    JSON.stringify({
      id: r.id,
      title: r.title,
      summary: r.summary,
      sources: r.sources,
      sourceUrl: r.source_url,
    }),
  );
const approvalView = (r: Row) => ({
  id: r.id,
  ownerId: r.owner_id,
  evidenceId: r.evidence_id,
  circleId: r.circle_id,
  status: r.status,
  version: r.version,
  evidenceHash: r.evidence_hash,
  createdAt: iso(r.created_at),
});
const event = async (
  tx: Queryable,
  ownerId: string,
  type: string,
  message: string,
) => {
  await tx.query(
    "INSERT INTO events(id,owner_id,type,message) VALUES($1,$2,$3,$4)",
    [id(), ownerId, type, message],
  );
};
async function circleFor(
  tx: Queryable,
  ownerId: string,
  circleId?: unknown,
): Promise<string> {
  const rows = await tx.query(
    "SELECT c.id FROM circles c JOIN circle_members m ON m.circle_id=c.id WHERE m.owner_id=$1 AND m.active=true AND (($2::text IS NOT NULL AND c.id=$2) OR ($2::text IS NULL AND c.owner_id=$1)) FOR SHARE OF m",
    [ownerId, circleId ?? null],
  );
  if (!rows.rows[0]) return fail(403, "Active circle membership required");
  return rows.rows[0].id;
}
async function ensureOwner(
  tx: Queryable,
  key: string,
  handle: string,
  displayName: string,
): Promise<Row> {
  const result = await tx.query(
    "INSERT INTO owners(id,github_id,handle,display_name,account_classification) VALUES($1,$2,$3,$4,'test') ON CONFLICT(github_id) DO UPDATE SET handle=EXCLUDED.handle,display_name=EXCLUDED.display_name RETURNING *",
    [id(), key, handle, displayName],
  );
  const owner = result.rows[0];
  requireActive(owner);
  const circle = await tx.query(
    "INSERT INTO circles(id,owner_id,name) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO UPDATE SET owner_id=EXCLUDED.owner_id RETURNING id",
    [id(), owner.id, `${handle}'s circle`],
  );
  await tx.query(
    "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'owner') ON CONFLICT(circle_id,owner_id) DO NOTHING",
    [circle.rows[0].id, owner.id],
  );
  return owner;
}
async function addEvidence(
  tx: Queryable,
  input: {
    ownerId: string;
    missionId?: string;
    botId?: string;
    title: string;
    summary: string;
    sources: Source[];
    circleId?: string;
  },
): Promise<Row> {
  const result = await tx.query(
    "INSERT INTO evidence(id,owner_id,mission_id,bot_id,title,summary,source_url,sources,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'private') RETURNING *",
    [
      id(),
      input.ownerId,
      input.missionId ?? null,
      input.botId ?? null,
      input.title,
      input.summary,
      input.sources[0]?.url ?? null,
      JSON.stringify(input.sources),
    ],
  );
  const evidence = result.rows[0];
  if (input.circleId) {
    await circleFor(tx, input.ownerId, input.circleId);
    await tx.query(
      "INSERT INTO approvals(id,owner_id,evidence_id,circle_id,status,evidence_hash) VALUES($1,$2,$3,$4,'pending',$5)",
      [
        id(),
        input.ownerId,
        evidence.id,
        input.circleId,
        evidenceHash(evidence),
      ],
    );
  }
  await event(
    tx,
    input.ownerId,
    "evidence.created",
    `Saved private evidence: ${input.title}`,
  );
  return evidence;
}
function sources(value: unknown): Source[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    return fail(400, "Provide between 1 and 20 sources");
  return value.map((source) => {
    const r = object(source, ["url", "title", "accessedAt"]);
    const url = publicUrl(r.url);
    const title =
      r.title === undefined ? undefined : string(r.title, "Source title", 300);
    const accessedAt =
      r.accessedAt === undefined
        ? undefined
        : string(r.accessedAt, "Source accessedAt", 50);
    if (
      accessedAt &&
      (!/^\d{4}-\d{2}-\d{2}T/.test(accessedAt) ||
        !Number.isFinite(Date.parse(accessedAt)))
    )
      return fail(400, "Invalid source accessedAt");
    return {
      ...{ url },
      ...(title ? { title } : {}),
      ...(accessedAt ? { accessedAt } : {}),
    };
  });
}

export async function createApp(db: Database, config: Config) {
  if (
    accessMode(config) === "restricted" &&
    (!config.betaAllowedGithubIds?.length ||
      config.betaAllowedGithubIds.some((v) => !/^[1-9][0-9]{0,19}$/.test(v)))
  )
    throw new Error("Private beta requires valid numeric GitHub allowlist");
  if (
    config.localLogin &&
    (config.production ||
      !loopback(config.host) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(
        new URL(config.origin).hostname,
      ))
  )
    throw new Error("Unsafe local login configuration");
  if ((config.trustedProxyIps ?? []).some((ip) => !isIP(ip)))
    throw new Error("Trusted proxies must be exact IP addresses");
  const publicLimits = resolvePublicLimits(config.publicLimits);
  if (config.production && !config.closureJournalDir)
    throw new Error("Production requires persistent closure journal storage");
  const closureJournal = config.closureJournalDir
    ? new ClosureJournal(
        config.closureJournalDir,
        config.production || process.platform !== "win32",
      )
    : undefined;
  // A restored database is never exposed before durable erasure/revocation
  // intents have been replayed. Any corrupt/unavailable journal stops startup.
  if (closureJournal) await replayClosureJournal(db, closureJournal);
  const app = Fastify({
    logger: false,
    trustProxy: (address, hop) =>
      hop === 0 &&
      (config.trustedProxyIps ?? []).some(
        (ip) => ip === address || `::ffff:${ip}` === address,
      ),
    bodyLimit: 100_000,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(cookie);
  if (config.production)
    app.addHook("onResponse", async (request, reply) => {
      // Route templates only: never log URL queries, cookies, tokens, IDs or bodies.
      console.info(
        JSON.stringify({
          event: "http.request",
          method: request.method,
          route: request.routeOptions.url ?? "unmatched",
          status: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime),
        }),
      );
    });
  let reconciliation: Promise<void> | undefined;
  const reconcile = () =>
    (reconciliation ??= reconcileMissions(db, config.maxAttempts).finally(
      () => {
        reconciliation = undefined;
      },
    ));
  const reconcileTimer = setInterval(() => {
    void reconcile().catch(() =>
      console.error("Hub lease reconciliation failed"),
    );
  }, 30_000);
  reconcileTimer.unref();
  let maintenance: Promise<unknown> | undefined;
  const maintenanceTimer = setInterval(() => {
    maintenance ??= (async () => {
      if (closureJournal) await replayClosureJournal(db, closureJournal, true);
      return runMaintenance(db, {
        contentRetentionDays: config.poolContentRetentionDays,
        reportRetentionDays: config.poolReportRetentionDays,
        ...(config.production
          ? { admissionPaused: await measureAdmissionPressure() }
          : {}),
      });
    })()
      .catch(() => console.error("Hub maintenance failed"))
      .finally(() => {
        maintenance = undefined;
      });
  }, 60_000);
  maintenanceTimer.unref();
  app.addHook("onClose", async () => {
    clearInterval(reconcileTimer);
    clearInterval(maintenanceTimer);
    await reconciliation;
    await maintenance;
  });
  const cookieName = config.production ? "__Host-gbs-session" : "gbs-session";
  const cookieOptions = {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax" as const,
    path: "/",
  };
  const limits = new Map<string, { count: number; expires: number }>();
  const rate = (request: FastifyRequest, bucket: string, max = 60) => {
    const now = Date.now();
    if (limits.size > 10000) {
      for (const [k, v] of limits) if (v.expires < now) limits.delete(k);
      if (limits.size > 10000) return fail(429, "Try again later");
    }
    const key =
      bucket.startsWith("owner:") || bucket.startsWith("bot:")
        ? bucket
        : `${bucket}:${request.ip}`;
    let value = limits.get(key);
    if (!value || value.expires < now) {
      value = { count: 0, expires: now + 15 * 60_000 };
      limits.set(key, value);
    }
    if (++value.count > max) return fail(429, "Try again later");
  };
  const checkOrigin = (request: FastifyRequest) => {
    if (request.headers.origin !== config.origin)
      return fail(403, "Origin rejected");
    if (
      request.body !== undefined &&
      !request.headers["content-type"]?.startsWith("application/json")
    )
      return fail(415, "Use application/json");
  };
  async function owner(
    request: FastifyRequest,
    mutation = false,
    allowRemoved = false,
  ): Promise<Row> {
    const token = request.cookies[cookieName];
    if (!token) return fail(401, "Owner login required");
    const result = await db.query(
      "SELECT o.*,s.csrf_token,s.authenticated_at,s.auth_provider,s.id_hash AS session_hash FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.id_hash=$1 AND s.expires_at>now()",
      [hash(token)],
    );
    const found = result.rows[0];
    if (!found) return fail(401, "Owner login required");
    if (!allowRemoved) {
      requireActive(found);
      requireEligible(config, found.github_id);
    }
    rate(request, `owner:${found.id}`, 3000);
    if (mutation) {
      checkOrigin(request);
      const csrf = request.headers["x-csrf-token"];
      if (typeof csrf !== "string" || !safeEqual(csrf, found.csrf_token))
        return fail(403, "CSRF token rejected");
    }
    return found;
  }
  async function bot(
    request: FastifyRequest,
    scope: "private" | "public" = "private",
  ): Promise<Row> {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer gbs_") || auth.length > 200)
      return fail(401, "Bot token required");
    const result = await db.query(
      "SELECT b.*,o.github_id,o.status AS owner_status FROM bots b JOIN owners o ON o.id=b.owner_id WHERE b.token_hash=$1",
      [hash(auth.slice(7))],
    );
    const found = result.rows[0];
    if (!found || found.status === "revoked" || journalBlocksBot(found.id))
      return fail(401, "Bot token invalid or revoked");
    requireActive(found);
    requireEligible(config, found.github_id);
    if (found.status !== "active") return fail(409, "Bot is paused");
    if (scope === "private" && found.credential_scope === "pool-only")
      return fail(403, "This credential is limited to public pool APIs");
    rate(request, `bot:${found.id}`, 1800);
    return found;
  }
  async function lockedBot(
    tx: Queryable,
    authenticated: Row,
    scope: "private" | "public" = "private",
  ): Promise<Row> {
    requireActive(
      (
        await tx.query("SELECT * FROM owners WHERE id=$1 FOR SHARE", [
          authenticated.owner_id,
        ])
      ).rows[0],
    );
    const result = await tx.query(
      "SELECT b.*,o.github_id,o.status AS owner_status FROM bots b JOIN owners o ON o.id=b.owner_id WHERE b.id=$1 AND b.token_hash=$2 AND b.token_generation=$3 FOR UPDATE OF b",
      [
        authenticated.id,
        authenticated.token_hash,
        authenticated.token_generation,
      ],
    );
    const found = result.rows[0];
    if (!found || found.status === "revoked" || journalBlocksBot(found.id))
      return fail(401, "Bot token invalid or revoked");
    requireActive(found);
    requireEligible(config, found.github_id);
    if (found.status !== "active") return fail(409, "Bot is paused");
    if (scope === "private" && found.credential_scope === "pool-only")
      return fail(403, "This credential is limited to public pool APIs");
    return found;
  }
  async function login(
    reply: FastifyReply,
    current: FastifyRequest,
    found: Row,
    provider: "github" | "x" | "local" = "local",
    providerUserId?: string,
  ) {
    requireActive(found);
    requireEligible(config, found.github_id);
    const token = secret();
    const csrf = secret();
    await db.transaction(async (tx) => {
      // Match unlink/link/closure lock ordering; no session may outlive a removed identity.
      await lockAdmission(tx);
      const active = (
        await tx.query("SELECT * FROM owners WHERE id=$1 FOR UPDATE", [
          found.id,
        ])
      ).rows[0];
      requireActive(active);
      requireEligible(config, active.github_id);
      if (provider !== "local") {
        const identity =
          providerUserId &&
          (
            await tx.query(
              "SELECT provider FROM provider_identities WHERE provider=$1 AND provider_user_id=$2 AND owner_id=$3",
              [provider, providerUserId, active.id],
            )
          ).rows[0];
        if (!identity)
          fail(
            403,
            "Sign-in identity changed. Use a currently linked provider and try again.",
          );
      }
      if (current.cookies[cookieName])
        await tx.query("DELETE FROM sessions WHERE id_hash=$1", [
          hash(current.cookies[cookieName]!),
        ]);
      await tx.query(
        "INSERT INTO sessions(id_hash,owner_id,csrf_token,expires_at,auth_provider) VALUES($1,$2,$3,$4,$5)",
        [
          hash(token),
          found.id,
          csrf,
          new Date(Date.now() + config.sessionHours * 3600000),
          provider,
        ],
      );
    });
    reply.setCookie(cookieName, token, {
      ...cookieOptions,
      maxAge: config.sessionHours * 3600,
    });
    return {
      authenticated: true,
      ...(await authCapabilities(db, config)),
      weeklyResearchEnabled: !!config.weeklyResearchEnabled,
      owner: ownerView(found),
      csrfToken: csrf,
      localLoginEnabled: config.localLogin,
      githubLoginEnabled: !!(
        config.githubClientId && config.githubClientSecret
      ),
    };
  }
  app.addHook("onRequest", async (request) => {
    rate(request, "all-requests", 12000);
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY");
    return payload;
  });
  app.setErrorHandler((caught, request, reply) => {
    const error = caught as Error & { statusCode?: number };
    const code =
      error instanceof ApiError
        ? error.statusCode
        : typeof error.statusCode === "number" && error.statusCode < 500
          ? error.statusCode
          : 500;
    if (code === 500)
      console.error("Hub request failed", request.id, error.name);
    if (error instanceof PublicLimitError)
      reply.header("Retry-After", error.retryAfterSeconds);
    reply.code(code).send({
      error: code === 500 ? "Internal server error" : error.message,
      ...(error instanceof PublicLimitError
        ? { code: error.code, retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    });
  });
  const beta = betaApi(db, config, {
    owner,
    reconcile,
    circleFor,
    missionView,
    evidenceView,
    evidenceHash,
    ownerView,
    botView,
    approvalView,
  });
  beta.register(app);
  app.get("/health", async () => {
    await db.query("SELECT 1");
    return { ok: true, service: "grokbot-social-hub", database: db.kind };
  });
  app.get("/api/session", async (request) => {
    try {
      const found = await owner(request);
      return {
        authenticated: true,
        ...(await authCapabilities(db, config)),
        weeklyResearchEnabled: !!config.weeklyResearchEnabled,
        owner: ownerView(found),
        csrfToken: found.csrf_token,
        localLoginEnabled: config.localLogin,
        githubLoginEnabled: !!(
          config.githubClientId && config.githubClientSecret
        ),
      };
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.statusCode))
        return {
          authenticated: false,
          accessDenied: error.statusCode === 403,
          ...(await authCapabilities(db, config)),
          weeklyResearchEnabled: !!config.weeklyResearchEnabled,
          localLoginEnabled: config.localLogin,
          githubLoginEnabled: !!(
            config.githubClientId && config.githubClientSecret
          ),
        };
      throw error;
    }
  });
  app.post("/api/auth/local", async (request, reply) => {
    if (!config.localLogin || !loopback(request.ip))
      return fail(404, "Not found");
    checkOrigin(request);
    rate(request, "local-auth", 20);
    object(request.body ?? {}, []);
    const found = await db.transaction((tx) =>
      ensureOwner(
        tx,
        `local:${config.localOwner}`,
        config.localOwner,
        "Local developer",
      ),
    );
    return login(reply, request, found);
  });
  app.post("/api/auth/logout", async (request, reply) => {
    checkOrigin(request);
    // Removing access must not strand the browser with an uncleared cookie.
    // Still enforce CSRF for eligible live sessions.
    try {
      await owner(request, true);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.statusCode !== 401) {
        const found = await owner(request, false, true);
        try {
          requireEligible(config, found.github_id);
          throw error;
        } catch (eligibility) {
          if (
            !(eligibility instanceof ApiError) ||
            eligibility.message !==
              "This GitHub account is not invited to the private beta"
          )
            throw eligibility;
        }
      }
    }
    await db.query("DELETE FROM sessions WHERE id_hash=$1", [
      hash(request.cookies[cookieName] ?? ""),
    ]);
    reply.clearCookie(cookieName, cookieOptions);
    return { ok: true };
  });
  registerAuth(app, db, config, {
    owner,
    login,
    rate,
    cookieName,
    cookieOptions,
  });
  registerDevice(app, db, config, { owner, checkOrigin, rate, botView, event });
  registerAvatars(app, db, owner);
  registerPool(
    app,
    db,
    config,
    {
      owner,
      bot: (request) => bot(request, "public"),
      lockedBot: (tx, authenticated) => lockedBot(tx, authenticated, "public"),
      rate,
    },
    closureJournal,
  );
  registerAccountLifecycle(
    app,
    db,
    config,
    {
      owner,
      checkOrigin,
      requireRecentAuthentication,
      cookieName,
      cookieOptions,
    },
    closureJournal,
  );

  app.get("/api/workspace", async (request) => {
    const found = await owner(request);
    await reconcile();
    const own = found.id;
    const [bots, missions, evidence, approvals, events, circles] =
      await Promise.all([
        db.query(
          "SELECT * FROM bots WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
          [own],
        ),
        db.query(
          "SELECT m.*,ARRAY(SELECT DISTINCT bot_id FROM tasks WHERE mission_id=m.id) AS bot_ids FROM missions m WHERE owner_id=$1 OR EXISTS(SELECT 1 FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE t.mission_id=m.id AND b.owner_id=$1 AND EXISTS(SELECT 1 FROM circle_members cm WHERE cm.circle_id=m.circle_id AND cm.owner_id=$1 AND cm.active=true)) ORDER BY created_at DESC LIMIT 100",
          [own],
        ),
        db.query(
          "SELECT * FROM evidence WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
          [own],
        ),
        db.query(
          "SELECT * FROM approvals WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
          [own],
        ),
        db.query(
          "SELECT * FROM events WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
          [own],
        ),
        db.query(
          "SELECT c.id,c.name,m.role FROM circles c JOIN circle_members m ON m.circle_id=c.id WHERE m.owner_id=$1 AND m.active=true",
          [own],
        ),
      ]);
    return {
      owner: ownerView(found),
      bots: bots.rows.map(botView),
      missions: missions.rows.map(missionView),
      evidence: evidence.rows.map(evidenceView),
      approvals: approvals.rows.map(approvalView),
      events: events.rows.map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        createdAt: iso(r.created_at),
      })),
      circles: circles.rows,
    };
  });
  app.post("/api/pairings", async (request) => {
    const found = await owner(request, true);
    object(request.body ?? {}, []);
    rate(request, "pair-create", 60);
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const code = secret(24);
      const expiresAt = new Date(Date.now() + config.pairingMinutes * 60000);
      await tx.query(
        "INSERT INTO pairings(code_hash,owner_id,expires_at) VALUES($1,$2,$3)",
        [hash(code), found.id, expiresAt],
      );
      return { code, expiresAt: expiresAt.toISOString() };
    });
  });
  app.post("/api/bot/pair", async (request) => {
    rate(request, "pair-consume", 60);
    const body = object(request.body, ["code", "name", "role", "runtime"]);
    const code = string(body.code, "Pairing code", 100);
    const name = string(body.name, "Bot name", 100);
    const role = choice(body.role, ["scout", "delegate"], "role");
    const runtime = choice(
      body.runtime,
      ["native-grok", "grok-compatible", "external-agent"],
      "runtime",
    );
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      const pairing = await tx.query(
        "UPDATE pairings SET consumed_at=now() WHERE code_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING owner_id",
        [hash(code)],
      );
      if (!pairing.rows[0])
        return fail(400, "Pairing code invalid, expired or already used");
      const pairingOwner = await tx.query(
        "SELECT * FROM owners WHERE id=$1 FOR UPDATE",
        [pairing.rows[0].owner_id],
      );
      requireActive(pairingOwner.rows[0]);
      requireEligible(config, pairingOwner.rows[0]?.github_id);
      await admitBot(tx, pairingOwner.rows[0].id, publicLimits);
      const reservations = (
        await tx.query(
          "SELECT count(*)::integer AS total FROM device_enrollments WHERE owner_id=$1 AND status='approved' AND reconnect_bot_id IS NULL AND expires_at>now()",
          [pairingOwner.rows[0].id],
        )
      ).rows[0].total;
      const connected = (
        await tx.query(
          "SELECT count(*)::integer AS total FROM bots WHERE owner_id=$1 AND status<>'revoked'",
          [pairingOwner.rows[0].id],
        )
      ).rows[0].total;
      if (reservations + connected >= publicLimits.botsPerOwner)
        fail(
          409,
          "All Bot connection slots are occupied or awaiting approval completion",
        );
      const token = `gbs_${secret()}`;
      const result = await tx.query(
        "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,$3,$4,$5,'active',$6) RETURNING *",
        [id(), pairing.rows[0].owner_id, name, role, runtime, hash(token)],
      );
      await event(
        tx,
        pairing.rows[0].owner_id,
        "bot.paired",
        `Owner paired ${name}; runtime is self-reported`,
      );
      return { token, bot: botView(result.rows[0]) };
    });
  });
  app.post("/api/bot/heartbeat", async (request) => {
    const authenticated = await bot(request, "public");
    const body = object(request.body ?? {}, ["version", "capabilities"]);
    if (body.version !== undefined) string(body.version, "Version", 100);
    if (body.capabilities !== undefined) {
      if (!Array.isArray(body.capabilities) || body.capabilities.length > 20)
        return fail(400, "Invalid capabilities");
      for (const cap of body.capabilities) string(cap, "Capability", 100);
    }
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await lockedBot(tx, authenticated, "public");
      const result = await tx.query(
        "UPDATE bots SET last_seen_at=now() WHERE id=$1 RETURNING *",
        [authenticated.id],
      );
      return {
        ok: true,
        bot: botView(result.rows[0]),
        serverTime: new Date().toISOString(),
      };
    });
  });
  for (const action of ["pause", "revoke"] as const)
    app.post(`/api/bots/:id/${action}`, async (request) => {
      const found = await owner(request, true);
      object(request.body ?? {}, []);
      const botId = string((request.params as Row).id, "Bot id", 100);
      if (action === "revoke" && closureJournal) {
        const owned = (
          await db.query("SELECT id FROM bots WHERE id=$1 AND owner_id=$2", [
            botId,
            found.id,
          ])
        ).rows[0];
        if (!owned) fail(404, "Bot not found");
        await closureJournal.append("bot-revoke", found.id, botId);
      }
      return db.transaction(async (tx) => {
        await lockAdmission(tx);
        await assertActiveOwner(tx, found.id);
        const result = await tx.query(
          "UPDATE bots SET status=$1 WHERE id=$2 AND owner_id=$3 AND (status<>'revoked' OR $1='revoked') RETURNING *",
          [action === "pause" ? "paused" : "revoked", botId, found.id],
        );
        if (!result.rows[0]) return fail(404, "Bot not found");
        await tx.query(
          "UPDATE pool_leases SET status='cancelled' WHERE bot_id=$1 AND status='leased'",
          [botId],
        );
        if (action === "revoke") {
          const missions = await tx.query(
            "SELECT m.* FROM missions m WHERE m.status IN ('queued','running') AND EXISTS(SELECT 1 FROM tasks t WHERE t.mission_id=m.id AND t.bot_id=$1 AND t.status IN ('queued','leased')) ORDER BY m.id FOR UPDATE OF m",
            [botId],
          );
          for (const mission of missions.rows)
            await failMission(tx, mission, "A participating bot was revoked");
        }
        await event(
          tx,
          found.id,
          `bot.${action}`,
          `${action === "pause" ? "Paused" : "Revoked"} ${result.rows[0].name}`,
        );
        return { bot: botView(result.rows[0]) };
      });
    });
  app.post("/api/bots/:id/resume", async (request) => {
    const found = await owner(request, true);
    object(request.body ?? {}, []);
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const result = await tx.query(
        "UPDATE bots SET status='active' WHERE id=$1 AND owner_id=$2 AND status='paused' RETURNING *",
        [(request.params as Row).id, found.id],
      );
      if (!result.rows[0]) return fail(404, "Paused bot not found");
      return { bot: botView(result.rows[0]) };
    });
  });

  app.post("/api/missions", async (request) => {
    if ((request.body as Row | undefined)?.kind === "weekly-decision")
      return beta.createWeekly(request);
    const found = await owner(request, true);
    const body = object(request.body, [
      "title",
      "brief",
      "botIds",
      "visibility",
      "maxRounds",
      "circleId",
    ]);
    const title = string(body.title, "Title", 200);
    const brief = string(body.brief, "Brief", 12000);
    const visibility = choice(
      body.visibility,
      ["private", "circle"],
      "visibility",
    );
    const maxRounds = integer(body.maxRounds, 1, 5, "maxRounds");
    if (
      !Array.isArray(body.botIds) ||
      body.botIds.length < 1 ||
      body.botIds.length > 10 ||
      new Set(body.botIds).size !== body.botIds.length
    )
      return fail(400, "Provide between 1 and 10 unique bot ids");
    const botIds = body.botIds.map((value) => string(value, "Bot id", 100));
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const bots = await tx.query(
        "SELECT id FROM bots WHERE id=ANY($1::text[]) AND owner_id=$2 AND status='active' AND credential_scope='legacy-private' ORDER BY id FOR UPDATE",
        [botIds, found.id],
      );
      if (bots.rows.length !== botIds.length)
        return fail(404, "Active owner bots not found");
      const circleId =
        visibility === "circle"
          ? await circleFor(tx, found.id, body.circleId)
          : null;
      const missionId = id();
      await admitMission(
        tx,
        found.id,
        missionId,
        botIds.length * maxRounds,
        Buffer.byteLength(JSON.stringify(body)),
        publicLimits,
      );
      const mission = await tx.query(
        "INSERT INTO missions(id,owner_id,title,brief,status,visibility,circle_id,max_rounds) VALUES($1,$2,$3,$4,'queued',$5,$6,$7) RETURNING *",
        [missionId, found.id, title, brief, visibility, circleId, maxRounds],
      );
      for (let round = 1; round <= maxRounds; round++)
        for (const botId of botIds)
          await tx.query(
            "INSERT INTO tasks(id,mission_id,bot_id,round,status) VALUES($1,$2,$3,$4,'queued')",
            [id(), mission.rows[0].id, botId, round],
          );
      await tx.query(
        "INSERT INTO mission_measurement_snapshots(mission_id,snapshot) VALUES($1,$2)",
        [
          mission.rows[0].id,
          JSON.stringify(await beta.measurement(tx, found, "unknown")),
        ],
      );
      await event(tx, found.id, "mission.created", `Created mission: ${title}`);
      return { mission: missionView({ ...mission.rows[0], bot_ids: botIds }) };
    });
  });
  app.post("/api/missions/:id/participate", async (request) => {
    const found = await owner(request, true);
    await reconcile();
    const body = object(request.body, ["botId"]);
    const botId = string(body.botId, "Bot id", 100);
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const ownBot = (
        await tx.query(
          "SELECT * FROM bots WHERE id=$1 AND owner_id=$2 AND status='active' AND credential_scope='legacy-private' FOR UPDATE",
          [botId, found.id],
        )
      ).rows[0];
      if (!ownBot) return fail(404, "Active owner bot not found");
      const visible = (
        await tx.query(
          "SELECT circle_id FROM missions WHERE id=$1 AND visibility='circle'",
          [(request.params as Row).id],
        )
      ).rows[0];
      if (!visible) return fail(404, "Circle mission not found");
      await circleFor(tx, found.id, visible.circle_id);
      const mission = (
        await tx.query(
          "SELECT * FROM missions WHERE id=$1 AND visibility='circle' FOR UPDATE",
          [(request.params as Row).id],
        )
      ).rows[0];
      if (!mission) return fail(404, "Circle mission not found");
      if (!["queued", "running"].includes(mission.status))
        return fail(409, "Mission is terminal");
      const participants = await tx.query(
        "SELECT DISTINCT bot_id FROM tasks WHERE mission_id=$1",
        [mission.id],
      );
      if (participants.rows.some((row) => row.bot_id === botId))
        return { missionId: mission.id, botId, joined: true, replayed: true };
      if (participants.rows.length >= 10)
        return fail(409, "Mission already has ten participating bots");
      await reserveParticipation(
        tx,
        found.id,
        mission.id,
        mission.max_rounds,
        publicLimits,
      );
      for (let round = 1; round <= mission.max_rounds; round++)
        await tx.query(
          "INSERT INTO tasks(id,mission_id,bot_id,round,status) VALUES($1,$2,$3,$4,'queued')",
          [id(), mission.id, botId, round],
        );
      await event(
        tx,
        found.id,
        "mission.joined",
        `Opted ${ownBot.name} into circle mission: ${mission.title}`,
      );
      return { missionId: mission.id, botId, joined: true, replayed: false };
    });
  });
  app.post("/api/missions/:id/cancel", async (request) => {
    const found = await owner(request, true);
    object(request.body ?? {}, []);
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const mission = (
        await tx.query(
          "SELECT * FROM missions WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [(request.params as Row).id, found.id],
        )
      ).rows[0];
      if (!mission) return fail(404, "Mission not found");
      if (["queued", "running"].includes(mission.status)) {
        await tx.query("UPDATE missions SET status='cancelled' WHERE id=$1", [
          mission.id,
        ]);
        await tx.query(
          "UPDATE tasks SET status='failed',attempt_id=NULL,lease_expires_at=NULL WHERE mission_id=$1 AND status IN ('queued','leased')",
          [mission.id],
        );
        await event(
          tx,
          found.id,
          "mission.cancelled",
          `Owner cancelled mission: ${mission.title}`,
        );
        mission.status = "cancelled";
      }
      return { mission: missionView(mission) };
    });
  });
  app.get("/api/missions/:id", async (request) => {
    const found = await owner(request);
    await reconcile();
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await beta.lockMemberships(tx, found.id);
      const mission = (
        await tx.query(
          "SELECT m.*,ARRAY(SELECT DISTINCT bot_id FROM tasks WHERE mission_id=m.id) AS bot_ids FROM missions m WHERE id=$1",
          [(request.params as Row).id],
        )
      ).rows[0];
      if (!mission) return fail(404, "Mission not found");
      if (mission.owner_id !== found.id) {
        if (mission.visibility !== "circle")
          return fail(404, "Mission not found");
        await circleFor(tx, found.id, mission.circle_id);
      }
      const tasks = await tx.query(
        "SELECT t.id,t.bot_id,t.round,t.status,t.attempts,t.lease_expires_at FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE t.mission_id=$1 AND ($2=$3 OR b.owner_id=$2) ORDER BY t.round,t.id",
        [mission.id, found.id, mission.owner_id],
      );
      const evidence = await tx.query(
        "SELECT * FROM evidence WHERE mission_id=$1 AND owner_id=$2",
        [mission.id, found.id],
      );
      return {
        ...(workspaceEnabled(config)
          ? await beta.detail(tx, found.id, mission, tasks.rows)
          : {}),
        mission: missionView(mission),
        tasks: tasks.rows.map((r) => ({
          id: r.id,
          botId: r.bot_id,
          round: r.round,
          status: r.status,
          attempts: r.attempts,
          leaseExpiresAt: iso(r.lease_expires_at),
        })),
        evidence: evidence.rows.map(evidenceView),
      };
    });
  });
  app.get("/api/bot/inbox", async (request) => {
    const authenticated = await bot(request);
    const supportsWeekly = weeklyCapability(request);
    await reconcile();
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      const active = await lockedBot(tx, authenticated);
      const candidate = await tx.query(
        "SELECT t.id,t.mission_id,t.round,m.title,m.brief FROM tasks t JOIN missions m ON m.id=t.mission_id WHERE t.bot_id=$1 AND t.status='queued' AND t.attempts<$2 AND m.status IN ('queued','running') AND m.created_at>now()-interval '24 hours' AND (m.kind='research' OR $4::boolean) AND (m.visibility='private' OR EXISTS(SELECT 1 FROM circle_members cm WHERE cm.circle_id=m.circle_id AND cm.owner_id=$3 AND cm.active=true)) AND NOT EXISTS (SELECT 1 FROM tasks earlier WHERE earlier.mission_id=t.mission_id AND earlier.round<t.round AND earlier.status<>'completed') AND NOT EXISTS (SELECT 1 FROM tasks running WHERE running.bot_id=$1 AND running.status='leased') ORDER BY m.created_at,t.round,t.id LIMIT 1",
        [active.id, config.maxAttempts, active.owner_id, supportsWeekly],
      );
      if (!candidate.rows[0]) return { bot: botView(active), tasks: [] };
      const task = candidate.rows[0];
      await beta.lockMemberships(tx, active.owner_id);
      const scope = (
        await tx.query(
          "SELECT visibility,circle_id FROM missions WHERE id=$1",
          [task.mission_id],
        )
      ).rows[0];
      if (scope.visibility === "circle")
        await circleFor(tx, active.owner_id, scope.circle_id);
      const missionRow = (
        await tx.query(
          "SELECT visibility,circle_id FROM missions WHERE id=$1 AND status IN ('queued','running') AND created_at>now()-interval '24 hours' FOR UPDATE",
          [task.mission_id],
        )
      ).rows[0];
      if (!missionRow) return { bot: botView(active), tasks: [] };
      const claimable = await tx.query(
        "SELECT id FROM tasks WHERE id=$1 AND status='queued' AND attempts<$2 AND NOT EXISTS(SELECT 1 FROM tasks earlier WHERE earlier.mission_id=$3 AND earlier.round<$4 AND earlier.status<>'completed') FOR UPDATE",
        [task.id, config.maxAttempts, task.mission_id, task.round],
      );
      if (!claimable.rows.length) return { bot: botView(active), tasks: [] };
      const attemptId = id();
      const weeklyContext = await beta.context(
        tx,
        active.owner_id,
        task.mission_id,
      );
      if (weeklyContext && !supportsWeekly)
        return { bot: botView(active), tasks: [] };
      const leaseExpiresAt = new Date(Date.now() + config.leaseSeconds * 1000);
      await tx.query(
        "UPDATE tasks SET status='leased',attempts=attempts+1,attempt_id=$2,lease_expires_at=$3 WHERE id=$1",
        [task.id, attemptId, leaseExpiresAt],
      );
      await tx.query(
        "UPDATE missions SET status='running' WHERE id=$1 AND status IN ('queued','running')",
        [task.mission_id],
      );
      await tx.query("UPDATE bots SET last_seen_at=now() WHERE id=$1", [
        active.id,
      ]);
      const contextRows = await tx.query(
        "SELECT * FROM evidence WHERE (owner_id=$1 AND mission_id=$2) OR ($3::text IS NOT NULL AND circle_id=$3 AND visibility='circle') ORDER BY CASE WHEN mission_id=$2 THEN 0 ELSE 1 END,created_at DESC,id LIMIT 30",
        [
          active.owner_id,
          task.mission_id,
          missionRow.visibility === "circle" ? missionRow.circle_id : null,
        ],
      );
      const contextEvidence: Row[] = [];
      let contextBytes = 2; // JSON array brackets; include commas below.
      for (const row of contextRows.rows) {
        let contextSources: Source[];
        try {
          contextSources = sources(row.sources);
          if (weeklyContext)
            validateWeeklySources({ input: weeklyContext }, contextSources);
        } catch (error) {
          // Stored records may predate the current adapter source policy.
          // Omit incompatible context rather than returning a poisoned lease.
          if (error instanceof ApiError) continue;
          throw error;
        }
        const item = {
          id: row.id,
          missionId: row.mission_id,
          botId: row.bot_id,
          title: row.title,
          summary: row.summary,
          sources: contextSources,
          visibility: row.visibility,
          provenance:
            row.owner_id === active.owner_id &&
            row.mission_id === task.mission_id
              ? "own-mission-result"
              : "circle-published",
          createdAt: iso(row.created_at),
        };
        const bytes =
          Buffer.byteLength(JSON.stringify(item), "utf8") +
          (contextEvidence.length ? 1 : 0);
        if (contextBytes + bytes > 750_000) continue;
        contextEvidence.push(item);
        contextBytes += bytes;
        if (contextEvidence.length === 10) break;
      }
      return {
        bot: botView(active),
        tasks: [
          {
            id: task.id,
            missionId: task.mission_id,
            title: task.title,
            brief: task.brief,
            round: task.round,
            attemptId,
            leaseExpiresAt: leaseExpiresAt.toISOString(),
            contextEvidence,
            ...(weeklyContext ? { weeklyContext } : {}),
          },
        ],
      };
    });
  });
  app.post("/api/bot/tasks/:id/result", async (request) => {
    const authenticated = await bot(request);
    await reconcile();
    const body = object(request.body, [
      "attemptId",
      "idempotencyKey",
      "contribution",
    ]);
    const attemptId = string(body.attemptId, "attemptId", 128);
    const idempotencyKey = string(body.idempotencyKey, "idempotencyKey", 128);
    if (
      !/^[A-Za-z0-9_-]+$/.test(attemptId) ||
      !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
    )
      return fail(400, "Invalid result identifiers");
    const contribution = object(body.contribution, [
      "type",
      "title",
      "summary",
      "sources",
    ]);
    choice(contribution.type, ["research"], "contribution type");
    const title = string(contribution.title, "Title", 200);
    const summary = string(contribution.summary, "Summary", 12000);
    const refs = sources(contribution.sources);
    const resultHash = hash(
      JSON.stringify({
        attemptId,
        idempotencyKey,
        title,
        summary,
        sources: refs,
      }),
    );
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      const active = await lockedBot(tx, authenticated);
      const assigned = (
        await tx.query(
          "SELECT t.mission_id,m.visibility,m.circle_id FROM tasks t JOIN missions m ON m.id=t.mission_id WHERE t.id=$1 AND t.bot_id=$2",
          [(request.params as Row).id, active.id],
        )
      ).rows[0];
      if (!assigned) return fail(404, "Task not found");
      const weekly = (
        await tx.query(
          "SELECT * FROM weekly_mission_inputs WHERE mission_id=$1",
          [assigned.mission_id],
        )
      ).rows[0];
      validateWeeklySources(weekly, refs);
      if (assigned.visibility === "circle")
        await circleFor(tx, active.owner_id, assigned.circle_id);
      await tx.query("SELECT id FROM missions WHERE id=$1 FOR UPDATE", [
        assigned.mission_id,
      ]);
      const result = await tx.query(
        "SELECT t.*,m.owner_id,m.visibility,m.circle_id,m.status AS mission_status FROM tasks t JOIN missions m ON m.id=t.mission_id WHERE t.id=$1 AND t.bot_id=$2 FOR UPDATE OF t",
        [(request.params as Row).id, active.id],
      );
      const task = result.rows[0];
      if (!task) return fail(404, "Task not found");
      if (
        task.status === "completed" &&
        task.attempt_id === attemptId &&
        task.idempotency_key === idempotencyKey &&
        task.result_hash === resultHash
      )
        return {
          ok: true,
          taskId: task.id,
          evidenceId: task.evidence_id,
          status: "completed",
          replayed: true,
        };
      if (
        task.status !== "leased" ||
        task.attempt_id !== attemptId ||
        new Date(task.lease_expires_at).getTime() <= Date.now() ||
        !["queued", "running"].includes(task.mission_status)
      )
        return fail(409, "Task attempt is stale or terminal");
      await chargeContent(
        tx,
        active.owner_id,
        Buffer.byteLength(JSON.stringify({ title, summary, sources: refs })),
        publicLimits,
        { missionId: task.mission_id, taskId: task.id },
      );
      const evidence = await addEvidence(tx, {
        ownerId: active.owner_id,
        missionId: task.mission_id,
        botId: active.id,
        title,
        summary,
        sources: refs,
        circleId: task.visibility === "circle" ? task.circle_id : undefined,
      });
      await tx.query(
        "UPDATE tasks SET status='completed',idempotency_key=$2,result_hash=$3,evidence_id=$4,lease_expires_at=NULL WHERE id=$1",
        [task.id, idempotencyKey, resultHash, evidence.id],
      );
      await tx.query(
        "UPDATE missions SET status='completed' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM tasks WHERE mission_id=$1 AND status<>'completed')",
        [task.mission_id],
      );
      return {
        ok: true,
        taskId: task.id,
        evidenceId: evidence.id,
        status: "completed",
        replayed: false,
      };
    });
  });

  app.post("/api/evidence", async (request) => {
    const found = await owner(request, true);
    const body = object(request.body, [
      "title",
      "summary",
      "sourceUrl",
      "visibility",
      "missionId",
      "circleId",
    ]);
    const title = string(body.title, "Title", 200);
    const summary = string(body.summary, "Summary", 12000);
    const sourceUrl = publicUrl(body.sourceUrl);
    const visibility = choice(
      body.visibility,
      ["private", "circle"],
      "visibility",
    );
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      let missionId: string | undefined;
      if (body.missionId !== undefined) {
        missionId = string(body.missionId, "Mission id", 100);
        const mission = await tx.query(
          "SELECT id FROM missions WHERE id=$1 AND owner_id=$2",
          [missionId, found.id],
        );
        if (!mission.rows[0]) return fail(404, "Mission not found");
        const weekly = (
          await tx.query(
            "SELECT * FROM weekly_mission_inputs WHERE mission_id=$1",
            [missionId],
          )
        ).rows[0];
        if (weekly && visibility !== "private")
          return fail(400, "Weekly mission evidence stays private");
        validateWeeklySources(weekly, [{ url: sourceUrl }]);
      }
      const circleId =
        visibility === "circle"
          ? await circleFor(tx, found.id, body.circleId)
          : undefined;
      await chargeContent(
        tx,
        found.id,
        Buffer.byteLength(JSON.stringify(body)),
        publicLimits,
      );
      const evidence = await addEvidence(tx, {
        ownerId: found.id,
        missionId,
        title,
        summary,
        sources: [{ url: sourceUrl }],
        circleId,
      });
      return {
        evidence: evidenceView(evidence),
        approvalRequired: visibility === "circle",
      };
    });
  });
  app.post("/api/approvals/:id/resolve", async (request) => {
    const found = await owner(request, true);
    const body = object(request.body, ["decision", "version"]);
    const decision = choice(body.decision, ["approve", "reject"], "decision");
    const version = integer(body.version, 1, 100000, "version");
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const result = await tx.query(
        "SELECT * FROM approvals WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [(request.params as Row).id, found.id],
      );
      const approval = result.rows[0];
      if (!approval) return fail(404, "Approval not found");
      if (approval.status !== "pending" || approval.version !== version)
        return fail(409, "Approval is stale or already resolved");
      const evidence = (
        await tx.query(
          "SELECT * FROM evidence WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [approval.evidence_id, found.id],
        )
      ).rows[0];
      if (!evidence || evidenceHash(evidence) !== approval.evidence_hash)
        return fail(409, "Evidence changed; a new approval is required");
      if (decision === "approve") {
        await circleFor(tx, found.id, approval.circle_id);
        await tx.query(
          "UPDATE evidence SET visibility='circle',circle_id=$2 WHERE id=$1",
          [evidence.id, approval.circle_id],
        );
      }
      const updated = await tx.query(
        "UPDATE approvals SET status=$2,version=version+1 WHERE id=$1 RETURNING *",
        [approval.id, decision === "approve" ? "approved" : "rejected"],
      );
      await event(
        tx,
        found.id,
        `approval.${decision}`,
        `${decision === "approve" ? "Published to circle" : "Rejected publication"}: ${evidence.title}`,
      );
      return { approval: approvalView(updated.rows[0]) };
    });
  });
  app.post("/api/circles/:id/invites", async (request) => {
    const found = await owner(request, true);
    object(request.body ?? {}, []);
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const circleId = (request.params as Row).id;
      const circle = await tx.query(
        "SELECT id FROM circles WHERE id=$1 AND owner_id=$2",
        [circleId, found.id],
      );
      if (!circle.rows[0]) return fail(404, "Circle not found");
      const code = secret(24);
      const expiresAt = new Date(Date.now() + 24 * 3600000);
      await tx.query(
        "INSERT INTO circle_invites(code_hash,circle_id,expires_at) VALUES($1,$2,$3)",
        [hash(code), circleId, expiresAt],
      );
      return { code, expiresAt: expiresAt.toISOString() };
    });
  });
  app.post("/api/circles/join", async (request) => {
    const found = await owner(request, true);
    rate(request, "circle-join", 60);
    const body = object(request.body, ["code"]);
    const code = string(body.code, "Invite code", 100);
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      const result = await tx.query(
        "UPDATE circle_invites SET consumed_at=now() WHERE code_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING circle_id",
        [hash(code)],
      );
      if (!result.rows[0])
        return fail(400, "Invite invalid, expired or already used");
      await admitCircleJoin(
        tx,
        found.id,
        result.rows[0].circle_id,
        publicLimits,
      );
      await tx.query(
        "INSERT INTO circle_members(circle_id,owner_id,role,active) VALUES($1,$2,'member',true) ON CONFLICT(circle_id,owner_id) DO UPDATE SET active=true",
        [result.rows[0].circle_id, found.id],
      );
      return { ok: true, circleId: result.rows[0].circle_id };
    });
  });
  app.get("/api/circles/:id", async (request) => {
    const found = await owner(request);
    await reconcile();
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      const circleId = await circleFor(
        tx,
        found.id,
        (request.params as Row).id,
      );
      const evidence = await tx.query(
        "SELECT * FROM evidence WHERE circle_id=$1 AND visibility='circle' ORDER BY created_at DESC LIMIT 200",
        [circleId],
      );
      const missions = await tx.query(
        "SELECT * FROM missions WHERE circle_id=$1 AND visibility='circle' ORDER BY created_at DESC LIMIT 100",
        [circleId],
      );
      const members = await tx.query(
        "SELECT o.id AS owner_id,o.handle,o.display_name,m.role FROM circle_members m JOIN owners o ON o.id=m.owner_id WHERE m.circle_id=$1 AND m.active=true ORDER BY m.role,o.handle",
        [circleId],
      );
      return {
        id: circleId,
        evidence: evidence.rows.map(evidenceView),
        missions: missions.rows.map(missionView),
        members: members.rows.map((r) => ({
          ownerId: r.owner_id,
          handle: r.handle,
          displayName: r.display_name,
          role: r.role,
        })),
      };
    });
  });
  app.post("/api/circles/:id/members/:ownerId/remove", async (request) => {
    const found = await owner(request, true);
    object(request.body ?? {}, []);
    const params = request.params as Row;
    if (params.ownerId === found.id)
      return fail(400, "Cannot remove the circle owner");
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, found.id);
      // Membership lock precedes mission locks, matching circle lease/results.
      const result = await tx.query(
        "UPDATE circle_members SET active=false WHERE circle_id=$1 AND owner_id=$2 AND circle_id IN (SELECT id FROM circles WHERE owner_id=$3) RETURNING owner_id",
        [params.id, params.ownerId, found.id],
      );
      if (!result.rows[0]) return fail(404, "Circle member not found");
      const missions = await tx.query(
        "SELECT m.* FROM missions m WHERE m.circle_id=$1 AND m.status IN ('queued','running') AND EXISTS(SELECT 1 FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE t.mission_id=m.id AND b.owner_id=$2 AND t.status IN ('queued','leased')) ORDER BY m.id FOR UPDATE OF m",
        [params.id, params.ownerId],
      );
      for (const mission of missions.rows)
        await failMission(
          tx,
          mission,
          "A participating owner lost circle membership",
        );
      return { ok: true };
    });
  });
  return app;
}
