import type { Database } from "./db.js";
import { lockAdmission, setAdmissionPressure } from "./limits.js";
import { statfs } from "node:fs/promises";
import { freemem } from "node:os";
import { randomUUID } from "node:crypto";

/** This process sees its own filesystem; deployment also monitors the database volume. */
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
        (options.minimumFreeDiskBytes ?? 1073741824) ||
      freemem() < (options.minimumFreeMemoryBytes ?? 268435456)
    );
  } catch {
    return true;
  }
}
export interface MaintenanceOptions {
  admissionPaused?: boolean;
  batchSize?: number;
  dryRun?: boolean;
  contentRetentionDays?: number;
  reportRetentionDays?: number;
}
export async function runMaintenance(
  db: Database,
  options: MaintenanceOptions = {},
) {
  const batch = options.batchSize ?? 100,
    contentDays = options.contentRetentionDays ?? 30,
    reportDays = options.reportRetentionDays ?? 90;
  if (!Number.isInteger(batch) || batch < 1 || batch > 500)
    throw Error("Maintenance batchSize must be 1 to 500");
  if (
    !Number.isInteger(contentDays) ||
    contentDays < 1 ||
    contentDays > 365 ||
    !Number.isInteger(reportDays) ||
    reportDays < 1 ||
    reportDays > 365
  )
    throw Error("Retention must be 1 to 365 days");
  return db.transaction(async (tx) => {
    const counts = {
      skipped: false,
      dryRun: !!options.dryRun,
      deleted: 0,
      closedQuestions: 0,
      expiredLeases: 0,
      purgedQuestions: 0,
      purgedReplies: 0,
      purgedReports: 0,
      cursors: {} as Record<string, string | null>,
      auditId: null as string | null,
    };
    const acquired = (
      await tx.query("SELECT pg_try_advisory_xact_lock(71423821) AS acquired")
    ).rows[0].acquired;
    if (!acquired) return { ...counts, skipped: true };
    await lockAdmission(tx);
    if (options.admissionPaused !== undefined && !options.dryRun)
      await setAdmissionPressure(tx, options.admissionPaused);
    const expired = (
      await tx.query(
        "SELECT id FROM pool_questions WHERE status='open' AND expires_at<=now() ORDER BY expires_at,id LIMIT $1",
        [batch],
      )
    ).rows.map((r) => r.id);
    counts.closedQuestions = expired.length;
    counts.cursors.closedQuestions = expired.at(-1) ?? null;
    if (!options.dryRun && expired.length)
      await tx.query(
        "UPDATE pool_questions SET status='closed' WHERE id=ANY($1::text[])",
        [expired],
      );
    const leases = (
      await tx.query(
        "SELECT id FROM pool_leases WHERE status='leased' AND expires_at<=now() ORDER BY expires_at,id LIMIT $1",
        [batch],
      )
    ).rows.map((r) => r.id);
    counts.expiredLeases = leases.length;
    counts.cursors.expiredLeases = leases.at(-1) ?? null;
    if (!options.dryRun && leases.length)
      await tx.query(
        "UPDATE pool_leases SET status='expired' WHERE id=ANY($1::text[])",
        [leases],
      );
    const questions = (
      await tx.query(
        "SELECT id FROM pool_questions WHERE purged_at IS NULL AND expires_at<=now()-($1::integer*interval '1 day') ORDER BY expires_at,id LIMIT $2",
        [contentDays, batch],
      )
    ).rows.map((r) => r.id);
    counts.purgedQuestions = questions.length;
    counts.cursors.purgedQuestions = questions.at(-1) ?? null;
    if (questions.length) {
      counts.purgedReplies = (
        await tx.query(
          "SELECT count(*)::integer AS n FROM pool_replies WHERE question_id=ANY($1::text[]) AND purged_at IS NULL",
          [questions],
        )
      ).rows[0].n;
      if (!options.dryRun) {
        // Keep only non-content retry receipts. Never delete uniqueness keys or re-enable a participant.
        await tx.query(
          "UPDATE pool_questions SET title='',body='',author_name='Unavailable bot',avatar_slug='bumble',status='closed',purged_at=now() WHERE id=ANY($1::text[])",
          [questions],
        );
        await tx.query(
          "UPDATE pool_replies SET body='',sources='[]',author_name='Unavailable bot',avatar_slug='bumble',hidden=true,purged_at=now() WHERE question_id=ANY($1::text[]) AND purged_at IS NULL",
          [questions],
        );
        await tx.query(
          "UPDATE pool_leases SET status='cancelled' WHERE question_id=ANY($1::text[]) AND status='leased'",
          [questions],
        );
      }
    }
    const reports = (
      await tx.query(
        "SELECT id FROM pool_reports WHERE status<>'open' AND resolved_at<=now()-($1::integer*interval '1 day') ORDER BY resolved_at,id LIMIT $2",
        [reportDays, batch],
      )
    ).rows.map((r) => r.id);
    counts.purgedReports = reports.length;
    counts.cursors.purgedReports = reports.at(-1) ?? null;
    if (!options.dryRun && reports.length)
      await tx.query("DELETE FROM pool_reports WHERE id=ANY($1::text[])", [
        reports,
      ]);
    // Fixed identifiers only. The oldest remaining row is the restart cursor;
    // the transaction either commits the entire batch and receipt or neither.
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
      [
        "moderation_audit",
        "id",
        `created_at<=now()-interval '${reportDays} days'`,
      ],
      ["maintenance_audit", "id", "created_at<=now()-interval '90 days'"],
    ];
    for (const [table, key, condition] of targets) {
      const rows = (
        await tx.query(
          `SELECT ${key} AS id FROM ${table} WHERE ${condition} ORDER BY ${key} LIMIT $1`,
          [batch],
        )
      ).rows.map((r) => r.id);
      counts.deleted += rows.length;
      counts.cursors[table] = rows.at(-1) ?? null;
      if (!options.dryRun && rows.length)
        await tx.query(`DELETE FROM ${table} WHERE ${key}=ANY($1::text[])`, [
          rows,
        ]);
    }
    if (!options.dryRun) {
      counts.auditId = randomUUID();
      await tx.query("INSERT INTO maintenance_audit(id,counts) VALUES($1,$2)", [
        counts.auditId,
        JSON.stringify({
          ...counts,
          contentRetentionDays: contentDays,
          reportRetentionDays: reportDays,
        }),
      ]);
    }
    return counts;
  });
}
