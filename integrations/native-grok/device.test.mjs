import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { HubClient, HubRateLimitError, storeConnectionState, loadCredentials } from './client.mjs';
import { runCli } from './cli.mjs';

const BOT = { id: 'device-test-bot', name: 'Device scout', role: 'scout', runtime: 'native-grok', status: 'active', trustLabel: 'owner-paired' };
const HUB = 'https://grokbotsocial.example';
const DEVICE_SECRET = 'D'.repeat(43);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const digest = value => createHash('sha256').update(value).digest('hex');
async function temporary(t) { const dir = await mkdtemp(join(tmpdir(), 'device-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
function harness(directory, changes = {}) {
  const output = [], errors = [], calls = [], waits = [];
  let now = Date.now(), request, candidateHash;
  const io = {
    stdout: value => output.push(value), stderr: value => errors.push(value), now: () => now, random: () => 0,
    sleep: async ms => { waits.push(ms); now += ms; },
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path, body, headers: options.headers });
      if (changes.fetch) { const result = await changes.fetch({ path, body, options, now, request, calls }); if (result) return result; }
      if (path.endsWith('/start')) {
        const stored = JSON.parse(await readFile(join(directory, 'device-connection.json'), 'utf8'));
        assert.equal(body.tokenHash, digest(stored.candidateToken));
        assert.equal(options.headers.Authorization, undefined);
        candidateHash = body.tokenHash;
        request = { enrollmentId: 'device-enrollment-1', deviceSecret: DEVICE_SECRET, userCode: 'ABCD-2345', verificationUrl: `${HUB}/connect/`, expiresAt: new Date(now + 600000).toISOString(), interval: 5, version: 1 };
        return json(request);
      }
      if (path.endsWith('/poll')) return json({ ...request, deviceSecret: undefined, userCode: undefined, status: changes.status || 'approved', botId: BOT.id, reconnectBotId: changes.reconnect ? BOT.id : null, name: BOT.name, role: BOT.role, runtime: BOT.runtime, adapterVersion: 'native-grok-adapter/0.3.0' });
      if (path.endsWith('/complete')) {
        const creds = await loadCredentials(join(directory, 'credentials.json'));
        assert.equal(creds.token, body.candidateToken, 'final credentials must be durably stored before activation');
        if (candidateHash) assert.equal(digest(body.candidateToken), candidateHash);
        return json({ ok: true, replayed: false, bot: BOT });
      }
      if (path.endsWith('/cancel')) return json({ ok: true, status: 'cancelled' });
      if (path.endsWith('/heartbeat')) return json({ ok: true, bot: BOT, serverTime: new Date(now).toISOString() });
      throw new Error('Unexpected API');
    }, ...changes.io,
  };
  return { io, output, errors, calls, waits };
}
const command = ['connect', '--url', HUB, '--name', BOT.name];

test('connect saves candidate before start, final credentials before complete, then only heartbeats; output has no secrets', async t => {
  const directory = await temporary(t), h = harness(directory);
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 0, h.errors.join(''));
  assert.deepEqual(h.calls.map(c => c.path), ['/api/bot/device/start', '/api/bot/device/poll', '/api/bot/device/complete', '/api/bot/heartbeat']);
  const saved = await loadCredentials(join(directory, 'credentials.json'));
  assert.equal(h.output.join('').includes(saved.token), false);
  assert.equal(h.output.join('').includes(DEVICE_SECRET), false);
  assert.equal(h.output.join('').includes('ABCD-2345'), true);
  assert.equal(h.output.join('').includes('"researchStarted": false'), true);
  await assert.rejects(readFile(join(directory, 'device-connection.json')), { code: 'ENOENT' });
  if (process.platform !== 'win32') assert.equal((await stat(join(directory, 'credentials.json'))).mode & 0o777, 0o600);
});

test('storage failure before final credentials blocks activation and a retry completes the same enrollment', async t => {
  const directory = await temporary(t);
  let failed = false;
  const h = harness(directory, { io: { storeCredentials: async (file, data) => { if (file.endsWith('credentials.json') && !failed) { failed = true; throw new Error('disk failure'); } await storeConnectionState(file, data); } } });
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 1);
  assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false);
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 0, h.errors.join(''));
  assert.equal(h.calls.filter(c => c.path.endsWith('/start')).length, 1);
  assert.equal(h.calls.filter(c => c.path.endsWith('/complete')).length, 1);
});

