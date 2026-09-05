import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { database, migrate, type Database } from "../src/db.js";
import { config, type Config } from "../src/config.js";
import { createApp } from "../src/server.js";
import { hash } from "../src/security.js";

const url = process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
const schema = `test_${randomUUID().replaceAll("-", "")}`;
let db: Database;
const origin = "http://127.0.0.1:3000";
let githubId = 700000;
const base: Config = {
  origin,
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
  privateBeta: true,
  weeklyResearchEnabled: true,
  betaAllowedGithubIds: ["1"],
  betaCohort: "beta-test",
};
before(async () => {
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
});
async function actor() {
  const id = randomUUID(),
    gh = String(githubId++),
    session = randomUUID(),
    csrf = randomUUID(),
    circle = randomUUID();
  await db.query(
    "INSERT INTO owners(id,github_id,handle,display_name) VALUES($1,$2,$3,'Beta tester')",
    [id, gh, `tester${gh}`],
  );
  await db.query(
    "INSERT INTO circles(id,owner_id,name) VALUES($1,$2,'Test circle')",
    [circle, id],
  );
  await db.query(
    "INSERT INTO circle_members(circle_id,owner_id,role) VALUES($1,$2,'owner')",
    [circle, id],
  );
  await db.query(
    "INSERT INTO sessions(id_hash,owner_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
    [hash(session), id, csrf],
  );
  const cfg = { ...base, betaAllowedGithubIds: [gh] };
  const app = await createApp(db, cfg);
  const req = (
    method: "GET" | "POST",
    path: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: path,
      headers: {
        cookie: `gbs-session=${session}`,
        origin,
        "x-csrf-token": csrf,
        ...headers,
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const botReq = (
    token: string,
    method: "GET" | "POST",
    path: string,
    payload?: unknown,
    cap = true,
  ) =>
    app.inject({
      method,
      url: path,
      headers: {
        authorization: `Bearer ${token}`,
        ...(cap ? { "x-grok-hub-capabilities": "weekly-research-v1" } : {}),
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const pair = async () => {
    const p = await req("POST", "/api/pairings", {});
    assert.equal(p.statusCode, 200, p.body);
    const r = await app.inject({
      method: "POST",
      url: "/api/bot/pair",
      payload: {
        code: p.json().code,
        name: "Beta scout",
        role: "scout",
        runtime: "native-grok",
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const weekly = async (
    botIds: string[],
    overrides: Record<string, unknown> = {},
  ) => {
    const r = await req("POST", "/api/missions", weeklyBody(botIds, overrides));
    assert.equal(r.statusCode, 200, r.body);
    return r.json().mission;
  };
  return { id, gh, circle, app, cfg, req, botReq, pair, weekly };
}
function weeklyBody(botIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    kind: "weekly-decision",
    title: "Which change deserves a small test?",
    botIds,
    visibility: "private",
    maxRounds: 1,
    weeklyInput: {
      offer: "Research workflow",
      buyer: "Independent founders",
      products: [{ name: "Example", url: "https://example.com/product" }],
      seedUrls: ["https://example.com/news"],
      approvedOrigins: ["https://example.com"],
    },
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}
const reviewBody = (
  evidenceIds: string[] = [],
  overrides: Record<string, unknown> = {},
) => ({
  expectedVersion: 0,
  decision: "watch",
  usefulness: "useful",
  rationale: "A supported owner decision, not authority for external action.",
  evidenceIds,
  nextReviewAt: null,
  assistance: "assisted",
  idempotencyKey: randomUUID(),
  ...overrides,
});
const resultBody = (task: any, url = "https://example.com/other-page") => ({
  attemptId: task.attemptId,
  idempotencyKey: randomUUID(),
  contribution: {
    type: "research",
    title: "Observed change",
    summary:
      "Changes\nSource-backed observation.\nUncertainty\nLimited scope.\nOwner relevance\nReview needed.\nCounterarguments\nSmall sample.\nProposed next experiment\nOwner approval needed.\nPrevious-decision update\nFirst run.",
    sources: [{ url }],
  },
});

async function summaryBot(ownerId: string, status = "active") {
  const botId = randomUUID();
  await db.query(
    "INSERT INTO bots(id,owner_id,name,role,runtime,status,token_hash) VALUES($1,$2,'Summary bot','scout','native-grok',$3,$4)",
    [botId, ownerId, status, hash(randomUUID())],
  );
  return botId;
}

async function summaryMission(input: {
  ownerId: string;
  title: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  botId?: string;
  taskStatus?: "queued" | "leased" | "completed" | "failed";
  attempts?: number;
  evidenceOwnerId?: string;
  evidenceVisibility?: "private" | "circle";
  circleId?: string;
}) {
  const missionId = randomUUID();
  await db.query(
    "INSERT INTO missions(id,owner_id,title,brief,status,visibility,circle_id,max_rounds) VALUES($1,$2,$3,'Summary fixture',$4,$5,$6,1)",
    [
      missionId,
      input.ownerId,
      input.title,
      input.status,
      input.circleId ? "circle" : "private",
      input.circleId ?? null,
    ],
  );
  await db.query("UPDATE missions SET created_at=$2 WHERE id=$1", [
    missionId,
    input.createdAt,
  ]);
  if (input.botId && input.taskStatus)
    await db.query(
      "INSERT INTO tasks(id,mission_id,bot_id,round,status,attempts) VALUES($1,$2,$3,1,$4,$5)",
      [
        randomUUID(),
        missionId,
        input.botId,
        input.taskStatus,
        input.attempts ?? 0,
      ],
    );
  if (input.evidenceOwnerId)
    await db.query(
      "INSERT INTO evidence(id,owner_id,mission_id,title,summary,source_url,sources,visibility,circle_id) VALUES($1,$2,$3,$4,'Permission-safe finding','https://example.com', $5,$6,$7)",
      [
        randomUUID(),
        input.evidenceOwnerId,
        missionId,
        `${input.title} finding`,
        JSON.stringify([{ url: "https://example.com" }]),
        input.evidenceVisibility ?? "private",
        input.circleId ?? null,
      ],
    );
  return missionId;
}

async function summaryReview(input: {
  missionId: string;
  ownerId: string;
  version?: number;
  nextReviewAt: string;
}) {
  const reviewId = randomUUID();
  await db.query(
    "INSERT INTO mission_review_versions(id,mission_id,owner_id,version,decision,usefulness,rationale,next_review_at,assistance,idempotency_key,request_hash) VALUES($1,$2,$3,$4,'watch','useful','Summary review',$5,'unknown',$6,$7)",
    [
      reviewId,
      input.missionId,
      input.ownerId,
      input.version ?? 1,
      input.nextReviewAt,
      randomUUID(),
      hash(randomUUID()),
    ],
  );
  return reviewId;
}

test("beta config fails closed and weekly rollout defaults off", () => {
  assert.throws(
    () => config({ HUB_PRIVATE_BETA: "true", HUB_EMBEDDED_DB: "true" }),
    /ALLOWED/,
  );
  assert.throws(
    () =>
      config({
        HUB_PRIVATE_BETA: "true",
        HUB_BETA_ALLOWED_GITHUB_IDS: "alice",
        HUB_EMBEDDED_DB: "true",
      }),
    /numeric/,
  );
  assert.throws(
    () =>
      config({
        HUB_PRIVATE_BETA: "true",
        HUB_BETA_ALLOWED_GITHUB_IDS: "123",
        HUB_BETA_INTERNAL_GITHUB_IDS: "456",
        HUB_EMBEDDED_DB: "true",
      }),
    /subsets/,
  );
  assert.throws(
    () =>
      config({ HUB_WEEKLY_RESEARCH_ENABLED: "true", HUB_EMBEDDED_DB: "true" }),
    /requires private/,
  );
  const c = config({
    HUB_PRIVATE_BETA: "true",
    HUB_BETA_ALLOWED_GITHUB_IDS: "123",
    HUB_EMBEDDED_DB: "true",
  });
  assert.equal(c.weeklyResearchEnabled, false);
});
test("invite removal blocks existing sessions, pair codes, bots, replay and still permits logout", async () => {
  const a = await actor();
  try {
    const bot = await a.pair(),
      mission = await a.weekly([bot.bot.id]);
    const task = (await a.botReq(bot.token, "GET", "/api/bot/inbox")).json()
      .tasks[0];
    const body = resultBody(task);
    const result = await a.botReq(
      bot.token,
      "POST",
      `/api/bot/tasks/${task.id}/result`,
      body,
    );
    assert.equal(result.statusCode, 200, result.body);
    const pair = (await a.req("POST", "/api/pairings", {})).json();
    a.cfg.betaAllowedGithubIds = [];
    assert.equal(
      (await a.req("GET", "/api/session")).json().accessDenied,
      true,
    );
    assert.equal((await a.req("GET", "/api/workspace")).statusCode, 403);
    assert.equal((await a.req("POST", "/api/pairings", {})).statusCode, 403);
    const denied = await a.app.inject({
      method: "POST",
      url: "/api/bot/pair",
      payload: {
        code: pair.code,
        name: "No access",
        role: "scout",
        runtime: "native-grok",
      },
    });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.equal(
      (await a.botReq(bot.token, "GET", "/api/bot/inbox")).statusCode,
      403,
    );
    assert.equal(
      (await a.botReq(bot.token, "POST", "/api/bot/heartbeat", {})).statusCode,
      403,
    );
    assert.equal(
      (
        await a.botReq(
          bot.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          body,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (await a.req("POST", "/api/auth/logout", {}, { "x-csrf-token": "" }))
        .statusCode,
      200,
    );
  } finally {
    await a.app.close();
  }
});
test("weekly compatibility gates before lease, immutable scope restricts origins and flag only stops new creation", async () => {
  const a = await actor();
  try {
    const bot = await a.pair();
    const payload = weeklyBody([bot.bot.id]);
    const r = await a.req("POST", "/api/missions", payload);
    assert.equal(r.statusCode, 200, r.body);
    const m = r.json().mission;
    const replay = await a.req("POST", "/api/missions", payload);
    assert.equal(replay.json().replayed, true);
    assert.equal(replay.json().mission.id, m.id);
    assert.equal(
      (await a.req("POST", "/api/missions", { ...payload, title: "Changed" }))
        .statusCode,
      409,
    );
    assert.equal(
      (
        await a.botReq(bot.token, "GET", "/api/bot/inbox", undefined, false)
      ).json().tasks.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT attempts,status FROM tasks WHERE mission_id=$1",
          [m.id],
        )
      ).rows[0].attempts,
      0,
    );
    const detail = await a.req("GET", `/api/missions/${m.id}`);
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().progress.queued, 1);
    assert.deepEqual(detail.json().weeklyInput.approvedOrigins, [
      "https://example.com",
    ]);
    await assert.rejects(
      () =>
        db.query(
          "UPDATE weekly_mission_inputs SET input='{}' WHERE mission_id=$1",
          [m.id],
        ),
      /immutable/,
    );
    a.cfg.weeklyResearchEnabled = false;
    assert.equal(
      (await a.req("POST", "/api/missions", payload)).json().replayed,
      true,
    );
    assert.equal(
      (await a.req("POST", "/api/missions", weeklyBody([bot.bot.id])))
        .statusCode,
      409,
    );
    const task = (await a.botReq(bot.token, "GET", "/api/bot/inbox")).json()
      .tasks[0];
    assert.equal(task.weeklyContext.schemaVersion, 1);
    assert.equal(
      (
        await a.botReq(
          bot.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task, "https://sub.example.com/source"),
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await a.botReq(
          bot.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task, "https://example.com:444/source"),
        )
      ).statusCode,
      403,
    );
    const result = await a.botReq(
      bot.token,
      "POST",
      `/api/bot/tasks/${task.id}/result`,
      resultBody(task),
    );
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(
      (await a.req("GET", `/api/missions/${m.id}`)).json().progress.completed,
      1,
    );
  } finally {
    await a.app.close();
  }
});
test("weekly validates owner-confirmed sites and never consumes attempts ahead of a compatible generic task", async () => {
  const a = await actor(),
    b = await actor();
  try {
    const bot = await a.pair();
    for (const change of [
      { visibility: "circle" },
      { botIds: [(await b.pair()).bot.id] },
      {
        weeklyInput: {
          offer: "Offer",
          buyer: "Buyer",
          products: [],
          seedUrls: ["https://example.com"],
          approvedOrigins: ["https://example.org"],
        },
      },
      {
        weeklyInput: {
          offer: "Offer",
          buyer: "Buyer",
          products: [],
          seedUrls: ["https://example.com/path\\evil"],
          approvedOrigins: ["https://example.com"],
        },
      },
    ]) {
      const r = await a.req(
        "POST",
        "/api/missions",
        weeklyBody([bot.bot.id], change),
      );
      assert.ok([400, 404].includes(r.statusCode), r.body);
    }
    const weekly = await a.weekly([bot.bot.id]);
    const generic = await a.req("POST", "/api/missions", {
      title: "Generic",
      brief: "Existing compatible task",
      botIds: [bot.bot.id],
      visibility: "private",
      maxRounds: 1,
    });
    assert.equal(generic.statusCode, 200, generic.body);
    const inbox = await a.botReq(
      bot.token,
      "GET",
      "/api/bot/inbox",
      undefined,
      false,
    );
    assert.equal(inbox.json().tasks[0].missionId, generic.json().mission.id);
    assert.equal(inbox.json().tasks[0].weeklyContext, undefined);
    assert.equal(
      (
        await db.query("SELECT attempts FROM tasks WHERE mission_id=$1", [
          weekly.id,
        ])
      ).rows[0].attempts,
      0,
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
});
test("versioned reviews serialize concurrent writes, preserve revisions, scoped citations and export", async () => {
  const a = await actor(),
    b = await actor();
  try {
    const bot = await a.pair(),
      m = await a.weekly([bot.bot.id]);
    const task = (await a.botReq(bot.token, "GET", "/api/bot/inbox")).json()
      .tasks[0];
    const done = await a.botReq(
      bot.token,
      "POST",
      `/api/bot/tasks/${task.id}/result`,
      resultBody(task),
    );
    const eid = done.json().evidenceId;
    const r1 = reviewBody([eid]),
      r2 = reviewBody([eid], { decision: "test" });
    const rs = await Promise.all([
      a.req("POST", `/api/missions/${m.id}/reviews`, r1),
      a.req("POST", `/api/missions/${m.id}/reviews`, r2),
    ]);
    assert.deepEqual(rs.map((r) => r.statusCode).sort(), [200, 409]);
    const first = rs.find((r) => r.statusCode === 200)!.json().review;
    assert.equal(first.measurement.classification, "invited");
    assert.equal(first.measurement.consent, false);
    assert.equal(first.reviewDurationSeconds, null);
    const original = rs[0].statusCode === 200 ? r1 : r2;
    assert.equal(
      (await a.req("POST", `/api/missions/${m.id}/reviews`, original)).json()
        .replayed,
      true,
    );
    assert.equal(
      (
        await a.req("POST", `/api/missions/${m.id}/reviews`, {
          ...original,
          rationale: "altered",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await b.req("POST", `/api/missions/${m.id}/reviews`, reviewBody()))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await a.req(
          "POST",
          `/api/missions/${m.id}/reviews`,
          reviewBody([eid], { expectedVersion: 1 }),
          { "x-csrf-token": "bad" },
        )
      ).statusCode,
      403,
    );
    const next = await a.req(
      "POST",
      `/api/missions/${m.id}/reviews`,
      reviewBody([eid], { expectedVersion: 1, decision: "stop" }),
    );
    assert.equal(next.statusCode, 200, next.body);
    assert.equal(next.json().review.version, 2);
    assert.equal(
      (await a.req("GET", `/api/missions/${m.id}`)).json().mission.status,
      "completed",
    );
    assert.equal(
      (await b.req("GET", `/api/decisions/${first.id}/export`)).statusCode,
      404,
    );
    const exportResult = await a.req(
      "GET",
      `/api/decisions/${first.id}/export?format=json`,
    );
    assert.equal(exportResult.statusCode, 200, exportResult.body);
    assert.equal(exportResult.json().review.citations[0].available, true);
    assert.match(
      exportResult.headers["content-disposition"] as string,
      /attachment/,
    );
    const page = await a.req("GET", `/api/decisions?missionId=${m.id}&limit=1`);
    assert.equal(page.json().items[0].version, 2);
    const older = await a.req(
      "GET",
      `/api/decisions?missionId=${m.id}&limit=1&cursor=${page.json().nextCursor}`,
    );
    assert.equal(older.json().items[0].version, 1);
    await a.req("POST", "/api/pilot/enrollment", {
      consent: true,
      assistance: "assisted",
    });
    const defaultDateBody: any = reviewBody([eid], { expectedVersion: 2 });
    delete defaultDateBody.nextReviewAt;
    const third = await a.req(
      "POST",
      `/api/missions/${m.id}/reviews`,
      defaultDateBody,
    );
    assert.equal(third.statusCode, 200, third.body);
    assert.equal(third.json().review.measurement.consent, true);
    assert.equal(third.json().review.measurement.classification, "invited");
    const nextDelay = Date.parse(third.json().review.nextReviewAt) - Date.now();
    assert.ok(nextDelay > 6.9 * 86400000 && nextDelay <= 7 * 86400000);
    assert.equal(
      first.measurement.consent,
      false,
      "later consent cannot rewrite history",
    );
    await assert.rejects(
      () =>
        db.query(
          "UPDATE mission_review_versions SET rationale='overwrite' WHERE id=$1",
          [first.id],
        ),
      /immutable/,
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
});
test("follow-ups are terminal-source, version-pinned and idempotent under concurrent retries", async () => {
  const a = await actor();
  try {
    const bot = await a.pair(),
      m = await a.weekly([bot.bot.id]);
    assert.equal(
      (await a.req("POST", `/api/missions/${m.id}/reviews`, reviewBody()))
        .statusCode,
      409,
    );
    await a.req("POST", `/api/missions/${m.id}/cancel`, {});
    const review = (
      await a.req("POST", `/api/missions/${m.id}/reviews`, reviewBody())
    ).json().review;
    const payload = { ...weeklyBody([bot.bot.id]), sourceReviewVersion: 1 };
    const results = await Promise.all([
      a.req("POST", `/api/missions/${m.id}/followups`, payload),
      a.req("POST", `/api/missions/${m.id}/followups`, payload),
    ]);
    for (const r of results) assert.equal(r.statusCode, 200, r.body);
    assert.equal(results[0].json().mission.id, results[1].json().mission.id);
    assert.deepEqual(results.map((r) => r.json().replayed).sort(), [
      false,
      true,
    ]);
    const child = results[0].json().mission,
      detail = (await a.req("GET", `/api/missions/${child.id}`)).json();
    assert.equal(detail.parentMissionId, m.id);
    assert.equal(detail.weeklyInput.priorReview.id, review.id);
    assert.equal(detail.weeklyInput.priorReview.availableEvidenceCount, 0);
    await a.req(
      "POST",
      `/api/missions/${m.id}/reviews`,
      reviewBody([], { expectedVersion: 1 }),
    );
    assert.equal(
      (
        await a.req("POST", `/api/missions/${m.id}/followups`, {
          ...payload,
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await a.req("GET", `/api/missions/${child.id}`)).json().weeklyInput
        .priorReview.version,
      1,
    );
  } finally {
    await a.app.close();
  }
});
test("evidence pagination preserves sub-millisecond timestamps; cursors cannot change owner or scope", async () => {
  const a = await actor(),
    b = await actor();
  try {
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const r = await a.req("POST", "/api/evidence", {
        title: `Evidence ${i}`,
        summary: "Page exactly once",
        sourceUrl: "https://example.com/source",
        visibility: "private",
      });
      assert.equal(r.statusCode, 200, r.body);
      ids.push(r.json().evidence.id);
      await db.query(
        "UPDATE evidence SET created_at=$2::timestamptz WHERE id=$1",
        [ids[i], `2026-09-04T00:00:00.12300${i}Z`],
      );
    }
    const first = await a.req("GET", "/api/evidence?limit=1");
    const seen = [first.json().items[0].id];
    let cursor = first.json().nextCursor;
    assert.equal(
      (await b.req("GET", `/api/evidence?limit=1&cursor=${cursor}`)).statusCode,
      400,
    );
    while (cursor) {
      const next = await a.req("GET", `/api/evidence?limit=1&cursor=${cursor}`);
      assert.equal(next.statusCode, 200, next.body);
      seen.push(...next.json().items.map((e: any) => e.id));
      cursor = next.json().nextCursor;
    }
    assert.equal(new Set(seen).size, 4);
    assert.deepEqual(new Set(seen), new Set(ids));
    assert.equal(
      (await b.req("GET", `/api/evidence/${ids[0]}`)).statusCode,
      404,
    );
    const summary = await a.req("GET", "/api/workspace/summary");
    assert.equal(summary.json().counts.evidence, 4);
    assert.equal(summary.json().weeklyResearchEnabled, true);
  } finally {
    await a.app.close();
    await b.app.close();
  }
});
test("pilot enrollment is optional and cannot self-assign operator classification", async () => {
  const a = await actor();
  try {
    assert.equal(
      (await a.req("GET", "/api/pilot/enrollment")).json().enrollment,
      null,
    );
    assert.equal(
      (
        await a.req("POST", "/api/pilot/enrollment", {
          consent: true,
          assistance: "assisted",
          classification: "internal",
        })
      ).statusCode,
      400,
    );
    a.cfg.betaInternalGithubIds = [a.gh];
    const r = await a.req("POST", "/api/pilot/enrollment", {
      consent: true,
      assistance: "assisted",
    });
    assert.equal(r.json().enrollment.classification, "internal");
    const revoked = await a.req("POST", "/api/pilot/enrollment", {
      consent: false,
      assistance: "unknown",
    });
    assert.equal(revoked.json().enrollment.consent, false);
    assert.equal(
      revoked.json().enrollment.enrolledAt,
      r.json().enrollment.enrolledAt,
    );
  } finally {
    await a.app.close();
  }
});

test("OAuth invite denial precedes owner/session creation and stable GitHub ID survives a renamed handle", async () => {
  const allowed = String(githubId++),
    denied = String(githubId++);
  let currentId = Number(denied),
    handle = "uninvited";
  const cfg: Config = {
    ...base,
    betaAllowedGithubIds: [allowed],
    githubClientId: "test-client",
    githubClientSecret: "test-only-secret",
    fetch: (async (url: any) =>
      new Response(
        JSON.stringify(
          String(url).includes("access_token")
            ? { access_token: "ephemeral-test-token" }
            : { id: currentId, login: handle, name: "Tester" },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch,
  };
  const app = await createApp(db, cfg);
  const login = async () => {
    const begin = await app.inject({ method: "GET", url: "/api/auth/github" });
    const state = new URL(begin.headers.location!).searchParams.get("state");
    return app.inject({
      method: "GET",
      url: `/api/auth/github/callback?code=test&state=${state}`,
      headers: { cookie: `${begin.cookies[0].name}=${begin.cookies[0].value}` },
    });
  };
  try {
    const rejected = await login();
    assert.equal(rejected.statusCode, 302, rejected.body);
    assert.equal(
      rejected.headers.location,
      `${origin}/workspace/?access=invitation-required`,
    );
    assert.equal(
      (await db.query("SELECT id FROM owners WHERE github_id=$1", [denied]))
        .rows.length,
      0,
    );
    assert.equal(
      rejected.cookies.some((c) => c.name === "gbs-session"),
      false,
    );
    currentId = Number(allowed);
    handle = "allowed-before-rename";
    assert.equal((await login()).statusCode, 302);
    const first = (
      await db.query("SELECT id FROM owners WHERE github_id=$1", [allowed])
    ).rows[0].id;
    handle = "allowed-after-rename";
    assert.equal((await login()).statusCode, 302);
    const row = (
      await db.query("SELECT * FROM owners WHERE github_id=$1", [allowed])
    ).rows[0];
    assert.equal(row.id, first);
    assert.equal(row.handle, handle);
  } finally {
    await app.close();
  }
});
test("published peer citations disappear from history/export after membership removal and prior context reveals counts only", async () => {
  const a = await actor(),
    b = await actor();
  try {
    const invite = (
      await b.req("POST", `/api/circles/${b.circle}/invites`, {})
    ).json();
    assert.equal(
      (await a.req("POST", "/api/circles/join", { code: invite.code }))
        .statusCode,
      200,
    );
    const abot = await a.pair(),
      bbot = await b.pair();
    const made = await a.req("POST", "/api/missions", {
      title: "Shared research",
      brief: "Public-source research",
      botIds: [abot.bot.id],
      maxRounds: 1,
      visibility: "circle",
      circleId: b.circle,
    });
    assert.equal(made.statusCode, 200, made.body);
    const mission = made.json().mission;
    assert.equal(
      (
        await b.req("POST", `/api/missions/${mission.id}/participate`, {
          botId: bbot.bot.id,
        })
      ).statusCode,
      200,
    );
    const atask = (await a.botReq(abot.token, "GET", "/api/bot/inbox")).json()
        .tasks[0],
      btask = (await b.botReq(bbot.token, "GET", "/api/bot/inbox")).json()
        .tasks[0];
    await a.botReq(
      abot.token,
      "POST",
      `/api/bot/tasks/${atask.id}/result`,
      resultBody(atask),
    );
    const peerBody = resultBody(btask);
    peerBody.contribution.title = "Peer private title sentinel";
    const peerResult = await b.botReq(
      bbot.token,
      "POST",
      `/api/bot/tasks/${btask.id}/result`,
      peerBody,
    );
    assert.equal(peerResult.statusCode, 200, peerResult.body);
    const eid = peerResult.json().evidenceId;
    assert.equal(
      (
        await a.req(
          "POST",
          `/api/missions/${mission.id}/reviews`,
          reviewBody([eid]),
        )
      ).statusCode,
      404,
    );
    const approvals = (
      await b.req("GET", "/api/approvals?status=pending")
    ).json().items;
    const approval = approvals.find((r: any) => r.evidenceId === eid);
    assert.equal(
      (
        await b.req("POST", `/api/approvals/${approval.id}/resolve`, {
          decision: "approve",
          version: approval.version,
        })
      ).statusCode,
      200,
    );
    const page = await a.req("GET", `/api/evidence?missionId=${mission.id}`);
    assert.ok(page.json().items.some((r: any) => r.id === eid));
    const saved = await a.req(
      "POST",
      `/api/missions/${mission.id}/reviews`,
      reviewBody([eid]),
    );
    assert.equal(saved.statusCode, 200, saved.body);
    const review = saved.json().review;
    const markdown = await a.req(
      "GET",
      `/api/decisions/${review.id}/export?format=markdown`,
    );
    assert.match(markdown.body, /Peer private title sentinel/);
    assert.match(markdown.body, /Source-backed observation/);
    assert.match(markdown.body, /https:\/\/example\.com\/other-page/);
    assert.equal(
      (
        await b.req(
          "POST",
          `/api/circles/${b.circle}/members/${a.id}/remove`,
          {},
        )
      ).statusCode,
      200,
    );
    const exported = await a.req("GET", `/api/decisions/${review.id}/export`);
    assert.equal(exported.statusCode, 200, exported.body);
    assert.deepEqual(exported.json().review.citations, [{ available: false }]);
    assert.equal(exported.body.includes(eid), false);
    assert.equal(exported.body.includes("Peer private title sentinel"), false);
    const next = await a.req("POST", `/api/missions/${mission.id}/followups`, {
      ...weeklyBody([abot.bot.id]),
      sourceReviewVersion: 1,
    });
    assert.equal(next.statusCode, 200, next.body);
    const task = (await a.botReq(abot.token, "GET", "/api/bot/inbox")).json()
      .tasks[0];
    assert.equal(task.weeklyContext.priorReview.availableEvidenceCount, 0);
    assert.equal(task.weeklyContext.priorReview.unavailableEvidenceCount, 1);
    assert.equal(JSON.stringify(task).includes(eid), false);
    assert.equal(
      JSON.stringify(task).includes("Peer private title sentinel"),
      false,
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("private-beta route flag returns legacy API shape and 404s every additive read", async () => {
  const a = await actor();
  try {
    a.cfg.privateBeta = false;
    a.cfg.weeklyResearchEnabled = false;
    for (const path of [
      "/api/workspace/summary",
      "/api/missions",
      "/api/approvals",
      "/api/evidence",
      "/api/evidence/missing",
      "/api/decisions",
      "/api/pilot/enrollment",
    ])
      assert.equal((await a.req("GET", path)).statusCode, 404, path);
    const bot = await a.pair();
    const generic = await a.req("POST", "/api/missions", {
      title: "Legacy mission",
      brief: "Generic research remains enabled.",
      botIds: [bot.bot.id],
      visibility: "private",
      maxRounds: 1,
    });
    assert.equal(generic.statusCode, 200, generic.body);
    const detail = (
      await a.req("GET", `/api/missions/${generic.json().mission.id}`)
    ).json();
    assert.equal("progress" in detail, false);
    assert.equal("weeklyInput" in detail, false);
    assert.equal(
      (await a.req("POST", "/api/missions", weeklyBody([bot.bot.id])))
        .statusCode,
      404,
    );
  } finally {
    await a.app.close();
  }
});

test("migration upgrades schema-two records without inventing measurement history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gbs-beta-upgrade-"));
  const old = await database({ dataDir: dir });
  try {
    const migration = async (name: string) =>
      old.exec(
        await readFile(
          new URL(`../migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    await migration("001_initial.sql");
    await old.query("INSERT INTO schema_migrations(version) VALUES(1)");
    await migration("002_mission_cancel.sql");
    await old.query("INSERT INTO schema_migrations(version) VALUES(2)");
    await old.query(
      "INSERT INTO owners(id,github_id,handle,display_name) VALUES('old-owner','42','old','Old owner')",
    );
    await old.query(
      "INSERT INTO missions(id,owner_id,title,brief,status,visibility,max_rounds) VALUES('old-mission','old-owner','Existing','Existing','completed','private',1)",
    );
    await migrate(old);
    const preserved = (
      await old.query(
        "SELECT m.kind,(SELECT count(*)::integer FROM mission_measurement_snapshots) AS snapshots FROM missions m WHERE id='old-mission'",
      )
    ).rows[0];
    assert.equal(preserved.kind, "research");
    assert.equal(preserved.snapshots, 0);
    assert.deepEqual(
      (
        await old.query(
          "SELECT version FROM schema_migrations ORDER BY version",
        )
      ).rows.map((row) => row.version),
      [1, 2, 3, 4, 5, 6, 7],
    );
    const identity = (await old.query("SELECT owner_id,provider,provider_user_id FROM provider_identities WHERE owner_id='old-owner'")).rows[0];
    assert.deepEqual(identity, { owner_id: "old-owner", provider: "github", provider_user_id: "42" });
    const account = (await old.query("SELECT status,account_classification FROM owners WHERE id='old-owner'")).rows[0];
    assert.equal(account.status, "active");
    assert.equal(account.account_classification, "invited");
    assert.ok(Number((await old.query("SELECT stored_bytes FROM owner_usage WHERE owner_id='old-owner'")).rows[0].stored_bytes) > 0);
    assert.equal((await old.query("SELECT mission_id FROM mission_admissions WHERE owner_id='old-owner'")).rows[0].mission_id, "old-mission");
    // Re-running startup migrations neither duplicates identities nor recharges usage.
    const usageBefore = (await old.query("SELECT stored_bytes FROM owner_usage WHERE owner_id='old-owner'")).rows[0].stored_bytes;
    await migrate(old);
    assert.equal((await old.query("SELECT stored_bytes FROM owner_usage WHERE owner_id='old-owner'")).rows[0].stored_bytes, usageBefore);
  } finally {
    await old.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("workspace action summary bounds and orders every awaiting and due owner record", async () => {
  const a = await actor();
  const b = await actor();
  try {
    for (let i = 0; i < 12; i++) {
      const createdAt = `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`;
      await summaryMission({
        ownerId: a.id,
        title: `Await ${String(i).padStart(2, "0")}`,
        status: "completed",
        createdAt,
        evidenceOwnerId: a.id,
      });
      const reviewed = await summaryMission({
        ownerId: a.id,
        title: `Due ${String(i).padStart(2, "0")}`,
        status: "completed",
        createdAt,
      });
      await summaryReview({
        missionId: reviewed,
        ownerId: a.id,
        nextReviewAt: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      });
      if (i === 0)
        await summaryReview({
          missionId: reviewed,
          ownerId: a.id,
          version: 2,
          nextReviewAt: "2099-01-01T00:00:00Z",
        });
    }
    const foreign = await summaryMission({
      ownerId: b.id,
      title: "FOREIGN SUMMARY SENTINEL",
      status: "completed",
      createdAt: "2025-01-01T00:00:00Z",
      evidenceOwnerId: b.id,
    });
    await summaryReview({
      missionId: foreign,
      ownerId: b.id,
      nextReviewAt: "2025-01-01T00:00:00Z",
    });
    const response = await a.req("GET", "/api/workspace/summary");
    assert.equal(response.statusCode, 200, response.body);
    const actions = response.json().actionSummary;
    assert.equal(actions.recordLimit, 10);
    assert.equal(actions.awaitingReview.total, 12);
    assert.equal(actions.awaitingReview.items.length, 10);
    assert.equal(actions.awaitingReview.items[0].title, "Await 00");
    assert.equal(actions.awaitingReview.items[9].title, "Await 09");
    assert.ok(
      actions.awaitingReview.items.every(
        (item: any) => item.accessibleFindingCount === 1,
      ),
    );
    assert.equal(
      actions.dueReviews.total,
      11,
      "only each mission's latest review may be due",
    );
    assert.equal(actions.dueReviews.items.length, 10);
    assert.equal(actions.dueReviews.items[0].title, "Due 01");
    assert.equal(actions.dueReviews.items[0].reviewVersion, 1);
    assert.equal(
      JSON.stringify(actions).includes("FOREIGN SUMMARY SENTINEL"),
      false,
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("awaiting review includes partial terminal findings only while evidence permission is current", async () => {
  const a = await actor();
  const b = await actor();
  try {
    const bot = await summaryBot(a.id);
    const partial = await summaryMission({
      ownerId: a.id,
      title: "Partial failed mission",
      status: "failed",
      createdAt: "2026-08-01T00:00:00Z",
      botId: bot,
      taskStatus: "failed",
      attempts: 1,
      evidenceOwnerId: a.id,
    });
    const peerOnly = await summaryMission({
      ownerId: a.id,
      title: "Published peer finding",
      status: "completed",
      createdAt: "2026-08-02T00:00:00Z",
      evidenceOwnerId: b.id,
      evidenceVisibility: "circle",
      circleId: b.circle,
    });
    await db.query(
      "INSERT INTO circle_members(circle_id,owner_id,role,active) VALUES($1,$2,'member',true)",
      [b.circle, a.id],
    );
    const privatePeer = await summaryMission({
      ownerId: a.id,
      title: "PRIVATE PEER SENTINEL",
      status: "completed",
      createdAt: "2026-08-03T00:00:00Z",
      evidenceOwnerId: b.id,
    });
    let summary = (await a.req("GET", "/api/workspace/summary")).json()
      .actionSummary.awaitingReview;
    assert.ok(
      summary.items.some(
        (item: any) =>
          item.missionId === partial && item.accessibleFindingCount === 1,
      ),
    );
    assert.ok(summary.items.some((item: any) => item.missionId === peerOnly));
    assert.equal(
      summary.items.some((item: any) => item.missionId === privatePeer),
      false,
    );
    assert.equal(
      JSON.stringify(summary).includes("PRIVATE PEER SENTINEL"),
      false,
    );
    await db.query(
      "UPDATE circle_members SET active=false WHERE circle_id=$1 AND owner_id=$2",
      [b.circle, a.id],
    );
    summary = (await a.req("GET", "/api/workspace/summary")).json()
      .actionSummary.awaitingReview;
    assert.equal(
      summary.items.some((item: any) => item.missionId === peerOnly),
      false,
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("workspace action summary reports active retries and bounded concrete blockers without foreign content", async () => {
  const a = await actor();
  const b = await actor();
  try {
    const recentWork = new Date(Date.now() - 60_000).toISOString();
    const recentPausedWork = new Date(Date.now() - 30_000).toISOString();
    const activeBot = await summaryBot(a.id);
    const pausedBot = await summaryBot(a.id, "paused");
    const revokedBot = await summaryBot(a.id, "revoked");
    const retrying = await summaryMission({
      ownerId: a.id,
      title: "Retrying work",
      status: "running",
      createdAt: recentWork,
      botId: activeBot,
      taskStatus: "queued",
      attempts: 2,
    });
    const paused = await summaryMission({
      ownerId: a.id,
      title: "Paused blocker",
      status: "queued",
      createdAt: recentPausedWork,
      botId: pausedBot,
      taskStatus: "queued",
    });
    await summaryMission({
      ownerId: a.id,
      title: "Retry limit blocker",
      status: "failed",
      createdAt: "2026-01-01T00:00:00Z",
      botId: activeBot,
      taskStatus: "failed",
      attempts: 3,
    });
    await summaryMission({
      ownerId: a.id,
      title: "Revoked blocker",
      status: "failed",
      createdAt: "2026-01-02T00:00:00Z",
      botId: revokedBot,
      taskStatus: "failed",
      attempts: 1,
    });
    for (let i = 0; i < 9; i++)
      await summaryMission({
        ownerId: a.id,
        title: `Cancelled ${i}`,
        status: "cancelled",
        createdAt: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      });
    await summaryMission({
      ownerId: b.id,
      title: "FOREIGN BLOCKER SENTINEL",
      status: "cancelled",
      createdAt: "2025-01-01T00:00:00Z",
    });
    const response = await a.req("GET", "/api/workspace/summary");
    assert.equal(response.statusCode, 200, response.body);
    const actions = response.json().actionSummary;
    assert.equal(actions.activeWork.total, 2);
    assert.equal(actions.activeWork.items.length, 2);
    const retryRecord = actions.activeWork.items.find(
      (item: any) => item.missionId === retrying,
    );
    assert.equal(retryRecord.retryingTasks, 1);
    assert.equal(retryRecord.queuedTasks, 1);
    assert.equal(retryRecord.totalTasks, 1);
    assert.ok(
      actions.activeWork.items.some((item: any) => item.missionId === paused),
    );
    assert.equal(actions.blockers.total, 12);
    assert.equal(actions.blockers.items.length, 10);
    assert.equal(actions.blockers.items[0].code, "bot_paused");
    assert.ok(
      actions.blockers.items.some(
        (item: any) => item.code === "retry_limit_reached",
      ),
    );
    assert.ok(
      actions.blockers.items.some((item: any) => item.code === "bot_revoked"),
    );
    assert.ok(
      actions.blockers.items.every(
        (item: any) =>
          typeof item.message === "string" && item.message.length > 0,
      ),
    );
    assert.equal(
      JSON.stringify(actions).includes("FOREIGN BLOCKER SENTINEL"),
      false,
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
});
