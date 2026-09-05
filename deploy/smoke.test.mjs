import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("deployment smoke sends the named virtual host for every session, page and archive request", async () => {
  const archive = Buffer.from(
    "synthetic archive bytes for the HTTP transport regression",
  );
  const seen = [];
  let expectedHost, expectedMode;
  const server = createServer((request, response) => {
    seen.push({
      host: request.headers.host,
      path: request.url,
      method: request.method,
    });
    // Match the empty 200 response from Caddy when no configured site matches.
    if (request.headers.host !== expectedHost) return response.end();
    if (request.url === "/api/session") {
      response.setHeader("Content-Type", "application/json");
      return response.end(
        JSON.stringify({
          authenticated: false,
          localLoginEnabled: false,
          githubLoginEnabled: true,
          workspaceEnabled: true,
          privateBetaEnabled: true,
          registrationMode: expectedMode,
          registrationPaused: false,
          weeklyResearchEnabled: true,
        }),
      );
    }
    if (request.url === "/api/auth/local") {
      assert.equal(request.method, "POST");
      response.statusCode = 404;
      return response.end();
    }
    if (request.url === "/resources/native-grok-0.3.0.manifest.json") {
      response.setHeader("Content-Type", "application/json");
      return response.end(
        JSON.stringify({
          version: "0.3.0",
          files: [{ path: "cli.mjs" }],
          archive: {
            sha256: createHash("sha256").update(archive).digest("hex"),
          },
        }),
      );
    }
    if (request.url === "/resources/native-grok-0.3.0.zip")
      return response.end(archive);
    if (
      ![
        "/",
        "/workspace/",
        "/connect/",
        "/library/",
        "/privacy/",
        "/terms/",
        "/help/",
        "/about/",
      ].includes(request.url)
    ) {
      response.statusCode = 404;
      return response.end();
    }
    response.setHeader("Content-Type", "text/html");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    response.end(
      '<!doctype html><title>GrokBot Social</title><section id="trust">Permissions</section>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const [host, mode] of [
      ["hub.example.com", "open"],
      ["staging.example.com", "restricted"],
    ]) {
      expectedHost = host;
      expectedMode = mode;
      seen.length = 0;
      const output = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(new URL("./smoke.mjs", import.meta.url))],
          {
            env: {
              ...process.env,
              SMOKE_ORIGIN: `http://127.0.0.1:${server.address().port}`,
              SMOKE_HOST: host,
              SMOKE_ACCESS_MODE: mode,
              SMOKE_REGISTRATION_PAUSED: "false",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let text = "";
        child.stdout.on("data", (chunk) => {
          text += chunk;
        });
        child.stderr.on("data", (chunk) => {
          text += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve(text)
            : reject(new Error(`Smoke failed (${code}): ${text}`)),
        );
      });
      assert.match(output, /verified through edge/);
      assert.equal(seen.length, 12);
      assert.ok(seen.every((request) => request.host === host));
      assert.ok(seen.some((request) => request.path === "/workspace/"));
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
