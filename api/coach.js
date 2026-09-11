const NORMAL_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const SEARCH_MODEL = process.env.GROQ_SEARCH_MODEL || 'groq/compound-mini';
const OVERFLOW_MODEL = process.env.GROQ_FALLBACK_MODEL || 'groq/compound-mini';

const SYSTEM = `You are Iron Six Coach, an evidence-informed strength and hypertrophy assistant embedded inside a workout app.
You receive structured context about the active user's physical profile, equipment, current workout, logged sets, recent history, set feedback, progress analytics, training freshness, and current training-block state. You may also receive recent conversation turns. Use those turns to resolve follow-up questions naturally instead of treating every message as a new conversation.

Primary goals:
- Help the user get stronger and build muscle while respecting their stated available equipment and time.
- Answer the user's exact question first. If they ask whether a specific setup, grip, position, technique, or variation can work, address that exact proposed setup before mentioning a more conventional alternative. Never silently replace the setup they asked about with a different exercise variation.
- Base load advice primarily on actual logged performance (weight, reps, RIR), then recent set feedback and training-block state. Profile variables are only conservative starting context when performance data are absent.
- Treat "too easy / about right / too hard" feedback as supporting evidence, not as stronger evidence than recorded reps and RIR.
- Treat pain/discomfort feedback as a reason to avoid forcing progression on that movement. Do not diagnose.
- If trainingState indicates Manage fatigue or Deload suggested, explain why and prefer conservative volume changes over arbitrary exercise churn.
- Explain recommendations briefly and clearly. For ordinary questions, usually answer in 2-5 sentences unless the user asks for detail.
- Never invent equipment the user does not have.
- equipmentCoverage is measured, not estimated: it reports how many exercise options each movement slot has with the user's actual equipment. When asked what equipment to buy or how their setup limits them, reason from emptySlots and thinSlots and recommend only from wouldHelp. Say plainly when a slot has no option at all. Items in conditioningOnly add no strength exercises; items in unrecognized are equipment the app could not identify, so ask what it is rather than guessing.
- If the user asks to change an exercise, choose only an EXACT replacementName from the allowedSwaps list for that target exercise. If none fits, explain instead of creating an action.
- If the user asks for a shorter/longer workout, you may return a set_duration action from 10 to 120 minutes.
- If the user reports sharp pain, sudden injury, neurological symptoms, chest pain, fainting, or other concerning symptoms, do not optimize through it. Recommend stopping the provoking exercise and seeking appropriate medical evaluation when warranted. Do not diagnose.
- Ordinary muscle soreness/fatigue can be handled with conservative training modifications.
- When discussing exercise form, emphasize controllable technique cues rather than claiming one universally perfect form.
- You are the cloud-hosted Iron Six Coach. Never claim that you are running locally or on-device. If asked about backend status, answer only from the transport metadata supplied by the server.`;

function wantsSearch(message) {
  return /\b(video|demo|demonstrat|youtube|how (do|to) i|form video|show me|tutorial)\b/i.test(message);
}

function wantsAction(message) {
  const text = String(message || '');
  return /\b(swap|replace|substitute|switch|change)\b.{0,45}\b(exercise|movement)\b/i.test(text)
    || /\b(shorter|longer|duration|workout length|\d+\s*minutes?)\b/i.test(text);
}

function isCloudStatusQuestion(message) {
  const text = String(message || '');
  return /\b(cloud|coach|model|ai)\b.*\b(working|online|available|connected|responding)\b/i.test(text)
    || /\b(working|online|available|connected|responding)\b.*\b(cloud|coach|model|ai)\b/i.test(text);
}

function compactSet(set) {
  const s = set && typeof set === 'object' ? set : {};
  return { weight: s.weight ?? s.weight_text ?? null, reps: s.reps ?? s.reps_text ?? null, rir: s.rir ?? s.rir_text ?? null, done: s.done ?? s.completed ?? null, feedback: s.feedback || null };
}

