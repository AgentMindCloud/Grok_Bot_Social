import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:18080';
let session;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const response = await fetch(origin + '/api/session', { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200);
    session = await response.json();
    break;
  } catch (error) {
    if (attempt === 19) throw error;
    await setTimeout(500);
  }
}
assert.equal(session.authenticated, false);
assert.equal(session.localLoginEnabled, false);
assert.equal(session.githubLoginEnabled, true);
const local = await fetch(origin + '/api/auth/local', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://hub.example.com' }, body: '{}' });
assert.equal(local.status, 404);
for (const path of ['/', '/workspace/', '/bots/', '/knowledge/']) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /GrokBot Social/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}
console.log('Caddy serves the static site and production API; developer sign-in is disabled.');
