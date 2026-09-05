import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { setTimeout } from "node:timers/promises";
const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1";
const host = process.env.SMOKE_HOST || "hub.example.com";
const expectedMode = process.env.SMOKE_ACCESS_MODE || "restricted";
// Node's fetch does not preserve a caller-supplied Host header. These probes
// connect to a local edge address while selecting its named virtual host.
const request = (path, options = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(origin + path);
    const transport = url.protocol === "https:" ? https : http;
    const pending = transport.request(
      url,
      {
        method: options.method || "GET",
        headers: { ...options.headers, Host: host },
        signal: AbortSignal.timeout(5000),
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on("error", reject);
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            pending.destroy(new Error("Smoke response exceeded 2 MiB"));
          } else chunks.push(chunk);
        });
        response.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined)
              headers.set(
                name,
                Array.isArray(value) ? value.join(", ") : value,
              );
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers,
            }),
          );
        });
      },
    );
    pending.on("error", reject);
    pending.end(options.body);
  });
let session;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await request("/api/session");
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") || "",
      /application\/json/,
      "Session must reach the named hub through the edge",
    );
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
