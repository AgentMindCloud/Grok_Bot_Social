#!/usr/bin/env node
/**
 * Read-only production dependency gate. No installs or lockfile changes.
 * node scripts/security-audit.mjs [--github-only] [web hub | package-lock.json ...]
 * node scripts/security-audit.mjs --self-test
 *
 * Default: bounded npm audit first; only transport/endpoint failures fall back.
 * GitHub queries every exact production package@version, including optional and
 * platform packages, for reviewed, unreviewed, and malware advisories. All pages
 * must complete. High/critical, malware, unknown severity, and incomplete scans
 * fail. GitHub is a different advisory source, not a claim of npm audit success.
 * GITHUB_TOKEN or GH_TOKEN is optional and used only for api.github.com requests.
 * API semantics: https://docs.github.com/en/rest/security-advisories/global-advisories#list-global-security-advisories
 */
import { readFile, realpath, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.github.com/advisories";
const TYPES = ["reviewed", "unreviewed", "malware"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const NPM_SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const MAX_BYTES = 4 * 1024 * 1024;
const NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i;
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i;
const GHSA = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;
const NETWORK_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "E408",
  "E429",
  "E500",
  "E502",
  "E503",
  "E504",
]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function pair(entry) {
  return `${entry.name}@${entry.version}`;
}
function blocking(item) {
  return (
    item.severity === "high" ||
    item.severity === "critical" ||
    item.type === "malware"
  );
}

export function productionDependencies(lock) {
  check(
    object(lock) &&
      [2, 3].includes(lock.lockfileVersion) &&
      object(lock.packages) &&
      object(lock.packages[""]),
    "Unsupported or incomplete npm lockfile.",
  );
  const found = new Map();
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location) continue; // Root project is not a dependency.
    check(object(entry), "Malformed lockfile package entry.");
    if (entry.dev === true) continue;
    check(
      entry.dev === undefined || entry.dev === false,
      "Malformed development dependency flag.",
    );
    check(
      location.startsWith("node_modules/") && !entry.link,
      "Unscannable local or linked production dependency.",
    );
    const name =
      entry.name ?? location.slice(location.lastIndexOf("node_modules/") + 13);
    check(
      typeof name === "string" && name.length <= 214 && NAME.test(name),
      "Invalid production package name.",
    );
    check(
      typeof entry.version === "string" &&
        entry.version.length <= 128 &&
        VERSION.test(entry.version),
      "Production dependency is not pinned to an exact npm version.",
    );
    check(
      typeof entry.resolved === "string" &&
        entry.resolved.startsWith("https://registry.npmjs.org/") &&
        typeof entry.integrity === "string",
      "Production dependency lacks a verifiable public npm registry origin or integrity.",
    );
    found.set(`${name}@${entry.version}`, { name, version: entry.version });
  }
  return [...found.values()].sort((a, b) => pair(a).localeCompare(pair(b)));
}

export function classifyNpmAudit(result) {
  check(
    !result.overflow && !result.spawnError,
    "npm audit could not run or exceeded its output limit.",
  );
  let report;
  const output = result.stdout.trim();
  if (output) {
    try {
      report = JSON.parse(output);
    } catch {
      throw new Error(
        "npm audit returned incomplete or invalid JSON; fallback refused.",
      );
    }
  }
  if (object(report) && Object.hasOwn(report, "vulnerabilities")) {
    check(
      report.auditReportVersion === 2 &&
        object(report.vulnerabilities) &&
        object(report.metadata?.vulnerabilities),
      "Incomplete npm audit report.",
    );
    check(
      !report.error && !result.timedOut && [0, 1].includes(result.code),
      "npm audit did not complete successfully.",
    );
    const counts = Object.fromEntries(
      NPM_SEVERITIES.map((severity) => [severity, 0]),
    );
    const findings = [];
    for (const [name, item] of Object.entries(report.vulnerabilities)) {
      check(
        NAME.test(name) &&
          object(item) &&
          NPM_SEVERITIES.includes(item.severity) &&
          Array.isArray(item.via),
        "Malformed npm vulnerability entry.",
      );
      counts[item.severity] += 1;
      const links = item.via
        .filter(object)
        .map((via) => via.url)
        .filter(
          (url) =>
            typeof url === "string" &&
            /^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(
              url,
            ),
        );
      findings.push({ name, severity: item.severity, links });
    }
    const metadata = report.metadata.vulnerabilities;
    for (const severity of NPM_SEVERITIES)
      check(
        Number.isSafeInteger(metadata[severity]) &&
          metadata[severity] === counts[severity],
        "npm audit vulnerability counts are inconsistent.",
      );
    check(
      metadata.total === findings.length,
      "npm audit total is inconsistent.",
    );
    return { kind: "report", findings };
  }
  // Never substitute another source for malformed data or a report with findings.
  if (!output && result.timedOut)
    return { kind: "unavailable", reason: "timeout" };
  const code = report?.error?.code ?? report?.code;
  const message = report?.message ?? "";
  const endpointTimeout =
    typeof message === "string" &&
    /^network timeout at: https:\/\/registry\.npmjs\.org\/-\/npm\/v1\/security\/(?:advisories\/bulk|audits\/quick)$/.test(
      message,
    );
  if (
    object(report) &&
    !Object.hasOwn(report, "vulnerabilities") &&
    (NETWORK_CODES.has(code) || endpointTimeout)
  )
    return {
      kind: "unavailable",
      reason: "registry transport or endpoint error",
    };
  throw new Error(
    "npm audit failed without a recognized transport/endpoint error; fallback refused.",
  );
}

