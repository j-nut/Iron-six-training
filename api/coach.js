const NORMAL_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const SEARCH_MODEL = process.env.GROQ_SEARCH_MODEL || 'groq/compound-mini';
const OVERFLOW_MODEL = process.env.GROQ_FALLBACK_MODEL || 'groq/compound-mini';

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

function compactSet(set) {
  const s = set && typeof set === 'object' ? set : {};
  return {
    weight: s.weight ?? s.weight_text ?? null,
    reps: s.reps ?? s.reps_text ?? null,
    rir: s.rir ?? s.rir_text ?? null,
    done: s.done ?? s.completed ?? null,
    feedback: s.feedback || null,
  };
}

function compactSuggested(value) {
  if (!value || typeof value !== 'object') return value || null;
  return {
    load: value.load ?? value.weight ?? null,
    target: value.target ?? value.reps ?? null,
    text: String(value.text || value.display || '').slice(0, 180),
    confidence: String(value.confidence || '').slice(0, 80),
    detail: String(value.detail || '').slice(0, 220),
  };
}

function compactHistory(input) {
  return (Array.isArray(input) ? input : []).slice(0, 4).map(session => ({
    name: session?.name || null,
    date: session?.date || null,
    ts: session?.ts || null,
    workoutKey: session?.workoutKey || null,
    duration: session?.duration || null,
    details: (Array.isArray(session?.details) ? session.details : []).slice(0, 8).map(detail => ({
      name: detail?.name || null,
      base: detail?.base || null,
      sets: (Array.isArray(detail?.sets) ? detail.sets : []).slice(-3).map(compactSet),
    })),
  }));
}

function compactAnalytics(input) {
  if (!input || typeof input !== 'object') return null;
  return {
    sessions7: input.sessions7 ?? null,
    sets7: input.sets7 ?? null,
    volume7: input.volume7 ?? null,
    trends: Array.isArray(input.trends) ? input.trends.slice(0, 6) : [],
    freshness: input.freshness || null,
  };
}

function compactContext(input) {
  const c = input && typeof input === 'object' ? input : {};
  const p = c.profile && typeof c.profile === 'object' ? c.profile : {};
  const today = Array.isArray(c.today)
    ? c.today.slice(-24).map(row => ({ key: row?.key || null, ...compactSet(row) }))
    : Object.entries(c.today && typeof c.today === 'object' ? c.today : {}).slice(-24).map(([key, row]) => ({ key, ...compactSet(row) }));
  return {
    profile: {
      name: p.name || null,
      bodyWeight: p.bodyWeight ?? p.weight ?? null,
      age: p.age ?? null,
      heightIn: p.heightIn ?? null,
      trainingLevel: p.trainingLevel || null,
      equipment: Array.isArray(p.equipment) ? p.equipment.slice(0, 18) : [],
      capacities: p.capacities || null,
      workoutMinutes: p.workoutMinutes ?? null,
    },
    readiness: c.readiness || {},
    workout: (Array.isArray(c.workout) ? c.workout : []).slice(0, 12).map(row => ({
      index: row?.index ?? null,
      name: row?.name || null,
      prescription: String(row?.prescription || '').slice(0, 120),
      base: row?.base || null,
      suggested: compactSuggested(row?.suggested),
    })),
    today,
    history: compactHistory(c.history),
    allowedSwaps: (Array.isArray(c.allowedSwaps) ? c.allowedSwaps : []).slice(0, 12).map(row => ({
      targetIndex: row?.targetIndex ?? null,
      targetName: row?.targetName || null,
      targetBase: row?.targetBase || null,
      replacements: (Array.isArray(row?.replacements) ? row.replacements : []).slice(0, 6),
    })),
    program: c.program || {},
    selectedExercise: c.selectedExercise || null,
    equipmentCoverage: c.equipmentCoverage || null,
    trainingState: c.trainingState || null,
    setFeedback: (Array.isArray(c.setFeedback) ? c.setFeedback : []).slice(0, 12).map(row => ({
      ts: row?.ts || null,
      exercise: row?.exercise || row?.exerciseName || null,
      feedback: row?.feedback || null,
      weight: row?.weight ?? null,
      reps: row?.reps ?? null,
      rir: row?.rir ?? null,
    })),
    analytics: compactAnalytics(c.analytics),
  };
}

