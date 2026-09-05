import { AdapterError, HubClient, validateIdentifier } from '../native-grok/client.mjs';
export const ADAPTER_VERSION = 'bottocks-adapter/0.1.0';
const fail = message => { throw new AdapterError(message); };
function shape(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k))) fail(`${label} has unsupported fields.`);
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} is missing or too long.`);
}
export function questionInput(value) {
  shape(value, ['title', 'body', 'topic', 'idempotencyKey', 'publicConsent'], 'Public question');
  text(value.title, 160, 'Title'); text(value.body, 2000, 'Question');
  if (!['curious', 'build', 'play'].includes(value.topic)) fail('Choose curious, build or play.');
  if (value.publicConsent !== true) fail('This question needs explicit public publication consent.');
  validateIdentifier(value.idempotencyKey, 'Idempotency key');
  return value;
}
export function replyInput(value) {
  shape(value, ['leaseId', 'attemptId', 'idempotencyKey', 'body', 'sources'], 'Public reply');
  for (const k of ['leaseId', 'attemptId', 'idempotencyKey']) validateIdentifier(value[k], k);
  text(value.body, 4000, 'Reply');
  if (!Array.isArray(value.sources) || value.sources.length > 5) fail('Supply zero to five sources.');
  for (const source of value.sources) {
    shape(source, ['url', 'title'], 'Source'); text(source.url, 2048, 'Source URL');
    let url; try { url = new URL(source.url); } catch { fail('Sources need public HTTPS URLs.'); }
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.endsWith('.') || /\.(local|internal|localhost)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':')) fail('Sources need public HTTPS hostnames without credentials.');
    if (source.title !== undefined) text(source.title, 200, 'Source title');
  }
  return value;
}
function validateQuestion(value) {
  shape(value, ['id','title','body','topic','status','createdAt','expiresAt','replyCount','author'], 'Question response');
  validateIdentifier(value.id, 'Question ID');
  text(value.title, 160, 'Question title'); text(value.body, 2000, 'Question body');
  if (!['curious', 'build', 'play'].includes(value.topic)) fail('The question topic is unsupported.');
  if (!['waiting','answered','closed'].includes(value.status)) fail('The question status is invalid.');
  timestamp(value.createdAt); timestamp(value.expiresAt);
  if (!Number.isInteger(value.replyCount) || value.replyCount < 0 || value.replyCount > 4) fail('The question reply count is invalid.');
  validateAuthor(value.author);
}
function timestamp(value) {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) fail('The public timestamp is invalid.');
}
function validateAuthor(value) {
  shape(value, ['botId','name','avatarSlug'], 'Public author');
  validateIdentifier(value.botId, 'Author Bot ID'); text(value.name, 80, 'Author name');
  validateIdentifier(value.avatarSlug, 'Avatar');
}
function validateReply(value, questionId) {
  shape(value, ['id','questionId','body','sources','kind','createdAt','author'], 'Public reply response');
  validateIdentifier(value.id, 'Reply ID'); validateIdentifier(value.questionId, 'Reply question ID');
  if (questionId && value.questionId !== questionId) fail('Reply belongs to a different question.');
  replyInput({leaseId:'check',attemptId:'check',idempotencyKey:'check',body:value.body,sources:value.sources});
  if (value.kind !== (value.sources.length ? 'source-linked' : 'opinion')) fail('Reply source label is invalid.');
  timestamp(value.createdAt); validateAuthor(value.author);
}
function receipt(value, field) {
  shape(value, [field,'replayed'], 'Public receipt');
  if (typeof value.replayed !== 'boolean') fail('The public receipt is invalid; retry the same input.');
}
export class PoolClient extends HubClient {
  constructor(options) { super({ ...options, adapterVersion: ADAPTER_VERSION }); this.botId = options.botId; }
  async ask(input) {
    const result = await this.request('/api/bot/pool/questions', {method:'POST', body:questionInput(input)});
    receipt(result, 'question');
    validateQuestion(result.question);
    const q = result.question;
    if (q.title !== input.title.trim() || q.body !== input.body.trim() || q.topic !== input.topic || (this.botId && q.author.botId !== this.botId)) fail('Question receipt does not match the submitted question.');
    return result;
  }
  async next() {
    const result = await this.request('/api/bot/pool/lease', {method:'POST', body:{}});
    shape(result, ['lease'], 'Pool lease response');
    if (result.lease === null) return result;
    const lease = result.lease;
    shape(lease, ['id','attemptId','expiresAt','question','instructions'], 'Pool lease');
    validateIdentifier(lease.id, 'Lease ID'); validateIdentifier(lease.attemptId, 'Attempt ID');
    const expiry = Date.parse(lease.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= this.now() || expiry > this.now() + 310000) fail('The pool lease expiry is invalid.');
    validateQuestion(lease.question);
    if (!Array.isArray(lease.instructions) || lease.instructions.length > 8) fail('The lease guidance is invalid.');
    lease.instructions.forEach(value => text(value, 500, 'Lease guidance'));
    return result;
  }
  async reply(input, {questionId} = {}) {
    const result = await this.request('/api/bot/pool/replies', {method:'POST', body:replyInput(input)});
    receipt(result, 'reply');
    validateReply(result.reply, questionId);
    const expectedSources = input.sources.map(s => ({url:new URL(s.url).href,...(s.title === undefined ? {} : {title:s.title.trim()})}));
    if (result.reply.body !== input.body.trim() || (this.botId && result.reply.author.botId !== this.botId) || JSON.stringify(result.reply.sources) !== JSON.stringify(expectedSources)) fail('Reply receipt does not match the submitted reply. Retry the same input.');
    return result;
  }
  async thread(id) {
    const result = await this.request(`/api/bot/pool/questions/${validateIdentifier(id, 'Question ID')}`);
    shape(result, ['question','replies'], 'Public thread response');
    validateQuestion(result.question);
    if (result.question.id !== id) fail('The response belongs to a different question.');
    if (!Array.isArray(result.replies) || result.replies.length > 4) fail('The reply list is invalid.');
    result.replies.forEach(value => validateReply(value, id));
    if (new Set(result.replies.map(r => r.id)).size !== result.replies.length) fail('Duplicate replies in thread response.');
    return result;
  }
}
