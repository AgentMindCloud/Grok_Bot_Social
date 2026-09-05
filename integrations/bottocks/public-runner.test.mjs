import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPublicRunner, providerResult } from "./public-runner.mjs";
import { storeConnectionState, HubClient } from "../native-grok/client.mjs";
const token = "gbs_" + "a".repeat(43),
  botId = "fixture-bot",
  hubUrl = "https://bottocks.fun";
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "bottocks-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDirectory = join(root, "private"),
    exchangeDirectory = join(root, "exchange");
  await storeConnectionState(join(stateDirectory, "credentials.json"), {
    token,
    botId,
    hubUrl,
  });
  let clock = Date.now();
  return {
    options: {
      stateDirectory,
      exchangeDirectory,
      public: true,
      maxJobs: 1,
      maxMinutes: 1,
    },
    clock: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    root,
  };
}
const heartbeat = async () => ({
  ok: true,
  bot: { id: botId, credentialScope: "pool-only" },
});
const lease = (now) => ({
  id: "lease-id",
  attemptId: "attempt-id",
  expiresAt: new Date(now + 30000).toISOString(),
  question: { id: "question-id", body: "public" },
});
test("public runner requires confirmed pool-only scope and separate directories", async (t) => {
  const f = await fixture(t);
  await assert.rejects(runPublicRunner({ ...f.options, public: false }));
  await assert.rejects(
    runPublicRunner({
      ...f.options,
      exchangeDirectory: f.options.stateDirectory,
    }),
  );
  await assert.rejects(
    runPublicRunner(f.options, {
      client: {
        heartbeat: async () => ({
          ok: true,
          bot: { id: botId, credentialScope: "legacy-private" },
        }),
      },
    }),
    /pool-only/,
  );
});
test("runtime result rejects mismatched jobs, commands, bad sources and oversized output", () => {
  assert.throws(() =>
    providerResult({ jobId: "a", body: "x", sources: [] }, "b"),
  );
  assert.throws(() =>
    providerResult(
      { jobId: "a", body: "x", sources: [], command: "read-private" },
      "a",
    ),
  );
  assert.throws(() =>
    providerResult({ jobId: "a", body: "x".repeat(4001), sources: [] }, "a"),
  );
  assert.throws(() =>
    providerResult(
      { jobId: "a", body: "x", sources: [{ url: "http://localhost" }] },
      "a",
    ),
  );
});
test("runner persists exact reply before delivery, retries lost receipt without regeneration, and obeys job budget", async (t) => {
  const f = await fixture(t);
  let next = 0,
    replies = [];
  const client = {
    heartbeat,
    next: async () => {
      next++;
      const l = lease(f.clock());
      await storeConnectionState(
        join(f.options.exchangeDirectory, "result.json"),
        { jobId: l.id, body: "Bounded public answer", sources: [] },
      );
      return { lease: l };
    },
    reply: async (input) => {
      replies.push(input);
      const stored = JSON.parse(
        await readFile(
          join(f.options.stateDirectory, "public-runner.json"),
          "utf8",
        ),
      );
      assert.deepEqual(stored.job.pendingResult, input);
      if (replies.length === 1) throw Error("lost receipt");
      return { replayed: true };
    },
  };
  const result = await runPublicRunner(f.options, {
    client,
    now: f.clock,
    sleep: f.sleep,
    random: () => 0,
  });
  assert.equal(result.replies, 1);
  assert.equal(result.jobs, 1);
  assert.equal(next, 1);
  assert.deepEqual(replies[0], replies[1]);
  const exchange = await readFile(
    join(f.options.exchangeDirectory, "job.json"),
    "utf8",
  );
  assert.ok(!exchange.includes(token));
});
test("restart replays pending submission without requesting another model result", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const client = {
    heartbeat,
    next: async () => {
      calls++;
      const l = lease(f.clock());
      await storeConnectionState(
        join(f.options.exchangeDirectory, "result.json"),
        { jobId: l.id, body: "Persisted answer", sources: [] },
      );
      return { lease: l };
    },
    reply: async () => {
      throw Error("offline");
    },
  };
  const stopped = await runPublicRunner(f.options, {
    client,
    now: f.clock,
    sleep: f.sleep,
  });
  assert.equal(stopped.stopped, "failure-limit");
  const saved = JSON.parse(
    await readFile(
      join(f.options.stateDirectory, "public-runner.json"),
      "utf8",
    ),
  ).job.pendingResult;
  let retried;
  const after = await runPublicRunner(f.options, {
    client: {
      heartbeat,
      next: async () => ({ lease: null }),
      reply: async (input) => {
        retried = input;
        return { replayed: true };
      },
    },
    now: f.clock,
    sleep: f.sleep,
  });
  assert.deepEqual(retried, saved);
  assert.equal(after.replies, 1);
  assert.equal(calls, 1);
});
test("no runtime output expires lease without publishing; credential-shaped output never reaches hub", async (t) => {
  for (const includeSecret of [false, true]) {
    const f = await fixture(t);
    let sends = 0;
    const result = await runPublicRunner(f.options, {
      client: {
        heartbeat,
        next: async () => {
          const l = lease(f.clock());
          if (includeSecret)
            await storeConnectionState(
              join(f.options.exchangeDirectory, "result.json"),
              { jobId: l.id, body: token, sources: [] },
            );
          return { lease: l };
        },
        reply: async () => {
          sends++;
        },
      },
      now: f.clock,
      sleep: f.sleep,
    });
    assert.equal(sends, 0);
    if (includeSecret) assert.ok(result.failures >= 1 && result.failures <= 5);
    else assert.equal(result.expired, 1);
  }
});
test("503 Retry-After is honored and retried only once, without shortening a long delay", async () => {
  let calls = 0,
    waits = [];
  const client = new HubClient({
    hubUrl,
    token,
    fetchImpl: async () => {
      calls++;
      return new Response("{}", {
        status: 503,
        headers: { "retry-after": "2" },
      });
    },
    sleep: async (ms) => waits.push(ms),
  });
  await assert.rejects(client.heartbeat(), /HTTP 503/);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
  let longCalls = 0;
  await assert.rejects(
    new HubClient({
      hubUrl,
      token,
      fetchImpl: async () => {
        longCalls++;
        return new Response("{}", {
          status: 503,
          headers: { "retry-after": "120" },
        });
      },
      sleep: async () => assert.fail("must not shorten wait"),
    }).heartbeat(),
    (e) => e.retryAfterMs === 120000,
  );
  assert.equal(longCalls, 1);
});
