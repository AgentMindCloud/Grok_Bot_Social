import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inventoryBackups, applyRetention, planVerificationReceipts, writeVerificationReceipts } from "./backup-retention.mjs";
test("retention defaults to inventory, requires exact review, and only removes verified dated archives", async () => {
  const root = await mkdtemp(join(tmpdir(), "gbs-retention-test-"));
  try {
    for (let day = 1; day <= 5; day++) {
      const name = `grokbot-2026080${day}T000000Z.dump.age`,
        bytes = Buffer.from(`synthetic-encrypted-fixture-${day}`);
      await writeFile(join(root, name), bytes);
      if (day !== 1)
        await writeFile(
          join(root, `${name}.verified.json`),
          JSON.stringify({
            ciphertextSha256: createHash("sha256").update(bytes).digest("hex"),
            offHostVerifiedAt: "2026-08-05T12:00:00Z",
          }),
        );
    }
    await writeFile(join(root, "historical-unknown.gpg"), "preserve");
    const now = new Date("2026-09-05T00:00:00Z"),
      plan = await inventoryBackups(root, "vps", now);
    assert.deepEqual(plan.candidates, ["grokbot-20260802T000000Z.dump.age"]);
    await assert.rejects(
      applyRetention(root, "vps", "0".repeat(64), now),
      /changed/,
    );
    await applyRetention(root, "vps", plan.inventorySha256, now);
    assert.equal(
      await readFile(join(root, "historical-unknown.gpg"), "utf8"),
      "preserve",
    );
    assert.ok(await readFile(join(root, "grokbot-20260801T000000Z.dump.age")));
    const offhost = await inventoryBackups(root, "offhost", now);
    assert.equal(offhost.candidates.length, 3);
    await assert.rejects(inventoryBackups("relative-path", "vps"), /absolute/);
  } finally {
    // Only the newly created synthetic fixture directory is removed by the test.
    assert.ok(root.startsWith(join(tmpdir(), "gbs-retention-test-")));
    await rm(root, { recursive: true, force: true });
  }
});

async function makeCheckpoint(root, day, journal = false) {
  const name = `2026080${day}T000000Z`, directory = join(root, name);
  await mkdir(directory);
  const files = ["COMMIT", "IMAGE-IDS", "database.dump.age", "release.env", "runtime.env.age", ...(journal ? ["closure-journal.tar.age"] : [])];
  const hashes = [];
  for (const file of files) {
    const bytes = Buffer.from(`synthetic-checkpoint-${day}-${file}`);
    await writeFile(join(directory, file), bytes);
    hashes.push(`${createHash("sha256").update(bytes).digest("hex")}  ${file}`);
  }
  await writeFile(join(directory, "SHA256SUMS"), hashes.join("\n")+"\n");
  return name;
}
test("whole-checkpoint receipts bind every file including the journal and retention removes only complete reviewed sets", async () => {
  const root = await mkdtemp(join(tmpdir(), "gbs-retention-test-"));
  const vps = join(root,"vps"), peer = join(root,"offhost"), now = new Date("2026-09-05T00:00:00Z");
  await mkdir(vps); await mkdir(peer);
  try {
    for (let day=1; day<=5; day++) {
      await makeCheckpoint(vps,day,day!==1);
      if (day!==1) await makeCheckpoint(peer,day,true);
    }
    const remoteInventory = await inventoryBackups(peer,"offhost",now);
    const receiptPlan = await planVerificationReceipts(vps,"vps",remoteInventory,"verified-offhost-fixture",now);
    assert.equal(receiptPlan.receipts.length,4);
    assert.deepEqual(receiptPlan.unmatched,["20260801T000000Z"]);
    await assert.rejects(writeVerificationReceipts(vps,"vps",remoteInventory,"verified-offhost-fixture","0".repeat(64),now),/changed/);
    assert.equal((await readdir(vps)).length,5); // Dry run/wrong approval wrote no receipts.
    await writeVerificationReceipts(vps,"vps",remoteInventory,"verified-offhost-fixture",receiptPlan.inventorySha256,now);
    const receipt = JSON.parse(await readFile(join(vps,"20260802T000000Z.verified.json"),"utf8"));
    assert.equal(receipt.hashScope,"complete-checkpoint-v1");
    assert.equal(receipt.files.length,7);
    assert.ok(receipt.files.some(file=>file.name==="closure-journal.tar.age"));
    const plan = await inventoryBackups(vps,"vps",now);
    assert.deepEqual(plan.candidates,["20260802T000000Z"]);
    await applyRetention(vps,"vps",plan.inventorySha256,now);
    await assert.rejects(readFile(join(vps,"20260802T000000Z","runtime.env.age")),{code:"ENOENT"});
    await assert.rejects(readFile(join(vps,"20260802T000000Z","closure-journal.tar.age")),{code:"ENOENT"});
    assert.ok(await readFile(join(vps,"20260802T000000Z.verified.json")));
    assert.ok(await readFile(join(vps,"20260801T000000Z","database.dump.age"))); // Unverified legacy set preserved.
  } finally { assert.ok(root.startsWith(join(tmpdir(),"gbs-retention-test-"))); await rm(root,{recursive:true,force:true}); }
});

