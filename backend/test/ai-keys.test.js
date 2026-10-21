import test from 'node:test';
import assert from 'node:assert/strict';
import { callAI, getAIReadiness } from '../src/services/aiService.js';

const configured = extra => ({ AI_ENABLED: 'true', AI_PROVIDER: 'groq', ...extra });
const success = () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }));
const failure = (status, error = {}, headers = {}) => new Response(JSON.stringify({ error }), { status, headers });
const pool = env => getAIReadiness(env).configuration.find(item => item.provider === 'groq');

test('short JSON tasks reserve reasoning tokens on the supported Groq model without changing other provider contracts', async () => {
  const bodies = [];
  const fetchImpl = async (_url, request) => { bodies.push(JSON.parse(request.body)); return success(); };
  await callAI([{ role: 'user', content: 'JSON classification fixture' }], {
    env: configured({ GROQ_API_KEY: 'fixture-valid' }), maxTokens: 100, json: true, fetchImpl,
  });
  assert.equal(bodies[0].model, 'openai/gpt-oss-20b');
  assert.equal(bodies[0].max_completion_tokens, 1200);
  assert.equal(bodies[0].reasoning_effort, 'low');
  assert.equal(bodies[0].include_reasoning, false);
  assert.equal(bodies[0].max_tokens, undefined);
  await callAI([], { env: configured({ GROQ_API_KEY: 'fixture-other', AI_MODEL: 'custom-model' }), maxTokens: 100, fetchImpl });
  assert.equal(bodies[1].max_tokens, 100);
  assert.equal(bodies[1].reasoning_effort, undefined);
  assert.equal(bodies[1].max_completion_tokens, undefined);
});

test('Groq readiness accepts CSV/JSON lists and aliases, deduplicates and never exposes values', () => {
  for (const list of ['fixture-a, fixture-b,fixture-a', '["fixture-a", "fixture-b", "fixture-a", null, 42]']) {
    const env = configured({ GROQ_API_KEYS: list, GROQ_API_KEY: ' fixture-b ', AI_API_KEY: 'fixture-c' });
    const status = getAIReadiness(env);
    assert.equal(status.configured, true); assert.equal(status.available, false); assert.equal(status.status, 'configured_unverified');
    assert.equal(pool(env).credentialCount, 3); assert.equal(pool(env).readyCredentialCount, 3);
    assert.ok(!JSON.stringify(status).includes('fixture-'));
  }
  for (const name of ['GROQ_API_KEY', 'AI_API_KEY']) assert.equal(pool(configured({ [name]: 'fixture-single' })).credentialCount, 1);
  for (const value of ['[broken', '{"key":"fixture-a"}', '[null,42,{}," ","contains whitespace"]']) {
    assert.equal(getAIReadiness(configured({ GROQ_API_KEYS: value })).configured, false);
  }
  assert.equal(getAIReadiness(configured({ AI_PROVIDER: 'together', GROQ_API_KEY: 'fixture-a' })).configured, false);
});

test('a revoked credential fails over once and is skipped on subsequent requests', async () => {
  const env = configured({ GROQ_API_KEYS: '["fixture-revoked","fixture-valid"]', GROQ_API_KEY: 'fixture-valid' });
  const credentials = [];
  const fetchImpl = async (_url, request) => {
    credentials.push(request.headers.Authorization);
    return credentials.length === 1 ? failure(401, { message: 'Invalid credential fixture-revoked' }) : success();
  };
  const result = await callAI([], { env, fetchImpl });
  assert.equal(result.content, '{"ok":true}'); assert.equal(result.providerRequestAttempted, true);
  assert.deepEqual(credentials, ['Bearer fixture-revoked', 'Bearer fixture-valid']);
  assert.equal(pool(env).rejectedCredentialCount, 1); assert.equal(pool(env).readyCredentialCount, 1);
  assert.equal(getAIReadiness(env).available, true);
  await callAI([], { env, fetchImpl });
  assert.deepEqual(credentials, ['Bearer fixture-revoked', 'Bearer fixture-valid', 'Bearer fixture-valid']);
  assert.ok(!JSON.stringify({ result, status: getAIReadiness(env) }).includes('fixture-'));
});