test('lost completion response retries the same candidate and Bot without another start', async t => {
  const directory = await temporary(t);
  let lost = false;
  const h = harness(directory, { fetch: ({ path }) => { if (path.endsWith('/complete') && !lost) { lost = true; throw new Error('response lost'); } } });
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 1);
  const before = await loadCredentials(join(directory, 'credentials.json'));
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 0, h.errors.join(''));
  assert.deepEqual(await loadCredentials(join(directory, 'credentials.json')), before);
  assert.equal(h.calls.filter(c => c.path.endsWith('/start')).length, 1);
  assert.equal(h.calls.filter(c => c.path.endsWith('/complete')).length, 2);
});

test('denied request never activates or leases and can be cancelled locally', async t => {
  const directory = await temporary(t), h = harness(directory, { status: 'denied' });
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 1);
  assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false);
  assert.equal(await loadCredentials(join(directory, 'credentials.json')), null);
  assert.equal(await runCli(['connect-cancel'], { GROK_HUB_STATE_DIR: directory }, h.io), 0);
});

test('reconnect keeps exact Bot ID and never sends previous token to the new origin', async t => {
  const directory = await temporary(t), oldToken = 'gbs_old_test_credential_1234567890123456789';
  await storeConnectionState(join(directory, 'credentials.json'), { hubUrl: 'https://old.example', token: oldToken, botId: BOT.id });
  const h = harness(directory, { reconnect: true });
  assert.equal(await runCli([...command, '--reconnect'], { GROK_HUB_STATE_DIR: directory }, h.io), 0, h.errors.join(''));
  assert.equal(JSON.stringify(h.calls).includes(oldToken), false);
  assert.equal((await loadCredentials(join(directory, 'credentials.json'))).botId, BOT.id);
});

test('verification redirects and changed approval metadata stop before credential activation', async t => {
  const directory = await temporary(t);
  const h = harness(directory, { fetch: ({ path, request }) => path.endsWith('/poll') ? json({ ...request, status: 'approved', botId: BOT.id, name: 'Changed', role: 'scout', runtime: 'native-grok', adapterVersion: 'native-grok-adapter/0.3.0' }) : undefined });
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 1);
  assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false);
  const client = new HubClient({ hubUrl: HUB, fetchImpl: async () => new Response('', { status: 307, headers: { location: 'https://evil.example' } }) });
  await assert.rejects(client.request('/api/bot/device/start', { method: 'POST', authenticated: false, body: {} }), /redirect blocked/);
});

test('429 respects Retry-After, retries once and refuses a long unbounded wait', async () => {
  const waits = []; let calls = 0;
  const client = new HubClient({ hubUrl: HUB, sleep: async ms => waits.push(ms), fetchImpl: async () => { calls++; return json({ error: 'capacity' }, 429, { 'retry-after': '7' }); } });
  await assert.rejects(client.request('/api/bot/device/poll', { method: 'POST', body: {}, authenticated: false }), HubRateLimitError);
  assert.equal(calls, 2); assert.deepEqual(waits, [7000]);
  const long = new HubClient({ hubUrl: HUB, sleep: async () => assert.fail('must not sleep'), fetchImpl: async () => json({}, 429, { 'retry-after': '3600' }) });
  await assert.rejects(long.request('/api/bot/device/poll', { method: 'POST', body: {}, authenticated: false }), error => error.retryAfterMs === 3600000);
});

test('pending approval polls at least five seconds apart and expires within its bounded window', async t => {
  const directory = await temporary(t), h = harness(directory, { status: 'pending' });
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 1);
  assert.equal(h.calls.filter(c => c.path.endsWith('/poll')).length <= 120, true);
  assert.equal(h.waits.every(ms => ms >= 5000), true);
  assert.equal(h.waits.reduce((sum, ms) => sum + ms, 0) < 600000, true);
  assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false);
  assert.match(h.errors.join(''), /expired/);
});

test('request recovery storage failure cancels the unactivated server request and keeps secrets out of error output', async t => {
  const directory = await temporary(t);
  const h = harness(directory, { io: { storeCredentials: async (file, data) => { if (data.phase === 'requested') throw new Error(`disk failure ${DEVICE_SECRET}`); await storeConnectionState(file, data); } } });
  assert.equal(await runCli(command, { GROK_HUB_STATE_DIR: directory }, h.io), 1);
  assert.equal(h.calls.some(c => c.path.endsWith('/cancel')), true);
  assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false);
  assert.equal(h.errors.join('').includes(DEVICE_SECRET), false);
});
