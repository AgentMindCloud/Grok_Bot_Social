import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function restoreInventory(db) {
  const { rows } = await db.query(`SELECT current_database() AS database,
    (SELECT count(*) FROM owners) AS owners,
    (SELECT count(*) FROM bots) AS bots,
    (SELECT count(*) FROM sessions) AS sessions,
    (SELECT count(*) FROM pairings) AS pairings,
    (SELECT count(*) FROM tasks WHERE status IN ('queued','leased')) AS pending_tasks,
    (SELECT max(version) FROM schema_migrations) AS schema_version`);
  const inventory = rows[0];
  return {
    ...inventory,
    inventorySha256: createHash("sha256")
      .update(JSON.stringify(inventory))
      .digest("hex"),
  };
}
export function assertRestoreTarget(databaseUrl, env) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Valid protected restore connection settings are required");
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!/^grokbot_restore_[a-z0-9_]{1,64}$/.test(databaseName))
    throw new Error(
      "Only an explicitly named grokbot_restore_* database can be quarantined",
    );
  if (
    env.HUB_RESTORE_QUARANTINE !== "true" ||
    env.HUB_REGISTRATION_PAUSED !== "true" ||
    env.HUB_ADMISSIONS_ENABLED !== "false" ||
    env.HUB_POOL_ENABLED !== "false"
  )
    throw new Error(
      "Restore requires quarantine=true, registration paused, new admission disabled and pool disabled",
    );
  return databaseName;
}
export async function quarantineRestoredDatabase(
  db,
  journal,
  replayClosureJournal,
) {
  // Apply durable explicit erasure intents first. Replaying an older database
  // alone cannot establish the current validity of providers/sessions/tokens.
  const replay = await replayClosureJournal(db, journal);
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(71423820)");
    await tx.query("DELETE FROM sessions");
    await tx.query("DELETE FROM oauth_states");
    await tx.query("DELETE FROM pairings");
    await tx.query("DELETE FROM device_enrollments");
    const prefix = createHash("sha256").update(randomBytes(32)).digest("hex");
    const bots = (
      await tx.query(
        "UPDATE bots SET status='revoked',token_hash=$1||id,token_generation=token_generation+1 WHERE status<>'revoked' RETURNING id",
        [prefix],
      )
    ).rows.length;
    const owners = (
      await tx.query(
        "UPDATE owners SET status='suspended' WHERE status='active' RETURNING id",
      )
    ).rows.length;
    const missions = (
      await tx.query(
        "UPDATE missions SET status='cancelled' WHERE status IN ('queued','running') RETURNING id",
      )
    ).rows.length;
    await tx.query(
      "UPDATE tasks SET status='failed',attempt_id=NULL,lease_expires_at=NULL WHERE status IN ('queued','leased')",
    );
    await tx.query("UPDATE circle_members SET active=false");
    // An old checkpoint can resurrect a removed post or stale public consent.
    // Withdraw all restored public content rather than infer publication rights
    // from an old snapshot. No automatic unhide/rejoin path is provided.
    await tx.query(
      "UPDATE pool_participation SET enabled=false,allow_questions=false,updated_at=now()",
    );
    const poolLeases = (
      await tx.query(
        "UPDATE pool_leases SET status='cancelled' WHERE status='leased' RETURNING id",
      )
    ).rows.length;
    const poolQuestions = (
      await tx.query(
        "UPDATE pool_questions SET status='hidden' WHERE status<>'hidden' RETURNING id",
      )
    ).rows.length;
    const poolReplies = (
      await tx.query(
        "UPDATE pool_replies SET hidden=true WHERE hidden=false RETURNING id",
      )
    ).rows.length;
    await tx.query("DELETE FROM circle_invites");
    await tx.query("UPDATE research_reservations SET reserved_bytes=0");
    await tx.query(
      "UPDATE service_capacity SET paused=true,updated_at=now() WHERE id=1",
    );
    return {
      quarantined: true,
      replay,
      suspendedOwners: owners,
      revokedBots: bots,
      cancelledMissions: missions,
      cancelledPoolLeases: poolLeases,
      hiddenPoolQuestions: poolQuestions,
      hiddenPoolReplies: poolReplies,
      publicExposureAllowed: false,
      identityReconciliationRequired: true,
    };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg, index) =>
        !["--apply", "--inventory-sha256"].includes(arg) &&
        args[index - 1] !== "--inventory-sha256",
    )
  )
    throw new Error("Unknown quarantine argument");
  const apply = args.includes("--apply"),
    expected = args[args.indexOf("--inventory-sha256") + 1];
  const target = assertRestoreTarget(process.env.DATABASE_URL, process.env);
  // Mount this script at /app/hub/quarantine-restored-db.mjs in the accepted hub
  // image, whose working directory contains dist and its installed dependencies.
  const { database, migrate } = await import(
    pathToFileURL(resolve("dist/db.js")).href
  );
  const { ClosureJournal } = await import(
    pathToFileURL(resolve("dist/closure-journal.js")).href
  );
  const { replayClosureJournal } = await import(
    pathToFileURL(resolve("dist/account-lifecycle.js")).href
  );
  const db = await database({ url: process.env.DATABASE_URL });
  try {
    const inventory = await restoreInventory(db);
    if (inventory.database !== target)
      throw new Error(
        "Connected database does not match the explicit restore target",
      );
    if (!apply)
      console.log(JSON.stringify({ dryRun: true, ...inventory }, null, 2));
    else {
      if (
        !/^[a-f0-9]{64}$/.test(expected ?? "") ||
        expected !== inventory.inventorySha256
      )
        throw new Error(
          "Restore inventory changed or is not explicitly confirmed",
        );
      if (!process.env.HUB_CLOSURE_JOURNAL_DIR)
        throw new Error("The current independent closure journal is required");
      await migrate(db);
      console.log(
        JSON.stringify(
          await quarantineRestoredDatabase(
            db,
            new ClosureJournal(process.env.HUB_CLOSURE_JOURNAL_DIR, true),
            replayClosureJournal,
          ),
          null,
          2,
        ),
      );
    }
  } finally {
    await db.close();
  }
}
