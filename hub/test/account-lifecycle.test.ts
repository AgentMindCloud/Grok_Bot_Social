import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, migrate, type Database } from "../src/db.js";
import {
  closeAccount,
  exportAccount,
  exportReviewCitations,
} from "../src/account-lifecycle.js";
import { hash } from "../src/security.js";
import { runMaintenance } from "../src/maintenance.js";

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
async function actor() {
  const owner = randomUUID(),
    circle = randomUUID(),
    mission = randomUUID();
  await db.query(
    "INSERT INTO owners(id,github_id,handle,display_name) VALUES($1,$2,$3,'Person')",
    [owner, randomUUID(), `handle-${owner}`],
  );
  await db.query(
    "INSERT INTO circles(id,owner_id,name) VALUES($1,$2,'Circle')",
    [circle, owner],
  );
  await db.query(
    "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'owner')",
    [circle, owner],
  );
  await db.query(
    "INSERT INTO missions(id,owner_id,title,brief,status,visibility,max_rounds) VALUES($1,$2,'Private title','Private context','completed','private',1)",
    [mission, owner],
  );
  return { owner, circle, mission };
}
async function review(owner: string, mission: string) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO mission_review_versions(id,mission_id,owner_id,version,decision,usefulness,rationale,assistance,idempotency_key,request_hash) VALUES($1,$2,$3,1,'watch','useful','Owner rationale','unassisted',$4,$5)`,
    [id, mission, owner, randomUUID(), randomUUID()],
  );
  return id;
}
async function evidence(owner: string, mission: string, circle?: string) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO evidence(id,owner_id,mission_id,title,summary,sources,visibility,circle_id) VALUES($1,$2,$3,'Unique evidence','Never leak this text','[]',$4,$5)`,
    [id, owner, mission, circle ? "circle" : "private", circle ?? null],
  );
  const row = (await db.query("SELECT * FROM evidence WHERE id=$1", [id]))
    .rows[0];
  return {
    id,
    digest: hash(
      JSON.stringify({
        id,
        title: row.title,
        summary: row.summary,
        sources: row.sources,
        sourceUrl: row.source_url,
      }),
    ),
  };
}
test("export contains own records but omits secrets and inaccessible citations", async () => {
  const a = await actor(),
    b = await actor(),
    r = await review(a.owner, a.mission),
    e = await evidence(b.owner, b.mission);
  await db.query(
    "INSERT INTO review_citations(review_id,evidence_id,content_hash) VALUES($1,$2,$3)",
    [r, e.id, e.digest],
  );
  await db.query(
    "INSERT INTO sessions(id_hash,owner_id,csrf_token,expires_at) VALUES('secret-session',$1,'secret-csrf',now()+interval '1 hour')",
    [a.owner],
  );
  let output = "";
  for await (const part of exportAccount(db, a.owner)) output += part;
  assert.ok(output.includes("Owner rationale"));
  assert.ok(output.includes('"available":false'));
  assert.ok(!output.includes("Never leak this text"));
  assert.ok(!output.includes(e.id));
  assert.ok(!output.includes("secret-session"));
  assert.ok(!output.includes("secret-csrf"));
  assert.ok(output.includes('"section":"complete"'));
});
test("closure erases live content, revokes credentials, and preserves inaccessible foreign citation tombstones", async () => {
  const a = await actor(),
    b = await actor(),
    ownedReview = await review(a.owner, a.mission),
    foreignReview = await review(b.owner, b.mission),
    e = await evidence(a.owner, a.mission, a.circle);
  const bot = randomUUID(),
    task = randomUUID();
  await db.query(
    "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,'Secret Bot','scout','native-grok','active','secret-bearer-hash')",
    [bot, a.owner],
  );
  await db.query(
    "INSERT INTO tasks(id,mission_id,bot_id,round,status) VALUES($1,$2,$3,1,'completed')",
    [task, a.mission, bot],
  );
  await db.query(
    'INSERT INTO weekly_mission_inputs(mission_id,owner_id,input,input_hash,idempotency_key,request_hash) VALUES($1,$2,\'{"offer":"Secret offer"}\',$3,$4,$5)',
    [a.mission, a.owner, randomUUID(), randomUUID(), randomUUID()],
  );
  await db.query(
    'INSERT INTO mission_measurement_snapshots(mission_id,snapshot) VALUES($1,\'{"classification":"test"}\')',
    [a.mission],
  );
  const retainedContribution = await evidence(b.owner, a.mission);
  await db.query(
    "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'member')",
    [a.circle, b.owner],
  );
  await db.query(
    "INSERT INTO review_citations(review_id,evidence_id,content_hash) VALUES($1,$2,$3)",
    [foreignReview, e.id, e.digest],
  );
  await db.query(
    "INSERT INTO sessions(id_hash,owner_id,csrf_token,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')",
    [randomUUID(), a.owner],
  );
  await db.query(
    "INSERT INTO pairings(code_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [randomUUID(), a.owner],
  );
  assert.equal(
    (await exportReviewCitations(db, b.owner, foreignReview))[0].available,
    true,
  );
  await assert.rejects(
    db.query("DELETE FROM mission_review_versions WHERE id=$1", [ownedReview]),
    /immutable/,
  );
  await assert.rejects(
    db.query(
      "UPDATE mission_review_versions SET rationale='rewritten' WHERE id=$1",
      [ownedReview],
    ),
    /immutable/,
  );
  assert.deepEqual(await closeAccount(db, a.owner), {
    closed: true,
    liveContentPurged: true,
  });
  const closed = (await db.query("SELECT * FROM owners WHERE id=$1", [a.owner]))
    .rows[0];
  assert.equal(closed.status, "closed");
  assert.equal(closed.github_id, null);
  assert.ok(closed.purged_at);
  for (const table of [
    "sessions",
    "pairings",
    "bots",
    "missions",
    "mission_review_versions",
    "provider_identities",
  ])
    assert.equal(
      Number(
        (
          await db.query(`SELECT count(*) FROM ${table} WHERE owner_id=$1`, [
            a.owner,
          ])
        ).rows[0].count,
      ),
      0,
    );
  const tombstone = (
    await db.query("SELECT * FROM evidence WHERE id=$1", [e.id])
  ).rows[0];
  assert.equal(tombstone.owner_id, null);
  assert.equal(tombstone.summary, "");
  assert.equal(tombstone.visibility, "private");
  assert.ok(tombstone.erased_at);
  assert.deepEqual(await exportReviewCitations(db, b.owner, foreignReview), [
    { available: false },
  ]);
  assert.equal(
    (
      await db.query(
        "SELECT rationale FROM mission_review_versions WHERE id=$1",
        [foreignReview],
      )
    ).rows[0].rationale,
    "Owner rationale",
  );
  const retained = (
    await db.query(
      "SELECT owner_id,mission_id,summary FROM evidence WHERE id=$1",
      [retainedContribution.id],
    )
  ).rows[0];
  assert.equal(retained.owner_id, b.owner);
  assert.equal(retained.mission_id, null);
  assert.equal(retained.summary, "Never leak this text");
  await assert.rejects(
    db.query("DELETE FROM mission_review_versions WHERE id=$1", [
      foreignReview,
    ]),
    /immutable/,
  );
  await assert.rejects(async () => {
    for await (const _ of exportAccount(db, a.owner)) {
      /* consume */
    }
  }, /unavailable/);
  assert.deepEqual(await closeAccount(db, a.owner), {
    closed: true,
    liveContentPurged: true,
  });
});
test("maintenance deletes bounded expired records and preserves recent completed enrollment receipts", async () => {
  const a = await actor();
  for (let i = 0; i < 3; i++)
    await db.query(
      "INSERT INTO pairings(code_hash,owner_id,expires_at) VALUES($1,$2,now()-interval '1 hour')",
      [randomUUID(), a.owner],
    );
  const receipt = randomUUID();
  await db.query(
    `INSERT INTO device_enrollments(id,device_secret_hash,user_code_hash,candidate_token_hash,name,role,runtime,adapter_version,status,owner_id,expires_at,completed_at) VALUES($1,$2,$3,$4,'Bot','scout','native-grok','1','completed',$5,now()-interval '1 hour',now()-interval '1 hour')`,
    [receipt, randomUUID(), randomUUID(), randomUUID(), a.owner],
  );
  await runMaintenance(db, { batchSize: 2 });
  assert.equal(
    Number(
      (
        await db.query("SELECT count(*) FROM pairings WHERE owner_id=$1", [
          a.owner,
        ])
      ).rows[0].count,
    ),
    1,
  );
  assert.equal(
    (await db.query("SELECT id FROM device_enrollments WHERE id=$1", [receipt]))
      .rows.length,
    1,
  );
});