async function npmCli() {
  const bin = dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    join(bin, "node_modules/npm/bin/npm-cli.js"),
    join(bin, "../lib/node_modules/npm/bin/npm-cli.js"),
    join(bin, "npm"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const file = await realpath(candidate);
      if (file.endsWith("npm-cli.js")) {
        await access(file);
        return file;
      }
    } catch {
      /* Try the next standard npm location. */
    }
  }
  throw new Error(
    "Cannot locate npm-cli.js; npm audit is required in default mode.",
  );
}

export async function runNpmAudit(directory, timeoutMs = 25000) {
  const executable = await npmCli();
  return new Promise((resolveResult) => {
    const env = { ...process.env };
    delete env.GITHUB_TOKEN;
    delete env.GH_TOKEN;
    const child = spawn(
      process.execPath,
      [
        executable,
        "audit",
        "--json",
        "--omit=dev",
        "--package-lock-only",
        "--registry=https://registry.npmjs.org",
        "--fetch-retries=0",
        "--fetch-timeout=30000", // Overall deadline fires before npm's legacy quick-audit fallback.
      ],
      {
        cwd: directory,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      bytes = 0,
      overflow = false,
      timedOut = false,
      spawnError = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        overflow = true;
        child.kill();
      } else stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        overflow = true;
        child.kill();
      }
    }); // Never print npm stderr or credentials.
    child.on("error", () => {
      spawnError = true;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({ code, stdout, timedOut, overflow, spawnError });
    });
  });
}

function queryUrl(entries, type) {
  const url = new URL(API);
  url.searchParams.set("ecosystem", "npm");
  url.searchParams.set("type", type);
  url.searchParams.set("is_withdrawn", "false");
  url.searchParams.set("affects", entries.map(pair).join(","));
  url.searchParams.set("per_page", "100");
  return url;
}

export function nextPage(link, initial) {
  if (!link) return null;
  check(
    typeof link === "string" && link.length < 20000,
    "Malformed GitHub pagination.",
  );
  let next = null;
  for (const part of link.split(/,\s*(?=<)/)) {
    const match = /^<([^>]+)>;\s*rel="(next|prev|first|last)"$/.exec(
      part.trim(),
    );
    check(match, "Malformed GitHub pagination.");
    let target;
    try {
      target = new URL(match[1]);
    } catch {
      throw new Error("Malformed GitHub pagination URL.");
    }
    check(
      target.origin === new URL(API).origin &&
        target.pathname === "/advisories" &&
        !target.username &&
        !target.password &&
        !target.hash,
      "Unsafe GitHub pagination origin.",
    );
    for (const [key, value] of initial.searchParams)
      check(
        target.searchParams.getAll(key).length === 1 &&
          target.searchParams.get(key) === value,
        "GitHub pagination changed the query scope.",
      );
    for (const key of target.searchParams.keys())
      check(
        initial.searchParams.has(key) ||
          ["after", "before", "page"].includes(key),
        "Unexpected GitHub pagination parameter.",
      );
    if (match[2] === "next") {
      check(!next, "Duplicate GitHub next page.");
      next = target;
    }
  }
  return next;
}

