import type { Queryable } from "./db.js";
import { ApiError, fail } from "./security.js";
import { journalBlocksOwner, journalBlocksBot } from "./closure-journal.js";

export interface PublicLimits {
  botsPerOwner: number;
  activeMissionsPerOwner: number;
  newMissionsPerDay: number;
  researchBytesPerOwner: number;
  activeMissionsGlobal: number;
  membersPerCircle: number;
  circlesPerOwner: number;
  admissionsEnabled: boolean;
}
export const DEFAULT_PUBLIC_LIMITS: Readonly<PublicLimits> = Object.freeze({
  botsPerOwner: 2,
  activeMissionsPerOwner: 2,
  newMissionsPerDay: 10,
  researchBytesPerOwner: 200 * 1024 * 1024,
  activeMissionsGlobal: 50,
  membersPerCircle: 10,
  circlesPerOwner: 10,
  admissionsEnabled: true,
});

// The HTTP envelope is capped at 100,000 bytes. This reserves more than twice
// that size per admitted result, including its evidence, event and index data.
export const TASK_RESULT_RESERVATION_BYTES = 256 * 1024;
const CONTENT_OVERHEAD_BYTES = 4096;
export class PublicLimitError extends ApiError {
  constructor(
    public code: string,
    message: string,
    public retryAfterSeconds = 60,
    statusCode = 429,
  ) {
    super(statusCode, message);
  }
}
export function resolvePublicLimits(
  input?: Partial<PublicLimits>,
): PublicLimits {
  const limits = { ...DEFAULT_PUBLIC_LIMITS, ...input };
  for (const [key, value] of Object.entries(limits)) {
    if (key === "admissionsEnabled") {
      if (typeof value !== "boolean")
        throw new Error("Invalid admissionsEnabled");
    } else if (!Number.isSafeInteger(value) || Number(value) < 1) {
      throw new Error(`Invalid public limit ${key}`);
    }
  }
  return limits;
}

/** Acquire FIRST in every admission/content/closure transaction, before rows.
 * A single short admission mutex gives globally correct limits on the small
 * launch VPS. Reads, check-ins, task claims and cancellation do not need it.
 */