test('shared or unknown 429 stops the entire pool and honors Retry-After across calls', async t => {
  let now = 1700000000000;
  t.mock.method(Date, 'now', () => now);
  const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b' });
  let calls = 0;
  const fetchImpl = async () => { calls++; return calls === 1 ? failure(429, { message: 'Rate limit reached' }, { 'Retry-After': '30' }) : success(); };
  assert.equal((await callAI([], { env, fetchImpl })).error, 'rate_limited');
  assert.equal(calls, 1); assert.equal(pool(env).readyCredentialCount, 0);
  assert.equal(pool(env).cooldownUntil, new Date(now + 30000).toISOString());
  const coolingDown = await callAI([], { env, fetchImpl });
  assert.equal(coolingDown.error, 'rate_limited'); assert.equal(coolingDown.providerRequestAttempted, false); assert.equal(calls, 1);
  now += 30000;
  assert.equal((await callAI([], { env, fetchImpl })).content, '{"ok":true}'); assert.equal(calls, 2);
});

test('an explicit credential restriction permits failover and retains that key cooldown', async t => {
  let now = 1700000000000;
  t.mock.method(Date, 'now', () => now);
  const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b' });
  const credentials = [];
  const fetchImpl = async (_url, request) => {
    credentials.push(request.headers.Authorization);
    return credentials.length === 1 ? failure(429, { scope: 'api_key', message: 'This key is temporarily restricted' }, { 'Retry-After': '60' }) : success();
  };
  assert.equal((await callAI([], { env, fetchImpl })).content, '{"ok":true}');
  assert.equal(pool(env).coolingDownCredentialCount, 1); assert.equal(pool(env).readyCredentialCount, 1);
  await callAI([], { env, fetchImpl });
  assert.deepEqual(credentials, ['Bearer fixture-a', 'Bearer fixture-b', 'Bearer fixture-b']);
  now += 60000;
  assert.equal(pool(env).coolingDownCredentialCount, 0); assert.equal(pool(env).readyCredentialCount, 2);
});

test('project, organization, token and quota restrictions override a claimed key scope', async () => {
  for (const message of ['organization limit reached', 'project limit reached', 'token limit reached', 'quota exhausted']) {
    const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b' });
    let calls = 0;
    const result = await callAI([], { env, fetchImpl: async () => { calls++; return failure(429, { scope: 'api_key', message }); } });
    assert.equal(result.error, 'rate_limited'); assert.equal(calls, 1); assert.equal(pool(env).readyCredentialCount, 0);
  }
  const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b' });
  let calls = 0;
  await callAI([], { env, fetchImpl: async () => { calls++; return failure(429, { scope: 'api_key' }, { 'x-ratelimit-remaining-tokens': '0' }); } });
  assert.equal(calls, 1); assert.equal(pool(env).readyCredentialCount, 0);
});

test('HTTP-date Retry-After and exhausted reset headers keep the pool paused', async t => {
  const now = 1700000000000;
  t.mock.method(Date, 'now', () => now);
  for (const headers of [
    { 'Retry-After': new Date(now + 90000).toUTCString() },
    { 'Retry-After': 'bad value', 'x-ratelimit-remaining-tokens': '0', 'x-ratelimit-reset-tokens': '1m30s' },
  ]) {
    const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b' });
    await callAI([], { env, fetchImpl: async () => failure(429, {}, headers) });
    assert.equal(pool(env).cooldownUntil, new Date(now + 90000).toISOString());
  }
});

test('all rejected credentials remain rejected without repeating network requests', async () => {
  const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b' });
  let calls = 0;
  const fetchImpl = async () => { calls++; return failure(401); };
  assert.equal((await callAI([], { env, fetchImpl })).error, 'authentication_failed'); assert.equal(calls, 2);
  const result = await callAI([], { env, fetchImpl });
  assert.equal(result.error, 'authentication_failed'); assert.equal(result.providerRequestAttempted, false); assert.equal(calls, 2);
  assert.equal(pool(env).rejectedCredentialCount, 2); assert.equal(getAIReadiness(env).available, false);
});