test("incomplete, tampered or extra checkpoint content is protected and peer inventory cannot be edited", async () => {
  const root = await mkdtemp(join(tmpdir(),"gbs-retention-test-")), peer = await mkdtemp(join(tmpdir(),"gbs-retention-test-"));
  const now = new Date("2026-09-05T00:00:00Z");
  try {
    for (let day=1;day<=3;day++) { await makeCheckpoint(root,day,true); await makeCheckpoint(peer,day,true); }
    await writeFile(join(root,"20260801T000000Z","unexpected-key.txt"),"synthetic-extra-preserve");
    await writeFile(join(root,"20260802T000000Z","closure-journal.tar.age"),"tampered");
    await rm(join(root,"20260803T000000Z","runtime.env.age"));
    const source = await inventoryBackups(root,"vps",now);
    assert.equal(source.entries.length,0); assert.equal(source.invalid.length,3); assert.deepEqual(source.candidates,[]);
    const peerInventory = await inventoryBackups(peer,"offhost",now);
    peerInventory.entries[0].sha256="f".repeat(64);
    await assert.rejects(planVerificationReceipts(root,"vps",peerInventory,"verified-offhost-fixture",now),/digest/);
    await applyRetention(root,"vps",source.inventorySha256,now);
    assert.equal(await readFile(join(root,"20260801T000000Z","unexpected-key.txt"),"utf8"),"synthetic-extra-preserve");
  } finally {
    for (const directory of [root,peer]) { assert.ok(directory.startsWith(join(tmpdir(),"gbs-retention-test-"))); await rm(directory,{recursive:true,force:true}); }
  }
});