export async function githubPage(
  url,
  {
    fetchImpl = fetch,
    token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
  } = {},
) {
  check(
    url.origin === "https://api.github.com" &&
      url.pathname === "/advisories" &&
      !url.username &&
      !url.password &&
      !url.hash,
    "Unsafe advisory API destination.",
  );
  // Credentials are opaque. Accept visible ASCII, including Actions token dots,
  // while rejecting whitespace and control characters before building a header.
  check(
    token === undefined ||
      token === "" ||
      (typeof token === "string" && /^[\x21-\x7E]+$/.test(token)),
    "Invalid GitHub token format.",
  );
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "grok-bot-social-security-audit",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("GitHub advisory request failed or timed out.");
  }
  check(
    response.status === 200,
    `GitHub advisory API returned HTTP ${Number.isInteger(response.status) ? response.status : "error"}; scan incomplete.`,
  );
  check(
    (response.headers.get("content-type") ?? "").includes("application/json"),
    "GitHub advisory response is not JSON.",
  );
  let body = "",
    bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      check(
        bytes <= MAX_BYTES,
        "GitHub advisory response exceeded the size limit.",
      );
      body += Buffer.from(chunk).toString("utf8");
    }
  } catch {
    throw new Error("GitHub advisory response was incomplete or too large.");
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("GitHub advisory API returned malformed JSON.");
  }
  check(
    Array.isArray(data) && data.length <= 100,
    "GitHub advisory API returned an incomplete or malformed page.",
  );
  return { data, link: response.headers.get("link") };
}

export async function scanGithub(
  entries,
  { request = githubPage, log = console.log } = {},
) {
  const unique = [
    ...new Map(entries.map((entry) => [pair(entry), entry])).values(),
  ];
  const findings = new Map();
  let scanned = 0,
    requests = 0;
  for (let offset = 0; offset < unique.length; offset += 20) {
    const batch = unique.slice(offset, offset + 20);
    for (const type of TYPES) {
      const initial = queryUrl(batch, type);
      check(
        initial.href.length <= 6000,
        "GitHub advisory query exceeds the URL limit.",
      );
      let url = initial;
      const visited = new Set();
      while (url) {
        check(
          !visited.has(url.href) && visited.size < 30,
          "GitHub advisory pagination did not complete.",
        );
        visited.add(url.href);
        const { data, link } = await request(url);
        requests += 1;
        check(
          Array.isArray(data) && data.length <= 100,
          "Malformed GitHub advisory page.",
        );
        for (const advisory of data) {
          check(
            object(advisory) &&
              GHSA.test(advisory.ghsa_id) &&
              advisory.type === type &&
              advisory.withdrawn_at === null &&
              SEVERITIES.includes(advisory.severity),
            "GitHub returned an incomplete advisory or unknown severity.",
          );
          check(
            Array.isArray(advisory.vulnerabilities) &&
              advisory.vulnerabilities.length > 0,
            "GitHub advisory lacks affected package data.",
          );
          const matching = advisory.vulnerabilities.filter(
            (item) =>
              object(item) &&
              item.package?.ecosystem === "npm" &&
              batch.some((entry) => entry.name === item.package.name),
          );
          check(
            matching.length > 0 &&
              matching.every(
                (item) =>
                  typeof item.vulnerable_version_range === "string" &&
                  item.vulnerable_version_range.length > 0,
              ),
            "GitHub advisory does not match the requested npm package scope.",
          );
          const previous = findings.get(advisory.ghsa_id);
          check(
            !previous ||
              (previous.type === type &&
                previous.severity === advisory.severity),
            "GitHub returned inconsistent advisory records.",
          );
          findings.set(advisory.ghsa_id, {
            id: advisory.ghsa_id,
            type,
            severity: advisory.severity,
            link: `https://github.com/advisories/${advisory.ghsa_id}`,
          });
        }
        url = nextPage(link, initial);
        check(
          data.length < 100 || link,
          "Full GitHub page has no pagination metadata; completeness is unverified.",
        );
      }
    }
    scanned += batch.length;
  }
  const result = [...findings.values()];
  for (const item of result)
    log(`[github] ${item.severity} ${item.type}: ${item.link}`);
  log(
    `[github] Complete: ${scanned}/${unique.length} unique production package versions; ${requests} requests; ${result.length} advisories; ${result.filter(blocking).length} blocking.`,
  );
  return { findings: result, scanned, requests };
}

