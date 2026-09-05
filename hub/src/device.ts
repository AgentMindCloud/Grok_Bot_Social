import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import type { Database, Queryable, Row } from "./db.js";
import { choice, fail, hash, integer, object, safeEqual, secret, string } from "./security.js";
import { admitBot, lockAdmission, resolvePublicLimits } from "./limits.js";

interface DeviceServices {
  owner(request: FastifyRequest, mutation?: boolean): Promise<Row>;
  checkOrigin(request: FastifyRequest): void;
  rate(request: FastifyRequest, bucket: string, max?: number): void;
  botView(row: Row): unknown;
  event(tx: Queryable, ownerId: string, type: string, message: string): Promise<void>;
}
const VERSIONS = ["native-grok-adapter/0.3.0", "bottocks-adapter/0.1.0"];
const iso = (v: unknown) => new Date(v as string).toISOString();
const codeHash = (v: unknown) => {
  const code = string(v, "Verification code", 12).toUpperCase().replaceAll("-", "");
  if (!/^[A-Z2-9]{8}$/.test(code)) return fail(400, "Invalid verification code");
  return hash(code);
};
const phase = (row: Row) => row.status === "completed" ? "completed" :
  new Date(row.expires_at).getTime() <= Date.now() ? "expired" : row.status;
const summary = (row: Row) => ({
  enrollmentId: row.id, name: row.name, role: row.role, runtime: row.runtime,
  adapterVersion: row.adapter_version, version: row.version, status: phase(row),
  expiresAt: iso(row.expires_at), botId: row.bot_id ?? null,
  reconnectBotId: row.reconnect_bot_id ?? null,
  permissions: ["Report connection status", "Request one owner-approved research task", "Submit private, sourced findings"],
  runtimeAttestation: "owner-declared",
});
async function activeOwner(tx: Queryable, ownerId: string) {
  const result = await tx.query("SELECT * FROM owners WHERE id=$1 FOR UPDATE", [ownerId]);
  if (!result.rows[0] || result.rows[0].status !== "active") return fail(403, "Account is not active");
  return result.rows[0];
}
async function drained(tx: Queryable, botId: string) {
  const leases = await tx.query("SELECT id FROM tasks WHERE bot_id=$1 AND status='leased' AND lease_expires_at>now() LIMIT 1", [botId]);
  if (leases.rows.length) return fail(409, "Wait for the current task lease to finish before reconnecting this Bot");
  if ((await tx.query("SELECT id FROM pool_leases WHERE bot_id=$1 AND status='leased' AND expires_at>now() LIMIT 1", [botId])).rows.length)
    return fail(409, "Wait for the current public answer lease to finish before reconnecting this Bot");
}

