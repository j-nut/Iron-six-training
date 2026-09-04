const NORMAL_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const SEARCH_MODEL = process.env.GROQ_SEARCH_MODEL || 'groq/compound-mini';

const SYSTEM = `You are Iron Six Coach, an evidence-informed strength and hypertrophy assistant embedded inside a workout app.
You receive structured context about the active user's physical profile, equipment, current workout, logged sets, recent history, and ALLOWED exercise swaps.

Primary goals:
- Help the user get stronger and build muscle while respecting their stated available equipment and time.
- Base load advice primarily on actual logged performance (weight, reps, RIR). Profile variables are only conservative starting context when performance data are absent.
- Explain recommendations briefly and clearly.
- Never invent equipment the user does not have.
- If the user asks to change an exercise, choose only an EXACT replacementName from the allowedSwaps list for that target exercise. If none fits, explain instead of creating an action.
- If the user asks for a shorter/longer workout, you may return a set_duration action from 10 to 120 minutes.
- If the user reports sharp pain, sudden injury, neurological symptoms, chest pain, fainting, or other concerning symptoms, do not optimize through it. Recommend stopping the provoking exercise and seeking appropriate medical evaluation when warranted. Do not diagnose.
- Ordinary muscle soreness/fatigue can be handled with conservative training modifications.
- When discussing exercise form, emphasize controllable technique cues rather than claiming one universally perfect form.

Return ONLY a JSON object with this shape:
{
  "reply": "concise useful coaching response",
  "actions": [
    {"type":"swap_exercise","targetIndex":0,"replacementName":"EXACT allowed name","reason":"short reason"},
    {"type":"set_duration","minutes":30,"reason":"short reason"}
  ],
  "videos": [{"title":"...","url":"https://...","source":"..."}],
  "followUps": ["short suggested prompt"]
}
Use an empty actions/videos array when not needed. Never include markdown fences.`;

function wantsSearch(message) {
  return /\b(video|demo|demonstrat|youtube|how (do|to) i|form video|show me|tutorial)\b/i.test(message);
}

function compactContext(input) {
  const c = input && typeof input === 'object' ? input : {};
  return {
    profile: c.profile || {},
    readiness: c.readiness || {},
    workout: Array.isArray(c.workout) ? c.workout.slice(0, 10) : [],
    today: c.today || {},
    history: Array.isArray(c.history) ? c.history.slice(0, 8) : [],
    allowedSwaps: Array.isArray(c.allowedSwaps) ? c.allowedSwaps.slice(0, 10) : [],
    program: c.program || {}
  };
}

function cleanJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {}
  }
  return { reply: raw || 'I could not generate a coaching response.', actions: [], videos: [], followUps: [] };
}

function youtubeFromTools(tools) {
  const out = [];
  for (const tool of tools || []) {
    const candidates = tool?.search_results?.results || tool?.search_results || [];
    for (const r of Array.isArray(candidates) ? candidates : []) {
      const url = String(r?.url || '');
      if (/youtu\.be|youtube\.com/i.test(url)) out.push({ title: r.title || 'Exercise demo', url, source: 'YouTube' });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Coach AI is not configured yet. Add GROQ_API_KEY to the Vercel project environment.' });

  const message = String(req.body?.message || '').trim().slice(0, 1400);
  if (!message) return res.status(400).json({ error: 'Message required' });
  const context = compactContext(req.body?.context);
  const useSearch = wantsSearch(message);
  const model = useSearch ? SEARCH_MODEL : NORMAL_MODEL;
  const extra = useSearch
    ? 'The user may want an exercise demonstration. If useful, use web search and prioritize reputable strength/fitness education sources or clear exercise demonstrations. Return direct video/page URLs in videos. Do not claim you watched a video unless search content actually supports the claim.'
    : '';

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM + '\n' + extra },
          { role: 'user', content: `ACTIVE APP CONTEXT:\n${JSON.stringify(context)}\n\nUSER MESSAGE:\n${message}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.25,
        max_completion_tokens: 1000,
        citation_options: useSearch ? 'enabled' : 'disabled'
      })
    });
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: body?.error?.message || 'AI request failed' });
    const msg = body?.choices?.[0]?.message || {};
    const parsed = cleanJson(msg.content);
    parsed.actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [];
    parsed.videos = Array.isArray(parsed.videos) ? parsed.videos.slice(0, 3) : [];
    if (useSearch && !parsed.videos.length) parsed.videos = youtubeFromTools(msg.executed_tools);
    parsed.followUps = Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3) : [];
    parsed.model = model;
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Coach AI request failed', detail: String(err?.message || err) });
  }
}