export async function auditProjects(
  projects,
  {
    githubOnly = false,
    npmAudit = runNpmAudit,
    githubScan = scanGithub,
    log = console.log,
  } = {},
) {
  const needsGithub = [];
  for (const project of projects) {
    log(
      `[inventory] ${project.label}: ${project.entries.length} unique production package versions (all optional/platform packages included).`,
    );
    if (githubOnly) {
      needsGithub.push(...project.entries);
      continue;
    }
    const result = classifyNpmAudit(await npmAudit(project.directory));
    if (result.kind === "unavailable") {
      log(
        `[npm] ${project.label}: ${result.reason}; checking GitHub advisories as a separate source.`,
      );
      needsGithub.push(...project.entries);
      continue;
    }
    for (const finding of result.findings)
      log(
        `[npm] ${finding.severity} ${finding.name}${finding.links.length ? `: ${finding.links.join(" ")}` : " (transitive advisory)"}`,
      );
    log(
      `[npm] ${project.label}: complete; ${result.findings.length} affected packages.`,
    );
    check(
      !result.findings.some(blocking),
      "npm audit found high or critical vulnerabilities; fallback refused.",
    );
  }
  if (needsGithub.length) {
    log(
      githubOnly
        ? "[mode] Explicit GitHub-only audit; npm was not run."
        : "[mode] GitHub fallback for unavailable npm audits; this is not npm audit success.",
    );
    const result = await githubScan(needsGithub, { log });
    check(
      result.scanned === new Set(needsGithub.map(pair)).size,
      "GitHub scan did not cover every required production package version.",
    );
    check(
      !result.findings.some(blocking),
      "GitHub found blocking security advisories.",
    );
  }
  log("Security gate passed for the completed advisory source(s).");
}

async function main(args) {
  if (args.length === 1 && args[0] === "--self-test") {
    await selfTest();
    return;
  }
  const githubOnly = args.includes("--github-only");
  const files = args.filter((arg) => arg !== "--github-only");
  check(
    files.every((file) => !file.startsWith("--")),
    "Usage: security-audit.mjs [--github-only] [web hub | package-lock.json ...] or --self-test",
  );
  const selected = files.length
    ? files
    : [
        join(REPO, "web/package-lock.json"),
        join(REPO, "hub/package-lock.json"),
      ];
  const projects = [];
  for (const [index, file] of selected.entries()) {
    const path = resolve(
      file.endsWith(".json") ? file : join(file, "package-lock.json"),
    );
    let lock;
    try {
      lock = JSON.parse(await readFile(path, "utf8"));
    } catch {
      throw new Error(`Cannot read lockfile ${index + 1}.`);
    }
    projects.push({
      label: NAME.test(lock.name ?? "") ? lock.name : `project-${index + 1}`,
      directory: dirname(path),
      entries: productionDependencies(lock),
    });
  }
  await auditProjects(projects, { githubOnly });
}

