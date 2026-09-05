import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { database, migrate, type Database } from "../src/db.js";
import { createApp } from "../src/server.js";
import type { Config } from "../src/config.js";
import { hash, secret } from "../src/security.js";
import { runMaintenance } from "../src/maintenance.js";
import {
  closeAccount,
  exportAccount,
  replayClosureJournal,
} from "../src/account-lifecycle.js";
import { ClosureJournal } from "../src/closure-journal.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let db: Database;
const url = process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL,
  schema = `test_${randomUUID().replaceAll("-", "")}`,
  origin = "http://127.0.0.1:3000";
const cfg: Config = {
  origin,
  production: false,
  localLogin: true,
  localOwner: "launch",
  host: "127.0.0.1",
  port: 8787,
  sessionHours: 24,
  pairingMinutes: 10,
  leaseSeconds: 300,
  maxAttempts: 3,
  fetch,
  poolEnabled: true,
  workspaceEnabled: true,
};
before(async () => {
  if (url) {
    const a = await database({ url });
    await a.exec(`CREATE SCHEMA ${schema}`);
    await a.close();
  }
  db = await database({ url, schema: url ? schema : undefined });
  await migrate(db);
});
after(async () => {
  await db?.close();
  if (url) {
    const a = await database({ url });
    await a.exec(`DROP SCHEMA ${schema} CASCADE`);
    await a.close();
  }
});
async function actor(
  t: { after(fn: () => Promise<void>): void },
  moderator = false,
  extra: Partial<Config> = {},
) {
  const localOwner = randomUUID();
  const config = { ...cfg, localOwner, ...extra };
  const app = await createApp(db, config);
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/local",
    headers: { origin },
    payload: {},
  });
  assert.equal(login.statusCode, 200, login.body);
  const session = login.json();
  if (moderator) config.poolModeratorOwnerIds = [session.owner.id];
  const headers = {
    cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    origin,
    "x-csrf-token": session.csrfToken,
  };
  const post = (path: string, payload: object = {}) =>
    app.inject({ method: "POST", url: path, headers, payload });
  const get = (path: string) => app.inject({ url: path, headers });
  const bot = async (scope = "pool-only") => {
    const token = `gbs_${secret()}`,
      id = randomUUID();
    await db.query(
      "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash,credential_scope) VALUES($1,$2,'Public fixture','scout','external-agent','active',$3,$4)",
      [id, session.owner.id, hash(token), scope],
    );
    return {
      id,
      token,
      post: (path: string, payload: object = {}) =>
        app.inject({
          method: "POST",
          url: path,
          headers: { authorization: `Bearer ${token}` },
          payload,
        }),
    };
  };
  return { app, session, headers, post, get, bot };
}
const avatar = {
  version: 1,
  color: "#74DFEE",
  expression: "wink",
  accessory: "antenna",
  badge: "Certified overthinker",
};
const participate = (a: Awaited<ReturnType<typeof actor>>, id: string) =>
  a.post(`/api/pool/participation/${id}`, {
    enabled: true,
    allowQuestions: true,
    topics: ["build"],
    avatarSlug: "bumble",
    publicConsent: true,
  });
const ask = (
  a: Awaited<ReturnType<typeof actor>>,
  id: string,
  key = randomUUID(),
) =>
  a.post("/api/pool/questions", {
    botId: id,
    title: "Public fixture title",
    body: "Only public data",
    topic: "build",
    publicConsent: true,
    idempotencyKey: key,
  });

