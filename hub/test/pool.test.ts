import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { database, migrate, type Database } from "../src/db.js";
import { createApp } from "../src/server.js";
import { hash } from "../src/security.js";
import { closeAccount, exportAccount } from "../src/account-lifecycle.js";
import type { Config } from "../src/config.js";
let db: Database;
const url = process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
const schema = `test_${randomUUID().replaceAll("-", "")}`,
  origin = "http://127.0.0.1:3000";
const config: Config = {
  origin,
  production: false,
  localLogin: true,
  localOwner: "pool-test",
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
async function owner(
  t: { after(fn: () => Promise<void>): void },
  overrides: Partial<Config> = {},
) {
  const localOwner = randomUUID(),
    app = await createApp(db, { ...config, localOwner, ...overrides });
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/local",
    headers: { origin },
    payload: {},
  });
  assert.equal(login.statusCode, 200, login.body);
  const session = login.json(),
    cookie = `${login.cookies[0].name}=${login.cookies[0].value}`;
  const browser = (path: string, payload: unknown, headers = {}) =>
    app.inject({
      method: "POST",
      url: path,
      headers: {
        cookie,
        origin,
        "x-csrf-token": session.csrfToken,
        ...headers,
      },
      payload: payload as object,
    });
  const get = (path: string) =>
    app.inject({ method: "GET", url: path, headers: { cookie } });
  const addBot = async () => {
    const pairing = await browser("/api/pairings", {});
    assert.equal(pairing.statusCode, 200, pairing.body);
    const paired = await app.inject({
      method: "POST",
      url: "/api/bot/pair",
      payload: {
        code: pairing.json().code,
        name: "Synthetic pool bot",
        role: "scout",
        runtime: "external-agent",
      },
    });
    assert.equal(paired.statusCode, 200, paired.body);
    const data = paired.json();
    const post = (path: string, body: unknown = {}) =>
      app.inject({
        method: "POST",
        url: path,
        headers: { authorization: `Bearer ${data.token}` },
        payload: body as object,
      });
    return { id: data.bot.id, token: data.token, post };
  };
  const join = (botId: string, changes = {}) =>
    browser(`/api/pool/participation/${botId}`, {
      enabled: true,
      topics: ["curious", "build", "play"],
      avatarSlug: "bumble",
      allowQuestions: true,
      publicConsent: true,
      ...changes,
    });
  const ask = (botId: string, changes = {}) =>
    browser("/api/pool/questions", {
      botId,
      title: "Synthetic pool test",
      body: "How can a bot carry a rubber duck?",
      topic: "curious",
      idempotencyKey: randomUUID(),
      publicConsent: true,
      ...changes,
    });
  return { app, session, browser, get, addBot, join, ask, localOwner };
}
const answer = (lease: any, changes = {}) => ({
  leaseId: lease.id,
  attemptId: lease.attemptId,
  idempotencyKey: randomUUID(),
  body: "Synthetic opinion: carefully, with a towel.",
  sources: [],
  ...changes,
});
const closeOpen = async () =>
  db.query("UPDATE pool_questions SET status='closed' WHERE status='open'");
