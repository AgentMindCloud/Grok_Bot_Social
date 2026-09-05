import type { Database } from "./db.js";
import { lockAdmission, setAdmissionPressure } from "./limits.js";
import { statfs } from "node:fs/promises";
import { freemem } from "node:os";

/** Local safeguard. Deployment monitoring must separately inspect the database
 * volume if it is backed by a different filesystem from this process. */
export async function measureAdmissionPressure(
  options: {
    storagePath?: string;
    minimumFreeDiskBytes?: number;
    minimumFreeMemoryBytes?: number;
  } = {},
): Promise<boolean> {
  try {
    const volume = await statfs(options.storagePath ?? process.cwd());
    return (
      volume.bavail * volume.bsize <
        (options.minimumFreeDiskBytes ?? 1024 * 1024 * 1024) ||
      freemem() < (options.minimumFreeMemoryBytes ?? 256 * 1024 * 1024)
    );
  } catch {
    // Inability to inspect capacity pauses new admission only. Accepted result
    // reservations and account recovery remain available.
    return true;
  }
}

export async function runMaintenance(
  db: Database,
  options: { admissionPaused?: boolean; batchSize?: number } = {},
): Promise<{ skipped: boolean; deleted: number }> {
  const batch = Math.min(
    500,
    Math.max(1, Math.floor(options.batchSize ?? 100)),
  );
  return db.transaction(async (tx) => {
    const acquired = (
      await tx.query("SELECT pg_try_advisory_xact_lock(71423821) AS acquired")
    ).rows[0].acquired;
    if (!acquired) return { skipped: true, deleted: 0 };
    await lockAdmission(tx);
    if (options.admissionPaused !== undefined)
      await setAdmissionPressure(tx, options.admissionPaused);
    let deleted = 0;
    // Fixed table/key pairs only; never interpolate user input. Completed device
    // receipts remain for at least 24 hours so response-loss recovery can finish.
    const targets = [
      ["sessions", "id_hash", "expires_at<=now()"],
      ["oauth_states", "state_hash", "expires_at<=now()"],
      ["pairings", "code_hash", "expires_at<=now()"],
      ["circle_invites", "code_hash", "expires_at<=now()"],
      ["device_enrollments", "id", "expires_at<=now()-interval '24 hours'"],
      [
        "mission_admissions",
        "mission_id",
        "created_at<=now()-interval '48 hours'",
      ],
    ];
    for (const [table, key, condition] of targets) {
      const result = await tx.query(
        `DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM ${table} WHERE ${condition} ORDER BY ${key} LIMIT $1) RETURNING ${key}`,
        [batch],
      );
      deleted += result.rows.length;
    }
    return { skipped: false, deleted };
  });
}