test("GitHub S256 binds verifier, rejects missing/wrong/expired/replayed states, and supports concurrent tabs", async (t) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const app = await createApp(db, {
    ...cfg,
    localLogin: false,
    githubClientId: "fixture",
    githubClientSecret: "fixture",
    fetch: (async (u, init = {}) => {
      calls.push({ url: String(u), init });
      return new Response(
        JSON.stringify(
          String(u).includes("access_token")
            ? { access_token: "discard-me" }
            : { id: 8910111213, login: "pkce-fixture", name: "Fixture" },
        ),
      );
    }) as typeof fetch,
  });
  t.after(() => app.close());
  const start = async () => {
    const r = await app.inject({ url: "/api/auth/github" });
    const u = new URL(r.headers.location!);
    return {
      r,
      u,
      cookie: r.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      path: `/api/auth/github/callback?code=fixture&state=${u.searchParams.get("state")}`,
    };
  };
  for (const mode of ["missing", "wrong", "expired"]) {
    const a = await start();
    let cookie = a.cookie;
    if (mode === "missing")
      cookie = a.r.cookies
        .filter((c) => !c.name.includes("verifier"))
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
    if (mode === "wrong")
      cookie = a.r.cookies
        .map(
          (c) => `${c.name}=${c.name.includes("verifier") ? "wrong" : c.value}`,
        )
        .join("; ");
    if (mode === "expired")
      await db.query(
        "UPDATE oauth_states SET expires_at=now()-interval '1 second' WHERE state_hash=$1",
        [hash(a.u.searchParams.get("state")!)],
      );
    assert.equal(
      (await app.inject({ url: a.path, headers: { cookie } })).statusCode,
      400,
    );
    assert.equal(calls.length, 0);
  }
  const a = await start(),
    b = await start(),
    jar = a.cookie + "; " + b.cookie;
  for (const value of [a, b]) {
    assert.equal(value.u.searchParams.get("code_challenge_method"), "S256");
    const verifier = value.r.cookies.find((c) =>
      c.name.includes("verifier"),
    )!.value;
    assert.equal(
      value.u.searchParams.get("code_challenge"),
      createHash("sha256").update(verifier).digest("base64url"),
    );
    assert.equal(
      (await app.inject({ url: value.path, headers: { cookie: jar } }))
        .statusCode,
      302,
    );
    assert.equal(
      JSON.parse(String(calls.at(-2)!.init.body)).code_verifier,
      verifier,
    );
    assert.equal(
      (await app.inject({ url: value.path, headers: { cookie: jar } }))
        .statusCode,
      400,
    );
  }
  const denied = await start();
  assert.equal(
    (
      await app.inject({
        url: denied.path.replace("code=fixture", "error=access_denied"),
        headers: { cookie: denied.cookie },
      })
    ).statusCode,
    302,
  );
  assert.equal(calls.length, 4);
});

