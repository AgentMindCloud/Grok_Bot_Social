import { mkdir, open, lstat, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{16,512}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class AdapterError extends Error {}
export class HubRateLimitError extends AdapterError {
  constructor(retryAfterMs) { super('Hub capacity is temporarily unavailable (HTTP 429). Retry after the stated interval.'); this.retryAfterMs = retryAfterMs; }
}

function fail(message) { throw new AdapterError(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
}
function keys(value, allowed, label) {
  object(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} contains unsupported fields.`);
}
function string(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail(`${label} has an invalid length.`);
  return value;
}

export function normalizeHubUrl(value, allowLocalHttp = false) {
  if (typeof value !== 'string' || !/^https?:\/\//.test(value) || value !== value.trim() || value.includes('\\')) fail('Set an absolute HTTPS hub origin.');
  let url;
  try { url = new URL(value); } catch { fail('Set a valid HTTPS hub origin.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('The hub URL must be an origin without credentials, paths, queries, or fragments.');
  if (url.protocol !== 'https:' && !(allowLocalHttp && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) fail('HTTPS is required. HTTP needs --allow-local-http and an exact loopback host.');
  return url.origin;
}

export function validateToken(value) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) fail('The local hub token is missing or invalid. Pair this Bot again.');
  return value;
}

export function validateIdentifier(value, label = 'Identifier') {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) fail(`${label} must use 1–128 letters, digits, underscores, or hyphens.`);
  return value;
}

export function validatePairInput(input) {
  keys(input, ['code', 'name', 'role', 'runtime'], 'Pair request');
  string(input.code, 6, 128, 'Pairing code');
  string(input.name, 1, 80, 'Bot name');
  if (!['scout', 'delegate'].includes(input.role)) fail('Role must be scout or delegate.');
  if (!['native-grok', 'grok-compatible'].includes(input.runtime)) fail('Runtime must be native-grok or grok-compatible.');
  return input;
}

function publicSourceUrl(value) {
  string(value, 1, 2048, 'Source URL');
  let url;
  try { url = new URL(value); } catch { fail('Each source needs a public HTTPS URL.'); }
  const host = url.hostname.toLowerCase();
  // Public DNS sources only. This is an output-data rule, not an SSRF defense:
  // the adapter never fetches sources, and cannot establish that a URL is truthful.
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.endsWith('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host === 'localhost' || host.includes(':') || /^[\d.]+$/.test(host)) fail('Each source needs a public HTTPS hostname without credentials or local addresses.');
}

export function validateResult(input) {
  keys(input, ['attemptId', 'idempotencyKey', 'contribution'], 'Result');
  validateIdentifier(input.attemptId, 'Attempt ID');
  validateIdentifier(input.idempotencyKey, 'Idempotency key');
  const contribution = input.contribution;
  keys(contribution, ['type', 'title', 'summary', 'sources'], 'Contribution');
  if (contribution.type !== 'research') fail('Only research contributions are supported.');
  string(contribution.title, 1, 200, 'Contribution title');
  string(contribution.summary, 1, 12000, 'Contribution summary');
  if (!Array.isArray(contribution.sources) || contribution.sources.length < 1 || contribution.sources.length > 20) fail('A contribution needs 1–20 source links.');
  for (const source of contribution.sources) {
    keys(source, ['url', 'title', 'accessedAt'], 'Source');
    publicSourceUrl(source.url);
    if (source.title !== undefined) string(source.title, 1, 300, 'Source title');
    if (source.accessedAt !== undefined && (typeof source.accessedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(source.accessedAt) || !Number.isFinite(Date.parse(source.accessedAt)))) fail('Source accessedAt must be an ISO UTC timestamp.');
  }
  return input;
}

export function validateContextEvidence(value, missionId) {
  // Omission supports an older hub, but the CLI explicitly reports unavailable context.
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 10 || Buffer.byteLength(JSON.stringify(value), 'utf8') > 750000) fail('Task context must contain at most 10 bounded evidence items.');
  const identifiers = new Set();
  for (const evidence of value) {
    keys(evidence, ['id', 'missionId', 'botId', 'title', 'summary', 'sources', 'visibility', 'provenance', 'createdAt'], 'Context evidence');
    validateIdentifier(evidence.id, 'Context evidence ID');
    if (identifiers.has(evidence.id)) fail('Task context contains duplicate evidence IDs.');
    identifiers.add(evidence.id);
    if (evidence.missionId !== null) validateIdentifier(evidence.missionId, 'Context mission ID');
    if (evidence.botId !== null) validateIdentifier(evidence.botId, 'Context Bot ID');
    if (!['private', 'circle'].includes(evidence.visibility) || !['own-mission-result', 'circle-published'].includes(evidence.provenance)) fail('Task context has invalid visibility or provenance.');
    if (evidence.provenance === 'own-mission-result' && evidence.missionId !== missionId) fail('Private-owner context must belong to the assigned mission.');
    if (evidence.provenance === 'circle-published' && evidence.visibility !== 'circle') fail('Shared context must be explicitly published to the circle.');
    string(evidence.title, 1, 200, 'Context title');
    string(evidence.summary, 1, 12000, 'Context summary');
    if (typeof evidence.createdAt !== 'string' || evidence.createdAt.length > 50 || !/^\d{4}-\d{2}-\d{2}T/.test(evidence.createdAt) || !Number.isFinite(Date.parse(evidence.createdAt))) fail('Context evidence needs a valid creation timestamp.');
    if (!Array.isArray(evidence.sources) || evidence.sources.length < 1 || evidence.sources.length > 20) fail('Context evidence needs 1–20 public source links.');
    for (const source of evidence.sources) {
      keys(source, ['url', 'title', 'accessedAt'], 'Context source');
      publicSourceUrl(source.url);
      if (source.title !== undefined) string(source.title, 1, 300, 'Context source title');
      if (source.accessedAt !== undefined && (typeof source.accessedAt !== 'string' || source.accessedAt.length > 50 || !/^\d{4}-\d{2}-\d{2}T/.test(source.accessedAt) || !Number.isFinite(Date.parse(source.accessedAt)))) fail('Context source accessedAt must be a valid ISO timestamp.');
    }
  }
}

export async function loadCredentials(file, allowLocalHttp = false) {
  let stat;
  try { stat = await lstat(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail('Could not read the local credential file.');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) fail('The local credential file must be a small regular file.');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) fail('The local credential file must have mode 0600.');
  let data;
  try { data = JSON.parse(await readFile(file, 'utf8')); } catch { fail('The local credential file is unreadable or malformed.'); }
  keys(data, ['hubUrl', 'token', 'botId'], 'Local credential file');
  return { hubUrl: normalizeHubUrl(data.hubUrl, allowLocalHttp), token: validateToken(data.token), botId: validateIdentifier(data.botId, 'Bot ID') };
}

async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('The credential directory must be a regular local directory.');
  if (process.platform !== 'win32' && (directoryStat.mode & 0o077) !== 0) fail('The credential directory must have mode 0700.');
}

export async function withPairingLock(file, callback) {
  const directory = dirname(resolve(file));
  const lockFile = join(directory, '.pair.lock');
  let handle;
  try {
    await privateDirectory(directory);
    handle = await open(lockFile, 'wx', 0o600);
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    if (error.code === 'EEXIST') fail('Pairing is locked for this state directory. Wait for the other pairing process; after a crash, verify its outcome in the hub before removing .pair.lock.');
    fail('Could not safely lock the local pairing directory.');
  }
  try { return await callback(); }
  finally {
    await handle.close().catch(() => {});
    await unlink(lockFile).catch(() => {});
  }
}

export async function storeCredentials(file, credentials) {
  const target = resolve(file);
  const directory = dirname(target);
  try {
    await privateDirectory(directory);
    try {
      await lstat(target);
      fail('Refusing to replace existing credentials. Revoke the new pairing in the hub and keep the original local identity.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = join(directory, `.credentials-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(credentials)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, target);
    } finally {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    fail('Could not save the scoped token locally. Revoke this pairing in the hub before trying again.');
  }
}