export function registerDevice(app: FastifyInstance, db: Database, config: Config, services: DeviceServices) {
  const { owner, rate, botView, event } = services;
  const publicLimits = resolvePublicLimits(config.publicLimits);
  const authenticate = async (tx: Queryable, input: Record<string, unknown>, lock = false) => {
    const enrollmentId = string(input.enrollmentId, "Enrollment ID", 80);
    const deviceSecret = string(input.deviceSecret, "Device secret", 100);
    const result = await tx.query(`SELECT * FROM device_enrollments WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [enrollmentId]);
    const row = result.rows[0];
    if (!row || !safeEqual(hash(deviceSecret), row.device_secret_hash)) return fail(401, "Connection request is unavailable");
    return row;
  };
  app.post("/api/bot/device/start", async (request) => {
    rate(request, "device-start", 12);
    const input = object(request.body, ["tokenHash", "name", "role", "runtime", "adapterVersion"]);
    const tokenHash = string(input.tokenHash, "Candidate token hash", 64);
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return fail(400, "Invalid candidate token hash");
    const name = string(input.name, "Bot name", 80);
    const role = choice(input.role, ["scout", "delegate"] as const, "role");
    const runtime = choice(input.runtime, ["native-grok", "grok-compatible", "external-agent"] as const, "runtime");
    if (!VERSIONS.includes(input.adapterVersion as string)) return fail(400, "Use native-grok-adapter/0.3.0 or bottocks-adapter/0.1.0 before connecting");
    const enrollmentId = randomUUID(), deviceSecret = secret();
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const rawCode = Array.from(randomBytes(8), v => alphabet[v % alphabet.length]).join("");
    const userCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;
    const expiresAt = new Date(Date.now() + 600_000);
    const result = await db.query("INSERT INTO device_enrollments(id,device_secret_hash,user_code_hash,candidate_token_hash,name,role,runtime,adapter_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(candidate_token_hash) DO NOTHING RETURNING id", [enrollmentId, hash(deviceSecret), hash(rawCode), tokenHash, name, role, runtime, input.adapterVersion, expiresAt]);
    if (!result.rows.length) return fail(409, "This candidate was already submitted; resume the saved connection request or create a new candidate");
    return { enrollmentId, deviceSecret, userCode, verificationUrl: `${config.origin}/connect/`, expiresAt: expiresAt.toISOString(), interval: 5, version: 1 };
  });
  app.post("/api/bot/device/poll", async (request, reply) => {
    rate(request, "device-poll", 240);
    const input = object(request.body, ["enrollmentId", "deviceSecret"]);
    const result = await db.transaction(async tx => {
      const row = await authenticate(tx, input, true);
      if (row.last_polled_at && Date.now() - new Date(row.last_polled_at).getTime() < 4900) return null;
      await tx.query("UPDATE device_enrollments SET last_polled_at=now() WHERE id=$1", [row.id]);
      return { ...summary(row), interval: 5 };
    });
    if (!result) return reply.header("Retry-After", "5").code(429).send({ error: "Poll no more than once every five seconds" });
    return result;
  });
  app.post("/api/device/inspect", async request => {
    const current = await owner(request, true);
    rate(request, "device-inspect", 30);
    const input = object(request.body, ["userCode"]);
    const result = await db.query("SELECT * FROM device_enrollments WHERE user_code_hash=$1", [codeHash(input.userCode)]);
    const row = result.rows[0];
    if (!row || (row.owner_id && row.owner_id !== current.id)) return fail(404, "Connection request is unavailable");
    const bots = await db.query("SELECT * FROM bots WHERE owner_id=$1 AND status!='revoked' ORDER BY created_at LIMIT 2", [current.id]);
    return { ...summary(row), owner: { id: current.id, handle: current.handle }, reconnectCandidates: bots.rows.map(botView) };
  });
  app.post("/api/device/resolve", async request => {
    const current = await owner(request, true);
    rate(request, "device-resolve", 30);
    const input = object(request.body, ["userCode", "version", "decision", "reconnectBotId"]);
    const userCodeHash = codeHash(input.userCode);
    const version = integer(input.version, 1, 1000, "version");
    const decision = choice(input.decision, ["approve", "deny"] as const, "decision");
    const reconnectId = input.reconnectBotId === undefined ? null : string(input.reconnectBotId, "Reconnect Bot ID", 80);
    if (decision === "deny" && reconnectId) return fail(400, "Denied requests cannot select a Bot");
    return db.transaction(async tx => {
      await lockAdmission(tx);
      await activeOwner(tx, current.id);
      const row = (await tx.query("SELECT * FROM device_enrollments WHERE user_code_hash=$1 FOR UPDATE", [userCodeHash])).rows[0];
      if (!row || (row.owner_id && row.owner_id !== current.id)) return fail(404, "Connection request is unavailable");
      if (row.version !== version) return fail(409, "Connection details changed; review them again");
      const desired = decision === "approve" ? "approved" : "denied";
      if ((row.status === desired || (row.status === "completed" && desired === "approved")) && row.owner_id === current.id && row.reconnect_bot_id === reconnectId) return { ...summary(row), replayed: true };
      if (phase(row) !== "pending") return fail(409, "Connection request is no longer pending");
      let priorGeneration: number | null = null;
      if (decision === "approve") {
        if (reconnectId) {
          const bot = (await tx.query("SELECT * FROM bots WHERE id=$1 AND owner_id=$2 AND status!='revoked' FOR UPDATE", [reconnectId, current.id])).rows[0];
          if (!bot) return fail(404, "Choose an available Bot belonging to this account");
          if (bot.role !== row.role || bot.runtime !== row.runtime) return fail(409, "Reconnect requires the existing Bot role and runtime");
          await drained(tx, reconnectId);
          priorGeneration = bot.token_generation;
        } else {
          await admitBot(tx, current.id, publicLimits);
        }
      }
      const updated = (await tx.query("UPDATE device_enrollments SET owner_id=$2,status=$3,bot_id=$4,reconnect_bot_id=$5,prior_token_generation=$6,approved_at=CASE WHEN $3='approved' THEN now() ELSE NULL END WHERE id=$1 RETURNING *", [row.id, current.id, desired, decision === "approve" ? reconnectId ?? randomUUID() : null, reconnectId, priorGeneration])).rows[0];
      await event(tx, current.id, `bot.connection.${desired}`, `${decision === "approve" ? "Approved" : "Denied"} a browser connection request for ${row.name}`);
      return { ...summary(updated), replayed: false };
    });
  });
  app.post("/api/bot/device/complete", async request => {
    rate(request, "device-complete", 60);
    const input = object(request.body, ["enrollmentId", "deviceSecret", "candidateToken"]);
    const snapshot = await authenticate(db, input);
    const candidateToken = string(input.candidateToken, "Candidate token", 100);
    if (!/^gbs_[A-Za-z0-9_-]{43}$/.test(candidateToken) || !safeEqual(hash(candidateToken), snapshot.candidate_token_hash)) return fail(401, "Candidate credential rejected");
    if (!snapshot.owner_id) return fail(409, "Owner approval is required");
    return db.transaction(async tx => {
      await lockAdmission(tx);
      await activeOwner(tx, snapshot.owner_id);
      const row = await authenticate(tx, input, true);
      if (row.status === "completed") {
        const bot = (await tx.query("SELECT * FROM bots WHERE id=$1 AND owner_id=$2 FOR UPDATE", [row.bot_id, row.owner_id])).rows[0];
        if (!bot || bot.status === "revoked" || !safeEqual(bot.token_hash, row.candidate_token_hash)) return fail(409, "Connection credential has since been revoked or replaced");
        return { ok: true, replayed: true, bot: botView(bot) };
      }
      if (phase(row) !== "approved") return fail(409, "Connection request is not approved or has expired");
      await admitBot(tx, row.owner_id, publicLimits, row.reconnect_bot_id ?? undefined, row.id);
      let bot: Row;
      if (row.reconnect_bot_id) {
        const prior = (await tx.query("SELECT * FROM bots WHERE id=$1 AND owner_id=$2 FOR UPDATE", [row.reconnect_bot_id, row.owner_id])).rows[0];
        if (!prior || prior.status === "revoked" || prior.token_generation !== row.prior_token_generation) return fail(409, "The selected Bot changed; start and approve a new connection request");
        await drained(tx, prior.id);
        bot = (await tx.query("UPDATE bots SET token_hash=$2,token_generation=token_generation+1,name=$3,last_seen_at=NULL WHERE id=$1 RETURNING *", [prior.id, row.candidate_token_hash, row.name])).rows[0];
      } else {
        bot = (await tx.query("INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,$3,$4,$5,'active',$6) RETURNING *", [row.bot_id, row.owner_id, row.name, row.role, row.runtime, row.candidate_token_hash])).rows[0];
      }
      await tx.query("UPDATE device_enrollments SET status='completed',completed_at=now() WHERE id=$1", [row.id]);
      await event(tx, row.owner_id, row.reconnect_bot_id ? "bot.reconnected" : "bot.connected", `Activated owner-approved credentials for ${row.name}; waiting for a check-in`);
      return { ok: true, replayed: false, bot: botView(bot) };
    });
  });
  app.post("/api/bot/device/cancel", async request => {
    rate(request, "device-cancel", 30);
    const input = object(request.body, ["enrollmentId", "deviceSecret"]);
    return db.transaction(async tx => {
      const row = await authenticate(tx, input, true);
      if (row.status === "completed") {
        const bot = (await tx.query("SELECT token_hash,status FROM bots WHERE id=$1", [row.bot_id])).rows[0];
        if (bot && bot.status !== "revoked" && safeEqual(bot.token_hash, row.candidate_token_hash)) return fail(409, "Completed credentials must be revoked in account settings");
      }
      await tx.query("UPDATE device_enrollments SET status='cancelled' WHERE id=$1", [row.id]);
      return { ok: true, status: "cancelled" };
    });
  });
}
