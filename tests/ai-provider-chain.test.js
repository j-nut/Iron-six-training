const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadApiSource, libSource } = require('./helpers/load-api.js');

function response(status, body, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: name => headers[String(name).toLowerCase()] ?? null }, async json() { return body; } };
}
const plain = value => JSON.parse(JSON.stringify(value));
const completion = (content, finish = 'stop') => ({ choices: [{ finish_reason: finish, message: { content } }] });
const ALL_KEYS = { GROQ_API_KEY: 'g', CEREBRAS_API_KEY: 'c', CLOUDFLARE_ACCOUNT_ID: 'acct 1', CLOUDFLARE_API_TOKEN: 'cf', OPENROUTER_API_KEY: 'o' };

function chatContext(env, fetchImpl) {
  const ctx = { process: { env }, console: { warn() {}, error() {} }, fetch: fetchImpl };
  vm.createContext(ctx);
  vm.runInContext(libSource('ai-chat.js') + '\nthis.lib={aiChat,aiProviders,aiConfigured};', ctx);
  return ctx.lib;
}

test('only configured providers join the chain, in free-allowance order', () => {
  const lib = chatContext(ALL_KEYS, async () => response(200, completion('x')));
  assert.deepEqual(plain(lib.aiProviders(ALL_KEYS).map(p => p.id)), ['groq', 'cerebras', 'cloudflare', 'openrouter', 'groq-overflow']);
  assert.deepEqual(plain(lib.aiProviders({ GROQ_API_KEY: 'g' }).map(p => p.id)), ['groq', 'groq-overflow'], 'Groq-only keeps the original two-model behaviour');
  assert.deepEqual(plain(lib.aiProviders({ CLOUDFLARE_ACCOUNT_ID: 'a' }).map(p => p.id)), [], 'Cloudflare needs both its account id and token');
  assert.equal(lib.aiConfigured({}), false);
  assert.match(lib.aiProviders(ALL_KEYS)[2].url, /accounts\/acct%201\/ai\/v1\/chat\/completions$/);
});

test('a rate-limited, failing, empty or hung provider hands off to the next one', async () => {
  const seen = [];
  const lib = chatContext(ALL_KEYS, async (url, init) => {
    const body = JSON.parse(init.body); seen.push({ url, body, auth: init.headers.Authorization });
    if (url.includes('groq')) return response(429, { error: { message: 'limit' } }, { 'retry-after': '7' });
    if (url.includes('cerebras')) return response(200, completion('   '));
    if (url.includes('cloudflare')) throw new Error('socket hang up');
    return response(200, completion('OpenRouter answer'));
  });
  const result = await lib.aiChat({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 300 });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.content, 'OpenRouter answer');
  assert.deepEqual(plain(result.attempts.map(a => a.provider)), ['groq', 'cerebras', 'cloudflare', 'openrouter']);
  assert.equal(seen[0].body.max_completion_tokens, 300);
  assert.equal(seen[0].body.reasoning_effort, 'low');
  assert.equal(seen[1].body.model, 'gpt-oss-120b');
  assert.equal(seen[1].body.reasoning_effort, 'low');
  assert.equal(seen[1].auth, 'Bearer c', 'each provider receives only its own key');
  assert.equal(seen[2].body.max_tokens, 300);
  assert.equal('reasoning_effort' in seen[2].body, false);
});

test('Cerebras retries once without optional parameters after a 400', async () => {
  const bodies = [];
  const lib = chatContext({ CEREBRAS_API_KEY: 'c' }, async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    return 'reasoning_effort' in body ? response(400, { error: { message: 'unknown field' } }) : response(200, completion('{"factor":1}'));
  });
  const result = await lib.aiChat({ messages: [], json: true });
  assert.equal(result.ok, true);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
  assert.equal('response_format' in bodies[1], false);
});

test('when every provider is rate-limited the caller learns it, with the retry hint', async () => {
  const lib = chatContext(ALL_KEYS, async () => response(429, {}, { 'retry-after': '12' }));
  const result = await lib.aiChat({ messages: [] });
  assert.equal(result.ok, false);
  assert.equal(result.rateLimited, true);
  assert.equal(result.retryAfter, '12');
  assert.equal(result.attempts.length, 5);
});

function guardContext(fetchImpl) {
  const ctx = { process: { env: {} }, fetch: fetchImpl, Date };
  vm.createContext(ctx);
  vm.runInContext(libSource('ai-guard.js') + '\nthis.lib={aiGuard,aiCompact,AI_LIMITS};', ctx);
  return ctx.lib;
}
const req = (headers, body = {}) => ({ headers, body });

test('guests are limited per network address, before any provider is called', async () => {
  const lib = guardContext(async () => { throw new Error('guests must not reach Supabase'); });
  const [burst] = lib.AI_LIMITS.coach.guest;
  for (let i = 0; i < burst; i++) assert.equal((await lib.aiGuard(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), 'coach')).allowed, true);
  const blocked = await lib.aiGuard(req({ 'x-forwarded-for': '203.0.113.9' }), 'coach');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'rate_limited');
  assert.equal((await lib.aiGuard(req({ 'x-forwarded-for': '198.51.100.4' }), 'coach')).allowed, true, 'another address keeps its own allowance');
  assert.equal((await lib.aiGuard(req({ 'x-forwarded-for': '203.0.113.9' }), 'review')).allowed, true, 'routes have separate allowances');
});