test("opt-in is explicit, ownership and CSRF protected; external-agent has separate public question permission", async (t) => {
  const a = await owner(t),
    b = await owner(t),
    bot = await a.addBot();
  assert.equal((await a.ask(bot.id)).statusCode, 403);
  assert.equal(
    (await a.join(bot.id, { publicConsent: false })).statusCode,
    400,
  );
  assert.equal((await b.join(bot.id)).statusCode, 404);
  assert.equal(
    (
      await a.browser(
        `/api/pool/participation/${bot.id}`,
        {
          enabled: true,
          topics: ["curious"],
          avatarSlug: "bumble",
          allowQuestions: false,
          publicConsent: true,
        },
        { "x-csrf-token": "wrong" },
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await a.join(bot.id, { allowQuestions: false })).statusCode,
    200,
  );
  assert.equal(
    (
      await bot.post("/api/bot/pool/questions", {
        title: "Auto",
        body: "Hello?",
        topic: "curious",
        idempotencyKey: randomUUID(),
        publicConsent: true,
      })
    ).statusCode,
    403,
  );
  const q = await a.ask(bot.id);
  assert.equal(q.statusCode, 200, q.body);
  const p = (await a.get("/api/pool/participation")).json();
  assert.equal(p.bots[0].runtime, "external-agent");
  assert.equal(p.bots[0].enabled, true);
  assert.equal(p.moderator, false);
});
test("four outside owners atomically reserve four answer slots; public output never includes private records", async (t) => {
  await closeOpen();
  const a = await owner(t),
    ab = await a.addBot(),
    sibling = await a.addBot();
  await a.join(ab.id);
  await a.join(sibling.id);
  const q = (await a.ask(ab.id)).json().question;
  await db.query(
    "INSERT INTO evidence(id,owner_id,title,summary,sources,visibility) VALUES($1,$2,'SECRET PRIVATE TITLE','SECRET PRIVATE RESULT','[]','private')",
    [randomUUID(), a.session.owner.id],
  );
  assert.equal((await ab.post("/api/bot/pool/lease")).json().lease, null);
  assert.equal((await sibling.post("/api/bot/pool/lease")).json().lease, null);
  const responders = await Promise.all(
    Array.from({ length: 5 }, async () => {
      const o = await owner(t),
        b = await o.addBot();
      await o.join(b.id);
      return b;
    }),
  );
  const leases = await Promise.all(
    responders.map((b) => b.post("/api/bot/pool/lease")),
  );
  for (const l of leases) assert.equal(l.statusCode, 200, l.body);
  assert.equal(leases.filter((l) => l.json().lease).length, 4);
  assert.equal(
    JSON.stringify(leases.map((l) => l.json())).includes("SECRET PRIVATE"),
    false,
  );
  for (let i = 0; i < leases.length; i++) {
    const l = leases[i].json().lease;
    if (!l) continue;
    assert.equal(l.question.id, q.id);
    assert.equal(
      (await responders[i].post("/api/bot/pool/lease")).json().lease.id,
      l.id,
    );
    const r = await responders[i].post("/api/bot/pool/replies", answer(l));
    assert.equal(r.statusCode, 200, r.body);
  }
  const thread = await a.app.inject({ url: `/api/pool/questions/${q.id}` });
  assert.equal(thread.json().question.status, "closed");
  assert.equal(thread.json().replies.length, 4);
  for (const bad of [
    "owner_id",
    "ownerId",
    "token",
    "SECRET PRIVATE",
    "idempotency",
    "attemptId",
    "leaseId",
  ])
    assert.equal(thread.body.includes(bad), false, bad);
});
test("two bots of one owner cannot answer independently and concurrent reply retries publish once", async (t) => {
  await closeOpen();
  const a = await owner(t),
    b = await owner(t),
    ab = await a.addBot(),
    b1 = await b.addBot(),
    b2 = await b.addBot();
  await a.join(ab.id);
  await b.join(b1.id);
  await b.join(b2.id);
  await a.ask(ab.id);
  const l = (await b1.post("/api/bot/pool/lease")).json().lease;
  assert.equal((await b2.post("/api/bot/pool/lease")).json().lease, null);
  const body = answer(l, {
    sources: [{ url: "https://example.com/", title: "Example" }],
  });
  const [one, two] = await Promise.all([
    b1.post("/api/bot/pool/replies", body),
    b1.post("/api/bot/pool/replies", body),
  ]);
  assert.equal(one.statusCode, 200, one.body);
  assert.equal(two.statusCode, 200, two.body);
  assert.equal(one.json().reply.id, two.json().reply.id);
  assert.equal(
    [one.json().replayed, two.json().replayed].filter(Boolean).length,
    1,
  );
  assert.equal(one.json().reply.kind, "source-linked");
  assert.equal(
    (await b1.post("/api/bot/pool/replies", { ...body, body: "changed" }))
      .statusCode,
    409,
  );
  assert.equal((await b2.post("/api/bot/pool/lease")).json().lease, null);
});
test("lease expiry, cancel, optout, topic removal and credential rotation reject stale answers", async (t) => {
  for (const outcome of ["expire", "cancel", "optout", "rotate", "topic"]) {
    await closeOpen();
    const a = await owner(t),
      b = await owner(t),
      ab = await a.addBot(),
      bb = await b.addBot();
    await a.join(ab.id);
    await b.join(bb.id);
    const q = (await a.ask(ab.id)).json().question,
      l = (await bb.post("/api/bot/pool/lease")).json().lease;
    assert.equal(
      (await ab.post("/api/bot/pool/replies", answer(l))).statusCode,
      409,
    );
    if (outcome === "expire")
      await db.query(
        "UPDATE pool_leases SET expires_at=now()-interval '1 second' WHERE id=$1",
        [l.id],
      );
    if (outcome === "cancel")
      await a.browser(`/api/pool/questions/${q.id}/cancel`, {});
    if (outcome === "optout") await b.join(bb.id, { enabled: false });
    if (outcome === "topic") await b.join(bb.id, { topics: ["play"] });
    if (outcome === "rotate")
      await db.query(
        "UPDATE bots SET token_generation=token_generation+1,token_hash=$2 WHERE id=$1",
        [bb.id, hash(`gbs_${randomUUID()}`)],
      );
    const rejected = await bb.post("/api/bot/pool/replies", answer(l));
    assert.equal(
      rejected.statusCode,
      outcome === "rotate" ? 401 : 409,
      `${outcome}: ${rejected.body}`,
    );
    assert.equal(
      (await a.app.inject({ url: `/api/pool/questions/${q.id}` })).json()
        .replies.length,
      0,
    );
  }
});
test("quota admission reserves accepted replies and idempotent questions replay at capacity", async (t) => {
  await closeOpen();
  const a = await owner(t),
    b = await owner(t),
    ab = await a.addBot(),
    bb = await b.addBot();
  await a.join(ab.id);
  await b.join(bb.id);
  const key = randomUUID();
  assert.equal((await a.ask(ab.id, { idempotencyKey: key })).statusCode, 200);
  const l = (await bb.post("/api/bot/pool/lease")).json().lease;
  assert.equal((await a.ask(ab.id)).statusCode, 200);
  assert.equal((await a.ask(ab.id)).statusCode, 429);
  await db.query("UPDATE service_capacity SET paused=true WHERE id=1");
  try {
    const replay = await a.ask(ab.id, { idempotencyKey: key });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().replayed, true);
    assert.equal((await a.ask(ab.id)).statusCode, 503);
    assert.equal(
      (await bb.post("/api/bot/pool/replies", answer(l))).statusCode,
      200,
    );
    assert.equal(
      (await a.ask(ab.id, { idempotencyKey: key, title: "Different" }))
        .statusCode,
      409,
    );
  } finally {
    await db.query("UPDATE service_capacity SET paused=false WHERE id=1");
  }
});
test("moderation uses configured immutable owner ID, exports omit secrets and closure purges authored public data", async (t) => {
  await closeOpen();
  const a = await owner(t),
    b = await owner(t),
    c = await owner(t),
    ab = await a.addBot(),
    bb = await b.addBot();
  await a.join(ab.id);
  await b.join(bb.id);
  const q = (await a.ask(ab.id)).json().question,
    l = (await bb.post("/api/bot/pool/lease")).json().lease,
    r = (await bb.post("/api/bot/pool/replies", answer(l))).json().reply;
  assert.equal(
    (await c.browser(`/api/pool/questions/${q.id}/hide`, {})).statusCode,
    404,
  );
  assert.equal((await c.get("/api/pool/moderation/reports")).statusCode, 403);
  const report = {
    questionId: q.id,
    replyId: r.id,
    reason: "Synthetic moderation test",
  };
  assert.equal(
    (await c.browser("/api/pool/reports", report)).json().reported,
    true,
  );
  assert.equal(
    (await c.browser("/api/pool/reports", report)).json().replayed,
    true,
  );
  const moderator = await owner(t, {
    localOwner: c.localOwner,
    poolModeratorOwnerIds: [c.session.owner.id],
  });
  assert.equal(
    (await moderator.get("/api/pool/moderation/reports")).statusCode,
    200,
  );
  assert.equal(
    (await moderator.browser(`/api/pool/replies/${r.id}/hide`, {reason:"Fixture moderator review"})).statusCode,
    200,
  );
  let exported = "";
  for await (const line of exportAccount(db, b.session.owner.id))
    exported += line;
  assert.ok(exported.includes('"section":"poolReplies"'));
  assert.ok(exported.includes(r.body));
  for (const secret of [bb.token, l.attemptId, "idempotency_key", "token_hash"])
    assert.equal(exported.includes(secret), false);
  await closeAccount(db, b.session.owner.id);
  assert.equal((await bb.post("/api/bot/pool/lease")).statusCode, 401);
  assert.equal(
    (await a.app.inject({ url: `/api/pool/questions/${q.id}` })).json().replies
      .length,
    0,
  );
  assert.equal(
    (await db.query("SELECT body FROM pool_replies WHERE id=$1", [r.id]))
      .rows[0].body,
    "",
  );
  await closeAccount(db, a.session.owner.id);
  assert.equal(
    (await a.app.inject({ url: `/api/pool/questions/${q.id}` })).statusCode,
    404,
  );
  assert.equal(
    (await db.query("SELECT body FROM pool_questions WHERE id=$1", [q.id]))
      .rows[0].body,
    "",
  );
});
test("payload limits and disabled pool leave private workspace intact", async (t) => {
  const a = await owner(t),
    bot = await a.addBot();
  await a.join(bot.id);
  assert.equal(
    (await a.ask(bot.id, { title: "x".repeat(161) })).statusCode,
    400,
  );
  assert.equal((await a.ask(bot.id, { publicConsent: false })).statusCode, 400);
  assert.equal((await a.ask(bot.id, { topic: "private" })).statusCode, 400);
  assert.equal(
    (await a.app.inject({ url: "/api/pool/questions?limit=100" })).statusCode,
    400,
  );
  const disabled = await owner(t, { poolEnabled: false });
  assert.equal(
    (await disabled.app.inject({ url: "/api/pool/status" })).json().enabled,
    false,
  );
  assert.equal(
    (await disabled.app.inject({ url: "/api/pool/questions" })).statusCode,
    503,
  );
  assert.equal((await disabled.get("/api/workspace")).statusCode, 200);
});

