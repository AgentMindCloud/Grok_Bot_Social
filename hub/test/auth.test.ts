import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { database, migrate, type Database } from "../src/db.js";
import { config, type Config } from "../src/config.js";
import { createApp } from "../src/server.js";
import { hash } from "../src/security.js";
const origin = "http://127.0.0.1:3000";
const base: Config = {
  origin,
  production: false,
  localLogin: false,
  localOwner: "auth-fixture",
  host: "127.0.0.1",
  port: 8787,
  sessionHours: 24,
  pairingMinutes: 10,
  leaseSeconds: 300,
  maxAttempts: 3,
  fetch,
  accessMode: "open",
  workspaceEnabled: true,
  weeklyResearchEnabled: true,
  githubClientId: "fixture-id",
  githubClientSecret: "fixture-secret",
  xClientId: "fixture-x",
  xClientSecret: "fixture-x-secret",
  xLoginEnabled: true,
  xBudgetVerified: true,
  xMonthlyBudgetUsd: 10,
  xAutoRecharge: false,
};
let db: Database;
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
const isolatedSchema = `test_${randomUUID().replaceAll("-", "")}`;
before(async () => {
  if (databaseUrl) {
    const admin = await database({ url: databaseUrl });
    try {
      await admin.exec(`CREATE SCHEMA ${isolatedSchema}`);
    } finally {
      await admin.close();
    }
  }
  db = await database({
    url: databaseUrl,
    schema: databaseUrl ? isolatedSchema : undefined,
  });
  await migrate(db);
});
after(async () => {
  await db?.close();
  if (databaseUrl) {
    const admin = await database({ url: databaseUrl });
    try {
      await admin.exec(`DROP SCHEMA ${isolatedSchema} CASCADE`);
    } finally {
      await admin.close();
    }
  }
});
let nextId = 8800000;
const jar = (response: { cookies: { name: string; value: string }[] }) =>
  response.cookies
    .filter((c) => c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
function fixtures() {
  const data = {
    github: { id: nextId++, login: "same-handle", name: "Fixture" },
    x: { id: String(nextId++), username: "same-handle", name: "Fixture" },
    creditFailure: false,
    calls: [] as { url: string; init: RequestInit }[],
  };
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    data.calls.push({ url, init });
    if (data.creditFailure && url.startsWith("https://api.x.com"))
      return new Response("{}", { status: 402 });
    return new Response(
      JSON.stringify(
        url.includes("token")
          ? { access_token: "never-store-provider-token" }
          : url.includes("api.github")
            ? data.github
            : { data: data.x },
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  return { data, fetcher };
}
async function oauth(
  app: Awaited<ReturnType<typeof createApp>>,
  provider: "github" | "x",
  request?: { url: string; headers: Record<string, string> },
) {
  const begin = request
    ? await app.inject({
        method: "POST",
        url: request.url,
        headers: request.headers,
        payload: {},
      })
    : await app.inject({ method: "GET", url: `/api/auth/${provider}` });
  assert.ok([200, 302].includes(begin.statusCode), begin.body);
  const url = new URL(
    begin.statusCode === 302
      ? String(begin.headers.location)
      : begin.json().url,
  );
  const cookies = [request?.headers.cookie, jar(begin)]
    .filter(Boolean)
    .join("; ");
  const callback = `/api/auth/${provider}/callback?code=fixture&state=${url.searchParams.get("state")}`;
  const response = await app.inject({
    method: "GET",
    url: callback,
    headers: { cookie: cookies },
  });
  return { begin, url, cookies, callback, response };
}
async function session(
  app: Awaited<ReturnType<typeof createApp>>,
  cookie: string,
) {
  const r = await app.inject({
    method: "GET",
    url: "/api/session",
    headers: { cookie },
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
test("registration, workspace and weekly flags are independent; X activates only with verified bounded budget", () => {
  const cfg = config({
    HUB_EMBEDDED_DB: "true",
    HUB_ACCESS_MODE: "open",
    HUB_WORKSPACE_ENABLED: "true",
    HUB_WEEKLY_RESEARCH_ENABLED: "true",
  });
  assert.equal(cfg.privateBeta, false);
  assert.equal(cfg.workspaceEnabled, true);
  assert.equal(cfg.weeklyResearchEnabled, true);
  assert.throws(
    () =>
      config({
        HUB_EMBEDDED_DB: "true",
        HUB_X_LOGIN_ENABLED: "true",
        X_CLIENT_ID: "x",
        X_CLIENT_SECRET: "x",
      }),
    /verified/,
  );
  assert.throws(
    () => config({ HUB_EMBEDDED_DB: "true", HUB_X_MONTHLY_BUDGET_USD: "11" }),
    /at most 10/,
  );
  assert.throws(
    () => config({ HUB_EMBEDDED_DB: "true", HUB_X_AUTO_RECHARGE: "true" }),
    /disabled/,
  );
  assert.throws(
    () =>
      config({ HUB_EMBEDDED_DB: "true", HUB_TRUSTED_PROXY_IPS: "10.0.0.0\/8" }),
    /exact IP/,
  );
});
test("open GitHub and X identities remain separate despite identical handles; X uses S256 and discards tokens", async (t) => {
  const f = fixtures();
  const app = await createApp(db, { ...base, fetch: f.fetcher });
  t.after(() => app.close());
  const gh = await oauth(app, "github");
  assert.equal(gh.response.statusCode, 302, gh.response.body);
  const ghSession = await session(app, jar(gh.response));
  assert.equal(ghSession.registrationMode, "open");
  assert.equal(ghSession.workspaceEnabled, true);
  const x = await oauth(app, "x");
  assert.equal(x.response.statusCode, 302, x.response.body);
  assert.equal(x.url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(x.url.searchParams.get("scope"), "tweet.read users.read");
  const tokenCall = f.data.calls.find(
    (c) => c.url === "https://api.x.com/2/oauth2/token",
  )!;
  const verifier = new URLSearchParams(String(tokenCall.init.body)).get(
    "code_verifier",
  )!;
  assert.equal(
    createHash("sha256").update(verifier).digest("base64url"),
    x.url.searchParams.get("code_challenge"),
  );
  const xSession = await session(app, jar(x.response));
  assert.notEqual(xSession.owner.id, ghSession.owner.id);
  const account = await app.inject({
    method: "GET",
    url: "/api/account",
    headers: { cookie: jar(x.response) },
  });
  assert.equal(account.json().owner.classification, "self-service");
  assert.ok(
    !JSON.stringify(
      (await db.query("SELECT * FROM provider_identities")).rows,
    ).includes("never-store"),
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: x.callback,
        headers: { cookie: x.cookies },
      })
    ).statusCode,
    400,
  );
});
test("registration pause retains existing GitHub access and changed handles retain owner IDs", async (t) => {
  const f = fixtures();
  const cfg = { ...base, fetch: f.fetcher };
  const app = await createApp(db, cfg);
  t.after(() => app.close());
  const initial = await oauth(app, "github");
  const before = await session(app, jar(initial.response));
  cfg.registrationPaused = true;
  f.data.github.login = "renamed";
  const again = await oauth(app, "github");
  assert.equal(again.response.statusCode, 302);
  const after = await session(app, jar(again.response));
  assert.equal(after.owner.id, before.owner.id);
  assert.equal(after.owner.handle, "renamed");
  f.data.github.id = nextId++;
  const denied = await oauth(app, "github");
  assert.equal(denied.response.statusCode, 302);
  assert.equal(
    denied.response.headers.location,
    `${origin}/workspace/?auth=registration-paused`,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM owners WHERE github_id=$1", [
        String(f.data.github.id),
      ])
    ).rows.length,
    0,
  );
});
test("linking is explicit, session-bound and recent; last-provider and cross-account conflicts fail safely", async (t) => {
  const f = fixtures();
  const app = await createApp(db, { ...base, fetch: f.fetcher });
  t.after(() => app.close());
  const gh = await oauth(app, "github");
  const cookie = jar(gh.response);
  const own = await session(app, cookie);
  const headers = { cookie, origin, "x-csrf-token": own.csrfToken };
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/account/identities/github",
        headers,
        payload: {},
      })
    ).statusCode,
    409,
  );
  const linked = await oauth(app, "x", {
    url: "/api/account/identities/x/link",
    headers,
  });
  assert.equal(linked.response.statusCode, 302, linked.response.body);
  const account = await app.inject({
    method: "GET",
    url: "/api/account",
    headers,
  });
  assert.equal(account.json().providers.length, 2);
  const x = await oauth(app, "x");
  assert.equal((await session(app, jar(x.response))).owner.id, own.owner.id);
  await db.query(
    "UPDATE sessions SET authenticated_at=now()-interval '11 minutes' WHERE id_hash=$1",
    [hash(gh.response.cookies.find((c) => c.name === "gbs-session")!.value)],
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/account/identities/x",
        headers,
        payload: {},
      })
    ).statusCode,
    403,
  );
  const reauth = await oauth(app, "github", {
    url: "/api/account/reauth/github",
    headers,
  });
  assert.equal(reauth.response.statusCode, 302);
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/account/identities/x",
        headers,
        payload: {},
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/account/identities/github",
        headers,
        payload: {},
      })
    ).statusCode,
    409,
  );
  // A separately created X workspace cannot be silently merged into this one.
  f.data.x.id = String(nextId++);
  assert.equal((await oauth(app, "x")).response.statusCode, 302);
  const conflict = await oauth(app, "x", {
    url: "/api/account/identities/x/link",
    headers,
  });
  assert.equal(conflict.response.statusCode, 302);
  assert.equal(
    conflict.response.headers.location,
    `${origin}/workspace/?view=account&auth=identity-conflict`,
  );
});
test("credit circuit blocks repeated X calls while existing sessions and GitHub continue", async (t) => {
  await db.query("DELETE FROM auth_provider_circuits");
  const f = fixtures();
  const app = await createApp(db, { ...base, fetch: f.fetcher });
  t.after(async () => {
    await app.close();
    await db.query("DELETE FROM auth_provider_circuits");
  });
  const first = await oauth(app, "x");
  const cookie = jar(first.response);
  f.data.creditFailure = true;
  const failure = await oauth(app, "x");
  assert.equal(failure.response.statusCode, 302);
  assert.equal(
    failure.response.headers.location,
    `${origin}/workspace/?auth=x-unavailable`,
  );
  const calls = f.data.calls.length;
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/auth/x" })).headers.location,
    `${origin}/workspace/?auth=x-unavailable`,
  );
  assert.equal(f.data.calls.length, calls);
  const current = await session(app, cookie);
  assert.equal(current.authenticated, true);
  assert.equal(current.xLoginEnabled, false);
  assert.equal((await oauth(app, "github")).response.statusCode, 302);
});
test("confirmed X usage caps persist across restart; ordinary rate limits do not require operator recovery", async () => {
  await db.query("DELETE FROM auth_provider_circuits");
  const f = fixtures();
  let failureType: string | null = null;
  let providerCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    providerCalls++;
    if (String(input) === "https://api.x.com/2/users/me" && failureType)
      return new Response(
        JSON.stringify({ type: failureType, title: "Fixture provider limit" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    return f.fetcher(input, init);
  };
  let app = await createApp(db, { ...base, fetch: fetcher });
  try {
    const original = await oauth(app, "x");
    const cookie = jar(original.response);
    failureType = "https://api.x.com/2/problems/rate-limit-exceeded";
    const limited = await oauth(app, "x");
    assert.equal(
      limited.response.headers.location,
      `${origin}/workspace/?auth=x-unavailable`,
    );
    assert.equal(
      (await db.query("SELECT provider FROM auth_provider_circuits")).rows
        .length,
      0,
    );
    assert.equal((await session(app, cookie)).xLoginEnabled, true);
    failureType = "https://api.x.com/2/problems/usage-capped";
    const capped = await oauth(app, "x");
    assert.equal(
      capped.response.headers.location,
      `${origin}/workspace/?auth=x-unavailable`,
    );
    assert.equal(
      (
        await db.query(
          "SELECT reason FROM auth_provider_circuits WHERE provider='x'",
        )
      ).rows[0]?.reason,
      "provider-usage-cap",
    );
    assert.equal((await session(app, cookie)).authenticated, true);
    await app.close();
    failureType = null;
    app = await createApp(db, { ...base, fetch: fetcher });
    const before = providerCalls;
    assert.equal(
      (await app.inject({ method: "GET", url: "/api/auth/x" })).headers
        .location,
      `${origin}/workspace/?auth=x-unavailable`,
    );
    assert.equal(providerCalls, before);
    assert.equal((await session(app, cookie)).authenticated, true);
    assert.equal((await session(app, cookie)).xLoginEnabled, false);
    assert.equal((await oauth(app, "github")).response.statusCode, 302);
    // Operator verifies actual provider recovery before clearing this durable row.
    await db.query("DELETE FROM auth_provider_circuits WHERE provider='x'");
    const recovered = await oauth(app, "x");
    assert.equal(
      (await session(app, jar(recovered.response))).authenticated,
      true,
    );
  } finally {
    await app.close();
    await db.query("DELETE FROM auth_provider_circuits");
  }
});

test("trusted edge accepts only its direct forwarded client; forged chains and untrusted proxy addresses do not change client identity", async (t) => {
  const f = fixtures();
  const app = await createApp(db, {
    ...base,
    fetch: f.fetcher,
    trustedProxyIps: ["10.20.0.2"],
  });
  app.get("/test/ip", async (req) => ({ ip: req.ip }));
  t.after(() => app.close());
  assert.equal(
    (
      await app.inject({
        url: "/test/ip",
        remoteAddress: "192.0.2.20",
        headers: { "x-forwarded-for": "198.51.100.10" },
      })
    ).json().ip,
    "192.0.2.20",
  );
  assert.equal(
    (
      await app.inject({
        url: "/test/ip",
        remoteAddress: "10.20.0.2",
        headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.10" },
      })
    ).json().ip,
    "198.51.100.10",
  );
});
test("suspension rejects existing sessions and tokens; rotated credentials cannot finish an already-authenticated request", async (t) => {
  let rotate = false,
    token = "",
    botId = "";
  const wrapped: Database = {
    ...db,
    transaction: async (run) => {
      if (rotate) {
        rotate = false;
        await db.query(
          "UPDATE bots SET token_hash=$2,token_generation=token_generation+1 WHERE id=$1",
          [botId, hash("gbs_replacement-fixture")],
        );
      }
      return db.transaction(run);
    },
  };
  const app = await createApp(wrapped, { ...base, localLogin: true });
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/local",
    headers: { origin },
    payload: {},
  });
  assert.equal(login.statusCode, 200, login.body);
  const headers = {
    origin,
    cookie: jar(login),
    "x-csrf-token": login.json().csrfToken,
  };
  const code = (
    await app.inject({
      method: "POST",
      url: "/api/pairings",
      headers,
      payload: {},
    })
  ).json().code;
  const pair = await app.inject({
    method: "POST",
    url: "/api/bot/pair",
    payload: { code, name: "Test", role: "scout", runtime: "native-grok" },
  });
  assert.equal(pair.statusCode, 200, pair.body);
  token = pair.json().token;
  botId = pair.json().bot.id;
  rotate = true;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/bot/heartbeat",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
    ).statusCode,
    401,
  );
  await db.query("UPDATE owners SET status='suspended' WHERE id=$1", [
    login.json().owner.id,
  ]);
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/workspace", headers }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/bot/heartbeat",
        headers: { authorization: "Bearer gbs_replacement-fixture" },
        payload: {},
      })
    ).statusCode,
    403,
  );
});