test("new browser connection is pool-only regardless of runtime label; private reconnect requires reviewed scope", async (t) => {
  const a = await actor(t);
  const candidate = `gbs_${secret()}`;
  const begin = await a.app.inject({
    method: "POST",
    url: "/api/bot/device/start",
    payload: {
      tokenHash: hash(candidate),
      name: "Scoped fixture",
      role: "scout",
      runtime: "native-grok",
      adapterVersion: "native-grok-adapter/0.3.0",
    },
  });
  assert.equal(begin.statusCode, 200, begin.body);
  const d = begin.json();
  const reviewed = await a.post("/api/device/inspect", {
    userCode: d.userCode,
  });
  assert.equal(reviewed.json().credentialScope, "pool-only");
  assert.equal(
    (
      await a.post("/api/device/resolve", {
        userCode: d.userCode,
        version: 1,
        decision: "approve",
      })
    ).statusCode,
    200,
  );
  const complete = await a.app.inject({
    method: "POST",
    url: "/api/bot/device/complete",
    payload: {
      enrollmentId: d.enrollmentId,
      deviceSecret: d.deviceSecret,
      candidateToken: candidate,
    },
  });
  assert.equal(complete.statusCode, 200, complete.body);
  assert.equal(complete.json().bot.credentialScope, "pool-only");
  const auth = { authorization: `Bearer ${candidate}` };
  assert.equal(
    (
      await a.app.inject({
        method: "POST",
        url: "/api/bot/heartbeat",
        headers: auth,
        payload: {},
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await a.app.inject({ url: "/api/bot/inbox", headers: auth })).statusCode,
    403,
  );
  assert.equal(
    (
      await a.app.inject({
        method: "POST",
        url: "/api/bot/tasks/fixture/result",
        headers: auth,
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await a.post("/api/missions", {
        title: "Private",
        brief: "Secret",
        visibility: "private",
        maxRounds: 1,
        botIds: [complete.json().bot.id],
      })
    ).statusCode,
    404,
  );
  await participate(a, complete.json().bot.id);
  assert.equal(
    (
      await a.app.inject({
        method: "POST",
        url: "/api/bot/pool/lease",
        headers: auth,
        payload: {},
      })
    ).statusCode,
    200,
  );
  const legacy = await a.bot("legacy-private");
  assert.equal(
    (
      await a.app.inject({
        url: "/api/bot/inbox",
        headers: { authorization: `Bearer ${legacy.token}` },
      })
    ).statusCode,
    200,
  );
  const second = await a.app.inject({
    method: "POST",
    url: "/api/bot/device/start",
    payload: {
      tokenHash: hash(`gbs_${secret()}`),
      name: "Reconnect",
      role: "scout",
      runtime: "external-agent",
      adapterVersion: "bottocks-adapter/0.1.0",
    },
  });
  const ds = second.json();
  assert.equal(
    (
      await a.post("/api/device/resolve", {
        userCode: ds.userCode,
        version: 1,
        decision: "approve",
        reconnectBotId: legacy.id,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await a.post("/api/device/resolve", {
        userCode: ds.userCode,
        version: 1,
        decision: "approve",
        reconnectBotId: legacy.id,
        credentialScope: "legacy-private",
      })
    ).statusCode,
    200,
  );
});

test("avatar assignment is owner-scoped, validated, revision-safe, public only on existing attribution and erased with account", async (t) => {
  const a = await actor(t),
    b = await actor(t),
    bot = await a.bot();
  const path = `/api/bots/${bot.id}/avatar`;
  assert.equal((await a.get(path)).json().revision, 0);
  assert.equal((await b.get(path)).statusCode, 404);
  const put = (config: object, revision: number) =>
    a.app.inject({
      method: "PUT",
      url: path,
      headers: a.headers,
      payload: { config, expectedRevision: revision },
    });
  assert.equal(
    (await put({ ...avatar, color: "url(javascript:alert(1))" }, 0)).statusCode,
    400,
  );
  const saved = await put(avatar, 0);
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().revision, 1);
  assert.equal(saved.json().receipt.botId, bot.id);
  assert.equal((await put(avatar, 0)).json().replayed, true);
  assert.equal(
    (await put({ ...avatar, expression: "happy" }, 0)).statusCode,
    409,
  );
  assert.equal((await a.get(path)).json().config.expression, "wink");
  const before = (await a.get("/api/pool/status")).json().participatingBots;
  assert.equal(
    (await a.get("/api/pool/questions"))
      .json()
      .items.some((q: any) => q.author.botId === bot.id),
    false,
  );
  await participate(a, bot.id);
  const q = (await ask(a, bot.id)).json().question;
  assert.deepEqual(q.author.avatarConfig, avatar);
  assert.equal(
    (await a.get("/api/pool/status")).json().participatingBots,
    before + 1,
  );
  const removed = await a.app.inject({
    method: "DELETE",
    url: path,
    headers: a.headers,
    payload: { expectedRevision: 1 },
  });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json().config, null);
  assert.equal(
    (await a.get(`/api/pool/questions/${q.id}`)).json().question.author
      .avatarConfig,
    null,
  );
  await closeAccount(db, a.session.owner.id);
  assert.equal(
    (await db.query("SELECT avatar_config FROM bots WHERE id=$1", [bot.id]))
      .rows.length,
    0,
  );
});

test("moderator resolves reports with audit and dedup permits a new incident; unprivileged suspension denied", async (t) => {
  const a = await actor(t),
    reporter = await actor(t),
    mod = await actor(t, true),
    bot = await a.bot();
  await participate(a, bot.id);
  const q = (await ask(a, bot.id)).json().question;
  const data = {
    questionId: q.id,
    reason: "Fixture public abuse",
    severity: "urgent",
  };
  assert.equal(
    (await reporter.post("/api/pool/reports", data)).json().replayed,
    false,
  );
  assert.equal(
    (await reporter.post("/api/pool/reports", data)).json().replayed,
    true,
  );
  assert.equal(
    (await reporter.get("/api/pool/moderation/reports")).statusCode,
    403,
  );
  assert.equal(
    (
      await reporter.post(
        `/api/pool/moderation/owners/${a.session.owner.id}/suspend`,
        { reason: "unauthorized" },
      )
    ).statusCode,
    403,
  );
  const queue = (await mod.get("/api/pool/moderation/reports")).json();
  const report = queue.items.find((r: any) => r.questionId === q.id);
  assert.equal(report.severity, "urgent");
  assert.equal(report.targetBotId, bot.id);
  const resolved = await mod.post(
    `/api/pool/moderation/reports/${report.id}/resolve`,
    {
      status: "resolved",
      reason: "Reviewed and handled",
      expectedStatus: "open",
    },
  );
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.ok(resolved.json().auditId);
  assert.equal(
    (await reporter.post("/api/pool/reports", data)).json().replayed,
    false,
  );
  assert.equal(
    (await mod.post(`/api/pool/questions/${q.id}/hide`, {})).statusCode,
    400,
  );
  assert.equal(
    (
      await mod.post(`/api/pool/questions/${q.id}/hide`, {
        reason: "Reviewed removal",
      })
    ).statusCode,
    200,
  );
  assert.equal((await a.get(`/api/pool/questions/${q.id}`)).statusCode, 404);
  const result = await mod.post(`/api/pool/moderation/bots/${bot.id}/revoke`, {
    reason: "Repeated public abuse",
  });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal((await bot.post("/api/bot/heartbeat")).statusCode, 401);
  const suspended = await mod.post(
    `/api/pool/moderation/owners/${a.session.owner.id}/suspend`,
    { reason: "Owner suspension" },
  );
  assert.equal(suspended.statusCode, 200, suspended.body);
  assert.equal((await a.get("/api/session")).json().authenticated, false);
  assert.ok(
    (
      await db.query("SELECT id FROM moderation_audit WHERE actor_id=$1", [
        mod.session.owner.id,
      ])
    ).rows.length >= 4,
  );
});

test("maintenance dry-run and bounded resume erase old public bodies while fencing retries and preserving participation", async (t) => {
  const a = await actor(t),
    b = await actor(t),
    ab = await a.bot(),
    bb = await b.bot();
  await participate(a, ab.id);
  await participate(b, bb.id);
  const key = randomUUID(),
    q = (await ask(a, ab.id, key)).json().question;
  const lease = (await bb.post("/api/bot/pool/lease")).json().lease;
  assert.ok(lease);
  const reply = {
    leaseId: lease.id,
    attemptId: lease.attemptId,
    idempotencyKey: randomUUID(),
    body: "Retain no private body",
    sources: [{ url: "https://example.com/source" }],
  };
  assert.equal((await bb.post("/api/bot/pool/replies", reply)).statusCode, 200);
  await db.query(
    "UPDATE pool_questions SET expires_at=now()-interval '31 days' WHERE id=$1",
    [q.id],
  );
  const dry = await runMaintenance(db, { dryRun: true, batchSize: 1 });
  assert.ok(dry.purgedQuestions >= 1);
  assert.equal(dry.auditId, null);
  assert.equal(
    (await db.query("SELECT body FROM pool_questions WHERE id=$1", [q.id]))
      .rows[0].body,
    "Only public data",
  );
  // Other tests may leave eligible rows: deterministic repeated batches finish without an external cursor file.
  for (let i = 0; i < 10; i++) {
    const result = await runMaintenance(db, { batchSize: 1 });
    if (
      (
        await db.query("SELECT purged_at FROM pool_questions WHERE id=$1", [
          q.id,
        ])
      ).rows[0].purged_at
    ) {
      assert.ok(result.auditId);
      break;
    }
  }
  assert.equal((await a.get(`/api/pool/questions/${q.id}`)).statusCode, 410);
  assert.equal((await ask(a, ab.id, key)).statusCode, 410);
  assert.equal((await bb.post("/api/bot/pool/replies", reply)).statusCode, 410);
  const retained = (
    await db.query(
      "SELECT body,sources FROM pool_replies WHERE question_id=$1",
      [q.id],
    )
  ).rows[0];
  assert.equal(retained.body, "");
  assert.deepEqual(retained.sources, []);
  assert.equal(
    (
      await db.query("SELECT enabled FROM pool_participation WHERE bot_id=$1", [
        bb.id,
      ])
    ).rows[0].enabled,
    true,
  );
  let exported = "";
  for await (const line of exportAccount(db, b.session.owner.id))
    exported += line;
  assert.ok(!exported.includes(reply.body));
  assert.equal(
    (await a.get("/api/pool/questions"))
      .json()
      .items.some((v: any) => v.id === q.id),
    false,
  );
});

test("owner suspension journal survives restored active account without erasing records", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "bottocks-launch-journal-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const a = await actor(t),
    bot = await a.bot(),
    journal = new ClosureJournal(dir, false);
  await journal.append("owner-suspend", a.session.owner.id);
  await replayClosureJournal(db, journal);
  assert.equal(
    (
      await db.query("SELECT status FROM owners WHERE id=$1", [
        a.session.owner.id,
      ])
    ).rows[0].status,
    "suspended",
  );
  assert.equal(
    (await db.query("SELECT id FROM bots WHERE id=$1", [bot.id])).rows.length,
    1,
  );
  await db.query("UPDATE owners SET status='active' WHERE id=$1", [
    a.session.owner.id,
  ]);
  await replayClosureJournal(db, journal);
  assert.equal(
    (
      await db.query("SELECT status FROM owners WHERE id=$1", [
        a.session.owner.id,
      ])
    ).rows[0].status,
    "suspended",
  );
});

test("moderation queue cursor preserves submillisecond timestamps and resolved report retention leaves unresolved incidents", async (t) => {
  const a = await actor(t),
    mod = await actor(t, true),
    bot = await a.bot();
  await participate(a, bot.id);
  const q = (await ask(a, bot.id)).json().question;
  const ids = Array.from({ length: 56 }, () => randomUUID());
  await db.query(
    "INSERT INTO pool_reports(id,question_id,owner_id,target_key,reason,created_at) SELECT value,$1,$2,value,'Fixture incident','2020-01-01T00:00:00.123456Z'::timestamptz FROM unnest($3::text[]) value",
    [q.id, a.session.owner.id, ids],
  );
  let cursor = null;
  const found: string[] = [];
  for (let page = 0; page < 5; page++) {
    const result = (
      await mod.get(
        "/api/pool/moderation/reports" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      )
    ).json();
    found.push(
      ...result.items
        .filter((r: any) => ids.includes(r.id))
        .map((r: any) => r.id),
    );
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  assert.equal(found.length, 56);
  assert.equal(new Set(found).size, 56);
  const resolved = ids[0];
  await db.query(
    "UPDATE pool_reports SET status='resolved',resolved_at=now()-interval '91 days',resolution_reason='Old handled incident' WHERE id=$1",
    [resolved],
  );
  await runMaintenance(db, { batchSize: 100 });
  assert.equal(
    (await db.query("SELECT id FROM pool_reports WHERE id=$1", [resolved])).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("SELECT id FROM pool_reports WHERE id=$1", [ids[1]])).rows
      .length,
    1,
  );
});
