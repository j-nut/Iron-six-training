const NORMAL_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const SEARCH_MODEL = process.env.GROQ_SEARCH_MODEL || 'groq/compound-mini';

const SYSTEM = `You are Iron Six Coach, an evidence-informed strength and hypertrophy assistant embedded inside a workout app.
You receive structured context about the active user's physical profile, equipment, current workout, logged sets, recent history, set feedback, progress analytics, training freshness, and current training-block state. You may also receive recent conversation turns. Use those turns to resolve follow-up questions naturally instead of treating every message as a new conversation.

Primary goals:
- Help the user get stronger and build muscle while respecting their stated available equipment and time.
- Base load advice primarily on actual logged performance (weight, reps, RIR), then recent set feedback and training-block state. Profile variables are only conservative starting context when performance data are absent.
- Treat "too easy / about right / too hard" feedback as supporting evidence, not as stronger evidence than recorded reps and RIR.
- Treat pain/discomfort feedback as a reason to avoid forcing progression on that movement. Do not diagnose.
- If trainingState indicates Manage fatigue or Deload suggested, explain why and prefer conservative volume changes over arbitrary exercise churn.
- Explain recommendations briefly and clearly.
- Never invent equipment the user does not have.
- equipmentCoverage is measured, not estimated: it reports how many exercise options each movement slot has with the user's actual equipment. When asked what equipment to buy or how their setup limits them, reason from emptySlots and thinSlots and recommend only from wouldHelp. Say plainly when a slot has no option at all. Items in conditioningOnly add no strength exercises; items in unrecognized are equipment the app could not identify, so ask what it is rather than guessing.
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
    profile: c.profile || {}, readiness: c.readiness || {},
    workout: Array.isArray(c.workout) ? c.workout.slice(0, 12) : [],
    today: c.today || {}, history: Array.isArray(c.history) ? c.history.slice(0, 8) : [],
    allowedSwaps: Array.isArray(c.allowedSwaps) ? c.allowedSwaps.slice(0, 12) : [],
    program: c.program || {}, selectedExercise: c.selectedExercise || null,
    equipmentCoverage: c.equipmentCoverage || null,
    trainingState: c.trainingState || null,
    setFeedback: Array.isArray(c.setFeedback) ? c.setFeedback.slice(0, 30) : [],
    analytics: c.analytics || null
  };
}

function compactConversation(input, currentMessage) {
  const turns = Array.isArray(input) ? input : [];
  const cleaned = turns.slice(-14).map(turn => ({
    role: turn?.role === 'assistant' ? 'assistant' : 'user',
    content: String(turn?.text || turn?.content || '').trim().slice(0, 1600)
  })).filter(turn => turn.content);
  const last = cleaned[cleaned.length - 1];
  if (last?.role === 'user' && last.content === currentMessage) cleaned.pop();
  return cleaned;
}

function cleanJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {} }
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
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Coach AI is not configured. GROQ_API_KEY is missing from the production environment.' });

  const message = String(req.body?.message || '').trim().slice(0, 1600);
  if (!message) return res.status(400).json({ error: 'Message required' });
  const context = compactContext(req.body?.context);
  const conversation = compactConversation(req.body?.conversation, message);
  const useSearch = wantsSearch(message);
  const model = useSearch ? SEARCH_MODEL : NORMAL_MODEL;
  const extra = useSearch ? 'The user wants or may benefit from a demonstration. If useful, use web search and prioritize a clear reputable exercise demonstration. Return direct video/page URLs in videos. Do not claim you watched a video.' : '';

  try {
    const messages = [
      { role: 'system', content: SYSTEM + '\n' + extra },
      { role: 'user', content: `ACTIVE APP CONTEXT:\n${JSON.stringify(context)}\n\nContinue the conversation below using this live app context.` },
      ...conversation,
      { role: 'user', content: message }
    ];
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, temperature: 0.2, max_completion_tokens: 1000, citation_options: useSearch ? 'enabled' : 'disabled' })
    });
    let body;
    try { body = await response.json(); } catch (_) { return res.status(502).json({ error: 'Coach provider returned an unreadable response. Please retry.' }); }
    if (!response.ok) return res.status(response.status).json({ error: body?.error?.message || `Coach provider failed (${response.status}). Please retry.` });
    const msg = body?.choices?.[0]?.message || {};
    const parsed = cleanJson(msg.content);
    parsed.actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [];
    parsed.videos = Array.isArray(parsed.videos) ? parsed.videos.slice(0, 3) : [];
    if (useSearch && !parsed.videos.length) parsed.videos = youtubeFromTools(msg.executed_tools);
    parsed.followUps = Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3) : [];
    parsed.model = model;
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Coach AI request failed. Please retry.', detail: String(err?.message || err) });
  }
}
