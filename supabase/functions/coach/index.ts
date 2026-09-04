import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NORMAL_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b';
const SEARCH_MODEL = Deno.env.get('GROQ_SEARCH_MODEL') || 'groq/compound-mini';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `You are Iron Six Coach, an evidence-informed strength and hypertrophy assistant inside an adaptive workout app.
The request contains structured profile, equipment, readiness, current workout, logged sets, recent history and allowed exercise swaps.

Rules:
- Help the user build strength and muscle while respecting their equipment, time and recovery.
- Actual logged weight, reps and RIR outrank demographic estimates as soon as performance data exist.
- Never invent equipment that the profile does not have.
- If the user requests an exercise swap, use only an EXACT replacementName listed for that target in allowedSwaps.
- You may recommend set_duration from 10 to 120 minutes.
- Explain why a load or exercise changed when asked.
- For sharp pain, sudden injury, neurological symptoms, chest pain, fainting or other concerning symptoms, tell the user to stop the provoking activity and seek appropriate medical evaluation when warranted. Do not diagnose.
- For ordinary soreness or fatigue, give conservative training modifications.
- For exercise technique, give practical controllable cues and avoid claiming one universal perfect form.

Return ONLY valid JSON:
{
  "reply":"concise coaching response",
  "actions":[{"type":"swap_exercise","targetIndex":0,"replacementName":"EXACT allowed name","reason":"..."},{"type":"set_duration","minutes":30,"reason":"..."}],
  "videos":[{"title":"...","url":"https://...","source":"..."}],
  "followUps":["..."]
}
Use empty arrays when no action/video is needed. No markdown fences.`;

function wantsDemo(message: string) {
  return /\b(video|demo|demonstrat|youtube|show me|tutorial|how (do|to) i|form video)\b/i.test(message);
}

function compactContext(input: unknown) {
  const c = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    profile: c.profile || {}, readiness: c.readiness || {},
    workout: Array.isArray(c.workout) ? c.workout.slice(0, 12) : [],
    today: c.today || {},
    history: Array.isArray(c.history) ? c.history.slice(0, 8) : [],
    allowedSwaps: Array.isArray(c.allowedSwaps) ? c.allowedSwaps.slice(0, 12) : [],
    program: c.program || {}, selectedExercise: c.selectedExercise || null,
  };
}

function parseJson(text: string) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(raw.slice(a, b + 1)); } catch (_) {}
  }
  return { reply: raw || 'I could not generate a coaching response.', actions: [], videos: [], followUps: [] };
}

function searchVideos(tools: unknown) {
  const out: Array<{title:string,url:string,source:string}> = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    const t = tool as Record<string, any>;
    const candidates = t?.search_results?.results || t?.search_results || [];
    for (const r of Array.isArray(candidates) ? candidates : []) {
      const url = String(r?.url || '');
      if (/youtube\.com|youtu\.be/i.test(url)) out.push({ title: r?.title || 'Exercise demonstration', url, source: 'YouTube' });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405, headers: cors });

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return Response.json({ error: 'Cloud Coach is not configured yet.' }, { status: 503, headers: cors });

  let body: any;
  try { body = await req.json(); } catch (_) { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: cors }); }
  const message = String(body?.message || '').trim().slice(0, 1600);
  if (!message) return Response.json({ error: 'Message required' }, { status: 400, headers: cors });

  const context = compactContext(body?.context);
  const search = wantsDemo(message);
  const model = search ? SEARCH_MODEL : NORMAL_MODEL;
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM + (search ? '\nThe user wants a demonstration. Use web search and prefer a clear YouTube exercise demonstration. Do not claim you watched a video.' : '') },
      { role: 'user', content: `ACTIVE APP CONTEXT:\n${JSON.stringify(context)}\n\nUSER MESSAGE:\n${message}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_completion_tokens: 1000,
  };
  if (search) requestBody.search_settings = { include_domains: ['youtube.com'] };

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const raw = await response.json();
    if (!response.ok) return Response.json({ error: raw?.error?.message || 'AI request failed' }, { status: response.status, headers: cors });
    const msg = raw?.choices?.[0]?.message || {};
    const out = parseJson(msg?.content || '');
    out.actions = Array.isArray(out.actions) ? out.actions.slice(0, 3) : [];
    out.videos = Array.isArray(out.videos) ? out.videos.slice(0, 3) : [];
    if (search && !out.videos.length) out.videos = searchVideos(msg?.executed_tools);
    out.followUps = Array.isArray(out.followUps) ? out.followUps.slice(0, 3) : [];
    out.model = model;
    return Response.json(out, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: 'Cloud Coach request failed', detail: String(err instanceof Error ? err.message : err) }, { status: 500, headers: cors });
  }
});