async function selfTest() {
  const { test } = await import("node:test");
  const assert = (await import("node:assert/strict")).default;
  const dep = (version, extra = {}) => ({
    version,
    resolved: `https://registry.npmjs.org/pkg/-/pkg-${version}.tgz`,
    integrity: "sha512-test",
    ...extra,
  });
  const entry = { name: "postcss", version: "8.4.31" };
  const advisory = (severity = "high", type = "reviewed") => ({
    ghsa_id: "GHSA-r28c-9q8g-f849",
    severity,
    type,
    withdrawn_at: null,
    vulnerabilities: [
      {
        package: { ecosystem: "npm", name: "postcss" },
        vulnerable_version_range: "<= 8.5.17",
      },
    ],
  });
  const report = (severity) => ({
    code: severity ? 1 : 0,
    stdout: JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: severity ? { postcss: { severity, via: [] } } : {},
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: severity === "high" ? 1 : 0,
          critical: 0,
          total: severity ? 1 : 0,
        },
      },
    }),
  });
  await test("inventory includes optional/platform/transitive versions and skips only dev:true", () => {
    const lock = {
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/a": dep("1.0.0"),
        "node_modules/b": dep("1.0.0", { dev: true }),
        "node_modules/@s/c": dep("2.0.0", {
          optional: true,
          os: ["linux"],
          cpu: ["arm64"],
        }),
        "node_modules/a/node_modules/a": dep("2.0.0", { devOptional: true }),
        "node_modules/alias": dep("3.0.0", { name: "actual" }),
      },
    };
    assert.deepEqual(productionDependencies(lock).map(pair).sort(), [
      "@s/c@2.0.0",
      "a@1.0.0",
      "a@2.0.0",
      "actual@3.0.0",
    ]);
    assert.throws(() =>
      productionDependencies({
        lockfileVersion: 3,
        packages: { "node_modules/x": { version: "file:../x", link: true } },
      }),
    );
  });
  await test("npm findings block without fallback and zero findings complete", async () => {
    let called = false;
    const project = [{ label: "test", directory: ".", entries: [entry] }];
    await assert.rejects(
      auditProjects(project, {
        npmAudit: async () => report("high"),
        githubScan: async () => {
          called = true;
        },
        log() {},
      }),
      /fallback refused/,
    );
    assert.equal(called, false);
    await assert.rejects(
      auditProjects(project, {
        npmAudit: async () => ({ ...report("high"), timedOut: true }),
        githubScan: async () => {
          called = true;
        },
        log() {},
      }),
      /did not complete/,
    );
    assert.equal(called, false);
    assert.equal(classifyNpmAudit(report()).kind, "report");
  });
  await test("only known npm transport errors can use fallback", () => {
    assert.equal(
      classifyNpmAudit({ stdout: "", timedOut: true }).kind,
      "unavailable",
    );
    assert.equal(
      classifyNpmAudit({
        stdout: JSON.stringify({ error: { code: "ETIMEDOUT" } }),
        code: 1,
      }).kind,
      "unavailable",
    );
    for (const result of [
      { stdout: "{", timedOut: true },
      { stdout: "{}", code: 1 },
      { stdout: JSON.stringify({ error: { code: "E401" } }), code: 1 },
      { stdout: "", overflow: true },
    ])
      assert.throws(() => classifyNpmAudit(result));
    const malformed = JSON.parse(report().stdout);
    malformed.metadata.vulnerabilities.high = 1;
    assert.throws(() =>
      classifyNpmAudit({ stdout: JSON.stringify(malformed), code: 0 }),
    );
  });
  await test("GitHub query uses exact versions and all three advisory types", async () => {
    const urls = [];
    const result = await scanGithub([entry, entry], {
      request: async (url) => {
        urls.push(url);
        return {
          data: url.searchParams.get("type") === "reviewed" ? [advisory()] : [],
          link: null,
        };
      },
      log() {},
    });
    assert.equal(result.scanned, 1);
    assert.equal(result.findings.filter(blocking).length, 1);
    assert.deepEqual(
      urls.map((url) => url.searchParams.get("type")),
      TYPES,
    );
    assert.ok(
      urls.every(
        (url) =>
          url.searchParams.get("affects") === "postcss@8.4.31" &&
          url.searchParams.get("ecosystem") === "npm",
      ),
    );
  });
  await test("GitHub follows complete pagination and blocks scope or origin changes", async () => {
    let pages = 0;
    const result = await scanGithub([entry], {
      request: async (url) => {
        pages += 1;
        if (
          url.searchParams.get("type") === "reviewed" &&
          !url.searchParams.has("after")
        ) {
          const next = new URL(url);
          next.searchParams.set("after", "cursor");
          return { data: [], link: `<${next}>; rel="next"` };
        }
        if (url.searchParams.get("type") === "reviewed")
          return { data: [advisory()], link: null };
        if (url.searchParams.get("type") === "malware")
          return {
            data: [
              { ...advisory("low", "malware"), ghsa_id: "GHSA-aaaa-bbbb-cccc" },
            ],
            link: null,
          };
        return { data: [], link: null };
      },
      log() {},
    });
    assert.equal(pages, 4);
    assert.equal(result.findings.filter(blocking).length, 2);
    const initial = queryUrl([entry], "reviewed");
    assert.throws(() =>
      nextPage('<https://evil.example/advisories>; rel="next"', initial),
    );
    const changed = new URL(initial);
    changed.searchParams.set("affects", "postcss@8.5.28");
    assert.throws(() => nextPage(`<${changed}>; rel="next"`, initial));
  });
  await test("incomplete, unknown severity, or irrelevant GitHub responses fail closed", async () => {
    for (const data of [
      {},
      [advisory("unknown")],
      [{ ...advisory(), vulnerabilities: [] }],
      Array.from({ length: 100 }, () => advisory()),
    ])
      await assert.rejects(
        scanGithub([entry], {
          request: async () => ({ data, link: null }),
          log() {},
        }),
      );
    await assert.rejects(
      auditProjects([{ label: "test", entries: [entry] }], {
        githubOnly: true,
        githubScan: async () => ({ scanned: 0, findings: [] }),
        log() {},
      }),
      /every required/,
    );
  });
  await test("opaque Actions token shapes reach the header; whitespace and controls never reach fetch", async () => {
    // Synthetic values test local header handling only, not GitHub authentication.
    for (const token of [
      "v1.synthetic-actions.token-2_~+/=",
      "github_pat_SYNTHETIC_ONLY",
    ]) {
      let calls = 0;
      const result = await githubPage(queryUrl([entry], "reviewed"), {
        token,
        fetchImpl: async (url, options) => {
          calls += 1;
          assert.equal(url.origin, "https://api.github.com");
          assert.equal(options.headers.authorization, `Bearer ${token}`);
          return new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      });
      assert.equal(calls, 1);
      assert.deepEqual(result.data, []);
    }
    for (const token of [
      "v1.synthetic\rX-Injected:value",
      "v1.synthetic\nX-Injected:value",
      "v1.synthetic\r\nX-Injected:value",
      " v1.synthetic",
      "v1.synthetic ",
      "v1. synthetic",
      "v1.\tsynthetic",
      "v1.\u0000synthetic",
      "v1.\u001fsynthetic",
      "v1.\u007fsynthetic",
      "v1.\u00a0synthetic",
    ]) {
      let calls = 0;
      await assert.rejects(
        githubPage(queryUrl([entry], "reviewed"), {
          token,
          fetchImpl: async () => {
            calls += 1;
            throw new Error("Fetch must not be reached");
          },
        }),
        (error) => error.message === "Invalid GitHub token format.",
      );
      assert.equal(calls, 0);
    }
  });
  await test("API redirects/errors never forward or print tokens", async () => {
    const token = "github_pat_TEST_SECRET";
    let calls = 0;
    await assert.rejects(
      githubPage(queryUrl([entry], "reviewed"), {
        token,
        fetchImpl: async (url, options) => {
          calls += 1;
          assert.equal(url.origin, "https://api.github.com");
          assert.equal(options.redirect, "manual");
          assert.equal(options.headers.authorization, `Bearer ${token}`);
          return new Response("", {
            status: 302,
            headers: { location: "https://evil.example" },
          });
        },
      }),
      (error) => !error.message.includes(token),
    );
    assert.equal(calls, 1);
    await assert.rejects(
      githubPage(queryUrl([entry], "reviewed"), {
        fetchImpl: async () => new Response("{}", { status: 429 }),
      }),
    );
    await assert.rejects(
      githubPage(queryUrl([entry], "reviewed"), {
        fetchImpl: async () =>
          new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      }),
    );
  });
  await test("a transport fallback preserves full coverage and partial API failure cannot pass", async () => {
    let captured;
    const projects = [
      { label: "one", directory: ".", entries: [entry] },
      {
        label: "two",
        directory: ".",
        entries: [{ name: "react", version: "18.3.1" }],
      },
    ];
    await auditProjects(projects, {
      npmAudit: async () => ({ stdout: "", timedOut: true }),
      githubScan: async (entries) => {
        captured = entries;
        return { scanned: 2, findings: [] };
      },
      log() {},
    });
    assert.deepEqual(captured.map(pair), ["postcss@8.4.31", "react@18.3.1"]);
    let calls = 0;
    await assert.rejects(
      scanGithub([entry], {
        request: async () => {
          if (++calls === 2) throw new Error("Service unavailable");
          return { data: [], link: null };
        },
        log() {},
      }),
    );
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(
      `Security gate failed: ${error instanceof Error ? error.message : "audit incomplete"}`,
    );
    process.exitCode = 1;
  });
}