export async function lockAdmission(tx: Queryable): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(71423820)");
}
export async function assertActiveOwner(
  tx: Queryable,
  ownerId: string,
): Promise<void> {
  if (journalBlocksOwner(ownerId)) fail(403, "Account is unavailable");
  const { rows } = await tx.query("SELECT status FROM owners WHERE id=$1", [
    ownerId,
  ]);
  if (rows[0]?.status !== "active") fail(403, "Account is unavailable");
}
async function assertAdmission(
  tx: Queryable,
  ownerId: string,
  limits: PublicLimits,
) {
  await assertActiveOwner(tx, ownerId);
  const pressure = (
    await tx.query("SELECT paused FROM service_capacity WHERE id=1")
  ).rows[0];
  if (!limits.admissionsEnabled || pressure?.paused)
    throw new PublicLimitError(
      "service_capacity",
      "New work is temporarily paused. Existing work and account recovery remain available.",
      60,
      503,
    );
}
export async function setAdmissionPressure(
  tx: Queryable,
  paused: boolean,
): Promise<void> {
  await lockAdmission(tx);
  await tx.query(
    "UPDATE service_capacity SET paused=$1,updated_at=now() WHERE id=1",
    [paused],
  );
}
async function refreshReservations(tx: Queryable, ownerId: string) {
  await tx.query(
    `UPDATE research_reservations r SET reserved_bytes=LEAST(r.reserved_bytes,
      (SELECT count(*)*$2 FROM tasks t JOIN bots b ON b.id=t.bot_id JOIN missions m ON m.id=t.mission_id
       WHERE t.mission_id=r.mission_id AND b.owner_id=r.owner_id AND t.status IN ('queued','leased') AND m.status IN ('queued','running')))
     WHERE r.owner_id=$1`,
    [ownerId, TASK_RESULT_RESERVATION_BYTES],
  );
}
async function storage(tx: Queryable, ownerId: string) {
  await tx.query(
    "INSERT INTO owner_usage(owner_id) VALUES($1) ON CONFLICT DO NOTHING",
    [ownerId],
  );
  const { rows } = await tx.query(
    `SELECT u.stored_bytes,
    COALESCE((SELECT sum(reserved_bytes) FROM research_reservations WHERE owner_id=$1),0) AS reserved_bytes
    FROM owner_usage u WHERE u.owner_id=$1`,
    [ownerId],
  );
  return {
    storedBytes: Number(rows[0].stored_bytes),
    reservedBytes: Number(rows[0].reserved_bytes),
  };
}
function assertStorage(
  used: { storedBytes: number; reservedBytes: number },
  extra: number,
  limits: PublicLimits,
) {
  if (
    used.storedBytes + used.reservedBytes + extra >
    limits.researchBytesPerOwner
  )
    throw new PublicLimitError(
      "research_storage",
      "Research storage is full. Existing results and account export remain available. Contact support before starting new work.",
      3600,
    );
}
export async function admitBot(
  tx: Queryable,
  ownerId: string,
  limits: PublicLimits,
  reconnectBotId?: string,
  excludeEnrollmentId?: string,
): Promise<void> {
  await assertActiveOwner(tx, ownerId);
  if (reconnectBotId) {
    if (journalBlocksBot(reconnectBotId))
      fail(403, "This Bot was revoked; create a new connection instead");
    const found = (
      await tx.query(
        "SELECT id FROM bots WHERE id=$1 AND owner_id=$2 AND status<>'revoked'",
        [reconnectBotId, ownerId],
      )
    ).rows[0];
    if (found) return;
  }
  const alreadyReserved =
    excludeEnrollmentId &&
    (
      await tx.query(
        "SELECT id FROM device_enrollments WHERE id=$1 AND owner_id=$2 AND status='approved' AND expires_at>now()",
        [excludeEnrollmentId, ownerId],
      )
    ).rows.length > 0;
  if (!alreadyReserved) await assertAdmission(tx, ownerId, limits);
  const count = Number(
    (
      await tx.query(
        `SELECT
    (SELECT count(*) FROM bots WHERE owner_id=$1 AND status<>'revoked') +
    (SELECT count(*) FROM device_enrollments de WHERE de.owner_id=$1 AND de.status='approved' AND
      (de.reconnect_bot_id IS NULL OR NOT EXISTS(SELECT 1 FROM bots b WHERE b.id=de.reconnect_bot_id AND b.owner_id=$1 AND b.status<>'revoked'))
      AND de.expires_at>now() AND ($2::text IS NULL OR de.id<>$2)) AS count`,
        [ownerId, excludeEnrollmentId ?? null],
      )
    ).rows[0].count,
  );
  if (count >= limits.botsPerOwner)
    throw new PublicLimitError(
      "connected_bots",
      `The account limit is ${limits.botsPerOwner} connected Bots. Reconnect an existing Bot or revoke one first.`,
      3600,
    );
}
async function activeMissionCount(tx: Queryable, ownerId: string) {
  return Number(
    (
      await tx.query(
        `SELECT count(*) FROM missions m WHERE m.status IN ('queued','running') AND
    (m.owner_id=$1 OR EXISTS(SELECT 1 FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE t.mission_id=m.id AND b.owner_id=$1))`,
        [ownerId],
      )
    ).rows[0].count,
  );
}
export async function admitMission(
  tx: Queryable,
  ownerId: string,
  missionId: string,
  taskCount: number,
  inputBytes: number,
  limits: PublicLimits,
): Promise<void> {
  // Caller checks request-hash idempotency first. This also makes accidental
  // duplicate accounting harmless within a retried transaction.
  if (
    (
      await tx.query(
        "SELECT mission_id FROM mission_admissions WHERE mission_id=$1 AND owner_id=$2",
        [missionId, ownerId],
      )
    ).rows.length
  )
    return;
  await assertAdmission(tx, ownerId, limits);
  if (
    !Number.isInteger(taskCount) ||
    taskCount < 1 ||
    taskCount > 50 ||
    !Number.isSafeInteger(inputBytes) ||
    inputBytes < 0
  )
    fail(400, "Invalid research reservation");
  if ((await activeMissionCount(tx, ownerId)) >= limits.activeMissionsPerOwner)
    throw new PublicLimitError(
      "active_missions",
      `Finish or cancel a mission before starting another. The account limit is ${limits.activeMissionsPerOwner}.`,
    );
  const globalCount = Number(
    (
      await tx.query(
        "SELECT count(*) FROM missions WHERE status IN ('queued','running')",
      )
    ).rows[0].count,
  );
  if (globalCount >= limits.activeMissionsGlobal)
    throw new PublicLimitError(
      "service_capacity",
      "All research slots are occupied. Try again after current work completes.",
      60,
      503,
    );
  const daily = (
    await tx.query(
      "SELECT count(*),min(created_at) AS oldest FROM mission_admissions WHERE owner_id=$1 AND created_at>now()-interval '24 hours'",
      [ownerId],
    )
  ).rows[0];
  if (Number(daily.count) >= limits.newMissionsPerDay) {
    const wait = Math.max(
      1,
      Math.ceil(
        (new Date(daily.oldest).getTime() + 86_400_000 - Date.now()) / 1000,
      ),
    );
    throw new PublicLimitError(
      "daily_missions",
      `The account limit is ${limits.newMissionsPerDay} new missions per rolling 24 hours.`,
      wait,
    );
  }
  await refreshReservations(tx, ownerId);
  const bytes = inputBytes + CONTENT_OVERHEAD_BYTES;
  assertStorage(
    await storage(tx, ownerId),
    bytes + taskCount * TASK_RESULT_RESERVATION_BYTES,
    limits,
  );
  await tx.query(
    "INSERT INTO mission_admissions(mission_id,owner_id) VALUES($1,$2)",
    [missionId, ownerId],
  );
  await tx.query(
    "UPDATE owner_usage SET stored_bytes=stored_bytes+$2 WHERE owner_id=$1",
    [ownerId, bytes],
  );
  await tx.query(
    "INSERT INTO research_reservations(owner_id,mission_id,reserved_bytes) VALUES($1,$2,$3)",
    [ownerId, missionId, taskCount * TASK_RESULT_RESERVATION_BYTES],
  );
}
export async function reserveParticipation(
  tx: Queryable,
  ownerId: string,
  missionId: string,
  taskCount: number,
  limits: PublicLimits,
): Promise<void> {
  await assertAdmission(tx, ownerId, limits);
  const already =
    (
      await tx.query(
        "SELECT 1 FROM tasks t JOIN bots b ON b.id=t.bot_id WHERE t.mission_id=$1 AND b.owner_id=$2 LIMIT 1",
        [missionId, ownerId],
      )
    ).rows.length > 0;
  if (
    !already &&
    (await activeMissionCount(tx, ownerId)) >= limits.activeMissionsPerOwner
  )
    throw new PublicLimitError(
      "active_missions",
      "Finish or cancel existing research before joining another mission.",
    );
  if (!Number.isInteger(taskCount) || taskCount < 1 || taskCount > 5)
    fail(400, "Invalid research reservation");
  await refreshReservations(tx, ownerId);
  const reserved = taskCount * TASK_RESULT_RESERVATION_BYTES;
  assertStorage(await storage(tx, ownerId), reserved, limits);
  await tx.query(
    `INSERT INTO research_reservations(owner_id,mission_id,reserved_bytes) VALUES($1,$2,$3)
    ON CONFLICT(owner_id,mission_id) DO UPDATE SET reserved_bytes=research_reservations.reserved_bytes+EXCLUDED.reserved_bytes`,
    [ownerId, missionId, reserved],
  );
}
export async function chargeContent(
  tx: Queryable,
  ownerId: string,
  contentBytes: number,
  limits: PublicLimits,
  reservation: { missionId?: string; taskId?: string } = {},
): Promise<void> {
  await assertActiveOwner(tx, ownerId);
  if (!Number.isSafeInteger(contentBytes) || contentBytes < 0)
    fail(400, "Invalid content size");
  if (
    reservation.taskId &&
    (
      await tx.query(
        "SELECT task_id FROM result_usage WHERE task_id=$1 AND owner_id=$2",
        [reservation.taskId, ownerId],
      )
    ).rows.length
  )
    return;
  const bytes = contentBytes + CONTENT_OVERHEAD_BYTES;
  let released = 0;
  if (reservation.taskId && reservation.missionId) {
    const row = (
      await tx.query(
        "SELECT reserved_bytes FROM research_reservations WHERE owner_id=$1 AND mission_id=$2",
        [ownerId, reservation.missionId],
      )
    ).rows[0];
    released = Math.min(
      Number(row?.reserved_bytes ?? 0),
      TASK_RESULT_RESERVATION_BYTES,
    );
  }
  const used = await storage(tx, ownerId);
  // Existing admitted results consume their reservation even if the operator
  // subsequently reduces the quota or closes new admission under pressure.
  if (!released || bytes > released)
    assertStorage(used, bytes - released, limits);
  await tx.query(
    "UPDATE owner_usage SET stored_bytes=stored_bytes+$2 WHERE owner_id=$1",
    [ownerId, bytes],
  );
  if (released)
    await tx.query(
      "UPDATE research_reservations SET reserved_bytes=reserved_bytes-$3 WHERE owner_id=$1 AND mission_id=$2",
      [ownerId, reservation.missionId, released],
    );
  if (reservation.taskId)
    await tx.query(
      "INSERT INTO result_usage(task_id,owner_id,content_bytes) VALUES($1,$2,$3)",
      [reservation.taskId, ownerId, bytes],
    );
}
export async function admitCircleJoin(
  tx: Queryable,
  ownerId: string,
  circleId: string,
  limits: PublicLimits,
): Promise<void> {
  await assertActiveOwner(tx, ownerId);
  const circle = (
    await tx.query(
      "SELECT c.id FROM circles c JOIN owners o ON o.id=c.owner_id WHERE c.id=$1 AND o.status='active'",
      [circleId],
    )
  ).rows[0];
  if (!circle) fail(404, "Circle is unavailable");
  if (
    (
      await tx.query(
        "SELECT 1 FROM circle_members WHERE circle_id=$1 AND owner_id=$2 AND active=true",
        [circleId, ownerId],
      )
    ).rows.length
  )
    return;
  await assertAdmission(tx, ownerId, limits);
  const joined = Number(
    (
      await tx.query(
        "SELECT count(*) FROM circle_members WHERE owner_id=$1 AND active=true",
        [ownerId],
      )
    ).rows[0].count,
  );
  const members = Number(
    (
      await tx.query(
        "SELECT count(*) FROM circle_members WHERE circle_id=$1 AND active=true",
        [circleId],
      )
    ).rows[0].count,
  );
  if (joined >= limits.circlesPerOwner)
    throw new PublicLimitError(
      "joined_circles",
      `The account limit is ${limits.circlesPerOwner} circles.`,
      3600,
    );
  if (members >= limits.membersPerCircle)
    throw new PublicLimitError(
      "circle_members",
      `This circle has reached its ${limits.membersPerCircle}-member limit.`,
      3600,
    );
}
export async function usageSummary(
  tx: Queryable,
  ownerId: string,
  limits: PublicLimits,
) {
  const used = (
    await tx.query(
      `SELECT COALESCE((SELECT stored_bytes FROM owner_usage WHERE owner_id=$1),0) AS stored_bytes,
    COALESCE((SELECT sum(LEAST(r.reserved_bytes,(SELECT count(*)*$2 FROM tasks t JOIN bots b ON b.id=t.bot_id JOIN missions m ON m.id=t.mission_id WHERE t.mission_id=r.mission_id AND b.owner_id=r.owner_id AND t.status IN ('queued','leased') AND m.status IN ('queued','running')))) FROM research_reservations r WHERE r.owner_id=$1),0) AS reserved_bytes`,
      [ownerId, TASK_RESULT_RESERVATION_BYTES],
    )
  ).rows[0];
  const count = (
    await tx.query(
      `SELECT
    (SELECT count(*) FROM bots WHERE owner_id=$1 AND status<>'revoked') AS bots,
    (SELECT count(*) FROM mission_admissions WHERE owner_id=$1 AND created_at>now()-interval '24 hours') AS daily,
    (SELECT count(*) FROM circle_members WHERE owner_id=$1 AND active=true) AS circles`,
      [ownerId],
    )
  ).rows[0];
  return {
    limits,
    used: {
      connectedBots: Number(count.bots),
      activeMissions: await activeMissionCount(tx, ownerId),
      newMissionsToday: Number(count.daily),
      researchBytes: Number(used.stored_bytes),
      reservedResearchBytes: Number(used.reserved_bytes),
      joinedCircles: Number(count.circles),
    },
  };
}