function compactSuggested(value) {
  if (!value || typeof value !== 'object') return value || null;
  return { load: value.load ?? value.weight ?? null, target: value.target ?? value.reps ?? null, text: String(value.text || value.display || '').slice(0, 120), confidence: String(value.confidence || '').slice(0, 60), detail: String(value.detail || '').slice(0, 120) };
}

function compactHistory(input) {
  return (Array.isArray(input) ? input : []).slice(0, 3).map(session => ({
    name: session?.name || null, date: session?.date || null, ts: session?.ts || null, workoutKey: session?.workoutKey || null, duration: session?.duration || null,
    details: (Array.isArray(session?.details) ? session.details : []).slice(0, 5).map(detail => ({ name: detail?.name || null, base: detail?.base || null, sets: (Array.isArray(detail?.sets) ? detail.sets : []).slice(-2).map(compactSet) })),
  }));
}

function compactAnalytics(input) {
  if (!input || typeof input !== 'object') return null;
  return { sessions7: input.sessions7 ?? null, sets7: input.sets7 ?? null, volume7: input.volume7 ?? null, trends: Array.isArray(input.trends) ? input.trends.slice(0, 4) : [], freshness: input.freshness || null };
}

function compactCoverage(input) {
  if (!input || typeof input !== 'object') return null;
  return {
    score: input.score ?? null, slotsCovered: input.slotsCovered ?? null, slotsTotal: input.slotsTotal ?? null,
    emptySlots: Array.isArray(input.emptySlots) ? input.emptySlots.slice(0, 6) : [], thinSlots: Array.isArray(input.thinSlots) ? input.thinSlots.slice(0, 6) : [],
    wouldHelp: Array.isArray(input.wouldHelp) ? input.wouldHelp.slice(0, 6) : [], unrecognized: Array.isArray(input.unrecognized) ? input.unrecognized.slice(0, 6) : [], conditioningOnly: Array.isArray(input.conditioningOnly) ? input.conditioningOnly.slice(0, 6) : [],
  };
}

function compactContext(input) {
  const c = input && typeof input === 'object' ? input : {};
  const p = c.profile && typeof c.profile === 'object' ? c.profile : {};
  const today = Array.isArray(c.today)
    ? c.today.slice(-16).map(row => ({ key: row?.key || null, ...compactSet(row) }))
    : Object.entries(c.today && typeof c.today === 'object' ? c.today : {}).slice(-16).map(([key, row]) => ({ key, ...compactSet(row) }));
  const program = c.program && typeof c.program === 'object' ? c.program : {};
  return {
    profile: { name: p.name || null, bodyWeight: p.bodyWeight ?? p.weight ?? null, age: p.age ?? null, heightIn: p.heightIn ?? null, trainingLevel: p.trainingLevel || null, equipment: Array.isArray(p.equipment) ? p.equipment.slice(0, 14) : [], capacities: p.capacities || null, workoutMinutes: p.workoutMinutes ?? null },
    readiness: c.readiness || {},
    workout: (Array.isArray(c.workout) ? c.workout : []).slice(0, 8).map(row => ({ index: row?.index ?? null, name: row?.name || null, prescription: String(row?.prescription || '').slice(0, 100), base: row?.base || null, suggested: compactSuggested(row?.suggested) })),
    today,
    history: compactHistory(c.history),
    allowedSwaps: (Array.isArray(c.allowedSwaps) ? c.allowedSwaps : []).slice(0, 8).map(row => ({ targetIndex: row?.targetIndex ?? null, targetName: row?.targetName || null, replacements: (Array.isArray(row?.replacements) ? row.replacements : []).slice(0, 4) })),
    program: { currentWorkoutKey: program.currentWorkoutKey || null, exposures: program.exposures || null, lastAdaptation: program.lastAdaptation || null },
    selectedExercise: c.selectedExercise || null,
    equipmentCoverage: compactCoverage(c.equipmentCoverage),
    trainingState: c.trainingState || null,
    setFeedback: (Array.isArray(c.setFeedback) ? c.setFeedback : []).slice(0, 8).map(row => ({ ts: row?.ts || null, exercise: row?.exercise || row?.exerciseName || null, feedback: row?.feedback || null, weight: row?.weight ?? null, reps: row?.reps ?? null, rir: row?.rir ?? null })),
    analytics: compactAnalytics(c.analytics),
  };
}

