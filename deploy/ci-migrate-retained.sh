#!/usr/bin/env bash
# Only CI synthetic data; never points to the retained production database.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true ]]
app=(docker compose -f deploy/compose.yml)
"${app[@]}" exec -T database createdb -U postgres -O grokbot grokbot_restore_ci
cleanup(){ "${app[@]}" exec -T database dropdb -U postgres --if-exists --force grokbot_restore_ci; }
trap cleanup EXIT
# Old schema is created by the app role, matching production object ownership.
for version in 001_initial 002_mission_cancel 003_private_beta; do
  "${app[@]}" exec -T hub cat "migrations/$version.sql" | "${app[@]}" exec -T database psql -U grokbot -d grokbot_restore_ci -v ON_ERROR_STOP=1 >/dev/null
done
"${app[@]}" exec -T database psql -U grokbot -d grokbot_restore_ci -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO schema_migrations(version) VALUES(1),(2),(3);
INSERT INTO owners(id,github_id,handle,display_name) VALUES('migration-owner','123456','synthetic-migration','Synthetic migration');
INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES('migration-bot','migration-owner','Synthetic bot','scout','native-grok','revoked','synthetic-test-hash');
INSERT INTO missions(id,owner_id,title,brief,status,visibility,max_rounds) VALUES('migration-mission','migration-owner','Retained synthetic mission','Synthetic retained content','completed','private',1);
INSERT INTO mission_review_versions(id,mission_id,owner_id,version,decision,usefulness,rationale,assistance,idempotency_key,request_hash) VALUES('migration-review','migration-mission','migration-owner',1,'watch','useful','Immutable synthetic history','unassisted','synthetic-idempotency','synthetic-hash');
SQL
# Write through the running process into the explicit writable tmpfs. Docker cp
# rejects this container's read-only root even when the target is /tmp.
"${app[@]}" exec -T hub node -e "require('node:fs').writeFileSync('/tmp/migrate-retained.mjs',require('node:fs').readFileSync(0),{mode:0o600})" < deploy/migrate-retained.mjs
"${app[@]}" exec -T hub node --input-type=module - <<'NODE'
import assert from'node:assert/strict';import{database,migrate}from'./dist/db.js';import{ClosureJournal}from'./dist/closure-journal.js';import{retainedInventory,assertPreserved,seedLifecycleJournal}from'/tmp/migrate-retained.mjs';
const url=new URL(process.env.DATABASE_URL);url.pathname='/grokbot_restore_ci';const db=await database({url:url.toString()});
try{const before=await retainedInventory(db);assert.equal(before.versions.at(-1),3);await migrate(db);const after=await retainedInventory(db);assertPreserved(before,after);const journal=new ClosureJournal('/tmp/migration-journal',true);const bootstrap=await seedLifecycleJournal(db,journal);assert.equal(bootstrap.revokedBots,1);assert.equal(bootstrap.seeded,1);assert.equal((await seedLifecycleJournal(db,journal)).seeded,0);assert.equal((await db.query("SELECT owner_id FROM provider_identities WHERE provider='github' AND provider_user_id='123456'")).rows[0].owner_id,'migration-owner');await migrate(db);assertPreserved(after,await retainedInventory(db));console.log('Schema3 to9 preserves immutable history/IDs, identity recovery and idempotent journal bootstrap.');}finally{await db.close();}
NODE
