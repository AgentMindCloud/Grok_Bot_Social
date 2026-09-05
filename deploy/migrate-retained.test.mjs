import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertMigrationMode, assertPreserved, seedLifecycleJournal, finalSchema } from './migrate-retained.mjs';
const env={HUB_MIGRATION_WRITE_BARRIER:'stopped',HUB_REGISTRATION_PAUSED:'true',HUB_ADMISSIONS_ENABLED:'false',HUB_POOL_ENABLED:'false',HUB_ACCESS_MODE:'restricted',HUB_CLOSURE_JOURNAL_DIR:'/journal/records'};

test('stdin imports do not execute the migration CLI, while direct stdin execution enforces its gates',()=>{
  const url=new URL('./migrate-retained.mjs',import.meta.url);
  const imported=spawnSync(process.execPath,['--input-type=module','-'],{input:`import ${JSON.stringify(url.href)}; console.log('import-only');`,encoding:'utf8'});
  assert.equal(imported.status,0,imported.stderr);
  assert.equal(imported.stdout.trim(),'import-only');
  assert.equal(imported.stderr,'');
  const direct=spawnSync(process.execPath,['--input-type=module','-'],{input:readFileSync(url,'utf8'),encoding:'utf8',env:{...process.env,HUB_MIGRATION_WRITE_BARRIER:''}});
  assert.equal(direct.status,1);
  assert.match(direct.stderr,/Retained migration failed/);
});
test('migration fails closed unless every isolation gate is explicit',()=>{
  assertMigrationMode(env);
  for(const key of Object.keys(env)) assert.throws(()=>assertMigrationMode({...env,[key]:''}),/Migration needs/);
});
test('retained history, keys and final schema must match',()=>{
  const before={versions:[1,2,3],keys:{owners:'a',bots:'b',missions:'c'},tables:{owners:{count:1,digest:'old'},mission_review_versions:{count:2,digest:'stable'}}};
  const after=structuredClone(before);after.versions=Array.from({length:finalSchema},(_,i)=>i+1);after.tables.owners.digest='additive columns';
  assertPreserved(before,after);
  for(const change of [x=>x.keys.bots='changed',x=>x.tables.owners.count=0,x=>x.tables.mission_review_versions.digest='changed',x=>x.versions.pop()]){const broken=structuredClone(after);change(broken);assert.throws(()=>assertPreserved(before,broken));}
});
test('bootstrap deduplicates known erasures and seeds only retained closed/suspended/revoked lifecycle state',async()=>{
  const appended=[];const journal={initialize:async()=>{},async *records(){yield {action:'account-close',ownerId:'closed'}},append:async(...v)=>appended.push(v)};
  const db={query:async sql=>({rows:sql.includes('FROM owners')?[{id:'closed',status:'closed'},{id:'suspended',status:'suspended'}]:[{id:'revoked',owner_id:'owner'}]})};
  const result=await seedLifecycleJournal(db,journal);
  assert.equal(result.seeded,2);assert.deepEqual(appended,[['owner-suspend','suspended'],['bot-revoke','owner','revoked']]);
});
