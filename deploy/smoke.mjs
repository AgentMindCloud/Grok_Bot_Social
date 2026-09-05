import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1";
const host = process.env.SMOKE_HOST || "hub.example.com";
const expectedMode = process.env.SMOKE_ACCESS_MODE || "restricted";
const request = (path, options = {}) =>
  fetch(origin + path, {
    ...options,
    headers: { Host: host, ...options.headers },
    signal: AbortSignal.timeout(5000),
  });
let session;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await request("/api/session");
    assert.equal(response.status, 200);
    session = await response.json();
    break;
  } catch (error) {
    if (attempt === 29) throw error;
    await setTimeout(500);
  }
}
assert.equal(session.authenticated, false);
assert.equal(session.localLoginEnabled, false);
assert.equal(session.githubLoginEnabled, true);
assert.equal(session.workspaceEnabled, true);
assert.equal(session.privateBetaEnabled, true); // Existing clients' workspace flag.
assert.equal(session.registrationMode, expectedMode);
assert.equal(
  session.registrationPaused,
  process.env.SMOKE_REGISTRATION_PAUSED === "true",
);
assert.equal(session.weeklyResearchEnabled, true);
const local = await request("/api/auth/local", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: `https://${host}` },
  body: "{}",
});
assert.equal(local.status, 404);
for (const path of [
  "/",
  "/workspace/",
  "/connect/",
  "/library/",
  "/trust/",
  "/about/",
]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /GrokBot Social/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
}
const manifest = await (
  await request("/resources/native-grok-0.3.0.manifest.json")
).json();
const archive = Buffer.from(
  await (await request("/resources/native-grok-0.3.0.zip")).arrayBuffer(),
);
assert.equal(
  createHash("sha256").update(archive).digest("hex"),
  manifest.archive.sha256,
);
assert.equal(manifest.version, "0.3.0");
assert.ok(
  manifest.files.every(
    (file) => !/(credentials|lease-scopes|\.env|\.test\.)/.test(file.path),
  ),
);
console.log(
  `${expectedMode} workspace, static routes, security headers and native archive verified through edge (${host}).`,
);