function compactConversation(input, currentMessage) {
  const cleaned = (Array.isArray(input) ? input : []).slice(-5).map(turn => ({ role: turn?.role === 'assistant' ? 'assistant' : 'user', content: String(turn?.text || turn?.content || '').trim().slice(0, 400) })).filter(turn => turn.content);
  const last = cleaned[cleaned.length - 1];
  if (last?.role === 'user' && last.content === currentMessage) cleaned.pop();
  return cleaned;
}

function decodeReplyFragment(fragment) {
  let out = '', escaped = false;
  for (let i = 0; i < fragment.length; i++) {
    const c = fragment[i];
    if (escaped) {
      if (c === 'n') out += '\n';
      else if (c === 'r') out += '\r';
      else if (c === 't') out += '\t';
      else if (c === 'b') out += '\b';
      else if (c === 'f') out += '\f';
      else if (c === 'u' && /^[0-9a-fA-F]{4}$/.test(fragment.slice(i + 1, i + 5))) { out += String.fromCharCode(parseInt(fragment.slice(i + 1, i + 5), 16)); i += 4; }
      else out += c;
      escaped = false;
      continue;
    }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') break;
    out += c;
  }
  return out.trim();
}

function cleanModelOutput(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {} }
  const marker = /["']reply["']\s*:\s*"/i.exec(raw);
  if (marker) {
    const reply = decodeReplyFragment(raw.slice(marker.index + marker[0].length));
    if (reply) return { reply, actions: [], videos: [], followUps: [], salvaged: true };
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

async function callGroq(model, messages, useSearch) {
  const request = { model, messages, temperature: 0.2, max_completion_tokens: 800 };
  if (/^openai\/gpt-oss-(20b|120b)$/.test(model)) {
    request.reasoning_effort = 'low';
    request.include_reasoning = false;
  }
  if (useSearch) request.citation_options = 'enabled';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  let body;
  try { body = await response.json(); } catch (_) { body = null; }
  return { response, body };
}

function retryableProviderStatus(status) {
  return status === 400 || status === 408 || status === 429 || status >= 500;
}

function recoveryReply(message, context, retryAfter) {
  const wait = Number(retryAfter);
  const suffix = Number.isFinite(wait) && wait > 0 ? ` Try again in about ${Math.ceil(wait)} seconds.` : ' Try again in a few seconds.';
  const current = context?.workout?.find(row => row?.name)?.name;
  return {
    reply: `The cloud coach is temporarily rate-limited, but your workout data are still intact.${current ? ` I still have ${current} and the rest of today’s plan in context.` : ''}${suffix}`,
    actions: [], videos: [], followUps: [String(message || '').slice(0, 120)], model: 'Iron Six cloud recovery', degraded: true,
  };
}

function sanitizeActions(actions) {
  return (Array.isArray(actions) ? actions : []).slice(0, 3).map(action => {
    if (action?.type === 'swap_exercise') return { type: 'swap_exercise', targetIndex: Number(action.targetIndex), replacementName: String(action.replacementName || ''), reason: String(action.reason || '') };
    if (action?.type === 'set_duration') return { type: 'set_duration', minutes: Number(action.minutes), reason: String(action.reason || '') };
    return null;
  }).filter(Boolean);
}

function formattingInstruction(structured) {
  return structured
    ? 'Return one JSON object with keys reply, actions, videos, and followUps. Use empty arrays when none are needed. Do not use markdown fences.'
    : 'Answer the user in plain text only — no JSON wrapper, no markdown fence, and no field names. Lead with the direct answer to the exact setup they asked about, then give only the most relevant caveat or alternative.';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Coach AI is not configured. GROQ_API_KEY is missing from the production environment.' });

  const message = String(req.body?.message || '').trim().slice(0, 1200);
  if (!message) return res.status(400).json({ error: 'Message required' });
  const context = compactContext(req.body?.context);
  const conversation = compactConversation(req.body?.conversation, message);
  const useSearch = wantsSearch(message);
  const structured = useSearch || wantsAction(message);
  const requestedModel = useSearch ? SEARCH_MODEL : NORMAL_MODEL;
  const extra = useSearch ? 'The user wants or may benefit from a demonstration. If useful, use web search and prioritize a clear reputable exercise demonstration. Return direct video/page URLs in videos. Do not claim you watched a video.' : '';

  try {
    const messages = [
      { role: 'system', content: `${SYSTEM}\n${formattingInstruction(structured)}\n${extra}` },
      { role: 'user', content: `TRANSPORT: cloud-hosted Iron Six Coach.\nACTIVE APP CONTEXT:\n${JSON.stringify(context)}\n\nContinue the conversation below using this live app context.` },
      ...conversation,
      { role: 'user', content: message }
    ];

    let usedModel = requestedModel;
    let attempt = await callGroq(usedModel, messages, useSearch);
    if (!attempt.response.ok && retryableProviderStatus(attempt.response.status)) {
      const alternate = usedModel === NORMAL_MODEL ? OVERFLOW_MODEL : NORMAL_MODEL;
      console.warn('Iron Six Coach primary provider attempt failed', {
        model: usedModel,
        status: attempt.response.status,
        error: attempt.body?.error?.message || null,
        retryAfter: attempt.response.headers.get('retry-after'),
      });
      if (alternate && alternate !== usedModel) {
        usedModel = alternate;
        attempt = await callGroq(usedModel, messages, false);
      }
    }

    if (!attempt.response.ok) {
      console.error('Iron Six Coach provider failed after retry', { model: usedModel, status: attempt.response.status, error: attempt.body?.error?.message || null });
      if (attempt.response.status === 429) return res.status(200).json(recoveryReply(message, context, attempt.response.headers.get('retry-after')));
      return res.status(502).json({ error: attempt.body?.error?.message || `Coach provider failed (${attempt.response.status}). Please retry.` });
    }

    let choice = attempt.body?.choices?.[0] || {};
    if (choice.finish_reason === 'length') {
      const alternate = usedModel === NORMAL_MODEL ? OVERFLOW_MODEL : NORMAL_MODEL;
      if (alternate && alternate !== usedModel) {
        const retryMessages = [...messages, { role: 'user', content: 'Your previous answer was cut off. Answer the same question completely in no more than 120 words.' }];
        const retry = await callGroq(alternate, retryMessages, false);
        if (retry.response.ok) { usedModel = alternate; attempt = retry; choice = retry.body?.choices?.[0] || {}; }
      }
    }

    const msg = choice.message || {};
    const parsed = cleanModelOutput(msg.content);
    parsed.reply = String(parsed.reply || 'I could not generate a coaching response.');
    parsed.actions = sanitizeActions(parsed.actions);
    parsed.videos = Array.isArray(parsed.videos) ? parsed.videos.slice(0, 3) : [];
    if (useSearch && !parsed.videos.length) parsed.videos = youtubeFromTools(msg.executed_tools);
    parsed.followUps = Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3) : [];
    parsed.model = usedModel;
    parsed.fallbackModel = usedModel !== requestedModel;
    parsed.truncated = choice.finish_reason === 'length';
    if (isCloudStatusQuestion(message)) {
      parsed.reply = parsed.fallbackModel
        ? 'Yes — the cloud Coach is responding right now through its backup cloud model.'
        : 'Yes — the cloud Coach is responding right now.';
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Iron Six Coach request exception', { error: String(err?.message || err) });
    return res.status(500).json({ error: 'Coach AI request failed. Please retry.', detail: String(err?.message || err) });
  }
}
