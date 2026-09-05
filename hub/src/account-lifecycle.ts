import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { Config } from "./config.js";
import type { Database, Queryable, Row } from "./db.js";
import { assertActiveOwner, lockAdmission } from "./limits.js";
import { fail, hash, object, secret } from "./security.js";
import { ClosureJournal } from "./closure-journal.js";
import { failMission } from "./lifecycle.js";

export interface AccountLifecycleServices {
  owner(request: FastifyRequest, mutate?: boolean): Promise<Row>;
  checkOrigin(request: FastifyRequest): void;
  requireRecentAuthentication(owner: Row): void;
  cookieName: string;
  cookieOptions: CookieSerializeOptions;
}

// Each export page is bounded. No sessions, bearer/connection secrets, attempt
// identifiers, idempotency keys or inaccessible circle content are exported.
const EXPORT_BATCH = 100;
const exportSections = [
  {
    name: "bots",
    sql: "SELECT id,name,role,runtime,status,last_seen_at,created_at FROM bots WHERE owner_id=$1 AND id>$2 ORDER BY id LIMIT $3",
  },
  {
    name: "missions",
    sql: "SELECT id,title,brief,status,visibility,circle_id,max_rounds,kind,created_at FROM missions WHERE owner_id=$1 AND id>$2 ORDER BY id LIMIT $3",
  },
  {
    name: "tasks",
    sql: "SELECT t.id,t.mission_id,t.bot_id,t.round,t.status,t.attempts FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE b.owner_id=$1 AND t.id>$2 ORDER BY t.id LIMIT $3",
  },
  {
    name: "evidence",
    sql: "SELECT id,mission_id,bot_id,title,summary,source_url,sources,visibility,circle_id,created_at FROM evidence WHERE owner_id=$1 AND erased_at IS NULL AND id>$2 ORDER BY id LIMIT $3",
  },
  {
    name: "reviews",
    sql: "SELECT id,mission_id,version,decision,usefulness,rationale,next_review_at,assistance,review_duration_seconds,measurement_snapshot,created_at FROM mission_review_versions WHERE owner_id=$1 AND id>$2 ORDER BY id LIMIT $3",
  },
  {
    name: "weeklyInputs",
    sql: "SELECT mission_id AS id,input,prior_review_id,created_at FROM weekly_mission_inputs WHERE owner_id=$1 AND mission_id>$2 ORDER BY mission_id LIMIT $3",
  },
  {
    name: "followups",
    sql: "SELECT mission_id AS id,source_mission_id,source_review_id,created_at FROM mission_followups WHERE owner_id=$1 AND mission_id>$2 ORDER BY mission_id LIMIT $3",
  },
  {
    name: "events",
    sql: "SELECT id,type,message,created_at FROM events WHERE owner_id=$1 AND id>$2 ORDER BY id LIMIT $3",
  },
] as const;

function evidenceDigest(row: Row) {
  return hash(
    JSON.stringify({
      id: row.id,
      title: row.title,
      summary: row.summary,
      sources: row.sources,
      sourceUrl: row.source_url,
    }),
  );
}
export async function exportReviewCitations(
  tx: Queryable,
  ownerId: string,
  reviewId: string,
) {
  const { rows } = await tx.query(
    `SELECT c.content_hash,e.*,
    (e.erased_at IS NULL AND (e.owner_id=$1 OR (e.visibility='circle' AND EXISTS(
      SELECT 1 FROM circle_members cm JOIN circles ci ON ci.id=cm.circle_id JOIN owners co ON co.id=ci.owner_id
      WHERE cm.owner_id=$1 AND cm.circle_id=e.circle_id AND cm.active=true AND co.status='active')))) AS accessible
    FROM review_citations c JOIN mission_review_versions r ON r.id=c.review_id
    JOIN evidence e ON e.id=c.evidence_id WHERE r.id=$2 AND r.owner_id=$1 ORDER BY e.id`,
    [ownerId, reviewId],
  );
  return rows.map((row) =>
    row.accessible && evidenceDigest(row) === row.content_hash
      ? {
          available: true,
          contentHash: row.content_hash,
          evidence: {
            id: row.id,
            title: row.title,
            summary: row.summary,
            sources: row.sources,
            createdAt: row.created_at,
          },
        }
      : { available: false },
  );
}

