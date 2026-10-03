(() => {
  if (window.__ironSixLocalAiFetchWrapped) return;
  window.__ironSixLocalAiFetchWrapped = true;

  const nativeFetch = window.fetch.bind(window);
  const MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  const CLOUD_TIMEOUT_MS = 9000;
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

  function nextExercise(context){
    const workout=Array.isArray(context.workout)?context.workout:[],today=Array.isArray(context.today)?context.today:[];
    return workout.find((ex,index)=>{
      const count=Number(ex.sets)||Number(String(ex.prescription||'').match(/^(\d+)\s*[×x]/)?.[1])||1;
      const completed=new Set(today.filter(set=>set.done===true).map(set=>{
        const parts=String(set.key||'').split('-').map(Number);
        const ei=Number.isInteger(set.exerciseIndex)?set.exerciseIndex:parts[0],si=Number.isInteger(set.setIndex)?set.setIndex:parts[1];
        return ei===(Number.isInteger(ex.index)?ex.index:index)&&Number.isInteger(si)&&si>=0&&si<count?si:null;
      }).filter(i=>i!==null));
      return completed.size<count;
    })||null;
  }

  function exerciseMatch(payload) {
    const context=payload?.context||{},workout=Array.isArray(context.workout)?context.workout:[];
    const message=String(payload?.message||'').toLowerCase();
    const named=workout.find(ex=>ex.name&&message.includes(ex.name.toLowerCase()));
    if(named)return named;
    const ordinal=message.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|last)\s+exercise\b/);
    if(ordinal){const index=ordinal[1]==='last'?workout.length-1:['first','second','third','fourth','fifth','sixth','seventh','eighth'].indexOf(ordinal[1]);return workout[index]||null}
    const numbered=message.match(/\bexercise\s*#?\s*(\d+)\b/);
    if(numbered)return workout[Number(numbered[1])-1]||null;
    if(/\bnext exercise\b/.test(message))return nextExercise(context);
    // A guide opened in a previous workout/profile is not an implicit selection for
    // an unrelated question. Pronouns may reuse only a movement still in this plan.
    if(/\b(this|that|it|selected|current)\b/.test(message)){
      const selected=context.selectedExercise;
      return workout.find(ex=>ex.name===selected?.name)||null;
    }
    return null;
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
    const match=exerciseMatch(payload);
    const light=c.profile?.workoutDifficulty==='light'||c.workoutDifficulty==='light';

    if(match && wantsExerciseTeaching(payload) && window.IronSixExerciseGuide){
      return window.IronSixExerciseGuide.teachingResponse(match);
    }
    if (/warm.?up/.test(message) && (match||first)) {
      const target=match||first;
      const s = target.suggested?.text || target.suggested?.weight || target.suggested?.display || '';
      return { reply: `For ${target.name}, ramp up gradually before your work sets. Start with an easy technique set, then use roughly 50%, 70%, and 85% of the planned working load with progressively fewer reps. Your current working suggestion is ${s || 'shown in the workout'}. Warm-ups should prepare you, not fatigue you.`, actions: [], videos: [], followUps: [`Teach me ${target.name}`] };
    }
    if (/what should i do next|what next|next exercise/.test(message) && first) {
      const current=nextExercise(c);
      if(!current)return {reply:'All prescribed sets are complete. Review your logged work and finish the workout when ready.',actions:[],videos:[],followUps:[]};
      return { reply: `Continue with ${current.name}: ${current.prescription || 'use the prescribed sets and reps'}. Keep the target RIR from today’s plan and log the actual weight, reps, and RIR so Iron Six can adjust your next recommendation.`, actions: [], videos: [], followUps: [`Teach me ${current.name}`,'Are my suggested weights right?'] };
    }
    if (/deload|too tired|fatigue/.test(message)) {
      const energy = Number(c.readiness?.energy || 4), soreness = Number(c.readiness?.soreness || 1);
      const highFatigue = energy <= 2 || soreness >= 4;
      return { reply: highFatigue ? 'Your readiness is showing enough fatigue that I would reduce today’s accessory volume and keep several reps in reserve. One low-readiness day alone does not automatically require a full deload; repeated performance drops across several sessions would be a stronger signal.' : 'Your current readiness does not, by itself, suggest a deload. Look for repeated performance regression, unusually high soreness/fatigue, or several sessions where normal loads feel much harder than expected before scheduling one.', actions: [], videos: [], followUps: ['What should I do next?'] };
    }
    if (/weight|load|too heavy|too light/.test(message)) {
      const target=match?.name?` for ${match.name}`:'';
      if(light)return {reply:`Use the Light working suggestion${target} for comfortable effort with about 4 reps in reserve. Reduce resistance or reps if you cannot keep that reserve and clean form. Light days do not require increasing weight when a set feels easy; adjust Today’s difficulty if you want a more demanding session. Log the actual weight, reps and RIR so future suggestions use your performance.`,actions:[],videos:[],followUps:match?.name?[`Teach me ${match.name}`]:['Give me warm-up sets']};
      return { reply: `Use the suggested load${target} as a starting target, but your actual set performance wins. If you exceed the top of the rep range with about 2+ reps still in reserve, increase next time. If you miss the rep range or unexpectedly hit 0 RIR, hold or reduce the load. Iron Six saves those results and updates future suggestions.`, actions: [], videos: [], followUps: match?.name?[`Teach me ${match.name}`]:['Give me warm-up sets'] };
    }
    return { reply: 'The cloud Coach could not be reached for this message, so I am using Iron Six’s built-in workout guidance. Your workout data are still intact.', actions: [], videos: [], followUps: ['Try the cloud Coach again'] };
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
    const system = `You are Iron Six Coach, an evidence-informed strength and hypertrophy assistant running locally on the user's device. Be concise. Use actual logged weight, reps and RIR before demographic estimates. Respect available equipment and the supplied workoutDifficulty. Light means comfortable effort with about 4 reps in reserve, lighter resistance and bodyweight when appropriate; do not push failure or automatically increase Light loads after easy feedback. Heavy favors available barbells/machines, never maximal loading. Suggest changing Today's difficulty when the user wants a different effort. Do not diagnose injuries. If sharp pain or concerning symptoms are reported, tell the user to stop the provoking movement and seek appropriate medical evaluation. Return JSON with reply, actions, videos and followUps.`;
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

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timeout`)),ms))
    ]);
  }

  async function supabaseCoach(payload){
    const cloud=window.IronSixCloud,client=cloud?.client?.(),session=cloud?.session?.();
    if(!client||!session?.user)return null;
    const enriched={...payload,context:{...(payload.context||{}),selectedExercise:payload?.context?.selectedExercise||null}};
    try{
      const result=await withTimeout(client.functions.invoke('coach',{body:enriched}),CLOUD_TIMEOUT_MS,'Supabase Coach');
      if(result?.error||!result?.data)return null;
      return result.data;
    }catch(_){return null}
  }

  async function vercelCoach(input,init,payload){
    let timer;
    try{
      const controller=new AbortController();
      timer=setTimeout(()=>controller.abort(),CLOUD_TIMEOUT_MS);
      const response=await nativeFetch(input,{...(init||{}),body:JSON.stringify(payload),signal:controller.signal});
      if(!response.ok)return null;
      const contentType=response.headers.get('content-type')||'';
      if(!contentType.includes('application/json'))return null;
      return response;
    }catch(_){return null}
    finally{if(timer)clearTimeout(timer)}
  }

  function sameOriginCloudAvailable(){
    return /^https?:$/.test(window.location?.protocol || '');
  }

  window.fetch = async function ironSixFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const isCoach = url === '/api/coach' && String(init?.method || 'GET').toUpperCase() === 'POST';
    if (!isCoach) return nativeFetch(input, init);

    let payload = {};
    try { payload = JSON.parse(init?.body || '{}'); } catch (_) {}
    const selected=payload?.context?.selectedExercise||window.__ironSixSelectedExercise;
    payload.context={...(payload.context||{}),selectedExercise:(payload?.context?.workout||[]).find(ex=>ex.name===selected?.name)||null};

    if(wantsExerciseTeaching(payload) && window.IronSixExerciseGuide){
      const output=window.IronSixExerciseGuide.teachingResponse(exerciseMatch(payload));
      return new Response(JSON.stringify(output),{status:200,headers:{'Content-Type':'application/json','X-Iron-Six-Coach':'exercise-guide'}});
    }

    // On the hosted web app, use the same-origin Vercel function first. This avoids
    // waiting on one cloud path only to start a second request afterward.
    if(sameOriginCloudAvailable()){
      const cloudResponse=await vercelCoach(input,init,payload);
      if(cloudResponse)return cloudResponse;
      const supabaseOutput=await supabaseCoach(payload);
      if(supabaseOutput)return new Response(JSON.stringify(supabaseOutput),{status:200,headers:{'Content-Type':'application/json','X-Iron-Six-Coach':'supabase'}});
    }else{
      // Native/static builds cannot rely on a relative /api route, so authenticated
      // Supabase remains their first cloud path.
      const supabaseOutput=await supabaseCoach(payload);
      if(supabaseOutput)return new Response(JSON.stringify(supabaseOutput),{status:200,headers:{'Content-Type':'application/json','X-Iron-Six-Coach':'supabase'}});
    }

    const output=deterministicFallback(payload);
    output.model='Built-in adaptive coach';
    return new Response(JSON.stringify(output), {status:200,headers:{'Content-Type':'application/json','X-Iron-Six-Coach':'local'}});
  };
})();
