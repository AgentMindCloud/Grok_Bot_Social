import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { database, migrate, type Database } from "../src/db.js";
import {
  closeAccount,
  replayClosureJournal,
} from "../src/account-lifecycle.js";
import {
  ClosureJournal,
  journalBlocksOwner,
  journalBlocksBot,
} from "../src/closure-journal.js";
import { config } from "../src/config.js";
import { createApp } from "../src/server.js";
import { admitBot, lockAdmission, resolvePublicLimits } from "../src/limits.js";

let db: Database, directory: string;
const url = process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
const schema = `test_${randomUUID().replaceAll("-", "")}`;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "gbs-closure-journal-"));
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
  assert.ok(directory.startsWith(join(tmpdir(), "gbs-closure-journal-")));
  await rm(directory, { recursive: true, force: true });
});
async function owner() {
  const id = randomUUID();
  await db.query(
    "INSERT INTO owners(id,handle,display_name) VALUES($1,'private-handle','Private name')",
    [id],
  );
  await db.query(
    "INSERT INTO evidence(id,owner_id,title,summary,visibility) VALUES($1,$2,'Private title','Never put research in a journal','private')",
    [randomUUID(), id],
  );
  return id;
}
test("durable closure intent survives a failed transaction and replays an older database before serving", async () => {
  const id = await owner(),
    path = join(directory, randomUUID()),
    journal = new ClosureJournal(path);
  const uncertain: Database = {
    ...db,
    transaction: async () => {
      throw new Error("Synthetic transaction response lost");
    },
  };
  await assert.rejects(closeAccount(uncertain, id, journal), /response lost/);
  assert.equal(
    (await db.query("SELECT status FROM owners WHERE id=$1", [id])).rows[0]
      .status,
    "active",
  );
  assert.equal(journalBlocksOwner(id), true);
  const filename = (await readdir(path))[0],
    text = await readFile(join(path, filename), "utf8");
  assert.ok(text.includes(id));
  assert.ok(!text.includes("Private name"));
  assert.ok(!text.includes("Never put research"));
  assert.ok(!text.includes("token"));
  // Fresh journal instance models a process starting against an older backup.
  const app = await createApp(db, {
    origin: "http://127.0.0.1:3000",
    production: false,
    localLogin: false,
    localOwner: "unused",
    host: "127.0.0.1",
    port: 8787,
    sessionHours: 24,
    pairingMinutes: 10,
    leaseSeconds: 300,
    maxAttempts: 3,
    fetch,
    accessMode: "open",
    workspaceEnabled: true,
    closureJournalDir: path,
  });
  assert.equal(
    (await db.query("SELECT status FROM owners WHERE id=$1", [id])).rows[0]
      .status,
    "closed",
  );
  assert.equal(
    Number(
      (await db.query("SELECT count(*) FROM evidence WHERE owner_id=$1", [id]))
        .rows[0].count,
    ),
    0,
  );
  await app.close();
  await replayClosureJournal(db, new ClosureJournal(path));
  assert.equal((await readdir(path)).length, 1);
});
test("storage failure prevents account mutation and a corrupt journal fails startup", async () => {
  const id = await owner(),
    invalid = join(directory, randomUUID());
  await writeFile(invalid, "This is a file, not a journal directory");
  await assert.rejects(
    closeAccount(db, id, new ClosureJournal(invalid)),
    /Completion is unconfirmed/,
  );
  assert.equal(
    (await db.query("SELECT status FROM owners WHERE id=$1", [id])).rows[0]
      .status,
    "active",
  );
  const journalPath = join(directory, randomUUID()),
    journal = new ClosureJournal(journalPath);
  await journal.append("account-close", randomUUID());
  const recordPath = join(journalPath, (await readdir(journalPath))[0]);
  await chmod(recordPath, 0o600);
  await writeFile(recordPath, '{"corrupt":true}');
  await assert.rejects(
    replayClosureJournal(db, new ClosureJournal(journalPath)),
    /envelope/,
  );
});
test("explicit Bot revocation is replayed once and unknown future owners do not block restore", async () => {
  const id = await owner(),
    bot = randomUUID(),
    mission = randomUUID(),
    task = randomUUID();
  await db.query(
    "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,'Bot','scout','native-grok','active',$3)",
    [bot, id, randomUUID()],
  );
  await db.query(
    "INSERT INTO missions(id,owner_id,title,brief,status,visibility,max_rounds) VALUES($1,$2,'Question','Scope','running','private',1)",
    [mission, id],
  );
  await db.query(
    "INSERT INTO tasks(id,mission_id,bot_id,round,status) VALUES($1,$2,$3,1,'queued')",
    [task, mission, bot],
  );
  const path = join(directory, randomUUID()),
    journal = new ClosureJournal(path);
  await journal.append("bot-revoke", id, bot);
  await journal.append("account-close", randomUUID());
  assert.equal(journalBlocksBot(bot), true);
  await assert.rejects(
    db.transaction(async (tx) => {
      await lockAdmission(tx);
      await admitBot(tx, id, resolvePublicLimits(), bot);
    }),
    /was revoked/,
  );
  await replayClosureJournal(db, journal);
  const state = (
    await db.query("SELECT status,token_generation FROM bots WHERE id=$1", [
      bot,
    ])
  ).rows[0];
  assert.equal(state.status, "revoked");
  assert.equal(state.token_generation, 2);
  assert.equal(
    (await db.query("SELECT status FROM missions WHERE id=$1", [mission]))
      .rows[0].status,
    "failed",
  );
  await replayClosureJournal(db, new ClosureJournal(path));
  assert.equal(
    (await db.query("SELECT token_generation FROM bots WHERE id=$1", [bot]))
      .rows[0].token_generation,
    2,
  );
});
test("production configuration requires independent absolute journal storage", () => {
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://ci:ci@127.0.0.1/ci",
    PUBLIC_ORIGIN: "https://example.com",
    GITHUB_CLIENT_ID: "ci",
    GITHUB_CLIENT_SECRET: "ci",
    HUB_WORKSPACE_ENABLED: "true",
  };
  assert.throws(() => config(env), /HUB_CLOSURE_JOURNAL_DIR/);
  assert.throws(
    () => config({ ...env, HUB_CLOSURE_JOURNAL_DIR: "relative" }),
    /HUB_CLOSURE_JOURNAL_DIR/,
  );
  assert.equal(
    config({ ...env, HUB_CLOSURE_JOURNAL_DIR: directory }).closureJournalDir,
    directory,
  );
});