test('signed-in users are limited durably by the Supabase function using their own token', async () => {
  const calls = [];
  let allow = true;
  const lib = guardContext(async (url, init) => { calls.push({ url, init }); return response(200, allow); });
  const token = 'a'.repeat(60);
  const ok = await lib.aiGuard(req({ authorization: `Bearer ${token}` }), 'coach');
  assert.deepEqual({ ...ok }, { allowed: true, identity: 'user', reason: undefined });
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/ai_rate_hit$/);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_route: 'coach', p_burst_limit: 20, p_daily_limit: 150 });
  allow = false;
  const denied = await lib.aiGuard(req({ authorization: `Bearer ${token}` }), 'coach');
  assert.equal(denied.allowed, false);
  assert.equal(denied.identity, 'user');
});

test('an invalid token is treated as a guest, and a missing migration falls back to verified in-memory limits', async () => {
  const invalid = guardContext(async () => response(401, { message: 'JWT expired' }));
  const asGuest = await invalid.aiGuard(req({ authorization: `Bearer ${'b'.repeat(60)}`, 'x-forwarded-for': '192.0.2.1' }), 'coach');
  assert.equal(asGuest.identity, 'guest');
  assert.equal(asGuest.allowed, true);

  let userLookups = 0;
  const noMigration = guardContext(async url => {
    if (url.includes('/rpc/')) return response(404, { code: 'PGRST202' });
    userLookups++; return response(200, { id: 'user-123' });
  });
  const headers = { authorization: `Bearer ${'c'.repeat(60)}` };
  const [burst] = noMigration.AI_LIMITS.review.user;
  for (let i = 0; i < burst; i++) assert.equal((await noMigration.aiGuard(req(headers), 'review')).allowed, true);
  const blocked = await noMigration.aiGuard(req(headers), 'review');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.identity, 'user');
  assert.equal(userLookups, 1, 'a verified token is cached instead of re-checked on every request');
});

test('oversized bodies are refused and arbitrary client JSON is bounded before prompting', async () => {
  const lib = guardContext(async () => response(200, true));
  const big = await lib.aiGuard(req({}, { blob: 'x'.repeat(130000) }), 'coach');
  assert.equal(big.reason, 'too_large');
  const compact = lib.aiCompact({ text: 'y'.repeat(1000), list: Array.from({ length: 50 }, (_, i) => i), deep: { a: { b: { c: { d: { e: { f: 1 } } } } } } });
  assert.equal(compact.text.length, 300);
  assert.equal(compact.list.length, 12);
  assert.equal(compact.deep.a.b.c.d, null, 'nesting is cut off at five levels');
});

test('the Coach endpoint answers over-limit users without calling any provider', async () => {
  let providerCalls = 0;
  const ctx = { process: { env: { GROQ_API_KEY: 'g' } }, console: { warn() {}, error() {} }, Date, fetch: async () => { providerCalls++; return response(200, completion('should not run')); } };
  vm.createContext(ctx);
  vm.runInContext(loadApiSource('api/coach.js') + '\nthis.handler=handler;', ctx);
  const makeRes = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
  const guestReq = () => ({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.50' }, body: { message: 'How heavy today?', context: {} } });
  for (let i = 0; i < 8; i++) await ctx.handler(guestReq(), makeRes());
  assert.equal(providerCalls, 8);
  const res = makeRes();
  await ctx.handler(guestReq(), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.limited, true);
  assert.equal(providerCalls, 8, 'a blocked request must not spend provider allowance');
  const err = makeRes();
  ctx.fetch = async () => response(500, { error: { message: 'internal provider secret detail' } });
  await ctx.handler({ method: 'POST', body: { message: 'hi', context: {} } }, err);
  assert.equal(err.code, 502);
  assert.equal(JSON.stringify(err.body).includes('secret detail'), false, 'provider error text must not reach users');
});

test('the browser attaches the signed-in token to AI requests only', async () => {
  const sent = [];
  const window = {
    location: { href: 'https://iron-six-training.vercel.app/', origin: 'https://iron-six-training.vercel.app' },
    fetch: async (input, init) => { sent.push({ input, init }); return 'ok'; },
    IronSixCloud: { session: () => ({ access_token: 'token-abc' }) },
  };
  const ctx = { window, URL, Headers };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('ai-request-auth.js', 'utf8'), ctx);
  await window.fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await window.fetch('/api/music?genre=Electronic');
  await window.fetch('https://iron-six-training.vercel.app/api/recalculate', { method: 'POST' });
  window.IronSixCloud = { session: () => null };
  await window.fetch('/api/review-workout', { method: 'POST' });
  assert.equal(sent[0].init.headers.get('Authorization'), 'Bearer token-abc');
  assert.equal(sent[0].init.headers.get('Content-Type'), 'application/json', 'existing headers are preserved');
  assert.equal(sent[1].init, undefined, 'non-AI requests are untouched');
  assert.equal(sent[2].init.headers.get('Authorization'), 'Bearer token-abc');
  assert.equal(sent[3].init.headers, undefined, 'guests send no token');
  const html = fs.readFileSync('index.html', 'utf8');
  assert(html.indexOf('ai-request-auth.js') < html.indexOf('local-ai-fallback.js'), 'must wrap fetch before the Coach fallback wrapper');
});
