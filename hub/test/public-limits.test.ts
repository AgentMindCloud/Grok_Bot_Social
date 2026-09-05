import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, migrate, type Database } from "../src/db.js";
import {
  admitBot,
  admitCircleJoin,
  admitMission,
  chargeContent,
  lockAdmission,
  PublicLimitError,
  resolvePublicLimits,
  setAdmissionPressure,
  TASK_RESULT_RESERVATION_BYTES,
  usageSummary,
} from "../src/limits.js";

let db: Database;
const url = process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
const schema = `test_${randomUUID().replaceAll("-", "")}`;
before(async () => {
  if (url) {
    const admin = await database({ url });
    await admin.exec(`CREATE SCHEMA ${schema}`);
    await admin.close();
  }
  db = await database({ url, schema: url ? schema : undefined });
  await migrate(db);
});
after(async () => {
  await db?.close();
  if (url) {
    const admin = await database({ url });
    await admin.exec(`DROP SCHEMA ${schema} CASCADE`);
    await admin.close();
  }
});
async function owner() {
  const id = randomUUID();
  await db.query(
    "INSERT INTO owners(id,handle,display_name) VALUES($1,'test','Test')",
    [id],
  );
  return id;
}
async function bot(ownerId: string) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,'Test','scout','native-grok','active',$3)",
    [id, ownerId, randomUUID()],
  );
  return id;
}
async function createMission(
  ownerId: string,
  botId: string,
  limits = resolvePublicLimits(),
  missionId = randomUUID(),
) {
  const taskId = randomUUID();
  await db.transaction(async (tx) => {
    await lockAdmission(tx);
    await admitMission(tx, ownerId, missionId, 1, 100, limits);
    await tx.query(
      "INSERT INTO missions(id,owner_id,title,brief,status,visibility,max_rounds) VALUES($1,$2,'Test','Question','queued','private',1)",
      [missionId, ownerId],
    );
    await tx.query(
      "INSERT INTO tasks(id,mission_id,bot_id,round,status) VALUES($1,$2,$3,1,'queued')",
      [taskId, missionId, botId],
    );
  });
  return { missionId, taskId };
}
test("concurrent bot admissions cannot exceed account capacity", async () => {
  const id = await owner(),
    limits = resolvePublicLimits({ botsPerOwner: 1 });
  const attempt = () =>
    db.transaction(async (tx) => {
      await lockAdmission(tx);
      await admitBot(tx, id, limits);
      await tx.query(
        "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,'Test','scout','native-grok','active',$3)",
        [randomUUID(), id, randomUUID()],
      );
    });
  const attempts = await Promise.allSettled([attempt(), attempt()]);
  assert.equal(attempts.filter((v) => v.status === "fulfilled").length, 1);
  assert.equal(
    Number(
      (await db.query("SELECT count(*) FROM bots WHERE owner_id=$1", [id]))
        .rows[0].count,
    ),
    1,
  );
});
test("approved enrollment consumes a slot; completing its own receipt does not double count", async () => {
  const id = await owner(),
    enrollment = randomUUID(),
    limits = resolvePublicLimits({ botsPerOwner: 1 });
  await db.query(
    `INSERT INTO device_enrollments(id,device_secret_hash,user_code_hash,candidate_token_hash,name,role,runtime,adapter_version,status,owner_id,expires_at)
    VALUES($1,$2,$3,$4,'Bot','scout','native-grok','1','approved',$5,now()+interval '10 minutes')`,
    [enrollment, randomUUID(), randomUUID(), randomUUID(), id],
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await lockAdmission(tx);
      await admitBot(tx, id, limits);
    }),
    (error: unknown) =>
      error instanceof PublicLimitError && error.code === "connected_bots",
  );
  await db.transaction(async (tx) => {
    await lockAdmission(tx);
    await admitBot(tx, id, limits, undefined, enrollment);
  });
  await db.transaction(async (tx) => {
    await lockAdmission(tx);
    await admitBot(
      tx,
      id,
      resolvePublicLimits({ admissionsEnabled: false }),
      undefined,
      enrollment,
    );
  });
});
test("reconnecting an existing Bot remains possible while new admission is paused", async () => {
  const id = await owner(),
    existing = await bot(id);
  await db.transaction(async (tx) => {
    await lockAdmission(tx);
    await admitBot(
      tx,
      id,
      resolvePublicLimits({ admissionsEnabled: false }),
      existing,
    );
  });
});
test("mission reservations survive quota reduction and repeated result accounting is free", async () => {
  const id = await owner(),
    b = await bot(id),
    limits = resolvePublicLimits();
  const { missionId, taskId } = await createMission(id, b, limits);
  const beforeUsage = await usageSummary(db, id, limits);
  assert.equal(
    beforeUsage.used.reservedResearchBytes,
    TASK_RESULT_RESERVATION_BYTES,
  );
  await db.transaction((tx) => setAdmissionPressure(tx, true));
  const reduced = resolvePublicLimits({
    researchBytesPerOwner: 1,
    admissionsEnabled: false,
  });
  await assert.rejects(
    db.transaction(async (tx) => {
      await lockAdmission(tx);
      await chargeContent(tx, id, 500, reduced);
    }),
    (error: unknown) =>
      error instanceof PublicLimitError && error.code === "research_storage",
  );
  const submit = () =>
    db.transaction(async (tx) => {
      await lockAdmission(tx);
      await chargeContent(tx, id, 500, reduced, { missionId, taskId });
    });
  await submit();
  await submit();
  const afterUsage = await usageSummary(db, id, reduced);
  assert.equal(
    afterUsage.used.researchBytes,
    beforeUsage.used.researchBytes + 500 + 4096,
  );
  assert.equal(afterUsage.used.reservedResearchBytes, 0);
  await assert.rejects(
    createMission(id, b, reduced),
    (error: unknown) =>
      error instanceof PublicLimitError && error.statusCode === 503,
  );
  await db.transaction((tx) => setAdmissionPressure(tx, false));
});
test("different owners racing for the final global mission slot admit exactly one", async () => {
  const a = await owner(),
    b = await owner();
  const botA = await bot(a),
    botB = await bot(b);
  const current = Number(
    (
      await db.query(
        "SELECT count(*) FROM missions WHERE status IN ('queued','running')",
      )
    ).rows[0].count,
  );
  const limits = resolvePublicLimits({ activeMissionsGlobal: current + 1 });
  const results = await Promise.allSettled([
    createMission(a, botA, limits),
    createMission(b, botB, limits),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find(
    (result) => result.status === "rejected",
  ) as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof PublicLimitError);
  assert.equal(rejected.reason.statusCode, 503);
});
test("daily window counts cancelled missions and idempotent admission precedes quota checks", async () => {
  const id = await owner(),
    b = await bot(id),
    limits = resolvePublicLimits({ newMissionsPerDay: 1 });
  const { missionId } = await createMission(id, b, limits);
  await db.query("UPDATE missions SET status='cancelled' WHERE id=$1", [
    missionId,
  ]);
  await db.transaction(async (tx) => {
    await lockAdmission(tx);
    await admitMission(
      tx,
      id,
      missionId,
      1,
      100,
      resolvePublicLimits({ admissionsEnabled: false }),
    );
  });
  await assert.rejects(
    createMission(id, b, limits),
    (error: unknown) =>
      error instanceof PublicLimitError &&
      error.code === "daily_missions" &&
      error.retryAfterSeconds > 0,
  );
});
test("circle member and joined circle limits remain transactional and membership replay works", async () => {
  const host = await owner(),
    member = await owner(),
    extra = await owner(),
    circle = randomUUID(),
    limits = resolvePublicLimits({ membersPerCircle: 2, circlesPerOwner: 1 });
  await db.query("INSERT INTO circles(id,owner_id,name) VALUES($1,$2,'Test')", [
    circle,
    host,
  ]);
  await db.query(
    "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'owner')",
    [circle, host],
  );
  const join = (who: string) =>
    db.transaction(async (tx) => {
      await lockAdmission(tx);
      await admitCircleJoin(tx, who, circle, limits);
      await tx.query(
        "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
        [circle, who],
      );
    });
  await join(member);
  await join(member);
  await assert.rejects(
    join(extra),
    (error: unknown) =>
      error instanceof PublicLimitError && error.code === "circle_members",
  );
});