/** NDJSON permits a complete account export without buffering 200 MiB in RAM. */
export async function* exportAccount(
  db: Database,
  ownerId: string,
): AsyncGenerator<string> {
  const initial = await db.transaction(async (tx) => {
    await assertActiveOwner(tx, ownerId);
    const profile = (
      await tx.query(
        "SELECT id,handle,display_name,account_classification,created_at FROM owners WHERE id=$1",
        [ownerId],
      )
    ).rows[0];
    const identities = (
      await tx.query(
        "SELECT provider,provider_user_id,handle,display_name,created_at FROM provider_identities WHERE owner_id=$1 ORDER BY provider",
        [ownerId],
      )
    ).rows;
    const circles = (
      await tx.query(
        `SELECT c.id,c.name,cm.role FROM circle_members cm JOIN circles c ON c.id=cm.circle_id JOIN owners o ON o.id=c.owner_id WHERE cm.owner_id=$1 AND cm.active=true AND o.status='active' ORDER BY c.id`,
        [ownerId],
      )
    ).rows;
    const enrollment =
      (
        await tx.query(
          "SELECT cohort_key,classification,consent,consent_version,assistance,enrolled_at,updated_at FROM pilot_enrollments WHERE owner_id=$1",
          [ownerId],
        )
      ).rows[0] ?? null;
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      format: "ndjson",
      consistency:
        "Each page rechecks current account and circle access; concurrent edits can appear in later pages.",
      profile,
      identities,
      circles,
      enrollment,
    };
  });
  yield JSON.stringify({ section: "account", data: initial }) + "\n";
  for (const section of exportSections) {
    let cursor = "";
    for (;;) {
      const rows = await db.transaction(async (tx) => {
        await assertActiveOwner(tx, ownerId);
        // Membership removal takes a conflicting row lock, so access remains
        // stable until the page has been prepared. Recheck on the next page.
        await tx.query(
          "SELECT circle_id FROM circle_members WHERE owner_id=$1 ORDER BY circle_id FOR SHARE",
          [ownerId],
        );
        const page = (
          await tx.query(section.sql, [ownerId, cursor, EXPORT_BATCH])
        ).rows;
        if (section.name === "reviews")
          for (const row of page)
            row.citations = await exportReviewCitations(tx, ownerId, row.id);
        return page;
      });
      for (const row of rows)
        yield JSON.stringify({ section: section.name, data: row }) + "\n";
      if (rows.length < EXPORT_BATCH) break;
      cursor = rows[rows.length - 1].id;
    }
  }
  yield JSON.stringify({
    section: "complete",
    data: { exportedAt: new Date().toISOString() },
  }) + "\n";
}

/** The caller enforces fresh authentication and explicit confirmation.
 * This transaction closes and erases live content atomically. Minimal closed
 * account/circle/evidence tombstones preserve foreign references only.
 */
