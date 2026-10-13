// Abuse protection for the AI endpoints: identifies the caller and enforces per-route limits
// before any provider is called, so one client cannot drain the shared free allowances.
//
// Signed-in users send their Supabase access token. When the ai_rate_hit migration is applied
// (supabase/migrations/202610130001_ai_rate_limits.sql) their limits are durable and shared
// by every serverless instance; the same call also proves the token is genuine. Guests, and
// users while that function is unavailable, fall back to a per-instance in-memory limiter.
//
// No imports: loaded into the test vm alongside the endpoint (see tests/helpers/load-api.js).

const AI_SUPABASE_URL = 'https://btfrkfbxyowglrdwclei.supabase.co';
const AI_SUPABASE_KEY = 'sb_publishable_lhLxwVoR5VcpNpOPs1bBVQ_ik42s4wi';
const AI_BURST_WINDOW_MS = 10 * 60 * 1000;
const AI_DAY_MS = 24 * 60 * 60 * 1000;
const AI_MAX_BODY_CHARS = 120000;

// [burst per 10 minutes, per day]
export const AI_LIMITS = {
  coach: { user: [20, 150], guest: [8, 40] },
  recalculate: { user: [60, 400], guest: [30, 150] },
  review: { user: [6, 20], guest: [3, 8] },
  equipment: { user: [10, 30], guest: [4, 10] },
};

const aiMemoryHits = new Map();
const aiVerifiedTokens = new Map();
let aiDurableUnavailableUntil = 0;

function aiHeader(req, name) {
  const headers = req?.headers;
  if (!headers) return '';
  const value = typeof headers.get === 'function' ? headers.get(name) : headers[name] ?? headers[name.toLowerCase()];
  return String(Array.isArray(value) ? value[0] : value || '');
}

function aiBearer(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(aiHeader(req, 'authorization').trim());
  const token = match ? match[1] : '';
  return token.length >= 40 && token.length <= 8000 ? token : '';
}

function aiClientIp(req) {
  return aiHeader(req, 'x-forwarded-for').split(',')[0].trim() || aiHeader(req, 'x-real-ip').trim() || 'unknown';
}

function aiMemoryAllow(key, [burst, daily], now) {
  const kept = (aiMemoryHits.get(key) || []).filter(ts => now - ts < AI_DAY_MS);
  const recent = kept.filter(ts => now - ts < AI_BURST_WINDOW_MS).length;
  if (recent >= burst || kept.length >= daily) { aiMemoryHits.set(key, kept); return false; }
  kept.push(now); aiMemoryHits.set(key, kept);
  if (aiMemoryHits.size > 5000) for (const [k, v] of aiMemoryHits) if (!v.some(ts => now - ts < AI_DAY_MS)) aiMemoryHits.delete(k);
  return true;
}

function aiSupabase() {
  const env = process.env || {};
  return { url: (env.SUPABASE_URL || AI_SUPABASE_URL).replace(/\/$/, ''), key: env.SUPABASE_PUBLISHABLE_KEY || AI_SUPABASE_KEY };
}

function aiSignal(ms) {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

// Durable per-user check. Returns {verified, allowed} or null when it cannot decide.
async function aiDurableUser(token, route, [burst, daily], now) {
  if (now < aiDurableUnavailableUntil) return null;
  const { url, key } = aiSupabase();
  try {
    const response = await fetch(`${url}/rest/v1/rpc/ai_rate_hit`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_route: route, p_burst_limit: burst, p_daily_limit: daily }),
      signal: aiSignal(3000),
    });
    if (response.status === 401 || response.status === 403) return { verified: false, allowed: false };
    if (!response.ok) { if (response.status === 404) aiDurableUnavailableUntil = now + 10 * 60 * 1000; return null; }
    return { verified: true, allowed: (await response.json()) === true };
  } catch (_) { return null; }
}

async function aiVerifiedUserId(token, now) {
  const cached = aiVerifiedTokens.get(token);
  if (cached && cached.until > now) return cached.id;
  const { url, key } = aiSupabase();
  try {
    const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: aiSignal(3000) });
    if (!response.ok) return '';
    const user = await response.json();
    const id = typeof user?.id === 'string' ? user.id : '';
    if (id) {
      if (aiVerifiedTokens.size > 2000) aiVerifiedTokens.clear();
      aiVerifiedTokens.set(token, { id, until: now + 5 * 60 * 1000 });
    }
    return id;
  } catch (_) { return ''; }
}

// Returns { allowed, identity:'user'|'guest'|'test', reason? }.
export async function aiGuard(req, route) {
  // Real HTTP requests always carry headers; only in-process tests call handlers without them.
  if (!req?.headers) return { allowed: true, identity: 'test' };
  let size = 0;
  try { size = JSON.stringify(req.body ?? null).length; } catch (_) { size = Infinity; }
  if (size > AI_MAX_BODY_CHARS) return { allowed: false, identity: 'guest', reason: 'too_large' };
  const limits = AI_LIMITS[route];
  const now = Date.now();
  const token = aiBearer(req);
  if (token) {
    const durable = await aiDurableUser(token, route, limits.user, now);
    if (durable?.verified) return { allowed: durable.allowed, identity: 'user', reason: durable.allowed ? undefined : 'rate_limited' };
    if (!durable) {
      const userId = await aiVerifiedUserId(token, now);
      if (userId) {
        const allowed = aiMemoryAllow(`user:${userId}:${route}`, limits.user, now);
        return { allowed, identity: 'user', reason: allowed ? undefined : 'rate_limited' };
      }
    }
    // An expired or forged token is treated as a guest rather than rejected outright.
  }
  const allowed = aiMemoryAllow(`ip:${aiClientIp(req)}:${route}`, limits.guest, now);
  return { allowed, identity: 'guest', reason: allowed ? undefined : 'rate_limited' };
}

// Bounds arbitrary client JSON before it reaches a prompt: limited depth, keys, array length
// and string length, so a crafted body cannot inflate token cost.
export function aiCompact(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  if (typeof value === 'string') return value.slice(0, 300);
  if (depth >= 5) return null;
  if (Array.isArray(value)) return value.slice(0, 12).map(item => aiCompact(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) out[String(k).slice(0, 60)] = aiCompact(v, depth + 1);
    return out;
  }
  return null;
}