test("a changed checkpoint invalidates an earlier receipt and an earlier retention approval", async () => {
  const root = await mkdtemp(join(tmpdir(),"gbs-retention-test-")), peer = await mkdtemp(join(tmpdir(),"gbs-retention-test-"));
  const now = new Date("2026-09-05T00:00:00Z");
  try {
    await makeCheckpoint(root,1,true); await makeCheckpoint(peer,1,true);
    const remoteInventory = await inventoryBackups(peer,"offhost",now);
    const receiptPlan = await planVerificationReceipts(root,"vps",remoteInventory,"verified-offhost-fixture",now);
    await writeVerificationReceipts(root,"vps",remoteInventory,"verified-offhost-fixture",receiptPlan.inventorySha256,now);
    const original = await inventoryBackups(root,"offhost",now);
    assert.equal(original.candidates.length,1);
    // Even a consistently rewritten manifest cannot reuse a receipt for old content.
    const file = join(root,"20260801T000000Z","runtime.env.age");
    await writeFile(file,"new-synthetic-ciphertext");
    const manifest = join(root,"20260801T000000Z","SHA256SUMS");
    const bytes = await readFile(file);
    await writeFile(manifest,(await readFile(manifest,"utf8")).replace(/^[a-f0-9]{64}  runtime\.env\.age$/m,`${createHash("sha256").update(bytes).digest("hex")}  runtime.env.age`));
    const changed = await inventoryBackups(root,"offhost",now);
    assert.equal(changed.entries.length,1); assert.equal(changed.entries[0].verification,null); assert.equal(changed.candidates.length,0);
    await assert.rejects(applyRetention(root,"offhost",original.inventorySha256,now),/changed/);
  } finally {
    for (const directory of [root,peer]) { assert.ok(directory.startsWith(join(tmpdir(),"gbs-retention-test-"))); await rm(directory,{recursive:true,force:true}); }
  }
});

test("newer flat archives never displace the three complete checkpoint retention slots", async () => {
  const root = await mkdtemp(join(tmpdir(),"gbs-retention-test-")), peer = await mkdtemp(join(tmpdir(),"gbs-retention-test-"));
  const now = new Date("2026-09-05T00:00:00Z");
  try {
    await makeCheckpoint(root,1,true); await makeCheckpoint(peer,1,true);
    const observed = await inventoryBackups(peer,"offhost",now), plan = await planVerificationReceipts(root,"vps",observed,"verified-offhost-fixture",now);
    await writeVerificationReceipts(root,"vps",observed,"verified-offhost-fixture",plan.inventorySha256,now);
    for (let day=2;day<=4;day++) await writeFile(join(root,`grokbot-2026080${day}T000000Z.dump.age`),"newer-flat-fixture");
    const inventory = await inventoryBackups(root,"vps",now);
    assert.deepEqual(inventory.candidates,[]);
  } finally { for (const directory of [root,peer]) { assert.ok(directory.startsWith(join(tmpdir(),"gbs-retention-test-"))); await rm(directory,{recursive:true,force:true}); } }
});

test("receipt creation rejects stale/future peer observations and records the actual peer observation time", async () => {
  const root = await mkdtemp(join(tmpdir(),"gbs-retention-test-")), peer = await mkdtemp(join(tmpdir(),"gbs-retention-test-"));
  const seen = new Date("2026-09-05T00:00:00Z"), applied = new Date("2026-09-05T00:02:00Z");
  try {
    await makeCheckpoint(root,1,true); await makeCheckpoint(peer,1,true);
    const observed = await inventoryBackups(peer,"offhost",seen);
    await assert.rejects(planVerificationReceipts(root,"vps",observed,"verified-offhost-fixture",new Date("2026-09-05T00:16:00Z")),/stale/);
    await assert.rejects(planVerificationReceipts(root,"vps",observed,"verified-offhost-fixture",new Date("2026-09-04T23:59:59Z")),/future/);
    const forged = {...observed, observedAt: applied.toISOString()};
    await assert.rejects(planVerificationReceipts(root,"vps",forged,"verified-offhost-fixture",applied),/observation digest/);
    const plan = await planVerificationReceipts(root,"vps",observed,"verified-offhost-fixture",applied);
    await writeVerificationReceipts(root,"vps",observed,"verified-offhost-fixture",plan.inventorySha256,applied);
    const receipt = JSON.parse(await readFile(join(root,"20260801T000000Z.verified.json"),"utf8"));
    assert.equal(receipt.offHostVerifiedAt,seen.toISOString());
    assert.equal(receipt.peerObservationSha256,observed.observationSha256);
  } finally { for (const directory of [root,peer]) { assert.ok(directory.startsWith(join(tmpdir(),"gbs-retention-test-"))); await rm(directory,{recursive:true,force:true}); } }
});