// Replacement is confined to the exclusive browser-connection lock. The
// advanced pairing path above deliberately keeps its no-overwrite behaviour.
export async function storeConnectionState(file, value) {
  const target = resolve(file), directory = dirname(target);
  await privateDirectory(directory);
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384 || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('Connection state must be a private regular file.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(directory, `.connection-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(temporary, target);
    if (process.platform !== 'win32') {
      const parent = await open(directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    }
  } catch { fail('Could not durably save connection state. No activation should be assumed; resume the same connection command.'); }
  finally { await handle?.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}

export class HubClient {
  constructor({ hubUrl, token, allowLocalHttp = false, fetchImpl = globalThis.fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
    this.hubUrl = normalizeHubUrl(hubUrl, allowLocalHttp);
    this.token = token === undefined ? undefined : validateToken(token);
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.now = now;
  }

  async request(path, { method = 'GET', body, authenticated = true, weeklyResearch = false, retry429 = true } = {}) {
    if (!/^\/api\/bot\/[A-Za-z0-9_/-]+$/.test(path)) fail('Unsupported hub API path.');
    const url = new URL(path, this.hubUrl);
    if (url.origin !== this.hubUrl) fail('Refusing to send credentials to a different origin.');
    const headers = { Accept: 'application/json' };
    if (weeklyResearch === true && path === '/api/bot/inbox') headers['X-Grok-Hub-Capabilities'] = 'weekly-research-v1';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated) headers.Authorization = `Bearer ${validateToken(this.token)}`;
    let response;
    try {
      response = await this.fetchImpl(url.href, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15000),
      });
    } catch { fail('Hub request failed or timed out. Check the configured hub and retry the same result key if submitting.'); }
    if (response.status >= 300 && response.status < 400) fail('Hub redirect blocked. Configure the final trusted HTTPS origin explicitly.');
    if (response.url && new URL(response.url).origin !== this.hubUrl) fail('Hub response origin did not match the configured origin.');
    if (response.status === 429) {
      const raw = response.headers.get('retry-after');
      const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : null;
      const date = raw && seconds === null ? Date.parse(raw) : NaN;
      const retryAfterMs = Math.max(1000, seconds !== null ? seconds * 1000 : Number.isFinite(date) ? date - this.now() : 5000);
      await response.body?.cancel().catch(() => {});
      // One retry only; long server delays are reported, never shortened.
      if (retry429 && retryAfterMs <= 30_000) {
        await this.sleep(retryAfterMs);
        return this.request(path, { method, body, authenticated, weeklyResearch, retry429: false });
      }
      throw new HubRateLimitError(retryAfterMs);
    }
    if (!response.ok) fail(`Hub request failed (HTTP ${response.status}). No server error content was displayed.`);
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) fail('The hub returned a non-JSON response.');
    let data;
    let length = 0;
    const chunks = [];
    try {
      for await (const chunk of response.body) {
        length += chunk.byteLength;
        if (length > MAX_RESPONSE_BYTES) fail('The hub response exceeded the size limit.');
        chunks.push(chunk);
      }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      fail('The hub returned unreadable JSON.');
    }
    object(data, 'Hub response');
    return data;
  }

  pair(input) { return this.request('/api/bot/pair', { method: 'POST', body: validatePairInput(input), authenticated: false }); }
  heartbeat({ weeklyResearch = false } = {}) { return this.request('/api/bot/heartbeat', { method: 'POST', body: { version: 'native-grok-adapter/0.3.0', capabilities: ['source-backed-research', ...(weeklyResearch === true ? ['weekly-research-v1'] : [])] } }); }
  inbox({ weeklyResearch = false } = {}) { return this.request('/api/bot/inbox', { weeklyResearch }); }
  submit(taskId, input) { return this.request(`/api/bot/tasks/${validateIdentifier(taskId, 'Task ID')}/result`, { method: 'POST', body: validateResult(input) }); }
}

export function redact(value, secrets = []) {
  const serialized = JSON.stringify(value, (key, item) => /token|secret|password|authorization|cookie|pairingCode/i.test(key) ? '[REDACTED]' : item, 2);
  return secrets.filter(secret => typeof secret === 'string' && secret.length > 0).reduce((text, secret) => text.split(secret).join('[REDACTED]'), serialized);
}
