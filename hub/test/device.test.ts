import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { database, migrate, type Database } from "../src/db.js";
import { createApp } from "../src/server.js";
import { hash } from "../src/security.js";
import type { Config } from "../src/config.js";

let db: Database;
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
const isolatedSchema = `test_${randomUUID().replaceAll("-", "")}`;
const origin = "http://127.0.0.1:3000";
const base: Config = { origin, production: false, localLogin: true, localOwner: "device-test", host: "127.0.0.1", port: 8787, sessionHours: 24, pairingMinutes: 10, leaseSeconds: 300, maxAttempts: 3, fetch };
before(async () => {
  if (databaseUrl) {
    const admin = await database({ url: databaseUrl });
    await admin.exec(`CREATE SCHEMA ${isolatedSchema}`);
    await admin.close();
  }
  db = await database({ url: databaseUrl, schema: databaseUrl ? isolatedSchema : undefined });
  await migrate(db);
});
after(async () => {
  await db?.close();
  if (databaseUrl) {
    const admin = await database({ url: databaseUrl });
    await admin.exec(`DROP SCHEMA ${isolatedSchema} CASCADE`);
    await admin.close();
  }
});

async function setup(t: { after(fn: () => Promise<void>): void }, name = randomUUID()) {
  const app = await createApp(db, { ...base, localOwner: name });
  t.after(() => app.close());
  const login = await app.inject({ method: "POST", url: "/api/auth/local", headers: { origin }, payload: {} });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = `${login.cookies[0].name}=${login.cookies[0].value}`;
  const session = login.json();
  const browser = (url: string, payload: unknown, override: Record<string, string> = {}) => app.inject({ method: "POST", url, headers: { cookie, origin, "x-csrf-token": session.csrfToken, ...override }, payload: payload as object });
  const bot = (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: payload as object });
  const start = async () => {
    const candidateToken = `gbs_${randomBytes(32).toString("base64url")}`;
    const response = await bot("/api/bot/device/start", { tokenHash: hash(candidateToken), name: "Device scout", role: "scout", runtime: "native-grok", adapterVersion: "native-grok-adapter/0.3.0" });
    assert.equal(response.statusCode, 200, response.body);
    const request = response.json();
    return { ...request, candidateToken, proof: { enrollmentId: request.enrollmentId, deviceSecret: request.deviceSecret } };
  };
  const approve = (request: any, reconnectBotId?: string) => browser("/api/device/resolve", { userCode: request.userCode, version: 1, decision: "approve", ...(reconnectBotId ? { reconnectBotId } : {}) });
  const complete = (request: any) => bot("/api/bot/device/complete", { ...request.proof, candidateToken: request.candidateToken });
  return { app, session, browser, bot, start, approve, complete };
}

test("browser approval exposes exact metadata but no secrets; activation waits for candidate proof and replays one Bot", async t => {
  const owner = await setup(t), request = await owner.start();
  assert.equal(request.verificationUrl, `${origin}/connect/`);
  const stored = (await db.query("SELECT * FROM device_enrollments WHERE id=$1", [request.enrollmentId])).rows[0];
  assert.equal(stored.device_secret_hash, hash(request.deviceSecret));
  assert.equal(JSON.stringify(stored).includes(request.candidateToken), false);
  const inspected = await owner.browser("/api/device/inspect", { userCode: request.userCode });
  assert.equal(inspected.statusCode, 200, inspected.body);
  assert.equal(inspected.json().adapterVersion, "native-grok-adapter/0.3.0");
  assert.equal(inspected.body.includes(request.deviceSecret), false);
  assert.equal(inspected.body.includes(stored.candidate_token_hash), false);
  assert.equal((await owner.complete(request)).statusCode, 409);
  const approved = await owner.approve(request);
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal((await db.query("SELECT id FROM bots WHERE owner_id=$1", [owner.session.owner.id])).rows.length, 0);
  const wrong = await owner.bot("/api/bot/device/complete", { ...request.proof, candidateToken: `gbs_${randomBytes(32).toString("base64url")}` });
  assert.equal(wrong.statusCode, 401);
  const receipt = await owner.complete(request);
  assert.equal(receipt.statusCode, 200, receipt.body);
  const replay = await owner.complete(request);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().bot.id, receipt.json().bot.id);
  assert.equal((await db.query("SELECT id FROM bots WHERE owner_id=$1", [owner.session.owner.id])).rows.length, 1);
  assert.equal(receipt.json().bot.lastSeenAt, null);
  assert.equal((await db.query("SELECT id FROM tasks WHERE bot_id=$1", [receipt.json().bot.id])).rows.length, 0);
});

