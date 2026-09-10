import { withSupabase } from 'npm:@supabase/server@1.4.1'

const NORMAL_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b'
const SEARCH_MODEL = Deno.env.get('GROQ_SEARCH_MODEL') || 'groq/compound-mini'
const OVERFLOW_MODEL = Deno.env.get('GROQ_FALLBACK_MODEL') || 'groq/compound-mini'

const SYSTEM = `You are Iron Six Coach, an evidence-informed strength and hypertrophy assistant inside an adaptive workout app.
The request contains structured profile, equipment, readiness, current workout, logged sets, recent history, set feedback, analytics, training freshness, training-block state and allowed exercise swaps. Recent conversation turns may also be included; use them to resolve follow-up questions naturally.

Rules:
- Help the user build strength and muscle while respecting their equipment, time and recovery.
- Actual logged weight, reps and RIR outrank demographic estimates; recent set feedback and training-block state are supporting evidence.
- Treat pain/discomfort feedback as a reason not to force progression on that movement. Do not diagnose.
- If trainingState says Manage fatigue or Deload suggested, prefer conservative volume reductions and explain the reason rather than randomly replacing exercises.
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
Use empty arrays when no action/video is needed. No markdown fences.`

function wantsDemo(message: string) {
  return /\b(video|demo|demonstrat|youtube|show me|tutorial|how (do|to) i|form video)\b/i.test(message)
}

function compactSet(input: any) {
  const s = input && typeof input === 'object' ? input : {}
  return {
    weight: s.weight ?? s.weight_text ?? null,
    reps: s.reps ?? s.reps_text ?? null,
    rir: s.rir ?? s.rir_text ?? null,
    done: s.done ?? s.completed ?? null,
    feedback: s.feedback || null,
  }
}

function compactSuggested(value: any) {
  if (!value || typeof value !== 'object') return value || null
  return {
    load: value.load ?? value.weight ?? null,
    target: value.target ?? value.reps ?? null,
    text: String(value.text || value.display || '').slice(0, 180),
    confidence: String(value.confidence || '').slice(0, 80),
    detail: String(value.detail || '').slice(0, 220),
  }
}

function compactHistory(input: unknown) {
  return (Array.isArray(input) ? input : []).slice(0, 4).map((session: any) => ({
    name: session?.name || null,
    date: session?.date || null,
    ts: session?.ts || null,
    workoutKey: session?.workoutKey || null,
    duration: session?.duration || null,
    details: (Array.isArray(session?.details) ? session.details : []).slice(0, 8).map((detail: any) => ({
      name: detail?.name || null,
      base: detail?.base || null,
      sets: (Array.isArray(detail?.sets) ? detail.sets : []).slice(-3).map(compactSet),
    })),
  }))
}

function compactContext(input: unknown) {
  const c = input && typeof input === 'object' ? input as Record<string, any> : {}
  const p = c.profile && typeof c.profile === 'object' ? c.profile : {}
  const today = Array.isArray(c.today)
    ? c.today.slice(-24).map((row: any) => ({ key: row?.key || null, ...compactSet(row) }))
    : Object.entries(c.today && typeof c.today === 'object' ? c.today : {}).slice(-24).map(([key, row]) => ({ key, ...compactSet(row) }))
  const analytics = c.analytics && typeof c.analytics === 'object' ? {
    sessions7: c.analytics.sessions7 ?? null,
    sets7: c.analytics.sets7 ?? null,
    volume7: c.analytics.volume7 ?? null,
    trends: Array.isArray(c.analytics.trends) ? c.analytics.trends.slice(0, 6) : [],
    freshness: c.analytics.freshness || null,
  } : null
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
    workout: (Array.isArray(c.workout) ? c.workout : []).slice(0, 12).map((row: any) => ({
      index: row?.index ?? null,
      name: row?.name || null,
      prescription: String(row?.prescription || '').slice(0, 120),
      base: row?.base || null,
      suggested: compactSuggested(row?.suggested),
    })),
    today,
    history: compactHistory(c.history),
    allowedSwaps: (Array.isArray(c.allowedSwaps) ? c.allowedSwaps : []).slice(0, 12).map((row: any) => ({
      targetIndex: row?.targetIndex ?? null,
      targetName: row?.targetName || null,
      targetBase: row?.targetBase || null,
      replacements: (Array.isArray(row?.replacements) ? row.replacements : []).slice(0, 6),
    })),
    program: c.program || {},
    selectedExercise: c.selectedExercise || null,
    equipmentCoverage: c.equipmentCoverage || null,
    trainingState: c.trainingState || null,
    setFeedback: (Array.isArray(c.setFeedback) ? c.setFeedback : []).slice(0, 12).map((row: any) => ({
      ts: row?.ts || null,
      exercise: row?.exercise || row?.exerciseName || null,
      feedback: row?.feedback || null,
      weight: row?.weight ?? null,
      reps: row?.reps ?? null,
      rir: row?.rir ?? null,
    })),
    analytics,
  }
}

