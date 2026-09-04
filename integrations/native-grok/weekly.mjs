import { mkdir, open, lstat, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AdapterError, normalizeHubUrl, validateIdentifier, validateResult } from './client.mjs';

export const WEEKLY_CAPABILITY = 'weekly-research-v1';
export const WEEKLY_HEADINGS = ['Changes', 'Uncertainty', 'Owner relevance', 'Counterarguments', 'Proposed next experiment', 'Previous-decision update'];
const MAX_WEEKLY_BYTES = 100000;
const MAX_STATE_BYTES = 64000;

function fail(message) { throw new AdapterError(message); }
function shape(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unsupported fields.`);
}
function text(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail(`${label} has an invalid length.`);
}
function timestamp(value, label) {
  if (typeof value !== 'string' || value.length > 50 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label} must be an ISO timestamp.`);
}
function boundedCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 20) fail(`${label} must be between 0 and 20.`);
}

export function weeklySourceUrl(value) {
  text(value, 1, 2048, 'Weekly source URL');
  if (/[\s\u0000-\u001f\u007f\\]/u.test(value) || !value.startsWith('https://')) fail('Weekly sources require clean absolute public HTTPS URLs.');
  let url;
  try { url = new URL(value); } catch { fail('Weekly source URL is malformed.'); }
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.length > 253 || host.endsWith('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.includes(':') || /^[\d.]+$/.test(host) || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || url.href.length > 2048) fail('Weekly sources require public HTTPS DNS names without credentials or local addresses.');
  return url;
}

export function validateApprovedOrigins(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 23) fail('Weekly research needs 1–23 approved HTTPS origins.');
  const origins = new Set();
  for (const item of value) {
    const url = weeklySourceUrl(item);
    if (item !== url.origin || origins.has(item)) fail('Approved origins must be unique canonical HTTPS origins, with no paths, queries, fragments, or trailing slash.');
    origins.add(item);
  }
  return origins;
}

export function validateWeeklyContext(value) {
  shape(value, ['schemaVersion', 'offer', 'buyer', 'products', 'seedUrls', 'approvedOrigins', 'priorReview'], 'Weekly research context');
  if (value.schemaVersion !== 1 || Buffer.byteLength(JSON.stringify(value)) > MAX_WEEKLY_BYTES) fail('Weekly research context uses an unsupported schema or exceeds its size limit.');
  text(value.offer, 1, 1000, 'Offer');
  text(value.buyer, 1, 1000, 'Buyer');
  if (!Array.isArray(value.products) || value.products.length > 3) fail('Weekly research supports at most three products.');
  if (!Array.isArray(value.seedUrls) || value.seedUrls.length < 1 || value.seedUrls.length > 20) fail('Weekly research needs 1–20 seed URLs.');
  const approved = validateApprovedOrigins(value.approvedOrigins);
  const selected = new Set();
  for (const product of value.products) {
    shape(product, ['name', 'url'], 'Product');
    text(product.name, 1, 100, 'Product name');
    selected.add(weeklySourceUrl(product.url).origin);
  }
  const seeds = new Set();
  for (const seed of value.seedUrls) {
    const url = weeklySourceUrl(seed);
    if (seeds.has(url.href)) fail('Weekly research contains duplicate seed URLs.');
    seeds.add(url.href);
    selected.add(url.origin);
  }
  if (selected.size !== approved.size || [...selected].some(origin => !approved.has(origin))) fail('Approved origins must exactly match the owner-selected product and seed websites.');
  if (value.priorReview !== null) {
    const prior = value.priorReview;
    shape(prior, ['id', 'version', 'decision', 'usefulness', 'rationale', 'nextReviewAt', 'createdAt', 'availableEvidenceCount', 'unavailableEvidenceCount'], 'Prior review');
    validateIdentifier(prior.id, 'Prior review ID');
    if (!Number.isSafeInteger(prior.version) || prior.version < 1) fail('Prior review version must be positive.');
    if (!['test', 'watch', 'stop'].includes(prior.decision) || !['useful', 'partly_useful', 'not_useful', 'not_assessed'].includes(prior.usefulness)) fail('Prior review uses an unsupported decision or usefulness value.');
    text(prior.rationale, 1, 4000, 'Prior review rationale');
    timestamp(prior.createdAt, 'Prior review creation date');
    if (prior.nextReviewAt !== null) timestamp(prior.nextReviewAt, 'Prior review next date');
    boundedCount(prior.availableEvidenceCount, 'Available evidence count');
    boundedCount(prior.unavailableEvidenceCount, 'Unavailable evidence count');
    if (prior.availableEvidenceCount + prior.unavailableEvidenceCount > 20) fail('Prior review evidence counts exceed the limit.');
  }
  return value;
}