test("approval requires current browser origin, CSRF and unchanged version; another owner cannot reuse it", async t => {
  const owner = await setup(t), other = await setup(t), request = await owner.start();
  assert.equal((await owner.browser("/api/device/inspect", { userCode: request.userCode }, { origin: "https://evil.example" })).statusCode, 403);
  assert.equal((await owner.browser("/api/device/resolve", { userCode: request.userCode, version: 1, decision: "approve" }, { "x-csrf-token": "wrong" })).statusCode, 403);
  assert.equal((await owner.browser("/api/device/resolve", { userCode: request.userCode, version: 2, decision: "approve" })).statusCode, 409);
  assert.equal((await owner.approve(request)).statusCode, 200);
  assert.equal((await other.browser("/api/device/inspect", { userCode: request.userCode })).statusCode, 404);
  assert.equal((await other.approve(request)).statusCode, 404);
});

test("denial, expiry and cancellation cannot activate a credential", async t => {
  const owner = await setup(t);
  for (const outcome of ["denied", "expired", "cancelled"]) {
    const request = await owner.start();
    if (outcome === "denied") await owner.browser("/api/device/resolve", { userCode: request.userCode, version: 1, decision: "deny" });
    else {
      await owner.approve(request);
      if (outcome === "expired") await db.query("UPDATE device_enrollments SET expires_at=now()-interval '1 second' WHERE id=$1", [request.enrollmentId]);
      else await owner.bot("/api/bot/device/cancel", request.proof);
    }
    assert.equal((await owner.complete(request)).statusCode, 409);
    const poll = await owner.bot("/api/bot/device/poll", request.proof);
    assert.equal(poll.json().status, outcome);
  }
  assert.equal((await db.query("SELECT id FROM bots WHERE owner_id=$1", [owner.session.owner.id])).rows.length, 0);
});

test("approved enrollment reserves capacity shared with advanced pairing", async t => {
  const owner = await setup(t), first = await owner.start(), second = await owner.start(), third = await owner.start();
  assert.equal((await owner.approve(first)).statusCode, 200);
  assert.equal((await owner.approve(second)).statusCode, 200);
  assert.equal((await owner.approve(third)).statusCode, 429);
  const pairing = await owner.browser("/api/pairings", {});
  if (pairing.statusCode === 200) {
    const result = await owner.bot("/api/bot/pair", { code: pairing.json().code, name: "Advanced", role: "scout", runtime: "native-grok" });
    assert.equal(result.statusCode, 429, result.body);
  } else assert.equal(pairing.statusCode, 429);
  assert.equal((await owner.complete(first)).statusCode, 200);
  assert.equal((await owner.complete(second)).statusCode, 200);
});

