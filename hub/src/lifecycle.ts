import { randomUUID } from "node:crypto";
import type { Database, Queryable, Row } from "./db.js";

// Lock order: bot (if needed), circle membership (if needed), mission, task.
// Multiple mission rows are locked in id order. Sweep never locks bots/members.
export async function failMission(
  tx: Queryable,
  mission: Row,
  reason: string,
): Promise<void> {
  const changed = await tx.query(
    "UPDATE missions SET status='failed' WHERE id=$1 AND status IN ('queued','running') RETURNING id",
    [mission.id],
  );
  if (!changed.rows.length) return;
  await tx.query(
    "UPDATE tasks SET status='failed',attempt_id=NULL,lease_expires_at=NULL WHERE mission_id=$1 AND status IN ('queued','leased')",
    [mission.id],
  );
  await tx.query(
    "INSERT INTO events(id,owner_id,type,message) VALUES($1,$2,$3,$4)",
    [
      randomUUID(),
      mission.owner_id,
      "mission.failed",
      `${mission.title}: ${reason}`,
    ],
  );
}

export async function reconcileMissions(
  db: Database,
  maxAttempts: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const missions = await tx.query(
      "SELECT m.*,m.created_at<=now()-interval '24 hours' AS deadline_passed FROM missions m WHERE m.status IN ('queued','running') AND (m.created_at<=now()-interval '24 hours' OR EXISTS(SELECT 1 FROM tasks t WHERE t.mission_id=m.id AND t.status='leased' AND t.lease_expires_at<=now())) ORDER BY m.id FOR UPDATE OF m",
    );
    for (const mission of missions.rows) {
      if (mission.deadline_passed) {
        await failMission(tx, mission, "24-hour mission deadline reached");
        continue;
      }
      await tx.query(
        "UPDATE tasks SET status=CASE WHEN attempts >= $2 THEN 'failed' ELSE 'queued' END,attempt_id=NULL,lease_expires_at=NULL WHERE mission_id=$1 AND status='leased' AND lease_expires_at<=now()",
        [mission.id, maxAttempts],
      );
      const failed = await tx.query(
        "SELECT id FROM tasks WHERE mission_id=$1 AND status='failed' LIMIT 1",
        [mission.id],
      );
      if (failed.rows.length)
        await failMission(tx, mission, "Research task retry limit reached");
    }
  });
}