export async function closeAccount(
  db: Database,
  ownerId: string,
  journal?: ClosureJournal,
): Promise<{ closed: true; liveContentPurged: true }> {
  if (journal) await journal.append("account-close", ownerId);
  return db.transaction(async (tx) => {
    await lockAdmission(tx);
    const owner = (
      await tx.query(
        "SELECT status,purged_at FROM owners WHERE id=$1 FOR UPDATE",
        [ownerId],
      )
    ).rows[0];
    if (!owner) fail(404, "Account not found");
    if (owner.status === "closed" && owner.purged_at)
      return { closed: true, liveContentPurged: true };
    await tx.query(
      "UPDATE owners SET status='closed',closed_at=COALESCE(closed_at,now()) WHERE id=$1",
      [ownerId],
    );
    await tx.query("DELETE FROM sessions WHERE owner_id=$1", [ownerId]);
    await tx.query("DELETE FROM oauth_states WHERE owner_id=$1", [ownerId]);
    await tx.query("DELETE FROM pairings WHERE owner_id=$1", [ownerId]);
    await tx.query("DELETE FROM device_enrollments WHERE owner_id=$1", [
      ownerId,
    ]);
    // Lock all affected Bots before memberships/missions, matching dispatch.
    await tx.query(
      "SELECT id FROM bots WHERE owner_id=$1 ORDER BY id FOR UPDATE",
      [ownerId],
    );
    await tx.query(
      "UPDATE bots SET status='revoked',token_hash=$2||id,token_generation=token_generation+1 WHERE owner_id=$1",
      [ownerId, hash(secret())],
    );
    await tx.query(
      "SELECT circle_id FROM circle_members WHERE owner_id=$1 OR circle_id IN (SELECT id FROM circles WHERE owner_id=$1) ORDER BY circle_id,owner_id FOR UPDATE",
      [ownerId],
    );
    await tx.query(
      "UPDATE circle_members SET active=false WHERE owner_id=$1 OR circle_id IN (SELECT id FROM circles WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query(
      "DELETE FROM circle_invites WHERE circle_id IN (SELECT id FROM circles WHERE owner_id=$1)",
      [ownerId],
    );
    const affected = (
      await tx.query(
        `SELECT m.id FROM missions m WHERE m.owner_id=$1 OR EXISTS(SELECT 1 FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE t.mission_id=m.id AND b.owner_id=$1 AND t.status IN ('queued','leased')) ORDER BY m.id FOR UPDATE`,
        [ownerId],
      )
    ).rows.map((m) => m.id);
    if (affected.length) {
      await tx.query(
        "UPDATE missions SET status='cancelled' WHERE id=ANY($1::text[]) AND status IN ('queued','running')",
        [affected],
      );
      await tx.query(
        "UPDATE tasks SET status='failed',attempt_id=NULL,lease_expires_at=NULL WHERE mission_id=ANY($1::text[]) AND status IN ('queued','leased')",
        [affected],
      );
    }
    await tx.query(
      "DELETE FROM approvals WHERE owner_id=$1 OR evidence_id IN (SELECT id FROM evidence WHERE owner_id=$1) OR circle_id IN (SELECT id FROM circles WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query("DELETE FROM mission_followups WHERE owner_id=$1", [
      ownerId,
    ]);
    await tx.query("DELETE FROM weekly_mission_inputs WHERE owner_id=$1", [
      ownerId,
    ]);
    await tx.query(
      "DELETE FROM review_citations WHERE review_id IN (SELECT id FROM mission_review_versions WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query("DELETE FROM mission_review_versions WHERE owner_id=$1", [
      ownerId,
    ]);
    await tx.query(
      "DELETE FROM mission_measurement_snapshots WHERE mission_id IN (SELECT id FROM missions WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query(
      "DELETE FROM result_usage WHERE owner_id=$1 OR task_id IN (SELECT t.id FROM tasks t JOIN missions m ON m.id=t.mission_id WHERE m.owner_id=$1)",
      [ownerId],
    );
    await tx.query(
      "DELETE FROM research_reservations WHERE owner_id=$1 OR mission_id IN (SELECT id FROM missions WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query(
      "DELETE FROM tasks WHERE bot_id IN (SELECT id FROM bots WHERE owner_id=$1) OR mission_id IN (SELECT id FROM missions WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query(
      "DELETE FROM evidence WHERE owner_id=$1 AND NOT EXISTS(SELECT 1 FROM review_citations c WHERE c.evidence_id=evidence.id)",
      [ownerId],
    );
    await tx.query(
      "UPDATE evidence SET owner_id=NULL,mission_id=NULL,bot_id=NULL,title='Unavailable reference',summary='',source_url=NULL,sources='[]',visibility='private',circle_id=NULL,erased_at=now() WHERE owner_id=$1",
      [ownerId],
    );
    // Other owners retain their own contributions, without the deleted Bot or
    // source mission relationship. Do not mutate their immutable reviews.
    await tx.query(
      "UPDATE evidence SET bot_id=NULL WHERE bot_id IN (SELECT id FROM bots WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query(
      "UPDATE evidence SET mission_id=NULL WHERE mission_id IN (SELECT id FROM missions WHERE owner_id=$1)",
      [ownerId],
    );
    await tx.query("DELETE FROM missions WHERE owner_id=$1", [ownerId]);
    await tx.query("DELETE FROM bots WHERE owner_id=$1", [ownerId]);
    await tx.query("DELETE FROM events WHERE owner_id=$1", [ownerId]);
    await tx.query("DELETE FROM pilot_enrollments WHERE owner_id=$1", [
      ownerId,
    ]);
    await tx.query("DELETE FROM provider_identities WHERE owner_id=$1", [
      ownerId,
    ]);
    await tx.query("DELETE FROM mission_admissions WHERE owner_id=$1", [
      ownerId,
    ]);
    await tx.query("DELETE FROM owner_usage WHERE owner_id=$1", [ownerId]);
    await tx.query("DELETE FROM circle_members WHERE owner_id=$1", [ownerId]);
    await tx.query(
      "UPDATE circles SET name='Unavailable circle' WHERE owner_id=$1",
      [ownerId],
    );
    await tx.query(
      "UPDATE owners SET github_id=NULL,handle='closed-account',display_name='Closed account',purged_at=now() WHERE id=$1",
      [ownerId],
    );
    return { closed: true, liveContentPurged: true };
  });
}

