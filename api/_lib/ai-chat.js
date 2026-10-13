// Shared AI transport for every Iron Six endpoint.
//
// Each provider below has its own free allowance, so the endpoints walk the chain and move
// on whenever one is rate-limited, down, slow or misconfigured. Only providers whose keys
// are present in the server environment take part; with just GROQ_API_KEY set this behaves
// exactly like the original Groq-only setup (primary model, then the Groq overflow model).
//
// No imports: the tests load API files into a vm sandbox with this file inlined, so this
// module may only use globals (fetch, process.env, AbortSignal when present).

const AI_PROVIDER_TIMEOUT_MS = 12000;
const AI_SEARCH_MODEL_DEFAULT = 'groq/compound-mini';

export function aiProviders(env) {
  const e = env || process.env || {};
  const list = [];
  const groqModel = e.GROQ_MODEL || 'openai/gpt-oss-20b';
  if (e.GROQ_API_KEY) list.push({ id: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: e.GROQ_API_KEY, model: groqModel, tokenField: 'max_completion_tokens', jsonMode: true, reasoning: 'groq' });
  if (e.CEREBRAS_API_KEY) list.push({ id: 'cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: e.CEREBRAS_API_KEY, model: e.CEREBRAS_MODEL || 'gpt-oss-120b', tokenField: 'max_completion_tokens', jsonMode: true, reasoning: 'effort', retryBare: true });
  if (e.CLOUDFLARE_ACCOUNT_ID && e.CLOUDFLARE_API_TOKEN) list.push({ id: 'cloudflare', url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(e.CLOUDFLARE_ACCOUNT_ID)}/ai/v1/chat/completions`, key: e.CLOUDFLARE_API_TOKEN, model: e.CLOUDFLARE_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', tokenField: 'max_tokens', jsonMode: false, reasoning: null });
  if (e.OPENROUTER_API_KEY) list.push({ id: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: e.OPENROUTER_API_KEY, model: e.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free', tokenField: 'max_tokens', jsonMode: false, reasoning: null });
  const overflow = e.GROQ_FALLBACK_MODEL || AI_SEARCH_MODEL_DEFAULT;
  if (e.GROQ_API_KEY && overflow !== groqModel) list.push({ id: 'groq-overflow', url: 'https://api.groq.com/openai/v1/chat/completions', key: e.GROQ_API_KEY, model: overflow, tokenField: 'max_completion_tokens', jsonMode: false, reasoning: null });
  return list;
}

export function aiConfigured(env) {
  return aiProviders(env).length > 0;
}

function aiRequestBody(provider, options, bare) {
  const body = { model: provider.model, messages: options.messages, temperature: options.temperature ?? 0.2 };
  body[provider.tokenField] = options.maxTokens || 800;
  if (bare) return body;
  if (options.json && provider.jsonMode) body.response_format = { type: 'json_object' };
  if (/gpt-oss-(20b|120b)$/.test(provider.model)) {
    if (provider.reasoning === 'groq') { body.reasoning_effort = 'low'; body.include_reasoning = false; }
    if (provider.reasoning === 'effort') body.reasoning_effort = 'low';
  }
  if (provider.search) body.citation_options = 'enabled';
  return body;
}

async function aiCallProvider(provider, options, bare) {
  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(options.timeoutMs || AI_PROVIDER_TIMEOUT_MS) : undefined;
  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestBody(provider, options, bare)),
      signal,
    });
    let body = null;
    try { body = await response.json(); } catch (_) {}
    const retryAfter = response.headers?.get?.('retry-after') ?? null;
    if (!response.ok) return { ok: false, status: response.status, retryAfter, error: body?.error?.message || null };
    const choice = body?.choices?.[0] || {};
    const content = choice.message?.content;
    if (typeof content !== 'string' || !content.trim()) return { ok: false, status: response.status, retryAfter, error: 'Empty completion' };
    return { ok: true, status: response.status, body, choice, content };
  } catch (error) {
    return { ok: false, status: 0, retryAfter: null, error: String(error?.name === 'TimeoutError' ? 'Provider timeout' : (error?.message || error)) };
  }
}

// Returns { ok, provider, model, content, choice, body, attempts } on success, or
// { ok:false, attempts, rateLimited, retryAfter } once every configured provider failed.
export async function aiChat(options) {
  const env = options.env || process.env || {};
  let chain = aiProviders(env);
  if (options.search && env.GROQ_API_KEY) {
    const groq = chain.find(p => p.id === 'groq');
    chain = [{ ...groq, id: 'groq-search', model: env.GROQ_SEARCH_MODEL || AI_SEARCH_MODEL_DEFAULT, reasoning: null, jsonMode: false, search: true }, ...chain];
  }
  const skip = new Set(options.skip || []);
  chain = chain.filter(p => !skip.has(p.id));
  const attempts = [];
  for (const provider of chain) {
    let result = await aiCallProvider(provider, options, false);
    if (!result.ok && result.status === 400 && provider.retryBare) result = await aiCallProvider(provider, options, true);
    attempts.push({ provider: provider.id, model: provider.model, status: result.status, retryAfter: result.retryAfter ?? null, error: result.ok ? null : result.error });
    if (result.ok) return { ok: true, provider: provider.id, model: provider.model, content: result.content, choice: result.choice, body: result.body, attempts };
    if (typeof console !== 'undefined') console.warn('Iron Six AI provider attempt failed', { provider: provider.id, model: provider.model, status: result.status, error: result.error });
  }
  const limited = attempts.filter(a => a.status === 429);
  return { ok: false, attempts, rateLimited: limited.length > 0, retryAfter: limited.length ? limited[limited.length - 1].retryAfter : null };
}
