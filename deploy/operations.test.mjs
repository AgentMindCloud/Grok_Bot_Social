import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthVerdict,maintenanceOptions,maintenanceReport } from './operations.mjs';
const baseline=()=>({containers:Object.fromEntries(['hub','web','database','edge'].map(k=>[k,{running:true,health:'healthy',oomKilled:false,restarts:0}])),diskFreeBytes:3*1024**3,memoryAvailableBytes:1024**3,backupAgeSeconds:12*3600,offhostVerified:true,expectedCommit:'a'.repeat(40),actualCommit:'a'.repeat(40)});
test('health requires every service, safe headroom, recent backup and exact commit',()=>{
 assert.equal(healthVerdict(baseline()).ok,true);
 for(const mutate of [x=>delete x.containers.hub,x=>x.containers.database.oomKilled=true,x=>x.containers.edge.health='unhealthy',x=>x.diskFreeBytes=NaN,x=>x.memoryAvailableBytes=5,x=>x.backupAgeSeconds=27*3600,x=>x.actualCommit='b'.repeat(40)]){const x=baseline();mutate(x);assert.equal(healthVerdict(x).ok,false);}
 const x=baseline();x.offhostVerified=false;assert.deepEqual(healthVerdict(x).warnings,['offhost-receipt-missing']);
});
test('maintenance bounds reject invalid numeric input rather than silently expanding work',()=>{
 assert.deepEqual(maintenanceOptions({}),{batchSize:100,dryRun:false,contentRetentionDays:30,reportRetentionDays:90});
 for(const value of ['NaN','0','501','1.5','Infinity'])assert.throws(()=>maintenanceOptions({HUB_MAINTENANCE_BATCH_SIZE:value}));
});
test('maintenance produces only aggregate diagnostics and passes explicit dry-run settings',async()=>{
 const db={query:async()=>({rows:[{schema:9,active_owners:2,active_bots:4,open_questions:1,open_reports:0}]})};
 const report=await maintenanceReport(db,async(_db,options)=>({skipped:false,deleted:options.dryRun?0:1}),{HUB_MAINTENANCE_DRY_RUN:'true'});
 assert.equal(report.result.deleted,0);assert.equal(report.summary.active_owners,2);assert.equal(report.job,'maintenance');
});