function compactConversation(input, currentMessage) {
  const turns = Array.isArray(input) ? input : [];
  const cleaned = turns.slice(-6).map(turn => ({
    role: turn?.role === 'assistant' ? 'assistant' : 'user',
    content: String(turn?.text || turn?.content || '').trim().slice(0, 700)
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

async function callGroq(model, messages, useSearch) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_completion_tokens: 600,
      citation_options: useSearch ? 'enabled' : 'disabled'
    })
  });
  let body;
  try { body = await response.json(); } catch (_) { body = null; }
  return { response, body };
}

function recoveryReply(message, context, retryAfter) {
  const wait = Number(retryAfter);
  const suffix = Number.isFinite(wait) && wait > 0 ? ` Try again in about ${Math.ceil(wait)} seconds.` : ' Try again in a few seconds.';
  const current = context?.workout?.find(row => row?.name)?.name;
  return {
    reply: `The cloud coach hit a temporary rate limit, but your workout data are still intact.${current ? ` I still have ${current} and the rest of today’s plan in context.` : ''}${suffix}`,
    actions: [],
    videos: [],
    followUps: [String(message || '').slice(0, 120)],
    model: 'Iron Six recovery',
    degraded: true,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Coach AI is not configured. GROQ_API_KEY is missing from the production environment.' });

  const message = String(req.body?.message || '').trim().slice(0, 1400);
  if (!message) return res.status(400).json({ error: 'Message required' });
  const context = compactContext(req.body?.context);
  const conversation = compactConversation(req.body?.conversation, message);
  const useSearch = wantsSearch(message);
  const requestedModel = useSearch ? SEARCH_MODEL : NORMAL_MODEL;
  const extra = useSearch ? 'The user wants or may benefit from a demonstration. If useful, use web search and prioritize a clear reputable exercise demonstration. Return direct video/page URLs in videos. Do not claim you watched a video.' : '';

  try {
    const messages = [
      { role: 'system', content: SYSTEM + '\n' + extra },
      { role: 'user', content: `ACTIVE APP CONTEXT:\n${JSON.stringify(context)}\n\nContinue the conversation below using this live app context.` },
      ...conversation,
      { role: 'user', content: message }
    ];

    let usedModel = requestedModel;
    let attempt = await callGroq(usedModel, messages, useSearch);
    if (!attempt.response.ok && attempt.response.status === 429 && !useSearch && OVERFLOW_MODEL !== usedModel) {
      console.warn('Iron Six Coach primary model rate-limited', {
        model: usedModel,
        retryAfter: attempt.response.headers.get('retry-after'),
        remainingTokens: attempt.response.headers.get('x-ratelimit-remaining-tokens'),
      });
      usedModel = OVERFLOW_MODEL;
      attempt = await callGroq(usedModel, messages, false);
    }

    if (!attempt.response.ok) {
      if (attempt.response.status === 429) {
        return res.status(200).json(recoveryReply(message, context, attempt.response.headers.get('retry-after')));
      }
      if (!attempt.body) return res.status(502).json({ error: 'Coach provider returned an unreadable response. Please retry.' });
      return res.status(attempt.response.status).json({ error: attempt.body?.error?.message || `Coach provider failed (${attempt.response.status}). Please retry.` });
    }

    const msg = attempt.body?.choices?.[0]?.message || {};
    const parsed = cleanJson(msg.content);
    parsed.actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [];
    parsed.videos = Array.isArray(parsed.videos) ? parsed.videos.slice(0, 3) : [];
    if (useSearch && !parsed.videos.length) parsed.videos = youtubeFromTools(msg.executed_tools);
    parsed.followUps = Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3) : [];
    parsed.model = usedModel;
    parsed.fallbackModel = usedModel !== requestedModel;
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Coach AI request failed. Please retry.', detail: String(err?.message || err) });
  }
}