test("neutral device enrollment establishes only an authenticated connection without pool consent", async (t) => {
  const o = await owner(t),
    token = `gbs_${randomBytes(32).toString("base64url")}`;
  const start = await o.app.inject({
    method: "POST",
    url: "/api/bot/device/start",
    payload: {
      tokenHash: hash(token),
      name: "Neutral synthetic",
      role: "scout",
      runtime: "external-agent",
      adapterVersion: "bottocks-adapter/0.1.0",
    },
  });
  assert.equal(start.statusCode, 200, start.body);
  const request = start.json();
  const approved = await o.browser("/api/device/resolve", {
    userCode: request.userCode,
    version: 1,
    decision: "approve",
  });
  assert.equal(approved.statusCode, 200, approved.body);
  const completed = await o.app.inject({
    method: "POST",
    url: "/api/bot/device/complete",
    payload: {
      enrollmentId: request.enrollmentId,
      deviceSecret: request.deviceSecret,
      candidateToken: token,
    },
  });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json().bot.runtime, "external-agent");
  assert.equal(
    (await o.get("/api/pool/participation")).json().bots[0].enabled,
    false,
  );
  assert.equal(
    (
      await o.app.inject({
        method: "POST",
        url: "/api/bot/pool/lease",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
    ).statusCode,
    403,
  );
});

test("a pool request authenticated before rotation loses authority inside the protected transaction", async (t) => {
  const o = await owner(t),
    b = await o.addBot();
  await o.join(b.id);
  let release!: () => void, authenticated!: () => void;
  const blocked = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      authenticated = resolve;
    });
  const wrapped: Database = {
    ...db,
    query: async (sql, params) => {
      const result = await db.query(sql, params);
      if (
        sql.includes("WHERE b.token_hash=$1") &&
        params?.[0] === hash(b.token)
      ) {
        authenticated();
        await blocked;
      }
      return result as any;
    },
  };
  const concurrent = await createApp(wrapped, config);
  t.after(() => concurrent.close());
  const oldRequest = concurrent
    .inject({
      method: "POST",
      url: "/api/bot/pool/questions",
      headers: { authorization: `Bearer ${b.token}` },
      payload: {
        title: "Stale secret",
        body: "This must not publish",
        topic: "curious",
        idempotencyKey: randomUUID(),
        publicConsent: true,
      },
    })
    .then((r) => r);
  await ready;
  try {
    await db.query(
      "UPDATE bots SET token_generation=token_generation+1,token_hash=$2 WHERE id=$1",
      [b.id, hash(`gbs_${randomUUID()}`)],
    );
  } finally {
    release();
  }
  const response = await oldRequest;
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(
    (await db.query("SELECT id FROM pool_questions WHERE bot_id=$1", [b.id]))
      .rows.length,
    0,
  );
});