export function registerAccountLifecycle(
  app: FastifyInstance,
  db: Database,
  _config: Config,
  services: AccountLifecycleServices,
  journal?: ClosureJournal,
): void {
  app.get("/api/account/export", async (request, reply) => {
    const owner = await services.owner(request);
    reply
      .header("Cache-Control", "no-store")
      .header(
        "Content-Disposition",
        "attachment; filename=GrokBot-Social-account.ndjson",
      )
      .type("application/x-ndjson; charset=utf-8");
    return reply.send(Readable.from(exportAccount(db, owner.id)));
  });
  app.post("/api/account/close", async (request, reply) => {
    services.checkOrigin(request);
    const owner = await services.owner(request, true);
    services.requireRecentAuthentication(owner);
    const body = object(request.body, ["confirmation"]);
    if (body.confirmation !== "CLOSE MY ACCOUNT")
      fail(400, "Type CLOSE MY ACCOUNT to confirm account closure");
    const result = await closeAccount(db, owner.id, journal);
    reply
      .clearCookie(services.cookieName, services.cookieOptions)
      .header("Cache-Control", "no-store");
    return result;
  });
}

export async function replayClosureJournal(
  db: Database,
  journal: ClosureJournal,
  pendingOnly = false,
): Promise<{ accounts: number; bots: number }> {
  let accounts = 0,
    bots = 0;
  for await (const intent of pendingOnly
    ? journal.pending()
    : journal.records()) {
    const exists =
      (await db.query("SELECT id FROM owners WHERE id=$1", [intent.ownerId]))
        .rows.length > 0;
    if (!exists) {
      journal.markApplied(intent.eventId);
      continue;
    } // Retained on disk for future restores.
    if (intent.action === "account-close") {
      await closeAccount(db, intent.ownerId);
      accounts++;
    } else {
      await db.transaction(async (tx) => {
        await lockAdmission(tx);
        const changed = (
          await tx.query(
            "UPDATE bots SET status='revoked',token_hash=$3,token_generation=token_generation+1 WHERE id=$1 AND owner_id=$2 AND status<>'revoked' RETURNING id",
            [intent.botId, intent.ownerId, hash(secret())],
          )
        ).rows.length;
        if (!changed) return;
        const missions = (
          await tx.query(
            "SELECT m.* FROM missions m WHERE m.status IN ('queued','running') AND EXISTS(SELECT 1 FROM tasks t WHERE t.mission_id=m.id AND t.bot_id=$1 AND t.status IN ('queued','leased')) ORDER BY m.id FOR UPDATE OF m",
            [intent.botId],
          )
        ).rows;
        for (const mission of missions)
          await failMission(tx, mission, "Bot credential revoked by its owner");
      });
      bots++;
    }
    journal.markApplied(intent.eventId);
  }
  return { accounts, bots };
}
