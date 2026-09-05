import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export function boundedInteger(value,fallback,min,max) {
  const n=value===undefined?fallback:Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max) throw new Error('Operations setting is outside its supported bounds');
  return n;
}
export function maintenanceOptions(env) {
  return {batchSize:boundedInteger(env.HUB_MAINTENANCE_BATCH_SIZE,100,1,500),dryRun:env.HUB_MAINTENANCE_DRY_RUN==='true',
    contentRetentionDays:boundedInteger(env.HUB_POOL_CONTENT_RETENTION_DAYS,30,1,365),
    reportRetentionDays:boundedInteger(env.HUB_POOL_REPORT_RETENTION_DAYS,90,1,365)};
}
export function healthVerdict({containers,diskFreeBytes,memoryAvailableBytes,backupAgeSeconds,offhostVerified,expectedCommit,actualCommit}) {
  const failures=[],warnings=[];
  for(const name of ['database','hub','web','edge']) {
    const c=containers[name];
    if(!c || c.running!==true || c.oomKilled===true || (c.health && c.health!=='healthy')) failures.push(`container:${name}`);
    if(c?.restarts>0) warnings.push(`restarts:${name}`);
  }
  if(!Number.isFinite(diskFreeBytes)||diskFreeBytes<2*1024**3) failures.push('disk-capacity');
  if(!Number.isFinite(memoryAvailableBytes)||memoryAvailableBytes<512*1024**2) failures.push('memory-capacity');
  if(!Number.isFinite(backupAgeSeconds)||backupAgeSeconds>26*3600) failures.push('backup-stale');
  if(!offhostVerified) warnings.push('offhost-receipt-missing');
  if(!/^[a-f0-9]{40}$/.test(expectedCommit??'')||expectedCommit!==actualCommit) failures.push('release-identity');
  return {ok:failures.length===0,failures,warnings};
}
export async function maintenanceReport(db,runMaintenance,env) {
  const options=maintenanceOptions(env);
  // The maintenance implementation owns DB advisory locking and bounded work.
  const result=await runMaintenance(db,options);
  const summary=(await db.query(`SELECT
    (SELECT max(version) FROM schema_migrations) AS schema,
    (SELECT count(*) FROM owners WHERE status='active') AS active_owners,
    (SELECT count(*) FROM bots WHERE status<>'revoked') AS active_bots,
    (SELECT count(*) FROM pool_questions WHERE status='open') AS open_questions,
    (SELECT count(*) FROM pool_reports WHERE status='open') AS open_reports`)).rows[0];
  return {schemaVersion:1,job:'maintenance',observedAt:new Date().toISOString(),options,result,summary};
}
async function main() {
  const job=process.argv[2];
  if(job!=='maintenance') throw new Error('Expected maintenance operation');
  const {database}=await import(pathToFileURL(resolve('dist/db.js')).href);
  const {runMaintenance}=await import(pathToFileURL(resolve('dist/maintenance.js')).href);
  const db=await database({url:process.env.DATABASE_URL});
  try{console.log(JSON.stringify(await maintenanceReport(db,runMaintenance,process.env)));}finally{await db.close();}
}
if(process.argv[1]==='-' || (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)) main().catch(()=>{console.error('Operations job failed. Inspect protected service logs; no credentials or private content were emitted.');process.exitCode=1;});