test("reconnect preserves identity, rotates generation and rejects old bearer plus old completion replay", async t => {
  const owner = await setup(t), original = await owner.start();
  await owner.approve(original);
  const initial = await owner.complete(original), botId = initial.json().bot.id;
  const replacement = await owner.start();
  const approval = await owner.approve(replacement, botId);
  assert.equal(approval.statusCode, 200, approval.body);
  assert.equal((await db.query("SELECT token_hash FROM bots WHERE id=$1", [botId])).rows[0].token_hash, hash(original.candidateToken));
  const complete = await owner.complete(replacement);
  assert.equal(complete.statusCode, 200, complete.body);
  assert.equal(complete.json().bot.id, botId);
  const row = (await db.query("SELECT * FROM bots WHERE id=$1", [botId])).rows[0];
  assert.equal(row.token_generation, 2);
  const oldCheckin = await owner.app.inject({ method: "POST", url: "/api/bot/heartbeat", headers: { authorization: `Bearer ${original.candidateToken}` }, payload: { version: "native-grok-adapter/0.3.0", capabilities: [] } });
  assert.equal(oldCheckin.statusCode, 401);
  assert.equal((await owner.complete(original)).statusCode, 409);
});

test("reconnect rejects a foreign Bot and a live task lease, including a lease acquired after approval", async t => {
  const owner = await setup(t), other = await setup(t), original = await owner.start();
  await owner.approve(original);
  const botId = (await owner.complete(original)).json().bot.id;
  const foreign = await other.start();
  assert.equal((await other.approve(foreign, botId)).statusCode, 404);
  const request = await owner.start();
  await owner.approve(request, botId);
  const missionId = randomUUID();
  await db.query("INSERT INTO missions(id,owner_id,title,brief,status,visibility,max_rounds) VALUES($1,$2,'test','test','running','private',1)", [missionId, owner.session.owner.id]);
  await db.query("INSERT INTO tasks(id,mission_id,bot_id,round,status,attempts,lease_expires_at) VALUES($1,$2,$3,1,'leased',1,now()+interval '1 minute')", [randomUUID(), missionId, botId]);
  assert.equal((await owner.complete(request)).statusCode, 409);
  const later = await owner.start();
  assert.equal((await owner.approve(later, botId)).statusCode, 409);
  assert.equal((await db.query("SELECT token_hash FROM bots WHERE id=$1", [botId])).rows[0].token_hash, hash(original.candidateToken));
});

test("closed owner cannot activate an already approved connection; rapid polling gets Retry-After", async t => {
  const owner = await setup(t), request = await owner.start();
  await owner.approve(request);
  assert.equal((await owner.bot("/api/bot/device/poll", request.proof)).statusCode, 200);
  const fast = await owner.bot("/api/bot/device/poll", request.proof);
  assert.equal(fast.statusCode, 429);
  assert.equal(fast.headers["retry-after"], "5");
  assert.equal((await owner.bot("/api/bot/device/poll", { ...request.proof, deviceSecret: "incorrect" })).statusCode, 401);
  await db.query("UPDATE owners SET status='closed' WHERE id=$1", [owner.session.owner.id]);
  assert.equal((await owner.complete(request)).statusCode, 403);
});

test("an old request authenticated before reconnect cannot mutate the Bot after rotation", async t => {
  const owner = await setup(t), original = await owner.start();
  await owner.approve(original);
  const botId = (await owner.complete(original)).json().bot.id;
  const replacement = await owner.start();
  await owner.approve(replacement, botId);
  let release!: () => void, authenticated!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { authenticated = resolve; });
  const wrapped: Database = { ...db, query: async (sql, params) => {
    const result = await db.query(sql, params);
    if (sql.includes("WHERE b.token_hash=$1") && params?.[0] === hash(original.candidateToken)) { authenticated(); await blocked; }
    return result as any;
  } };
  const concurrent = await createApp(wrapped, base);
  t.after(() => concurrent.close());
  const oldRequest = concurrent.inject({ method: "POST", url: "/api/bot/heartbeat", headers: { authorization: `Bearer ${original.candidateToken}` }, payload: { version: "native-grok-adapter/0.3.0", capabilities: [] } }).then(result => result);
  await ready;
  try { assert.equal((await owner.complete(replacement)).statusCode, 200); }
  finally { release(); }
  const response = await oldRequest;
  assert.equal(response.statusCode, 401, response.body);
  assert.equal((await db.query("SELECT last_seen_at FROM bots WHERE id=$1", [botId])).rows[0].last_seen_at, null);
});
