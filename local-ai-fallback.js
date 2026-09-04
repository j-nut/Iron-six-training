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

  function exerciseMatch(payload) {
    const g=window.IronSixExerciseGuide;
    if(!g)return null;
    return g.findInContext(payload?.message||'',payload?.context||{}) || window.__ironSixSelectedExercise || null;
  }

  function wantsExerciseTeaching(payload) {
    const message=String(payload?.message||'').toLowerCase();
    return !!exerciseMatch(payload) && /teach|how (do|to)|show me|demo|demonstrat|form|technique|what is|explain.*exercise/.test(message);
  }

  function deterministicFallback(payload) {
    const message = String(payload?.message || '').toLowerCase();
    const c = payload?.context || {};
    const workout = Array.isArray(c.workout) ? c.workout : [];
    const today = Array.isArray(c.today) ? c.today : [];
    const first = workout[0];
    const completed = today.filter(s => s.done).length;
    const match=exerciseMatch(payload);

    if(match && wantsExerciseTeaching(payload) && window.IronSixExerciseGuide){
      return window.IronSixExerciseGuide.teachingResponse(match);
    }
    if (/warm.?up/.test(message) && (match||first)) {
      const target=match||first;
      const s = target.suggested?.weight || target.suggested?.display || '';
      return { reply: `For ${target.name}, ramp up gradually before your work sets. Start with an easy technique set, then use roughly 50%, 70%, and 85% of the planned working load with progressively fewer reps. Your current working suggestion is ${s || 'shown in the workout'}. Warm-ups should prepare you, not fatigue you.`, actions: [], videos: [], followUps: [`Teach me ${target.name}`] };
    }
    if (/what should i do next|what next|next exercise/.test(message) && first) {
      const current = workout[Math.min(workout.length - 1, Math.floor(completed / Math.max(1, Number(first.sets || 1))))] || first;
      return { reply: `Continue with ${current.name}: ${current.prescription || 'use the prescribed sets and reps'}. Keep the target RIR from today’s plan and log the actual weight, reps, and RIR so Iron Six can adjust your next recommendation.`, actions: [], videos: [], followUps: [`Teach me ${current.name}`,'Are my suggested weights right?'] };
    }
    if (/deload|too tired|fatigue/.test(message)) {
      const energy = Number(c.readiness?.energy || 4), soreness = Number(c.readiness?.soreness || 1);
      const highFatigue = energy <= 2 || soreness >= 4;
      return { reply: highFatigue ? 'Your readiness is showing enough fatigue that I would reduce today’s accessory volume and keep several reps in reserve. One low-readiness day alone does not automatically require a full deload; repeated performance drops across several sessions would be a stronger signal.' : 'Your current readiness does not, by itself, suggest a deload. Look for repeated performance regression, unusually high soreness/fatigue, or several sessions where normal loads feel much harder than expected before scheduling one.', actions: [], videos: [], followUps: ['What should I do next?'] };
    }
    if (/weight|load|too heavy|too light/.test(message)) {
      const target=match?.name?` for ${match.name}`:'';
      return { reply: `Use the suggested load${target} as a starting target, but your actual set performance wins. If you exceed the top of the rep range with about 2+ reps still in reserve, increase next time. If you miss the rep range or unexpectedly hit 0 RIR, hold or reduce the load. Iron Six saves those results and updates future suggestions.`, actions: [], videos: [], followUps: match?.name?[`Teach me ${match.name}`]:['Give me warm-up sets'] };
    }
    return { reply: 'I can still coach this session even when the cloud model is unavailable. I can use your current workout, equipment, readiness, logged sets, recent performance, and the built-in exercise guide for form, loading, warm-ups, fatigue, and workout changes.', actions: [], videos: [], followUps: ['What should I do next?', 'Are my suggested weights right?'] };
  }

  async function getEngine() {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable');
    if (!enginePromise) {
      enginePromise = (async () => {
        const webllm = await import('https://esm.run/@mlc-ai/web-llm@0.2.84');
        return webllm.CreateMLCEngine(MODEL, {
          initProgressCallback: (p) => window.dispatchEvent(new CustomEvent('iron-six-local-ai-progress', { detail: p }))
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
    const result = await engine.chat.completions.create({messages:[{role:'system',content:system},{role:'user',content:prompt}],temperature:0.2,max_tokens:650});
    const out = safeJson(result?.choices?.[0]?.message?.content);
    out.actions = Array.isArray(out.actions) ? out.actions.slice(0, 2) : [];
    out.videos = Array.isArray(out.videos) ? out.videos.slice(0,2) : [];
    const match=exerciseMatch(payload);
    if(match && /video|demo|show me|how (do|to)|form/.test(String(payload?.message||'').toLowerCase()) && window.IronSixExerciseGuide){
      const v=window.IronSixExerciseGuide.guideFor(match).videoUrl;
      if(v&&!out.videos.some(x=>x.url===v))out.videos.push({title:`Find a ${match.name} video demonstration`,url:v,source:'YouTube'});
    }
    out.followUps = Array.isArray(out.followUps) ? out.followUps.slice(0, 3) : [];
    out.model = 'On-device Qwen 0.5B';
    return out;
  }

  async function supabaseCoach(payload){
    const cloud=window.IronSixCloud,client=cloud?.client?.(),session=cloud?.session?.();
    if(!client||!session?.user)return null;
    const enriched={...payload,context:{...(payload.context||{}),selectedExercise:window.__ironSixSelectedExercise||payload?.context?.selectedExercise||null}};
    try{
      const result=await Promise.race([
        client.functions.invoke('coach',{body:enriched}),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('Supabase Coach timeout')),5500))
      ]);
      if(result?.error||!result?.data)return null;
      return result.data;
    }catch(_){return null}
  }

  window.fetch = async function ironSixFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const isCoach = url === '/api/coach' && String(init?.method || 'GET').toUpperCase() === 'POST';
    if (!isCoach) return nativeFetch(input, init);

    let payload = {};
    try { payload = JSON.parse(init?.body || '{}'); } catch (_) {}
    payload.context={...(payload.context||{}),selectedExercise:window.__ironSixSelectedExercise||payload?.context?.selectedExercise||null};

    // Exercise teaching is intentionally instant and deterministic. AI handles follow-ups.
    if(wantsExerciseTeaching(payload) && window.IronSixExerciseGuide){
      const output=window.IronSixExerciseGuide.teachingResponse(exerciseMatch(payload));
      return new Response(JSON.stringify(output),{status:200,headers:{'Content-Type':'application/json','X-Iron-Six-Coach':'exercise-guide'}});
    }

    // First choice when signed in: authenticated Supabase Edge Function.
    const supabaseOutput=await supabaseCoach(payload);
    if(supabaseOutput){
      return new Response(JSON.stringify(supabaseOutput),{status:200,headers:{'Content-Type':'application/json','X-Iron-Six-Coach':'supabase'}});
    }

    // Backward-compatible Vercel route if it happens to be configured.
    try {
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),3000);
      const cloudResponse = await nativeFetch(input,{...(init||{}),body:JSON.stringify(payload),signal:controller.signal});
      clearTimeout(timer);
      if (cloudResponse.ok) return cloudResponse;
      if (![404, 500, 502, 503].includes(cloudResponse.status)) return cloudResponse;
    } catch (_) {}

    let output;
    // Common coaching questions do not need a model download.
    if(/warm.?up|what should i do next|what next|next exercise|deload|too tired|fatigue|weight|load|too heavy|too light/.test(String(payload?.message||'').toLowerCase())){
      output=deterministicFallback(payload);output.model='Built-in adaptive coach';
    }else{
      try { output = await localCoach(payload); }
      catch (_) { output = deterministicFallback(payload); output.model = 'Built-in adaptive coach'; }
    }

    return new Response(JSON.stringify(output), {status:200,headers:{'Content-Type':'application/json','X-Iron-Six-Coach':'local'}});
  };
})();