export function validateWeeklySources(result, approvedOrigins) {
  validateResult(result);
  const approved = validateApprovedOrigins(approvedOrigins);
  for (const source of result.contribution.sources) if (!approved.has(weeklySourceUrl(source.url).origin)) fail('A result citation is outside this lease’s owner-approved website origins. Start a new owner-approved mission to expand scope.');
  return result;
}

async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('Weekly research state needs a regular private directory (0700 on POSIX).');
}

async function readState(path) {
  try {
    const parent = await lstat(dirname(path));
    if (!parent.isDirectory() || parent.isSymbolicLink() || (process.platform !== 'win32' && (parent.mode & 0o077))) fail('Weekly research state needs a regular private directory (0700 on POSIX).');
  } catch (error) { if (error.code === 'ENOENT') return null; if (error instanceof AdapterError) throw error; fail('Could not inspect the weekly research state directory.'); }
  let stat;
  try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; fail('Could not read weekly research state.'); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('Weekly research state must be a small regular private file (0600 on POSIX).');
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail('Weekly research state contains invalid JSON.'); }
}

async function writeState(path, value) {
  await directory(dirname(path));
  try {
    const current = await lstat(path);
    if (!current.isFile() || current.isSymbolicLink()) fail('Refusing to replace non-regular weekly research state.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(dirname(path), `.weekly-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } finally { await handle?.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}

export async function withWeeklyLock(stateDirectory, callback) {
  await directory(stateDirectory);
  const file = join(stateDirectory, '.weekly.lock');
  let handle;
  try { handle = await open(file, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') fail('Weekly research state is locked. Wait for the current process; after a crash, verify its hub outcome before removing .weekly.lock.');
    fail('Could not lock weekly research state.');
  }
  try { return await callback(); } finally { await handle.close().catch(() => {}); await unlink(file).catch(() => {}); }
}

export async function loadWeeklyConfiguration(stateDirectory, identity, allowLocalHttp = false) {
  const value = await readState(join(stateDirectory, 'weekly-research.json'));
  if (value === null) return false;
  shape(value, ['schemaVersion', 'capability', 'enabled', 'ownerApproved', 'hubUrl', 'botId'], 'Weekly research configuration');
  if (value.schemaVersion !== 1 || value.capability !== WEEKLY_CAPABILITY || typeof value.enabled !== 'boolean' || typeof value.ownerApproved !== 'boolean') fail('Weekly research configuration is unsupported.');
  const hubUrl = normalizeHubUrl(value.hubUrl, allowLocalHttp);
  validateIdentifier(value.botId, 'Configured Bot ID');
  if (!identity || hubUrl !== identity.hubUrl || value.botId !== identity.botId) fail('Weekly research configuration belongs to a different hub or Bot identity. Use the existing approved paired state directory.');
  if (value.enabled && !value.ownerApproved) fail('Weekly research requires explicit owner approval of the native profile and routine.');
  return value.enabled;
}

export async function configureWeeklyResearch(stateDirectory, identity, enabled, ownerApproved) {
  if (!identity) fail('Weekly research requires an existing locally paired Bot identity. Keep its credentials.json and use that state directory.');
  if (enabled && ownerApproved !== true) fail('Enable requires --owner-approved after the owner approves the updated native profile and routine.');
  await writeState(join(stateDirectory, 'weekly-research.json'), { schemaVersion: 1, capability: WEEKLY_CAPABILITY, enabled, ownerApproved: enabled && ownerApproved === true, hubUrl: identity.hubUrl, botId: identity.botId });
}

function scopeFile(stateDirectory, taskId) { return join(stateDirectory, 'lease-scopes', `${validateIdentifier(taskId, 'Task ID')}.json`); }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export async function loadLeaseScope(stateDirectory, taskId, identity) {
  const value = await readState(scopeFile(stateDirectory, taskId));
  if (value === null) return null;
  shape(value, ['schemaVersion', 'hubUrl', 'botId', 'taskId', 'attemptId', 'leaseExpiresAt', 'weeklyContextHash', 'approvedOrigins', 'submission'], 'Saved lease scope');
  if (value.schemaVersion !== 1 || !identity || value.hubUrl !== identity.hubUrl || value.botId !== identity.botId || value.taskId !== taskId) fail('Saved lease scope does not match this hub, Bot, or task.');
  validateIdentifier(value.attemptId, 'Saved attempt ID');
  timestamp(value.leaseExpiresAt, 'Saved lease expiry');
  if (value.weeklyContextHash === null) { if (value.approvedOrigins !== null) fail('Legacy lease scope contains unexpected weekly permissions.'); }
  else {
    if (!/^[a-f0-9]{64}$/.test(value.weeklyContextHash)) fail('Saved weekly context hash is invalid.');
    validateApprovedOrigins(value.approvedOrigins);
  }
  if (value.submission !== null) {
    shape(value.submission, ['idempotencyKey', 'resultHash'], 'Saved submission');
    validateIdentifier(value.submission.idempotencyKey, 'Saved result key');
    if (!/^[a-f0-9]{64}$/.test(value.submission.resultHash)) fail('Saved result hash is invalid.');
  }
  return value;
}

export async function saveLeaseScope(stateDirectory, task, identity) {
  if (!identity) fail('Cannot store a negotiated lease without the paired Bot identity.');
  const weekly = task.weeklyContext === undefined ? null : validateWeeklyContext(task.weeklyContext);
  const next = { schemaVersion: 1, hubUrl: identity.hubUrl, botId: identity.botId, taskId: task.id, attemptId: task.attemptId, leaseExpiresAt: task.leaseExpiresAt, weeklyContextHash: weekly === null ? null : digest(weekly), approvedOrigins: weekly?.approvedOrigins ?? null, submission: null };
  const previous = await loadLeaseScope(stateDirectory, task.id, identity);
  if (previous?.attemptId === task.attemptId) {
    if (previous.weeklyContextHash !== next.weeklyContextHash || JSON.stringify(previous.approvedOrigins) !== JSON.stringify(next.approvedOrigins)) fail('The hub changed an immutable lease scope for the same attempt.');
    next.submission = previous.submission;
  }
  await writeState(scopeFile(stateDirectory, task.id), next);
}

export async function pinSubmission(stateDirectory, taskId, result, identity, weeklyEnabled) {
  validateResult(result);
  const scope = await loadLeaseScope(stateDirectory, taskId, identity);
  if (!scope) {
    if (weeklyEnabled) fail('No saved lease scope. Retrieve this Bot’s assigned task with inbox before submitting.');
    return; // Preserve legacy submission behavior when weekly support was never enabled.
  }
  if (scope.attemptId !== result.attemptId) fail('Result attempt does not match the current saved lease. Retrieve a fresh assignment; do not reuse an old result.');
  if (scope.weeklyContextHash !== null) {
    if (!weeklyEnabled) fail('Weekly research is disabled for this Bot. Restore owner approval before submitting weekly work.');
    validateWeeklySources(result, scope.approvedOrigins);
  }
  const submission = { idempotencyKey: result.idempotencyKey, resultHash: digest(result) };
  if (scope.submission !== null && (scope.submission.idempotencyKey !== submission.idempotencyKey || scope.submission.resultHash !== submission.resultHash)) fail('This attempt already has a submitted or uncertain result. Retry the identical file and idempotency key.');
  if (scope.submission === null && Date.parse(scope.leaseExpiresAt) <= Date.now()) fail('The saved lease expired before submission. Retrieve a fresh assignment.');
  scope.submission = submission;
  await writeState(scopeFile(stateDirectory, taskId), scope);
}
