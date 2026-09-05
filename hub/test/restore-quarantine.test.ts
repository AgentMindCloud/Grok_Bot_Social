import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { database, migrate, type Database } from "../src/db.js";
import { ClosureJournal } from "../src/closure-journal.js";
import { createApp } from "../src/server.js";
import { replayClosureJournal } from "../src/account-lifecycle.js";
import {
  assertRestoreTarget,
  quarantineRestoredDatabase,
} from "../../deploy/quarantine-restored-db.mjs";

let db: Database, directory: string;
const url = process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
const schema = `test_${randomUUID().replaceAll("-", "")}`;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "gbs-quarantine-test-"));
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
  assert.ok(directory.startsWith(join(tmpdir(), "gbs-quarantine-test-")));
  await rm(directory, { recursive: true, force: true });
});
test("restore refuses production DB names and unsafe admission configuration", () => {
  const env = {
    HUB_RESTORE_QUARANTINE: "true",
    HUB_REGISTRATION_PAUSED: "true",
    HUB_ADMISSIONS_ENABLED: "false",
    HUB_POOL_ENABLED: "false",
  };
  assert.throws(
    () => assertRestoreTarget("postgresql://test:test@localhost/grokbot", env),
    /explicitly named/,
  );
  assert.throws(
    () =>
      assertRestoreTarget(
        "postgresql://test:test@localhost/grokbot_restore_test",
        {},
      ),
    /quarantine/,
  );
  assert.throws(
    () =>
      assertRestoreTarget(
        "postgresql://test:test@localhost/grokbot_restore_test",
        { ...env, HUB_POOL_ENABLED: "true" },
      ),
    /pool disabled/,
  );
  assert.equal(
    assertRestoreTarget(
      "postgresql://test:test@localhost/grokbot_restore_test",
      env,
    ),
    "grokbot_restore_test",
  );
});
test("restore quarantine invalidates stale sessions/identities/Bots until protected reconciliation", async () => {
  const owner = randomUUID(),
    bot = randomUUID(),
    circle = randomUUID();
  await db.query(
    "INSERT INTO owners(id,handle,display_name) VALUES($1,'restore','Restore')",
    [owner],
  );
  await db.query(
    "INSERT INTO provider_identities(provider,provider_user_id,owner_id,handle,display_name) VALUES('github','123',$1,'old-linked-identity','Old identity')",
    [owner],
  );
  await db.query(
    "INSERT INTO sessions(id_hash,owner_id,csrf_token,expires_at) VALUES('old-session',$1,'old-csrf',now()+interval '1 day')",
    [owner],
  );
  await db.query(
    "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,'Old Bot','scout','native-grok','active','old-token-hash')",
    [bot, owner],
  );
  await db.query(
    "INSERT INTO circles(id,owner_id,name) VALUES($1,$2,'Old circle')",
    [circle, owner],
  );
  await db.query(
    "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'owner')",
    [circle, owner],
  );
  const question = randomUUID(),
    lease = randomUUID(),
    reply = randomUUID();
  await db.query(
    "INSERT INTO pool_participation(bot_id,enabled,topics,allow_questions) VALUES($1,true,'[\"curious\"]',true)",
    [bot],
  );
  await db.query(
    "INSERT INTO pool_questions(id,owner_id,bot_id,author_name,avatar_slug,title,body,topic,idempotency_key,request_hash) VALUES($1,$2,$3,'Old public Bot','bumble','Old public question','Restored public text','curious','old-q','old-hash')",
    [question, owner, bot],
  );
  await db.query(
    "INSERT INTO pool_leases(id,question_id,owner_id,bot_id,attempt_id,token_generation,status,expires_at) VALUES($1,$2,$3,$4,'old-attempt',1,'leased',now()+interval '5 minutes')",
    [lease, question, owner, bot],
  );
  await db.query(
    "INSERT INTO pool_replies(id,question_id,owner_id,bot_id,lease_id,attempt_id,author_name,avatar_slug,body,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,'old-attempt','Old public Bot','bumble','Restored reply','old-r','old-hash')",
    [reply, question, owner, bot, lease],
  );
  const result = await quarantineRestoredDatabase(
    db,
    new ClosureJournal(directory),
    replayClosureJournal,
  );
  assert.equal(result.publicExposureAllowed, false);
  assert.equal(result.identityReconciliationRequired, true);
  assert.equal(result.cancelledPoolLeases, 1);
  assert.equal(result.hiddenPoolQuestions, 1);
  assert.equal(result.hiddenPoolReplies, 1);
  // Even an accidental public-pool flag change cannot republish old posts.
  const preview = await createApp(db, {
    origin: "http://127.0.0.1:3000",
    production: false,
    localLogin: false,
    localOwner: "restore-check",
    host: "127.0.0.1",
    port: 8787,
    sessionHours: 24,
    pairingMinutes: 10,
    leaseSeconds: 300,
    maxAttempts: 3,
    fetch,
    poolEnabled: true,
  });
  try {
    assert.equal(
      (await preview.inject({ url: "/api/pool/questions" })).json().items
        .length,
      0,
    );
    assert.equal(
      (await preview.inject({ url: `/api/pool/questions/${question}` }))
        .statusCode,
      404,
    );
  } finally {
    await preview.close();
  }
  assert.equal(
    (
      await db.query("SELECT enabled FROM pool_participation WHERE bot_id=$1", [
        bot,
      ])
    ).rows[0].enabled,
    false,
  );
  assert.equal(
    (
      await db.query("SELECT status FROM pool_questions WHERE id=$1", [
        question,
      ])
    ).rows[0].status,
    "hidden",
  );
  assert.equal(
    (await db.query("SELECT hidden FROM pool_replies WHERE id=$1", [reply]))
      .rows[0].hidden,
    true,
  );
  assert.equal(
    Number((await db.query("SELECT count(*) FROM sessions")).rows[0].count),
    0,
  );
  assert.equal(
    (await db.query("SELECT status FROM owners WHERE id=$1", [owner])).rows[0]
      .status,
    "suspended",
  );
  const revoked = (
    await db.query(
      "SELECT status,token_hash,token_generation FROM bots WHERE id=$1",
      [bot],
    )
  ).rows[0];
  assert.equal(revoked.status, "revoked");
  assert.notEqual(revoked.token_hash, "old-token-hash");
  assert.equal(
    (
      await db.query("SELECT active FROM circle_members WHERE owner_id=$1", [
        owner,
      ])
    ).rows[0].active,
    false,
  );
  // Preserve the old identity as evidence to reconcile; suspension prevents it
  // from reopening the account merely because it reappeared in an old backup.
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) FROM provider_identities WHERE owner_id=$1",
          [owner],
        )
      ).rows[0].count,
    ),
    1,
  );
  await quarantineRestoredDatabase(
    db,
    new ClosureJournal(directory),
    replayClosureJournal,
  );
  assert.equal(
    (await db.query("SELECT token_generation FROM bots WHERE id=$1", [bot]))
      .rows[0].token_generation,
    revoked.token_generation,
  );
});