test("OAuth link state rejects a different logged-in owner, expiration, denial and missing X verifier", async (t) => {
  const f = fixtures();
  const app = await createApp(db, { ...base, fetch: f.fetcher });
  t.after(() => app.close());
  const first = await oauth(app, "github"),
    cookie = jar(first.response),
    own = await session(app, cookie),
    headers = { cookie, origin, "x-csrf-token": own.csrfToken };
  f.data.github.id = nextId++;
  const other = await oauth(app, "github");
  const begin = await app.inject({
    method: "POST",
    url: "/api/account/identities/x/link",
    headers,
    payload: {},
  });
  const state = new URL(begin.json().url).searchParams.get("state");
  const before = f.data.calls.length;
  const swapped = await app.inject({
    method: "GET",
    url: `/api/auth/x/callback?code=x&state=${state}`,
    headers: { cookie: `${jar(other.response)}; ${jar(begin)}` },
  });
  assert.equal(swapped.statusCode, 302);
  assert.equal(
    swapped.headers.location,
    `${origin}/workspace/?view=account&auth=verification-required`,
  );
  assert.equal(f.data.calls.length, before);
  const expired = await app.inject({ method: "GET", url: "/api/auth/x" });
  const expstate = new URL(String(expired.headers.location)).searchParams.get(
    "state",
  )!;
  await db.query(
    "UPDATE oauth_states SET expires_at=now()-interval '1 second' WHERE state_hash=$1",
    [hash(expstate)],
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/api/auth/x/callback?code=x&state=${expstate}`,
        headers: { cookie: jar(expired) },
      })
    ).statusCode,
    400,
  );
  const noVerifier = await app.inject({ method: "GET", url: "/api/auth/x" });
  const nvstate = new URL(String(noVerifier.headers.location)).searchParams.get(
    "state",
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/api/auth/x/callback?code=x&state=${nvstate}`,
        headers: { cookie: `gbs-x-oauth-state=${nvstate}` },
      })
    ).statusCode,
    400,
  );
  const denied = await app.inject({ method: "GET", url: "/api/auth/x" });
  const dstate = new URL(String(denied.headers.location)).searchParams.get(
    "state",
  );
  const denial = await app.inject({
    method: "GET",
    url: `/api/auth/x/callback?error=access_denied&state=${dstate}`,
    headers: { cookie: jar(denied) },
  });
  assert.equal(denial.statusCode, 302);
  assert.match(String(denial.headers.location), /auth=denied/);
  assert.equal(f.data.calls.length, before);
});
test("concurrent provider removals preserve one identity and a closure racing connection-code creation leaves no new private row", async (t) => {
  const f = fixtures();
  let closeBeforeTransaction = false,
    closingOwner = "";
  const wrapped: Database = {
    ...db,
    transaction: async (run) => {
      if (closeBeforeTransaction) {
        closeBeforeTransaction = false;
        await db.query("UPDATE owners SET status='closed' WHERE id=$1", [
          closingOwner,
        ]);
      }
      return db.transaction(run);
    },
  };
  const app = await createApp(wrapped, { ...base, fetch: f.fetcher });
  t.after(() => app.close());
  const gh = await oauth(app, "github"),
    cookie = jar(gh.response),
    own = await session(app, cookie),
    headers = { cookie, origin, "x-csrf-token": own.csrfToken };
  assert.equal(
    (await oauth(app, "x", { url: "/api/account/identities/x/link", headers }))
      .response.statusCode,
    302,
  );
  const outcomes = await Promise.all(
    ["github", "x"].map((provider) =>
      app.inject({
        method: "DELETE",
        url: `/api/account/identities/${provider}`,
        headers,
        payload: {},
      }),
    ),
  );
  assert.deepEqual(outcomes.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(
    (
      await db.query(
        "SELECT count(*) FROM provider_identities WHERE owner_id=$1",
        [own.owner.id],
      )
    ).rows[0].count.toString(),
    "1",
  );
  closingOwner = own.owner.id;
  closeBeforeTransaction = true;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/pairings",
        headers,
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await db.query("SELECT count(*) FROM pairings WHERE owner_id=$1", [
        own.owner.id,
      ])
    ).rows[0].count.toString(),
    "0",
  );
});
test("connection login returns only to the fixed approval page and rejects arbitrary destinations", async (t) => {
  const f = fixtures();
  const app = await createApp(db, { ...base, fetch: f.fetcher });
  t.after(() => app.close());
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/auth/github?return_to=https%3A%2F%2Fexample.org",
      })
    ).statusCode,
    400,
  );
  const begin = await app.inject({
    method: "GET",
    url: "/api/auth/github?return_to=connect",
  });
  assert.equal(begin.statusCode, 302);
  const state = new URL(String(begin.headers.location)).searchParams.get(
    "state",
  );
  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?code=fixture&state=${state}`,
    headers: { cookie: jar(begin) },
  });
  assert.equal(callback.statusCode, 302, callback.body);
  assert.equal(callback.headers.location, `${origin}/connect/`);
  const account = await app.inject({
    method: "GET",
    url: "/api/account",
    headers: { cookie: jar(callback) },
  });
  assert.equal(account.json().usage.limits.botsPerOwner, 2);
  assert.equal(account.json().usage.used.connectedBots, 0);
  assert.equal(account.json().usage.oldestMissionWindowExpiresAt, null);
});
for (const provider of ["github", "x"] as const) {
  test(`${provider} removed after identity lookup cannot issue a new session`, async (t) => {
    const fixture = fixtures();
    let pause = false,
      arrived!: () => void,
      release!: () => void;
    const boundary = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wrapped: Database = {
      ...db,
      transaction: async (run) => {
        let resolved = false;
        const result = await db.transaction((tx) =>
          run({
            ...tx,
            query: async (sql, params) => {
              if (pause && sql.startsWith("UPDATE owners SET handle="))
                resolved = true;
              return tx.query(sql, params);
            },
          }),
        );
        if (resolved) {
          pause = false;
          arrived();
          await resume;
        }
        return result;
      },
    };
    const app = await createApp(wrapped, { ...base, fetch: fixture.fetcher });
    t.after(async () => {
      release();
      await app.close();
    });
    const first = await oauth(app, "github");
    const cookie = jar(first.response),
      own = await session(app, cookie),
      headers = { cookie, origin, "x-csrf-token": own.csrfToken };
    assert.equal(
      (
        await oauth(app, "x", {
          url: "/api/account/identities/x/link",
          headers,
        })
      ).response.statusCode,
      302,
    );
    const begin = await app.inject({
      method: "GET",
      url: `/api/auth/${provider}`,
    });
    const state = new URL(String(begin.headers.location)).searchParams.get(
      "state",
    );
    pause = true;
    const callback = app.inject({
      method: "GET",
      url: `/api/auth/${provider}/callback?code=fixture&state=${state}`,
      headers: { cookie: jar(begin) },
    });
    await boundary;
    const unlinked = await app.inject({
      method: "DELETE",
      url: `/api/account/identities/${provider}`,
      headers,
      payload: {},
    });
    assert.equal(unlinked.statusCode, 200, unlinked.body);
    release();
    const result = await callback;
    assert.equal(result.statusCode, 302, result.body);
    assert.equal(
      result.headers.location,
      `${origin}/workspace/?auth=identity-changed`,
    );
    assert.equal(
      result.cookies.some((c) => c.name === "gbs-session" && c.value),
      false,
    );
    const check = await session(app, jar(result));
    assert.equal(check.authenticated, false);
    assert.equal(
      (
        await db.query(
          "SELECT provider FROM provider_identities WHERE owner_id=$1 AND provider=$2",
          [own.owner.id, provider],
        )
      ).rows.length,
      0,
    );
  });
}
test("provider failures return safe page codes, consume state once, and keep connection/account return context", async (t) => {
  const fixture = fixtures();
  let unavailable = false;
  const app = await createApp(db, {
    ...base,
    fetch: async (input, init) =>
      unavailable
        ? new Response(
            JSON.stringify({ error: "provider secret must never be echoed" }),
            { status: 503 },
          )
        : fixture.fetcher(input, init),
  });
  t.after(() => app.close());
  const login = await oauth(app, "github"),
    cookie = jar(login.response),
    own = await session(app, cookie),
    headers = { cookie, origin, "x-csrf-token": own.csrfToken };
  const start = await app.inject({
    method: "POST",
    url: "/api/account/reauth/github",
    headers,
    payload: {},
  });
  const state = new URL(start.json().url).searchParams.get("state");
  unavailable = true;
  const callback = `/api/auth/github/callback?code=sensitive-code&state=${state}`;
  const failed = await app.inject({
    method: "GET",
    url: callback,
    headers: { cookie: `${cookie}; ${jar(start)}` },
  });
  assert.equal(
    failed.headers.location,
    `${origin}/workspace/?view=account&auth=github-unavailable`,
  );
  assert.ok(!JSON.stringify(failed.headers).includes("sensitive-code"));
  assert.ok(!failed.body.includes("provider secret"));
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: callback,
        headers: { cookie: `${cookie}; ${jar(start)}` },
      })
    ).statusCode,
    400,
  );
  const connect = await app.inject({
    method: "GET",
    url: "/api/auth/github?return_to=connect",
  });
  const cstate = new URL(String(connect.headers.location)).searchParams.get(
    "state",
  );
  const connectFailure = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?code=x&state=${cstate}`,
    headers: { cookie: jar(connect) },
  });
  assert.equal(
    connectFailure.headers.location,
    `${origin}/connect/?auth=github-unavailable`,
  );
});
