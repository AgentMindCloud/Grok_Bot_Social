import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const finalSchema = 9;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertMigrationMode(env) {
  if (env.HUB_MIGRATION_WRITE_BARRIER !== 'stopped' || env.HUB_REGISTRATION_PAUSED !== 'true' ||
      env.HUB_ADMISSIONS_ENABLED !== 'false' || env.HUB_POOL_ENABLED !== 'false' ||
      env.HUB_ACCESS_MODE !== 'restricted' || !env.HUB_CLOSURE_JOURNAL_DIR)
    throw new Error('Migration needs stopped writers, restricted access, closed admissions and an explicit journal');
}
export async function retainedInventory(db) {
  // No private content or identifying rows leave this process. Immutable keys
  // and content are hashed server-side to prove retention across migration.
  const versions = (await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r=>Number(r.version));
  const tables = {};
  for (const table of ['owners','bots','missions','tasks','evidence','mission_review_versions','weekly_mission_inputs','review_citations']) {
    const rows = (await db.query(`SELECT count(*) AS count,md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${table} t`)).rows[0];
    tables[table] = { count: Number(rows.count), digest: rows.digest };
  }
  const keys = (await db.query(`SELECT
    md5(COALESCE((SELECT string_agg(id,E'\\n' ORDER BY id) FROM owners),'')) AS owners,
    md5(COALESCE((SELECT string_agg(id||':'||owner_id,E'\\n' ORDER BY id) FROM bots),'')) AS bots,
    md5(COALESCE((SELECT string_agg(id||':'||owner_id,E'\\n' ORDER BY id) FROM missions),'')) AS missions`)).rows[0];
  const state = { versions, tables, keys };
  return { ...state, inventorySha256: hash(state) };
}
export function assertPreserved(before,after) {
  if (JSON.stringify(before.keys)!==JSON.stringify(after.keys)) throw new Error('Retained owner, bot or mission identity changed');
  for(const table of Object.keys(before.tables)) {
    if(before.tables[table].count!==after.tables[table].count) throw new Error(`Retained ${table} count changed`);
    // Owners/bots/evidence gain columns. Histories below must be byte-stable.
    if(['missions','tasks','mission_review_versions','weekly_mission_inputs','review_citations'].includes(table) && before.tables[table].digest!==after.tables[table].digest)
      throw new Error(`Retained ${table} content changed`);
  }
  if(JSON.stringify(after.versions)!==JSON.stringify(Array.from({length:finalSchema},(_,i)=>i+1))) throw new Error('Unexpected final schema');
}
export async function seedLifecycleJournal(db,journal) {
  await journal.initialize();
  const known=new Set();
  for await(const intent of journal.records()) known.add(`${intent.action}:${intent.ownerId}:${intent.botId??''}`);
  let seeded=0;
  const owners=(await db.query("SELECT id,status FROM owners WHERE status IN ('closed','suspended') ORDER BY id")).rows;
  const bots=(await db.query("SELECT id,owner_id FROM bots WHERE status='revoked' ORDER BY owner_id,id")).rows;
  for(const owner of owners) {
    const action=owner.status==='closed'?'account-close':'owner-suspend';
    if(!known.has(`${action}:${owner.id}:`)){await journal.append(action,owner.id);seeded++;}
  }
  for(const bot of bots) if(!known.has(`bot-revoke:${bot.owner_id}:${bot.id}`)){await journal.append('bot-revoke',bot.owner_id,bot.id);seeded++;}
  return {seeded,closedOwners:owners.filter(o=>o.status==='closed').length,suspendedOwners:owners.filter(o=>o.status==='suspended').length,revokedBots:bots.length, historicalCompleteness:'Only lifecycle state retained in this database is established; pre-journal deleted records cannot be reconstructed.'};
}
async function main() {
  assertMigrationMode(process.env);
  const mode=process.argv[2]??'inventory';
  if(!['inventory','apply'].includes(mode)) throw new Error('Expected inventory or apply');
  const {database,migrate}=await import(pathToFileURL(resolve('dist/db.js')).href);
  const {ClosureJournal}=await import(pathToFileURL(resolve('dist/closure-journal.js')).href);
  const db=await database({url:process.env.DATABASE_URL});
  try {
    const before=await retainedInventory(db);
    if(mode==='inventory') return console.log(JSON.stringify(before));
    if(!/^[a-f0-9]{64}$/.test(process.env.HUB_MIGRATION_INVENTORY_SHA256??'') || process.env.HUB_MIGRATION_INVENTORY_SHA256!==before.inventorySha256)
      throw new Error('Migration inventory changed or was not accepted');
    if(![3,finalSchema].includes(before.versions.at(-1))) throw new Error('Expected retained schema 3 or accepted current schema');
    await migrate(db);
    const after=await retainedInventory(db);
    assertPreserved(before,after);
    const journal=await seedLifecycleJournal(db,new ClosureJournal(process.env.HUB_CLOSURE_JOURNAL_DIR,true));
    console.log(JSON.stringify({migrated:true,before,after,journal}));
  } finally { await db.close(); }
}
const entryUrl = process.argv[1] === '-'
  ? pathToFileURL(resolve('[eval1]')).href
  : process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if(import.meta.url===entryUrl) main().catch(()=>{console.error('Retained migration failed; preserve its protected evidence and keep writers stopped.');process.exitCode=1;});
