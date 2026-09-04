(() => {
  if (window.__ironSixLocalAiFetchWrapped) return;
  window.__ironSixLocalAiFetchWrapped = true;

  const nativeFetch = window.fetch.bind(window);
  const MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  let enginePromise = null;

  function safeJson(text) {
    const raw = String(text || '').trim();
    try { return JSON.parse(raw); } catch (_) {}
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(raw.slice(a, b + 1)); } catch (_) {}
    }
    return { reply: raw || 'I could not generate a local coaching response.', actions: [], videos: [], followUps: [] };
  }

  function deterministicFallback(payload) {
    const message = String(payload?.message || '').toLowerCase();
    const c = payload?.context || {};
    const workout = Array.isArray(c.workout) ? c.workout : [];
    const today = Array.isArray(c.today) ? c.today : [];
    const first = workout[0];
    const completed = today.filter(s => s.done).length;

    if (/warm.?up/.test(message) && first) {
      const s = first.suggested?.weight || first.suggested?.display || '';
      return { reply: `For ${first.name}, ramp up gradually before your work sets. A simple sequence is an easy technique set, then roughly 50%, 70%, and 85% of your planned working load with progressively fewer reps. Your current working suggestion is ${s || 'shown in the workout'}. Keep warm-ups easy; they should prepare you, not fatigue you.`, actions: [], videos: [], followUps: ['Why is this weight suggested?'] };
    }
    if (/what should i do next|what next|next exercise/.test(message) && first) {
      const current = workout[Math.min(workout.length - 1, Math.floor(completed / Math.max(1, Number(first.sets || 1))))] || first;
      return { reply: `Continue with ${current.name}: ${current.prescription || 'use the prescribed sets and reps'}. Keep the target RIR from today’s plan and log the actual weight, reps, and RIR so Iron Six can adjust your next recommendation.`, actions: [], videos: [], followUps: ['Are my suggested weights right?'] };
    }
    if (/deload|too tired|fatigue/.test(message)) {
      const energy = Number(c.readiness?.energy || 4), soreness = Number(c.readiness?.soreness || 1);
      const highFatigue = energy <= 2 || soreness >= 4;
      return { reply: highFatigue ? 'Your readiness is currently showing enough fatigue that I would reduce today’s accessory volume and keep several reps in reserve. One low-readiness day alone does not automatically require a full deload; repeated performance drops across several sessions would be a stronger signal.' : 'Your current readiness does not, by itself, suggest a deload. I would look for repeated performance regression, unusually high soreness/fatigue, or several sessions where normal loads feel much harder than expected before scheduling one.', actions: [], videos: [], followUps: ['What should I do next?'] };
    }
    if (/weight|load|too heavy|too light/.test(message)) {
      return { reply: 'Use the suggested load as a starting target, but your actual set performance wins. If you exceed the top of the rep range with about 2+ reps still in reserve, increase next time. If you miss the rep range or unexpectedly hit 0 RIR, hold or reduce the load. Iron Six saves those results and updates future suggestions.', actions: [], videos: [], followUps: ['Give me warm-up sets'] };
    }
    return { reply: 'The cloud coach is not configured, so I am using the on-device fallback. I can still use your current workout, equipment, readiness, logged sets, and recent performance to help with exercise choices, loading, warm-ups, fatigue, and workout length.', actions: [], videos: [], followUps: ['What should I do next?', 'Are my suggested weights right?'] };
  }

  async function getEngine() {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable');
    if (!enginePromise) {
      enginePromise = (async () => {
        const webllm = await import('https://esm.run/@mlc-ai/web-llm@0.2.84');
        return webllm.CreateMLCEngine(MODEL, {
          initProgressCallback: (p) => {
            window.dispatchEvent(new CustomEvent('iron-six-local-ai-progress', { detail: p }));
          }
        });
      })().catch(err => { enginePromise = null; throw err; });
    }
    return enginePromise;
  }

  async function localCoach(payload) {
    const engine = await getEngine();
    const context = payload?.context || {};
    const allowed = Array.isArray(context.allowedSwaps) ? context.allowedSwaps : [];
    const system = `You are Iron Six Coach, an evidence-informed strength and hypertrophy assistant running locally on the user's device. Be concise. Use actual logged weight, reps and RIR before demographic estimates. Respect available equipment. Do not diagnose injuries. If sharp pain or concerning symptoms are reported, tell the user to stop the provoking movement and seek appropriate medical evaluation.\n\nReturn ONLY JSON: {"reply":"...","actions":[],"videos":[],"followUps":[]}. You may add a swap_exercise action only by copying an EXACT replacement name from allowedSwaps. You may add set_duration from 10-120 minutes. No markdown.`;
    const prompt = `APP CONTEXT:\n${JSON.stringify({ ...context, allowedSwaps: allowed }).slice(0, 14000)}\n\nUSER:\n${String(payload?.message || '').slice(0, 1400)}`;
    const result = await engine.chat.completions.create({
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 650
    });
    const out = safeJson(result?.choices?.[0]?.message?.content);
    out.actions = Array.isArray(out.actions) ? out.actions.slice(0, 2) : [];
    out.videos = [];
    out.followUps = Array.isArray(out.followUps) ? out.followUps.slice(0, 3) : [];
    out.model = 'On-device Qwen 0.5B';
    return out;
  }

  window.fetch = async function ironSixFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const isCoach = url === '/api/coach' && String(init?.method || 'GET').toUpperCase() === 'POST';
    if (!isCoach) return nativeFetch(input, init);

    let cloudResponse = null;
    try {
      cloudResponse = await nativeFetch(input, init);
      if (cloudResponse.ok) return cloudResponse;
      if (![404, 500, 502, 503].includes(cloudResponse.status)) return cloudResponse;
    } catch (_) {}

    let payload = {};
    try { payload = JSON.parse(init?.body || '{}'); } catch (_) {}
    let output;
    try { output = await localCoach(payload); }
    catch (_) { output = deterministicFallback(payload); output.model = 'Built-in offline coach'; }

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Iron-Six-Coach': 'local' }
    });
  };
})();