function compactConversation(input: unknown, currentMessage: string) {
  const cleaned = (Array.isArray(input) ? input : []).slice(-6).map((turn: any) => ({
    role: turn?.role === 'assistant' ? 'assistant' : 'user',
    content: String(turn?.text || turn?.content || '').trim().slice(0, 700),
  })).filter((turn: any) => turn.content)
  const last = cleaned[cleaned.length - 1]
  if (last?.role === 'user' && last.content === currentMessage) cleaned.pop()
  return cleaned
}

function parseJson(text: string) {
  const raw = String(text || '').trim()
  try { return JSON.parse(raw) } catch (_) {}
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
  if (a >= 0 && b > a) {
    try { return JSON.parse(raw.slice(a, b + 1)) } catch (_) {}
  }
  return { reply: raw || 'I could not generate a coaching response.', actions: [], videos: [], followUps: [] }
}

function searchVideos(tools: unknown) {
  const out: Array<{ title: string; url: string; source: string }> = []
  for (const tool of Array.isArray(tools) ? tools : []) {
    const t = tool as Record<string, any>
    const candidates = t?.search_results?.results || t?.search_results || []
    for (const r of Array.isArray(candidates) ? candidates : []) {
      const url = String(r?.url || '')
      if (/youtube\.com|youtu\.be/i.test(url)) out.push({ title: r?.title || 'Exercise demonstration', url, source: 'YouTube' })
      if (out.length >= 3) return out
    }
  }
  return out
}

async function callGroq(apiKey: string, model: string, messages: any[], search: boolean) {
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_completion_tokens: 600,
  }
  if (search) requestBody.search_settings = { include_domains: ['youtube.com'] }
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  let body: any = null
  try { body = await response.json() } catch (_) {}
  return { response, body }
}

function recoveryReply(message: string, context: any, retryAfter: string | null) {
  const wait = Number(retryAfter)
  const suffix = Number.isFinite(wait) && wait > 0 ? ` Try again in about ${Math.ceil(wait)} seconds.` : ' Try again in a few seconds.'
  const current = context?.workout?.find((row: any) => row?.name)?.name
  return {
    reply: `The cloud coach hit a temporary rate limit, but your workout data are still intact.${current ? ` I still have ${current} and the rest of today’s plan in context.` : ''}${suffix}`,
    actions: [], videos: [], followUps: [String(message || '').slice(0, 120)], model: 'Iron Six recovery', degraded: true,
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 })

    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return Response.json({ error: 'Cloud Coach is not configured yet.' }, { status: 503 })

    let body: any
    try { body = await req.json() } catch (_) { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const message = String(body?.message || '').trim().slice(0, 1400)
    if (!message) return Response.json({ error: 'Message required' }, { status: 400 })

    const context = compactContext(body?.context)
    const conversation = compactConversation(body?.conversation, message)
    const search = wantsDemo(message)
    const requestedModel = search ? SEARCH_MODEL : NORMAL_MODEL
    const messages = [
      { role: 'system', content: SYSTEM + (search ? '\nThe user wants a demonstration. Use web search and prefer a clear YouTube exercise demonstration. Do not claim you watched a video.' : '') },
      { role: 'user', content: `ACTIVE APP CONTEXT:\n${JSON.stringify(context)}\n\nContinue the conversation below using this live app context.` },
      ...conversation,
      { role: 'user', content: message },
    ]

    try {
      let usedModel = requestedModel
      let attempt = await callGroq(apiKey, usedModel, messages, search)
      if (!attempt.response.ok && attempt.response.status === 429 && !search && OVERFLOW_MODEL !== usedModel) {
        console.warn('Iron Six Coach primary model rate-limited', {
          model: usedModel,
          retryAfter: attempt.response.headers.get('retry-after'),
          remainingTokens: attempt.response.headers.get('x-ratelimit-remaining-tokens'),
        })
        usedModel = OVERFLOW_MODEL
        attempt = await callGroq(apiKey, usedModel, messages, false)
      }

      if (!attempt.response.ok) {
        if (attempt.response.status === 429) return Response.json(recoveryReply(message, context, attempt.response.headers.get('retry-after')), { headers: { 'Cache-Control': 'no-store' } })
        return Response.json({ error: attempt.body?.error?.message || 'AI request failed' }, { status: attempt.response.status })
      }

      const msg = attempt.body?.choices?.[0]?.message || {}
      const out = parseJson(msg?.content || '')
      out.actions = Array.isArray(out.actions) ? out.actions.slice(0, 3) : []
      out.videos = Array.isArray(out.videos) ? out.videos.slice(0, 3) : []
      if (search && !out.videos.length) out.videos = searchVideos(msg?.executed_tools)
      out.followUps = Array.isArray(out.followUps) ? out.followUps.slice(0, 3) : []
      out.model = usedModel
      out.fallbackModel = usedModel !== requestedModel
      return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
    } catch (err) {
      return Response.json({ error: 'Cloud Coach request failed', detail: String(err instanceof Error ? err.message : err) }, { status: 500 })
    }
  }),
}
