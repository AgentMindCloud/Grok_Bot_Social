import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import type { Database, Queryable, Row } from "./db.js";
import { assertActiveOwner, lockAdmission } from "./limits.js";
import { choice, fail, hash, object, secret, string } from "./security.js";
import { ClosureJournal } from "./closure-journal.js";
import { failMission } from "./lifecycle.js";
export const moderationAudit = async (
  tx: Queryable,
  actorId: string,
  action: string,
  targetId: string,
  reason: string,
) => {
  const id = randomUUID();
  await tx.query(
    "INSERT INTO moderation_audit(id,actor_id,action,target_id,reason) VALUES($1,$2,$3,$4,$5)",
    [id, actorId, action, targetId, reason],
  );
  return id;
};
export function registerModeration(
  app: FastifyInstance,
  db: Database,
  config: Config,
  owner: (request: FastifyRequest, mutation?: boolean) => Promise<Row>,
  journal?: ClosureJournal,
) {
  const moderator = async (request: FastifyRequest, mutation = false) => {
    const own = await owner(request, mutation);
    if (!config.poolModeratorOwnerIds?.includes(own.id))
      return fail(403, "Operator moderation access required");
    return own;
  };
  const reportView = (r: Row) => ({
    id: r.id,
    questionId: r.question_id,
    replyId: r.reply_id,
    reason: r.reason,
    severity: r.severity,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    resolutionReason: r.resolution_reason,
    targetBotId: r.target_bot_id ?? null,
    targetOwnerId: r.target_owner_id ?? null,
  });
  app.get("/api/pool/moderation/reports", async (request) => {
    await moderator(request);
    const input = object(request.query, ["status", "cursor"]);
    const status =
      input.status === undefined
        ? "open"
        : choice(
            input.status,
            ["open", "resolved", "dismissed"],
            "report status",
          );
    let cursor: { severity: string; createdAt: string; id: string } | null =
      null;
    if (input.cursor !== undefined) {
      try {
        const parsed = JSON.parse(
          Buffer.from(
            string(input.cursor, "Cursor", 500),
            "base64url",
          ).toString(),
        );
        const v = object(parsed, ["severity", "createdAt", "id"]);
        cursor = {
          severity: choice(
            v.severity,
            ["urgent", "routine"],
            "cursor severity",
          ),
          createdAt: string(v.createdAt, "Cursor time", 40),
          id: string(v.id, "Cursor ID", 80),
        };
        if (!Number.isFinite(Date.parse(cursor.createdAt)))
          fail(400, "Invalid cursor time");
      } catch {
        fail(400, "Invalid moderation cursor");
      }
    }
    const rows = (
      await db.query(
        `SELECT p.*,to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,CASE WHEN p.reply_id IS NULL THEN q.bot_id ELSE r.bot_id END AS target_bot_id,CASE WHEN p.reply_id IS NULL THEN q.owner_id ELSE r.owner_id END AS target_owner_id FROM pool_reports p JOIN pool_questions q ON q.id=p.question_id LEFT JOIN pool_replies r ON r.id=p.reply_id WHERE p.status=$1 AND ($2::text IS NULL OR p.severity<$2 OR (p.severity=$2 AND (p.created_at,p.id)>($3::timestamptz,$4::text))) ORDER BY p.severity DESC,p.created_at,p.id LIMIT 51`,
        [
          status,
          cursor?.severity ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
        ],
      )
    ).rows;
    const last = rows[49];
    return {
      items: rows.slice(0, 50).map(reportView),
      nextCursor:
        rows.length > 50
          ? Buffer.from(
              JSON.stringify({
                severity: last.severity,
                createdAt: last.cursor_created_at,
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  });
  app.post("/api/pool/moderation/reports/:id/resolve", async (request) => {
    const own = await moderator(request, true);
    const input = object(request.body, ["status", "reason", "expectedStatus"]);
    const status = choice(
      input.status,
      ["resolved", "dismissed"],
      "resolution",
    );
    if (input.expectedStatus !== "open")
      fail(400, "Review an open report before resolving it");
    const reason = string(input.reason, "Resolution reason", 500),
      id = string((request.params as Row).id, "Report ID", 80);
    return db.transaction(async (tx) => {
      await lockAdmission(tx);
      await assertActiveOwner(tx, own.id);
      const row = (
        await tx.query("SELECT * FROM pool_reports WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rows[0];
      if (!row) return fail(404, "Report unavailable");
      if (row.status === status && row.resolution_reason === reason)
        return { report: reportView(row), replayed: true };
      if (row.status !== "open")
        fail(409, "Report has already been reviewed; refresh the queue");
      const result = (
        await tx.query(
          "UPDATE pool_reports SET status=$2,resolved_by=$3,resolved_at=now(),resolution_reason=$4 WHERE id=$1 RETURNING *",
          [id, status, own.id, reason],
        )
      ).rows[0];
      const auditId = await moderationAudit(
        tx,
        own.id,
        `report.${status}`,
        id,
        reason,
      );
      return { report: reportView(result), auditId, replayed: false };
    });
  });
  for (const target of ["bots", "owners"] as const)
    app.post(
      `/api/pool/moderation/${target}/:id/${target === "bots" ? "revoke" : "suspend"}`,
      async (request) => {
        const own = await moderator(request, true),
          input = object(request.body, ["reason"]);
        const reason = string(input.reason, "Moderation reason", 500),
          id = string((request.params as Row).id, "Target ID", 80);
        if (target === "owners" && config.poolModeratorOwnerIds?.includes(id))
          fail(
            409,
            "Moderator account suspension requires a separate operator review",
          );
        return db.transaction(async (tx) => {
          await lockAdmission(tx);
          await assertActiveOwner(tx, own.id);
          const row = (
            await tx.query(`SELECT * FROM ${target} WHERE id=$1 FOR UPDATE`, [
              id,
            ])
          ).rows[0];
          if (!row) return fail(404, "Moderation target unavailable");
          if (row.status === (target === "bots" ? "revoked" : "suspended"))
            return { ok: true, replayed: true };
          if (target === "owners" && row.status === "closed")
            return fail(409, "Closed accounts cannot be suspended");
          const botIds =
            target === "bots"
              ? [id]
              : (
                  await tx.query(
                    "SELECT id FROM bots WHERE owner_id=$1 ORDER BY id FOR UPDATE",
                    [id],
                  )
                ).rows.map((r) => r.id);
          if (journal)
            await journal.append(
              target === "bots" ? "bot-revoke" : "owner-suspend",
              target === "bots" ? row.owner_id : id,
              target === "bots" ? id : undefined,
            );
          if (target === "bots")
            await tx.query(
              "UPDATE bots SET status='revoked',token_generation=token_generation+1,token_hash=$2 WHERE id=$1",
              [id, hash(secret())],
            );
          else {
            await tx.query("UPDATE owners SET status='suspended' WHERE id=$1", [
              id,
            ]);
            await tx.query("DELETE FROM sessions WHERE owner_id=$1", [id]);
            await tx.query("DELETE FROM oauth_states WHERE owner_id=$1", [id]);
            await tx.query("DELETE FROM pairings WHERE owner_id=$1", [id]);
            await tx.query(
              "UPDATE device_enrollments SET status='cancelled' WHERE owner_id=$1 AND status IN ('pending','approved')",
              [id],
            );
          }
          await tx.query(
            "UPDATE pool_participation SET enabled=false,allow_questions=false,updated_at=now() WHERE bot_id=ANY($1::text[])",
            [botIds],
          );
          await tx.query(
            "UPDATE pool_questions SET status='closed' WHERE bot_id=ANY($1::text[]) AND status='open'",
            [botIds],
          );
          await tx.query(
            "UPDATE pool_leases SET status='cancelled' WHERE status='leased' AND (bot_id=ANY($1::text[]) OR question_id IN (SELECT id FROM pool_questions WHERE bot_id=ANY($1::text[])))",
            [botIds],
          );
          const missions = (
            await tx.query(
              "SELECT m.* FROM missions m WHERE m.status IN ('queued','running') AND EXISTS(SELECT 1 FROM tasks t WHERE t.mission_id=m.id AND t.bot_id=ANY($1::text[]) AND t.status IN ('queued','leased')) ORDER BY m.id FOR UPDATE OF m",
              [botIds],
            )
          ).rows;
          for (const m of missions)
            await failMission(
              tx,
              m,
              "Participating access was suspended or revoked by moderation",
            );
          const auditId = await moderationAudit(
            tx,
            own.id,
            target === "bots" ? "bot.revoked" : "owner.suspended",
            id,
            reason,
          );
          return { ok: true, auditId, replayed: false };
        });
      },
    );
  app.get("/api/pool/moderation/status", async (request) => {
    await moderator(request);
    return (
      await db.query(
        `SELECT (SELECT count(*)::integer FROM pool_reports WHERE status='open') AS "openReports",(SELECT count(*)::integer FROM pool_reports WHERE status='open' AND severity='urgent') AS "urgentReports",(SELECT min(created_at) FROM pool_reports WHERE status='open') AS "oldestOpenReportAt",(SELECT count(*)::integer FROM pool_questions WHERE purged_at IS NULL) AS "retainedQuestions",(SELECT count(*)::integer FROM pool_leases WHERE status='leased' AND expires_at>now()) AS "activeLeases",(SELECT max(created_at) FROM maintenance_audit) AS "lastMaintenanceAt"`,
      )
    ).rows[0];
  });
}
