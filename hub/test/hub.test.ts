import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { database, migrate, type Database } from "../src/db.js";
import { config, type Config } from "../src/config.js";
import { createApp } from "../src/server.js";
import { hash } from "../src/security.js";

let db: Database;
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.HUB_TEST_DATABASE_URL;
let isolatedSchema: string | undefined;
const origin = "http://127.0.0.1:3000";
const base: Config = {
  origin,
  production: false,
  localLogin: true,
  localOwner: "test",
  host: "127.0.0.1",
  port: 8787,
  sessionHours: 24,
  pairingMinutes: 10,
  leaseSeconds: 300,
  maxAttempts: 3,
  fetch,
};
before(async () => {
  if (testDatabaseUrl) {
    isolatedSchema = `test_${randomUUID().replaceAll("-", "")}`;
    const admin = await database({ url: testDatabaseUrl });
    try {
      await admin.exec(`CREATE SCHEMA ${isolatedSchema}`);
    } finally {
      await admin.close();
    }
  }
  db = await database({ url: testDatabaseUrl, schema: isolatedSchema });
  await migrate(db);
});
after(async () => {
  await db?.close();
  if (
    testDatabaseUrl &&
    isolatedSchema &&
    /^test_[a-f0-9]+$/.test(isolatedSchema)
  ) {
    const admin = await database({ url: testDatabaseUrl });
    try {
      await admin.exec(`DROP SCHEMA ${isolatedSchema} CASCADE`);
    } finally {
      await admin.close();
    }
  }
});
async function owner(name = randomUUID(), targetDb: Database = db) {
  const app = await createApp(targetDb, { ...base, localOwner: name });
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/local",
    headers: { origin },
    payload: {},
  });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = login.cookies[0].name + "=" + login.cookies[0].value;
  const session = login.json();
  const request = (
    method: "GET" | "POST",
    url: string,
    payload?: unknown,
    override: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        cookie,
        origin,
        "x-csrf-token": session.csrfToken,
        ...override,
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const workspace = async () => {
    const result = await request("GET", "/api/workspace");
    assert.equal(result.statusCode, 200, result.body);
    return result.json();
  };
  const pair = async () => {
    const pairing = await request("POST", "/api/pairings", {});
    assert.equal(pairing.statusCode, 200, pairing.body);
    const result = await app.inject({
      method: "POST",
      url: "/api/bot/pair",
      payload: {
        code: pairing.json().code,
        name: "Test scout",
        role: "scout",
        runtime: "native-grok",
      },
    });
    assert.equal(result.statusCode, 200, result.body);
    return result.json();
  };
  const botRequest = (
    token: string,
    method: "GET" | "POST",
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const mission = async (
    botIds: string[],
    visibility = "private",
    maxRounds = 1,
  ) => {
    const result = await request("POST", "/api/missions", {
      title: "Check a primary source",
      brief: "Read the primary source and return referenced findings.",
      botIds,
      visibility,
      maxRounds,
    });
    assert.equal(result.statusCode, 200, result.body);
    return result.json().mission;
  };
  return {
    app,
    request,
    workspace,
    pair,
    botRequest,
    mission,
    session,
    cookie,
  };
}
const contribution = {
  type: "research",
  title: "A verified finding",
  summary: "The source states a testable finding.",
  sources: [
    {
      url: "https://example.com/source",
      title: "Primary source",
      accessedAt: "2026-09-04T00:00:00Z",
    },
  ],
};
const resultBody = (task: { attemptId: string }, key = "result_1") => ({
  attemptId: task.attemptId,
  idempotencyKey: key,
  contribution,
});

test("starts empty, durable hashed session, explicit local-login and owner CSRF guards", async () => {
  const a = await owner();
  try {
    const ws = await a.workspace();
    assert.deepEqual(
      [
        ws.bots.length,
        ws.missions.length,
        ws.evidence.length,
        ws.approvals.length,
      ],
      [0, 0, 0, 0],
    );
    assert.equal(ws.circles.length, 1);
    assert.equal(
      (
        await a.request(
          "POST",
          "/api/pairings",
          {},
          { "x-csrf-token": "wrong" },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await a.request(
          "POST",
          "/api/pairings",
          {},
          { origin: "https://attacker.example" },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await a.app.inject({
          method: "POST",
          url: "/api/auth/local",
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await a.app.inject({
          method: "POST",
          url: "/api/auth/local",
          headers: { origin },
          remoteAddress: "192.0.2.12",
          payload: {},
        })
      ).statusCode,
      404,
    );
    const rows = await db.query("SELECT * FROM sessions WHERE owner_id=$1", [
      ws.owner.id,
    ]);
    assert.notEqual(rows.rows[0].id_hash, a.cookie.split("=")[1]);
    assert.equal(
      (await a.request("POST", "/api/auth/logout", {})).statusCode,
      200,
    );
    assert.equal((await a.request("GET", "/api/workspace")).statusCode, 401);
  } finally {
    await a.app.close();
  }
  assert.throws(() =>
    config({
      NODE_ENV: "production",
      HUB_EMBEDDED_DB: "true",
      HUB_LOCAL_OWNER_LOGIN: "true",
    }),
  );
  assert.throws(() =>
    config({
      HUB_EMBEDDED_DB: "true",
      HUB_LOCAL_OWNER_LOGIN: "true",
      HUB_HOST: "0.0.0.0",
    }),
  );
  assert.throws(() => config({ HUB_LOCAL_OWNER_LOGIN: "true" }));
});

test("pairing expires, races consume once, and only hashed bot credentials persist", async () => {
  const a = await owner();
  try {
    let pair = (await a.request("POST", "/api/pairings", {})).json();
    await db.query(
      "UPDATE pairings SET expires_at=now()-interval '1 minute' WHERE code_hash=$1",
      [hash(pair.code)],
    );
    const input = {
      code: pair.code,
      name: "Native bot",
      role: "scout",
      runtime: "native-grok",
    };
    assert.equal(
      (
        await a.app.inject({
          method: "POST",
          url: "/api/bot/pair",
          payload: input,
        })
      ).statusCode,
      400,
    );
    pair = (await a.request("POST", "/api/pairings", {})).json();
    input.code = pair.code;
    const raced = await Promise.all([
      a.app.inject({ method: "POST", url: "/api/bot/pair", payload: input }),
      a.app.inject({ method: "POST", url: "/api/bot/pair", payload: input }),
    ]);
    assert.deepEqual(raced.map((r) => r.statusCode).sort(), [200, 400]);
    const paired = raced.find((r) => r.statusCode === 200)!.json();
    const stored = (
      await db.query("SELECT * FROM bots WHERE id=$1", [paired.bot.id])
    ).rows[0];
    assert.equal(stored.token_hash, hash(paired.token));
    assert.ok(!JSON.stringify(stored).includes(paired.token));
    assert.equal(paired.bot.trustLabel, "owner-paired");
    assert.equal(
      (await a.botRequest(paired.token, "GET", "/api/workspace")).statusCode,
      401,
    );
    assert.equal((await a.request("GET", "/api/bot/inbox")).statusCode, 401);
  } finally {
    await a.app.close();
  }
});

test("cross-owner reads, writes, mission bot assignment, evidence and approvals are denied", async () => {
  const a = await owner(),
    b = await owner();
  try {
    const paired = await a.pair();
    const mission = await a.mission([paired.bot.id]);
    assert.equal(
      (await b.request("GET", `/api/missions/${mission.id}`)).statusCode,
      404,
    );
    assert.equal(
      (await b.request("POST", `/api/bots/${paired.bot.id}/revoke`, {}))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await b.request("POST", "/api/missions", {
          title: "Bad",
          brief: "Bad",
          botIds: [paired.bot.id],
          visibility: "private",
          maxRounds: 1,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await b.request("POST", "/api/evidence", {
          title: "Bad",
          summary: "Bad",
          sourceUrl: "https://example.com",
          visibility: "private",
          missionId: mission.id,
        })
      ).statusCode,
      404,
    );
    await a.request("POST", "/api/evidence", {
      title: "Circle finding",
      summary: "Held for approval",
      sourceUrl: "https://example.com",
      visibility: "circle",
    });
    const ws = await a.workspace();
    assert.equal(
      (
        await b.request(
          "POST",
          `/api/approvals/${ws.approvals[0].id}/resolve`,
          { decision: "approve", version: 1 },
        )
      ).statusCode,
      404,
    );
    const other = await b.workspace();
    assert.equal(other.bots.length, 0);
    assert.equal(other.missions.length, 0);
    assert.equal(other.evidence.length, 0);
    assert.equal(other.approvals.length, 0);
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("atomic task claims, ordered rounds, private results and idempotency reject altered replay", async () => {
  const a = await owner();
  try {
    const paired = await a.pair();
    const mission = await a.mission([paired.bot.id], "private", 2);
    const raced = await Promise.all([
      a.botRequest(paired.token, "GET", "/api/bot/inbox"),
      a.botRequest(paired.token, "GET", "/api/bot/inbox"),
    ]);
    for (const response of raced)
      assert.equal(response.statusCode, 200, response.body);
    assert.equal(
      raced.reduce((n, r) => n + r.json().tasks.length, 0),
      1,
    );
    const task = raced.flatMap((r) => r.json().tasks)[0];
    assert.equal(task.round, 1);
    const submit = await a.botRequest(
      paired.token,
      "POST",
      `/api/bot/tasks/${task.id}/result`,
      resultBody(task),
    );
    assert.equal(submit.statusCode, 200, submit.body);
    assert.equal(submit.json().replayed, false);
    const replay = await a.botRequest(
      paired.token,
      "POST",
      `/api/bot/tasks/${task.id}/result`,
      resultBody(task),
    );
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().replayed, true);
    const altered = {
      ...resultBody(task),
      contribution: { ...contribution, summary: "Changed" },
    };
    assert.equal(
      (
        await a.botRequest(
          paired.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          altered,
        )
      ).statusCode,
      409,
    );
    const second = (
      await a.botRequest(paired.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(second.round, 2);
    assert.equal(
      (
        await a.botRequest(
          paired.token,
          "POST",
          `/api/bot/tasks/${second.id}/result`,
          resultBody(second),
        )
      ).statusCode,
      200,
    );
    const ws = await a.workspace();
    assert.equal(ws.evidence.length, 2);
    assert.equal(ws.evidence[0].visibility, "private");
    assert.equal(ws.approvals.length, 0);
    assert.equal(
      ws.missions.find((m: any) => m.id === mission.id).status,
      "completed",
    );
  } finally {
    await a.app.close();
  }
});

test("expired attempts are fenced and retry exhaustion terminates mission", async () => {
  const a = await owner();
  try {
    const paired = await a.pair();
    const mission = await a.mission([paired.bot.id]);
    let first: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const inbox = await a.botRequest(paired.token, "GET", "/api/bot/inbox");
      assert.equal(inbox.statusCode, 200, inbox.body);
      const task = inbox.json().tasks[0];
      assert.ok(task);
      if (attempt === 1) first = task;
      else assert.notEqual(task.attemptId, first.attemptId);
      if (attempt > 1)
        assert.equal(
          (
            await a.botRequest(
              paired.token,
              "POST",
              `/api/bot/tasks/${first.id}/result`,
              resultBody(first),
            )
          ).statusCode,
          409,
        );
      await db.query(
        "UPDATE tasks SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
        [task.id],
      );
    }
    assert.deepEqual(
      (await a.botRequest(paired.token, "GET", "/api/bot/inbox")).json().tasks,
      [],
    );
    const detail = (
      await a.request("GET", `/api/missions/${mission.id}`)
    ).json();
    assert.equal(detail.mission.status, "failed");
    assert.equal(detail.tasks[0].attempts, 3);
    assert.equal(detail.tasks[0].status, "failed");
  } finally {
    await a.app.close();
  }
});

test("foreign bots cannot submit; pause and revocation stop results and cannot be undone through resume", async () => {
  const a = await owner(),
    b = await owner();
  try {
    const paired = await a.pair(),
      other = await b.pair();
    await a.mission([paired.bot.id]);
    const task = (
      await a.botRequest(paired.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(
      (
        await b.botRequest(
          other.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task),
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (await a.request("POST", `/api/bots/${paired.bot.id}/pause`, {}))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await a.botRequest(
          paired.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task),
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await a.request("POST", `/api/bots/${paired.bot.id}/resume`, {}))
        .statusCode,
      200,
    );
    assert.equal(
      (await a.request("POST", `/api/bots/${paired.bot.id}/revoke`, {}))
        .statusCode,
      200,
    );
    assert.equal(
      (await a.request("POST", `/api/bots/${paired.bot.id}/pause`, {}))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await a.botRequest(
          paired.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task),
        )
      ).statusCode,
      401,
    );
    assert.equal(
      (await a.botRequest(paired.token, "POST", "/api/bot/heartbeat", {}))
        .statusCode,
      401,
    );
    assert.equal(
      (await a.request("POST", `/api/bots/${paired.bot.id}/resume`, {}))
        .statusCode,
      404,
    );
    assert.equal((await a.workspace()).evidence.length, 0);
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("circle publication requires bound owner approval; invite replay and membership loss deny access", async () => {
  const a = await owner(),
    b = await owner();
  try {
    const circle = (await a.workspace()).circles[0];
    assert.equal(
      (await b.request("GET", `/api/circles/${circle.id}`)).statusCode,
      403,
    );
    const invitation = (
      await a.request("POST", `/api/circles/${circle.id}/invites`, {})
    ).json();
    assert.equal(
      (await b.request("POST", "/api/circles/join", { code: invitation.code }))
        .statusCode,
      200,
    );
    assert.equal(
      (await b.request("POST", "/api/circles/join", { code: invitation.code }))
        .statusCode,
      400,
    );
    const paired = await a.pair();
    await a.mission([paired.bot.id], "circle");
    const task = (
      await a.botRequest(paired.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(
      (
        await a.botRequest(
          paired.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task),
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await b.request("GET", `/api/circles/${circle.id}`)).json().evidence
        .length,
      0,
    );
    let ws = await a.workspace();
    const approval = ws.approvals[0];
    assert.equal(ws.evidence[0].visibility, "private");
    assert.equal(
      (
        await a.request("POST", `/api/approvals/${approval.id}/resolve`, {
          decision: "approve",
          version: 2,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await a.request("POST", `/api/approvals/${approval.id}/resolve`, {
          decision: "approve",
          version: 1,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await a.request("POST", `/api/approvals/${approval.id}/resolve`, {
          decision: "approve",
          version: 1,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await b.request("GET", `/api/circles/${circle.id}`)).json().evidence
        .length,
      1,
    );
    assert.equal(
      (
        await b.request("POST", "/api/evidence", {
          title: "Member evidence",
          summary: "Pending member contribution",
          sourceUrl: "https://example.com/member",
          visibility: "circle",
          circleId: circle.id,
        })
      ).statusCode,
      200,
    );
    const memberApproval = (await b.workspace()).approvals[0];
    assert.equal(
      (
        await a.request(
          "POST",
          `/api/circles/${circle.id}/members/${b.session.owner.id}/remove`,
          {},
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await b.request("GET", `/api/circles/${circle.id}`)).statusCode,
      403,
    );
    assert.equal(
      (
        await b.request("POST", `/api/approvals/${memberApproval.id}/resolve`, {
          decision: "approve",
          version: 1,
        })
      ).statusCode,
      403,
    );
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("approval evidence binding rejects database changes and result validation rejects hidden or unsafe source fields", async () => {
  const a = await owner();
  try {
    await a.request("POST", "/api/evidence", {
      title: "Original",
      summary: "Original",
      sourceUrl: "https://example.com",
      visibility: "circle",
    });
    const ws = await a.workspace();
    await db.query("UPDATE evidence SET summary=$2 WHERE id=$1", [
      ws.evidence[0].id,
      "Tampered",
    ]);
    assert.equal(
      (
        await a.request(
          "POST",
          `/api/approvals/${ws.approvals[0].id}/resolve`,
          { decision: "approve", version: 1 },
        )
      ).statusCode,
      409,
    );
    for (const url of [
      "http://example.com",
      "https://127.0.0.1",
      "https://10.0.0.1",
      "https://user:pass@example.com",
      "https://localhost",
      "https://x.internal",
      "https://8.8.8.8/",
      "https://example.com./",
    ])
      assert.equal(
        (
          await a.request("POST", "/api/evidence", {
            title: "Bad",
            summary: "Bad",
            sourceUrl: url,
            visibility: "private",
          })
        ).statusCode,
        400,
        url,
      );
    const paired = await a.pair();
    await a.mission([paired.bot.id]);
    const task = (
      await a.botRequest(paired.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(
      (
        await a.botRequest(
          paired.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          { ...resultBody(task), secret: "hidden" },
        )
      ).statusCode,
      400,
    );
  } finally {
    await a.app.close();
  }
});

for (const issuer of [undefined, "https://github.com/login/oauth"]) {
  test(`OAuth ${issuer ? "with issuer" : "without issuer"} keeps cookie binding, single-use state and private profile tokens`, async () => {
    const calls: string[] = [];
    const oauth = await createApp(db, {
      ...base,
      localLogin: false,
      githubClientId: "test-client",
      githubClientSecret: "test-secret",
      fetch: (async (url: any) => {
        calls.push(String(url));
        return new Response(
          JSON.stringify(
            String(url).includes("access_token")
              ? { access_token: "sensitive-oauth-access-token" }
              : { id: 543210, login: "oauth-test", name: "OAuth Test" },
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });
    try {
      const begin = await oauth.inject({
        method: "GET",
        url: "/api/auth/github",
      });
      assert.equal(begin.statusCode, 302);
      const redirect = new URL(begin.headers.location!);
      assert.equal(
        redirect.searchParams.get("redirect_uri"),
        `${origin}/api/auth/github/callback`,
      );
      assert.equal(redirect.searchParams.has("scope"), false);
      const state = redirect.searchParams.get("state")!;
      const stateCookie = begin.cookies.map(c => `${c.name}=${c.value}`).join("; ");
      const callbackBase = `/api/auth/github/callback?code=test-code&state=${state}`;
      const callback =
        callbackBase + (issuer ? `&iss=${encodeURIComponent(issuer)}` : "");
      if (issuer) {
        for (const suffix of [
          "&iss=https%3A%2F%2Fattacker.example%2Flogin%2Foauth",
          "&iss=",
          "&iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth&iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth",
          "&unexpected=value",
        ]) {
          const rejected = await oauth.inject({
            method: "GET",
            url: callbackBase + suffix,
            headers: { cookie: stateCookie },
          });
          assert.equal(rejected.statusCode, 400);
          assert.equal(
            calls.length,
            0,
            "Rejected callbacks must not contact GitHub",
          );
        }
      }
      assert.equal(
        (await oauth.inject({ method: "GET", url: callback })).statusCode,
        400,
      );
      const response = await oauth.inject({
        method: "GET",
        url: callback,
        headers: { cookie: stateCookie },
      });
      assert.equal(response.statusCode, 302, response.body);
      assert.equal(response.headers.location, `${origin}/workspace`);
      assert.equal(calls.length, 2);
      assert.equal(
        (
          await oauth.inject({
            method: "GET",
            url: callback,
            headers: { cookie: stateCookie },
          })
        ).statusCode,
        400,
      );
      assert.equal(calls.length, 2);
      const stored = await db.query(
        "SELECT * FROM owners WHERE github_id='543210'",
      );
      assert.equal(stored.rows.length, 1);
      assert.ok(!JSON.stringify(stored).includes("sensitive-oauth"));
    } finally {
      await oauth.close();
    }
  });
}

test("two-bot cap is atomic across different pair challenges; revoked slots are reusable", async () => {
  const a = await owner();
  try {
    const first = await a.pair();
    const codes = await Promise.all([
      a.request("POST", "/api/pairings", {}),
      a.request("POST", "/api/pairings", {}),
    ]);
    const responses = await Promise.all(
      codes.map((pair) =>
        a.app.inject({
          method: "POST",
          url: "/api/bot/pair",
          payload: {
            code: pair.json().code,
            name: "Second bot",
            role: "delegate",
            runtime: "grok-compatible",
          },
        }),
      ),
    );
    assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 429]);
    assert.equal(
      (await a.workspace()).bots.filter((b: any) => b.status !== "revoked")
        .length,
      2,
    );
    await a.request("POST", `/api/bots/${first.bot.id}/revoke`, {});
    const failedIndex = responses.findIndex((r) => r.statusCode === 429);
    assert.equal(
      (
        await a.app.inject({
          method: "POST",
          url: "/api/bot/pair",
          payload: {
            code: codes[failedIndex].json().code,
            name: "Replacement",
            role: "scout",
            runtime: "native-grok",
          },
        })
      ).statusCode,
      200,
    );
  } finally {
    await a.app.close();
  }
});

test("circle opt-in missions preserve participant ownership and stop at membership loss", async () => {
  const a = await owner(),
    b = await owner(),
    outsider = await owner();
  try {
    const circle = (await a.workspace()).circles[0];
    const invitation = (
      await a.request("POST", `/api/circles/${circle.id}/invites`, {})
    ).json();
    await b.request("POST", "/api/circles/join", { code: invitation.code });
    const originBot = await a.pair(),
      participantBot = await b.pair(),
      foreignBot = await outsider.pair();
    const mission = await a.mission([originBot.bot.id], "circle", 2);
    assert.equal(
      (await b.request("GET", `/api/circles/${circle.id}`)).json().missions[0]
        .id,
      mission.id,
    );
    assert.equal(
      (
        await outsider.request(
          "POST",
          `/api/missions/${mission.id}/participate`,
          { botId: foreignBot.bot.id },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await b.request("POST", `/api/missions/${mission.id}/participate`, {
          botId: originBot.bot.id,
        })
      ).statusCode,
      404,
    );
    const join = await b.request(
      "POST",
      `/api/missions/${mission.id}/participate`,
      { botId: participantBot.bot.id },
    );
    assert.equal(join.statusCode, 200, join.body);
    assert.equal(join.json().joined, true);
    assert.equal(
      (
        await b.request("POST", `/api/missions/${mission.id}/participate`, {
          botId: participantBot.bot.id,
        })
      ).json().replayed,
      true,
    );
    const task = (
      await b.botRequest(participantBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(task.missionId, mission.id);
    assert.equal(
      (
        await b.botRequest(
          participantBot.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task),
        )
      ).statusCode,
      200,
    );
    assert.equal((await a.workspace()).evidence.length, 0);
    assert.equal(
      (await a.request("GET", `/api/missions/${mission.id}`)).json().evidence
        .length,
      0,
    );
    const own = await b.workspace();
    assert.equal(own.evidence[0].ownerId, b.session.owner.id);
    assert.equal(own.evidence[0].visibility, "private");
    assert.equal(own.approvals.length, 1);
    const approval = own.approvals[0];
    await b.request("POST", `/api/approvals/${approval.id}/resolve`, {
      decision: "approve",
      version: approval.version,
    });
    assert.equal(
      (await a.request("GET", `/api/circles/${circle.id}`)).json().evidence
        .length,
      1,
    );
    const originTask = (
      await a.botRequest(originBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    await a.botRequest(
      originBot.token,
      "POST",
      `/api/bot/tasks/${originTask.id}/result`,
      resultBody(originTask),
    );
    const participantRoundTwo = (
      await b.botRequest(participantBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(participantRoundTwo.round, 2);
    await a.request(
      "POST",
      `/api/circles/${circle.id}/members/${b.session.owner.id}/remove`,
      {},
    );
    assert.equal(
      (
        await b.botRequest(
          participantBot.token,
          "POST",
          `/api/bot/tasks/${participantRoundTwo.id}/result`,
          resultBody(participantRoundTwo),
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (await b.botRequest(participantBot.token, "GET", "/api/bot/inbox")).json()
        .tasks.length,
      0,
    );
    assert.equal((await b.workspace()).missions.length, 0);
  } finally {
    await a.app.close();
    await b.app.close();
    await outsider.app.close();
  }
});

test("embedded PostgreSQL persists records and migrations across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grokbot-hub-db-test-"));
  let durable: Database | undefined;
  try {
    durable = await database({ dataDir: join(directory, "database") });
    await migrate(durable);
    await durable.query(
      "INSERT INTO owners(id,github_id,handle,display_name) VALUES($1,$2,$3,$4)",
      ["persisted-owner", "persisted-github", "persisted", "Persisted Owner"],
    );
    await durable.close();
    durable = await database({ dataDir: join(directory, "database") });
    await migrate(durable);
    assert.equal(
      (
        await durable.query(
          "SELECT handle FROM owners WHERE id='persisted-owner'",
        )
      ).rows[0].handle,
      "persisted",
    );
  } finally {
    await durable?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("actual native adapter pairs, heartbeats, leases and submits to real loopback hub with PostgreSQL", async () => {
  const { runCli } = await import("../../integrations/native-grok/cli.mjs");
  const a = await owner();
  const directory = await mkdtemp(join(tmpdir(), "grokbot-adapter-hub-test-"));
  const stdout: string[] = [],
    stderr: string[] = [];
  try {
    const url = await a.app.listen({ host: "127.0.0.1", port: 0 });
    const pairing = (await a.request("POST", "/api/pairings", {})).json();
    const env = {
      GROK_HUB_PAIR_CODE: pairing.code,
      GROK_HUB_STATE_DIR: directory,
      GROK_HUB_URL: url,
    };
    const io = {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    };
    assert.equal(
      await runCli(
        [
          "pair",
          "--url",
          url,
          "--name",
          "Adapter acceptance scout",
          "--role",
          "scout",
          "--allow-local-http",
        ],
        env,
        io,
      ),
      0,
      stderr.join("\n"),
    );
    const saved = JSON.parse(
      await readFile(join(directory, "credentials.json"), "utf8"),
    );
    assert.ok(!stdout.join("\n").includes(saved.token));
    assert.equal(
      await runCli(["status", "--allow-local-http"], env, io),
      0,
      stderr.join("\n"),
    );
    const knowledge = (
      await a.request("POST", "/api/evidence", {
        title: "Published context for actual adapter",
        summary: "A source lead to consider as untrusted evidence.",
        sourceUrl: "https://example.com/published-context",
        visibility: "circle",
      })
    ).json().evidence;
    const publishApproval = (await a.workspace()).approvals.find(
      (p: any) => p.evidenceId === knowledge.id,
    );
    await a.request("POST", `/api/approvals/${publishApproval.id}/resolve`, {
      decision: "approve",
      version: publishApproval.version,
    });
    const legacyId = randomUUID();
    const defaultCircle = (await a.workspace()).circles[0].id;
    await db.query(
      "INSERT INTO evidence(id,owner_id,title,summary,sources,source_url,visibility,circle_id) VALUES($1,$2,$3,$4,$5,$6,'circle',$7)",
      [
        legacyId,
        a.session.owner.id,
        "Legacy source incompatible with adapter",
        "Stored before public DNS source policy",
        JSON.stringify([{ url: "https://8.8.8.8/" }]),
        "https://8.8.8.8/",
        defaultCircle,
      ],
    );
    const mission = await a.mission([saved.botId], "circle");
    assert.equal(
      await runCli(["inbox", "--allow-local-http"], env, io),
      0,
      stderr.join("\n"),
    );
    const task = JSON.parse(stdout.at(-1)!).tasks[0];
    assert.equal(task.missionId, mission.id);
    assert.equal(task.contextEvidence[0].id, knowledge.id);
    assert.equal(task.contextEvidence[0].provenance, "circle-published");
    assert.ok(!JSON.stringify(task.contextEvidence).includes(legacyId));
    const resultFile = join(directory, "result.json");
    await writeFile(resultFile, JSON.stringify(resultBody(task)));
    assert.equal(
      await runCli(
        [
          "submit",
          "--task-id",
          task.id,
          "--file",
          resultFile,
          "--allow-local-http",
        ],
        env,
        io,
      ),
      0,
      stderr.join("\n"),
    );
    assert.equal(JSON.parse(stdout.at(-1)!).status, "completed");
    assert.equal((await a.workspace()).evidence.length, 3);
    assert.ok(!stdout.join("\n").includes(saved.token));
    assert.ok(!stdout.join("\n").includes(pairing.code));
  } finally {
    await a.app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("owner reads reconcile exhausted leases and the overall mission deadline without bot polling", async () => {
  const a = await owner();
  try {
    const paired = await a.pair();
    const mission = await a.mission([paired.bot.id]);
    const task = (
      await a.botRequest(paired.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    await db.query(
      "UPDATE tasks SET attempts=3,lease_expires_at=now()-interval '1 day' WHERE id=$1",
      [task.id],
    );
    const detail = (
      await a.request("GET", `/api/missions/${mission.id}`)
    ).json();
    assert.equal(detail.mission.status, "failed");
    assert.equal(detail.tasks[0].status, "failed");
    const neverStarted = await a.mission([paired.bot.id]);
    await db.query(
      "UPDATE missions SET created_at=now()-interval '25 hours' WHERE id=$1",
      [neverStarted.id],
    );
    const ws = await a.workspace();
    assert.equal(
      ws.missions.find((m: any) => m.id === neverStarted.id).status,
      "failed",
    );
    assert.equal(
      (await a.botRequest(paired.token, "GET", "/api/bot/inbox")).json().tasks
        .length,
      0,
    );
  } finally {
    await a.app.close();
  }
});

test("owner cancellation is scoped, terminal, idempotent and fences leased results", async () => {
  const a = await owner(),
    b = await owner();
  try {
    const paired = await a.pair();
    const mission = await a.mission([paired.bot.id]);
    const task = (
      await a.botRequest(paired.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(
      (await b.request("POST", `/api/missions/${mission.id}/cancel`, {}))
        .statusCode,
      404,
    );
    const cancelled = await a.request(
      "POST",
      `/api/missions/${mission.id}/cancel`,
      {},
    );
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    assert.equal(cancelled.json().mission.status, "cancelled");
    assert.equal(
      (await a.request("POST", `/api/missions/${mission.id}/cancel`, {})).json()
        .mission.status,
      "cancelled",
    );
    assert.equal(
      (
        await a.botRequest(
          paired.token,
          "POST",
          `/api/bot/tasks/${task.id}/result`,
          resultBody(task),
        )
      ).statusCode,
      409,
    );
    assert.deepEqual(
      (await a.botRequest(paired.token, "GET", "/api/bot/inbox")).json().tasks,
      [],
    );
    assert.equal((await a.workspace()).evidence.length, 0);
  } finally {
    await a.app.close();
    await b.app.close();
  }
});

test("concurrent final results complete once and claim against revoke cannot resurrect a mission", async () => {
  const a = await owner();
  try {
    const first = await a.pair(),
      second = await a.pair();
    const mission = await a.mission([first.bot.id, second.bot.id]);
    const one = (
      await a.botRequest(first.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    const two = (
      await a.botRequest(second.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    const results = await Promise.all([
      a.botRequest(
        first.token,
        "POST",
        `/api/bot/tasks/${one.id}/result`,
        resultBody(one),
      ),
      a.botRequest(
        second.token,
        "POST",
        `/api/bot/tasks/${two.id}/result`,
        resultBody(two),
      ),
    ]);
    for (const response of results)
      assert.equal(response.statusCode, 200, response.body);
    assert.equal(
      (await a.request("GET", `/api/missions/${mission.id}`)).json().mission
        .status,
      "completed",
    );
    const next = await a.mission([first.bot.id, second.bot.id]);
    await Promise.all([
      a.botRequest(first.token, "GET", "/api/bot/inbox"),
      a.request("POST", `/api/bots/${second.bot.id}/revoke`, {}),
    ]);
    const detail = (await a.request("GET", `/api/missions/${next.id}`)).json();
    assert.equal(detail.mission.status, "failed");
    assert.ok(detail.tasks.every((t: any) => t.status === "failed"));
    assert.deepEqual(
      (await a.botRequest(first.token, "GET", "/api/bot/inbox")).json().tasks,
      [],
    );
  } finally {
    await a.app.close();
  }
});

test("circle reads hold membership permission through data reads; membership list excludes removed owners", async () => {
  let armed = false;
  let signalPaused: () => void = () => {};
  const paused = new Promise<void>((resolve) => {
    signalPaused = resolve;
  });
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const guarded = async <T>(sql: string, run: () => Promise<T>) => {
    const result = await run();
    if (armed && sql.includes("FOR SHARE OF m")) {
      armed = false;
      signalPaused();
      await released;
    }
    return result;
  };
  const wrapped: Database = {
    ...db,
    query: (sql, params) => guarded(sql, () => db.query(sql, params)),
    transaction: (run) =>
      db.transaction((tx) =>
        run({
          ...tx,
          query: (sql, params) => guarded(sql, () => tx.query(sql, params)),
        }),
      ),
  };
  const a = await owner(),
    b = await owner(randomUUID(), wrapped);
  let reading: Promise<any> | undefined;
  let removal: Promise<any> | undefined;
  try {
    const circle = (await a.workspace()).circles[0];
    const invite = (
      await a.request("POST", `/api/circles/${circle.id}/invites`, {})
    ).json();
    await b.request("POST", "/api/circles/join", { code: invite.code });
    const before = (await b.request("GET", `/api/circles/${circle.id}`)).json();
    assert.equal(before.members.length, 2);
    assert.deepEqual(Object.keys(before.members[0]).sort(), [
      "displayName",
      "handle",
      "ownerId",
      "role",
    ]);
    armed = true;
    reading = b.request("GET", `/api/circles/${circle.id}`).then((r) => r);
    await paused;
    removal = a
      .request(
        "POST",
        `/api/circles/${circle.id}/members/${b.session.owner.id}/remove`,
        {},
      )
      .then((r) => r);
    const early = await Promise.race([
      removal.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 50)),
    ]);
    assert.equal(
      early,
      false,
      "Removal must wait until authorized read has captured its response",
    );
    release();
    const read = await reading;
    assert.equal(read.statusCode, 200);
    assert.equal((await removal).statusCode, 200);
    const created = (
      await a.request("POST", "/api/evidence", {
        title: "Published after removal",
        summary: "Must not leak into the earlier read",
        sourceUrl: "https://example.com/after-removal",
        visibility: "circle",
      })
    ).json();
    const approval = (await a.workspace()).approvals.find(
      (p: any) => p.evidenceId === created.evidence.id,
    );
    await a.request("POST", `/api/approvals/${approval.id}/resolve`, {
      decision: "approve",
      version: approval.version,
    });
    assert.equal(read.json().evidence.length, 0);
    assert.equal(
      (await b.request("GET", `/api/circles/${circle.id}`)).statusCode,
      403,
    );
    assert.equal(
      (await a.request("GET", `/api/circles/${circle.id}`)).json().members
        .length,
      1,
    );
  } finally {
    release();
    await reading;
    await removal;
    await a.app.close();
    await b.app.close();
  }
});

test("inbox context shares assigned owner results but never unrelated private owner evidence", async () => {
  const a = await owner();
  try {
    const first = await a.pair(),
      second = await a.pair();
    await a.mission([first.bot.id, second.bot.id], "private", 2);
    const unrelated = (
      await a.request("POST", "/api/evidence", {
        title: "Unrelated private owner document",
        summary: "Excluded from assigned task context",
        sourceUrl: "https://example.com/unrelated-private",
        visibility: "private",
      })
    ).json().evidence;
    const one = (
        await a.botRequest(first.token, "GET", "/api/bot/inbox")
      ).json().tasks[0],
      two = (await a.botRequest(second.token, "GET", "/api/bot/inbox")).json()
        .tasks[0];
    const oneReceipt = (
      await a.botRequest(
        first.token,
        "POST",
        `/api/bot/tasks/${one.id}/result`,
        resultBody(one),
      )
    ).json();
    const twoReceipt = (
      await a.botRequest(
        second.token,
        "POST",
        `/api/bot/tasks/${two.id}/result`,
        resultBody(two),
      )
    ).json();
    const next = (
      await a.botRequest(first.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(next.round, 2);
    assert.deepEqual(
      next.contextEvidence.map((e: any) => e.id).sort(),
      [oneReceipt.evidenceId, twoReceipt.evidenceId].sort(),
    );
    assert.ok(
      next.contextEvidence.every(
        (e: any) =>
          e.provenance === "own-mission-result" && e.visibility === "private",
      ),
    );
    assert.ok(!JSON.stringify(next).includes(unrelated.id));
    assert.ok(!JSON.stringify(next).includes(unrelated.title));
  } finally {
    await a.app.close();
  }
});

test("inbox context includes approved circle knowledge and peer results only after approval, excludes other circles and caps ten", async () => {
  const a = await owner(),
    b = await owner();
  try {
    const circle = (await a.workspace()).circles[0],
      otherCircle = (await b.workspace()).circles[0];
    const invite = (
      await a.request("POST", `/api/circles/${circle.id}/invites`, {})
    ).json();
    await b.request("POST", "/api/circles/join", { code: invite.code });
    const save = async (
      title: string,
      visibility: string,
      circleId?: string,
    ) => {
      const response = await b.request("POST", "/api/evidence", {
        title,
        summary: `Summary for ${title}`,
        sourceUrl: "https://example.com/context",
        visibility,
        ...(circleId ? { circleId } : {}),
      });
      assert.equal(response.statusCode, 200, response.body);
      return response.json().evidence;
    };
    const approve = async (evidenceId: string, decision = "approve") => {
      const approval = (await b.workspace()).approvals.find(
        (p: any) => p.evidenceId === evidenceId,
      );
      const response = await b.request(
        "POST",
        `/api/approvals/${approval.id}/resolve`,
        { decision, version: approval.version },
      );
      assert.equal(response.statusCode, 200, response.body);
    };
    const privatePeer = await save("Never share peer private", "private");
    const pending = await save("Never share pending peer", "circle", circle.id);
    const rejected = await save(
      "Never share rejected peer",
      "circle",
      circle.id,
    );
    await approve(rejected.id, "reject");
    const elsewhere = await save(
      "Another circle only",
      "circle",
      otherCircle.id,
    );
    await approve(elsewhere.id);
    const knowledge = await save(
      "Approved knowledge from earlier work",
      "circle",
      circle.id,
    );
    await approve(knowledge.id);
    const ownBot = await a.pair(),
      peerBot = await b.pair();
    const mission = await a.mission([ownBot.bot.id], "circle", 3);
    await b.request("POST", `/api/missions/${mission.id}/participate`, {
      botId: peerBot.bot.id,
    });
    const peerTask = (
      await b.botRequest(peerBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    const peerResult = (
      await b.botRequest(
        peerBot.token,
        "POST",
        `/api/bot/tasks/${peerTask.id}/result`,
        {
          ...resultBody(peerTask),
          contribution: {
            ...contribution,
            title: "Peer mission finding awaiting approval",
          },
        },
      )
    ).json();
    const first = (
      await a.botRequest(ownBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.deepEqual(
      first.contextEvidence.map((e: any) => e.id),
      [knowledge.id],
    );
    assert.ok(!JSON.stringify(first).includes(peerResult.evidenceId));
    for (const excluded of [privatePeer, pending, rejected, elsewhere]) {
      assert.ok(!JSON.stringify(first).includes(excluded.id));
      assert.ok(!JSON.stringify(first).includes(excluded.title));
    }
    await approve(peerResult.evidenceId);
    await a.botRequest(
      ownBot.token,
      "POST",
      `/api/bot/tasks/${first.id}/result`,
      resultBody(first),
    );
    const second = (
      await a.botRequest(ownBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    const publishedPeer = second.contextEvidence.find(
      (e: any) => e.id === peerResult.evidenceId,
    );
    assert.equal(publishedPeer.visibility, "circle");
    assert.equal(publishedPeer.provenance, "circle-published");
    assert.ok(second.contextEvidence.some((e: any) => e.id === knowledge.id));
    await a.botRequest(
      ownBot.token,
      "POST",
      `/api/bot/tasks/${second.id}/result`,
      resultBody(second),
    );
    const peerSecond = (
      await b.botRequest(peerBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    await b.botRequest(
      peerBot.token,
      "POST",
      `/api/bot/tasks/${peerSecond.id}/result`,
      resultBody(peerSecond),
    );
    for (let n = 0; n < 11; n++) {
      const extra = await save(
        `Approved bounded knowledge ${n}`,
        "circle",
        circle.id,
      );
      await approve(extra.id);
    }
    const third = (
      await a.botRequest(ownBot.token, "GET", "/api/bot/inbox")
    ).json().tasks[0];
    assert.equal(third.contextEvidence.length, 10);
    assert.ok(
      Buffer.byteLength(JSON.stringify(third.contextEvidence), "utf8") <=
        750_000,
    );
    assert.equal(third.contextEvidence[0].missionId, mission.id);
    for (const excluded of [privatePeer, pending, rejected, elsewhere])
      assert.ok(!JSON.stringify(third).includes(excluded.id));
  } finally {
    await a.app.close();
    await b.app.close();
  }
});