test('shared quota can use the configured alternate provider without retrying more Groq keys', async () => {
  const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b', AI_FALLBACK_PROVIDER: 'gemini', GEMINI_API_KEY: 'fixture-gemini' });
  const urls = [];
  const result = await callAI([], { env, fetchImpl: async url => {
    urls.push(url);
    return urls.length === 1 ? failure(429) : new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] }));
  } });
  assert.equal(urls.length, 2); assert.equal(result.provider, 'gemini'); assert.equal(getAIReadiness(env).available, true);
  assert.ok(urls[0].startsWith('https://api.groq.com/')); assert.ok(urls[1].startsWith('https://generativelanguage.googleapis.com/'));
});

test('network, permission and server failures do not churn through keys or expose error details', async () => {
  for (const status of [403, 400, 503, null]) {
    const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b' });
    let calls = 0;
    const result = await callAI([], { env, fetchImpl: async () => {
      calls++;
      if (status === null) throw new Error('Secret fixture-a');
      return failure(status, { message: 'Secret fixture-a' });
    } });
    assert.equal(calls, 1); assert.equal(result.error, 'provider_unavailable'); assert.ok(!JSON.stringify(result).includes('fixture-'));
  }
});

test('all credentials and the fallback share one deadline; late responses cannot alter pool state', async () => {
  const env = configured({ GROQ_API_KEYS: 'fixture-a,fixture-b,fixture-c', AI_FALLBACK_PROVIDER: 'gemini', GEMINI_API_KEY: 'fixture-gemini' });
  const signals = [];
  let resolveLate;
  const result = await callAI([], { env, timeoutMs: 30, fetchImpl: async (_url, { signal }) => {
    signals.push(signal);
    if (signals.length === 1) return failure(401);
    return new Promise(resolve => { resolveLate = resolve; });
  } });
  assert.equal(result.error, 'timeout'); assert.equal(signals.length, 2); assert.equal(signals[0], signals[1]); assert.equal(signals[1].aborted, true);
  resolveLate(failure(401));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pool(env).rejectedCredentialCount, 1); assert.equal(getAIReadiness(env).available, false);
});

test('replacing credentials resets old availability and test environments remain isolated', async () => {
  const env = configured({ GROQ_API_KEY: 'fixture-a' });
  await callAI([], { env, fetchImpl: async () => success() });
  assert.equal(getAIReadiness(env).available, true);
  assert.equal(getAIReadiness(configured({ GROQ_API_KEY: 'fixture-a' })).status, 'configured_unverified');
  env.GROQ_API_KEY = 'fixture-b';
  assert.equal(getAIReadiness(env).available, false); assert.equal(getAIReadiness(env).status, 'configured_unverified');
});

test('adding credentials cannot clear the shared cooldown', async () => {
  const env = configured({ GROQ_API_KEY: 'fixture-a' });
  let calls = 0;
  const fetchImpl = async () => { calls++; return failure(429, {}, { 'Retry-After': '60' }); };
  await callAI([], { env, fetchImpl });
  env.GROQ_API_KEYS = 'fixture-a,fixture-b';
  assert.equal(getAIReadiness(env).status, 'rate_limited');
  const result = await callAI([], { env, fetchImpl });
  assert.equal(result.error, 'rate_limited'); assert.equal(result.providerRequestAttempted, false);
  assert.equal(calls, 1); assert.equal(pool(env).credentialCount, 2); assert.equal(pool(env).readyCredentialCount, 0);
});

test('an unconfigured fallback cannot hide a configured provider rate limit', async () => {
  const env = configured({ GROQ_API_KEY: 'fixture-a', AI_FALLBACK_PROVIDER: 'gemini' });
  const result = await callAI([], { env, fetchImpl: async () => failure(429) });
  assert.equal(result.error, 'rate_limited'); assert.equal(result.provider, 'groq');
  assert.equal(getAIReadiness(env).status, 'rate_limited'); assert.equal(getAIReadiness(env).configured, true);
});
