import { lstat, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { AdapterError, HubClient, HubRateLimitError, loadCredentials, normalizeHubUrl, storeConnectionState, validateIdentifier, validatePairInput, validateToken, withPairingLock } from './client.mjs';

const VERSION = 'native-grok-adapter/0.3.0';
const fail = message => { throw new AdapterError(message); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

async function readState(path, allowLocalHttp) {
  let stat;
  try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; fail('Could not read connection recovery state.'); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384 || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('Connection recovery state must be a private, small regular file.');
  let state;
  try { state = JSON.parse(await readFile(path, 'utf8')); } catch { fail('Connection recovery state is unreadable.'); }
  if (!state || typeof state !== 'object' || state.version !== 1 || !['candidate', 'requested', 'stored'].includes(state.phase)) fail('Connection recovery state has an unsupported version.');
  state.adapterVersion ??= VERSION;
  if (![VERSION, 'bottocks-adapter/0.1.0'].includes(state.adapterVersion)) fail('Connection recovery adapter is unsupported.');
  state.hubUrl = normalizeHubUrl(state.hubUrl, allowLocalHttp);
  if (!/^gbs_[A-Za-z0-9_-]{43}$/.test(state.candidateToken)) fail('Connection recovery credential is invalid.');
  validatePairInput({ code: 'unused-code', name: state.name, role: state.role, runtime: state.runtime });
  if (state.request) validateRequest(state.request, state.hubUrl);
  if (state.previous) {
    normalizeHubUrl(state.previous.hubUrl, allowLocalHttp);
    validateToken(state.previous.token); validateIdentifier(state.previous.botId, 'Previous Bot ID');
  }
  return state;
}
function validateRequest(request, hubUrl) {
  if (!request || typeof request !== 'object' || request.version !== 1 || request.interval !== 5 || !timestamp(request.expiresAt)) fail('Invalid connection request response.');
  validateIdentifier(request.enrollmentId, 'Enrollment ID');
  if (typeof request.deviceSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(request.deviceSecret) || typeof request.userCode !== 'string' || !/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(request.userCode)) fail('Invalid connection verification response.');
  if (request.verificationUrl !== `${hubUrl}/connect/`) fail('The verification address did not match the approved hub.');
}
function validatePoll(value, state) {
  if (!value || typeof value !== 'object' || value.enrollmentId !== state.request.enrollmentId || value.version !== 1 || value.name !== state.name || value.role !== state.role || value.runtime !== state.runtime || value.adapterVersion !== state.adapterVersion || value.expiresAt !== state.request.expiresAt || !['pending', 'approved', 'completed', 'expired', 'denied', 'cancelled'].includes(value.status)) fail('Connection details changed unexpectedly. Start a new reviewed connection.');
  if (['approved', 'completed'].includes(value.status)) {
    validateIdentifier(value.botId, 'Approved Bot ID');
    if (state.previous && (value.reconnectBotId !== state.previous.botId || value.botId !== state.previous.botId)) fail('Choose Reconnect for this exact existing Bot in the browser.');
  }
}

// One exclusive local operation, at most ten minutes, with no task leasing.
export async function connectDevice({ stateDirectory, hubUrl: requestedUrl, name, role = 'scout', runtime = 'native-grok', allowLocalHttp = false, reconnect = false, io = {}, secrets = [], adapterVersion = VERSION }) {
  if (![VERSION, 'bottocks-adapter/0.1.0'].includes(adapterVersion)) fail('Unsupported adapter version.');
  if (typeof name === 'string') name = name.trim();
  const stateFile = join(stateDirectory, 'credentials.json');
  const recoveryFile = join(stateDirectory, 'device-connection.json');
  const now = io.now || Date.now;
  const sleep = io.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const save = io.storeCredentials || storeConnectionState;
  const emit = io.onProgress || (() => {});
  return withPairingLock(stateFile, async () => {
    let state = await readState(recoveryFile, allowLocalHttp);
    if (state) {
      secrets.push(state.candidateToken, state.request?.deviceSecret, state.previous?.token);
      if (requestedUrl && normalizeHubUrl(requestedUrl, allowLocalHttp) !== state.hubUrl) fail('Resume the saved connection on its approved origin before changing hubs.');
      if ((name && name !== state.name) || role !== state.role || runtime !== state.runtime) fail('Resume with the original connection name, role and runtime.');
      if (state.adapterVersion !== adapterVersion) fail('Resume with the original adapter before changing versions.');
    } else {
      const hubUrl = normalizeHubUrl(requestedUrl, allowLocalHttp);
      validatePairInput({ code: 'unused-code', name, role, runtime });
      const previous = await loadCredentials(stateFile, allowLocalHttp);
      if (previous && !reconnect) fail('This directory is connected. Use connect --reconnect to rotate credentials for the same existing Bot.');
      const candidateToken = `gbs_${randomBytes(32).toString('base64url')}`;
      secrets.push(candidateToken, previous?.token);
      state = { version: 1, phase: 'candidate', hubUrl, candidateToken, name, role, runtime, previous, adapterVersion };
      // Candidate must be durably present before a request can be approved remotely.
      await save(recoveryFile, state);
    }
    const client = new HubClient({ hubUrl: state.hubUrl, allowLocalHttp, fetchImpl: io.fetchImpl, sleep, now, adapterVersion });
    if (!state.request) {
      const request = await client.request('/api/bot/device/start', { method: 'POST', authenticated: false, body: { tokenHash: sha256(state.candidateToken), name: state.name, role: state.role, runtime: state.runtime, adapterVersion } });
      secrets.push(request.deviceSecret);
      validateRequest(request, state.hubUrl);
      if (Date.parse(request.expiresAt) > now() + 610_000 || Date.parse(request.expiresAt) <= now()) fail('Connection request expiry is outside the allowed window.');
      state = { ...state, request, phase: 'requested' };
      try { await save(recoveryFile, state); }
      catch (error) {
        await client.request('/api/bot/device/cancel', { method: 'POST', authenticated: false, body: { enrollmentId: request.enrollmentId, deviceSecret: request.deviceSecret } }).catch(() => {});
        throw error;
      }
    }
    const { enrollmentId, deviceSecret, expiresAt } = state.request;
    const proof = { enrollmentId, deviceSecret };
    emit({ action: 'Approve this connection in your browser', verificationUrl: state.request.verificationUrl, userCode: state.request.userCode, botName: state.name, role: state.role, runtime: state.runtime, expiresAt, reconnect: !!state.previous, note: 'Only approve if you just started this request. Connection does not start research or create a routine.' });
    const deadline = Math.min(Date.parse(expiresAt), now() + 600_000);
    let poll;
    let attempts = 0;
    while (attempts++ < 121) {
      if (state.phase === 'stored') break; // Lost completion response: retry the same proof first, even after expiry.
      if (now() >= deadline) fail('The connection request expired. No new credential was activated. Use connect-cancel, then start a new request.');
      try {
        poll = await client.request('/api/bot/device/poll', { method: 'POST', authenticated: false, body: proof, retry429: false });
      } catch (error) {
        if (!(error instanceof HubRateLimitError)) throw error;
        if (now() + error.retryAfterMs >= deadline) throw error;
        await sleep(error.retryAfterMs);
        continue;
      }
      validatePoll(poll, state);
      if (['denied', 'cancelled', 'expired'].includes(poll.status)) fail(`Connection ${poll.status}. No new credential was activated. Use connect-cancel before starting again.`);
      if (['approved', 'completed'].includes(poll.status)) break;
      const delay = 5000 + Math.floor((io.random || Math.random)() * 350);
      if (now() + delay >= deadline) fail('The connection request expired before approval. Use connect-cancel before starting again.');
      await sleep(delay);
    }
    if (state.phase !== 'stored') {
      if (!poll || !['approved', 'completed'].includes(poll.status)) fail('Connection wait limit reached. Resume with the same command.');
      // Recoverable write-ahead marker includes only the final public Bot ID.
      state = { ...state, phase: 'stored', botId: poll.botId };
      await save(recoveryFile, state);
    }
    validateIdentifier(state.botId, 'Approved Bot ID');
    const credentials = { hubUrl: state.hubUrl, token: state.candidateToken, botId: state.botId };
    // Always retry this durable write before complete. A storage failure cannot activate.
    await save(stateFile, credentials);
    const complete = await client.request('/api/bot/device/complete', { method: 'POST', authenticated: false, body: { ...proof, candidateToken: state.candidateToken } });
    if (complete.ok !== true || complete.bot?.id !== state.botId) fail('Connection receipt is uncertain. Resume with the same command to recover it.');
    if (complete.bot.status === 'paused') {
      await unlink(recoveryFile).catch(() => {});
      return { connected: true, bot: { id: state.botId, name: state.name, role: state.role, runtime: state.runtime, status: 'paused' }, checkInConfirmed: false, notice: 'Credentials were reconnected. Resume this paused Bot in your workspace, then run status to confirm its check-in.', runtimeAttestation: 'owner-declared', researchStarted: false, routineCreated: false };
    }
    const authenticated = new HubClient({ hubUrl: state.hubUrl, token: state.candidateToken, allowLocalHttp, fetchImpl: io.fetchImpl, sleep, now, adapterVersion });
    const heartbeat = await authenticated.heartbeat();
    if (heartbeat.ok !== true || heartbeat.bot?.id !== state.botId || !timestamp(heartbeat.serverTime)) fail('Credential activation succeeded but check-in is unconfirmed. Resume with the same command.');
    await unlink(recoveryFile).catch(() => {});
    return { connected: true, bot: Object.fromEntries(['id', 'name', 'role', 'runtime', 'status', 'trustLabel', 'credentialScope'].map(key => [key, heartbeat.bot[key]])), serverTime: heartbeat.serverTime, credential: 'Scoped credential stored locally; never printed.', runtimeAttestation: 'owner-declared', researchStarted: false, routineCreated: false };
  });
}

export async function cancelDevice({ stateDirectory, allowLocalHttp = false, io = {}, secrets = [] }) {
  const stateFile = join(stateDirectory, 'credentials.json');
  const recoveryFile = join(stateDirectory, 'device-connection.json');
  return withPairingLock(stateFile, async () => {
    const state = await readState(recoveryFile, allowLocalHttp);
    if (!state) return { cancelled: true, message: 'No pending local connection request.' };
    secrets.push(state.candidateToken, state.request?.deviceSecret, state.previous?.token);
    if (state.request) {
      const client = new HubClient({ hubUrl: state.hubUrl, allowLocalHttp, fetchImpl: io.fetchImpl, sleep: io.sleep, now: io.now });
      await client.request('/api/bot/device/cancel', { method: 'POST', authenticated: false, body: { enrollmentId: state.request.enrollmentId, deviceSecret: state.request.deviceSecret } });
    }
    // Remote cancellation has ruled out activation. Restore only this operation's file.
    const current = await loadCredentials(stateFile, allowLocalHttp);
    if (current?.token === state.candidateToken) {
      if (state.previous) await (io.storeCredentials || storeConnectionState)(stateFile, state.previous);
      else await unlink(stateFile);
    }
    await unlink(recoveryFile);
    return { cancelled: true, message: 'Pending connection cancelled; any previous local credential was preserved.' };
  });
}
