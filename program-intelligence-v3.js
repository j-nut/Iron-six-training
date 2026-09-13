/* Rolling program intelligence.
 * Reads completed work only. It does not advance the rotation, invent exercises, or alter
 * an in-progress draft. The deterministic planner remains authoritative; Groq receives this
 * context as a second opinion after completed sessions and in Coach conversations.
 */
(() => {
  if (window.__ironSixProgramIntelligenceV3Loaded) return;
  window.__ironSixProgramIntelligenceV3Loaded = true;

  const TARGETS = {
    chest_press:12, overhead_press:3, lateral_delts:5, triceps:4,
    vertical_pull:5, row:5, lat_iso:5, rear_delts:3, biceps:6,
    squat:6, hinge:5, unilateral:3, hip_extension:3, hamstrings:5, calves:6, core:4
  };
  const LABELS = {
    chest_press:'chest pressing', overhead_press:'overhead pressing', lateral_delts:'side delts', triceps:'direct triceps',
    vertical_pull:'vertical pulling / lat width', row:'rows / mid-back thickness', lat_iso:'direct lat work', rear_delts:'rear delts / scapular work', biceps:'direct biceps / brachialis',
    squat:'squat / quad work', hinge:'hinge / posterior chain', unilateral:'single-leg work', hip_extension:'direct glute / hip extension', hamstrings:'hamstring curls', calves:'calves', core:'core'
  };
  const SESSION_PURPOSE = {
    push_a:'Chest-biased pressing · horizontal strength, upper-chest support, side delts, triceps, core',
    lower_a:'Squat-biased lower · quads, unilateral strength, smaller hinge dose, hamstrings, calves',
    pull_a:'Lat/width pull · vertical pulling, direct lats, lighter supported row, long-head biceps, core',
    push_b:'Balanced push · alternate chest angle, overhead press, chest isolation, side delts, triceps',
    lower_b:'Hinge/posterior lower · hinge strength, squat support, direct glutes, hamstrings, calves',
    pull_b:'Mid-back/thickness pull · supported rows, secondary vertical pull, rear delts/scapulae, brachialis/forearms'
  };
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const completedSets=d=>(d?.sets||[]).filter(s=>s?.done===true).length;

  function bucket(detail){
    const seed=String(detail?.seedKey||'').toLowerCase(),base=String(detail?.base||'').toLowerCase(),name=String(detail?.name||'').toLowerCase();
    if(seed==='bench'||seed==='chest_press'||seed==='fly'||/horizontal press|secondary press|chest isolation/.test(base))return 'chest_press';
    if(seed==='overhead_press'||/vertical press/.test(base))return 'overhead_press';
    if(seed==='lateral_raise'||/lateral delt/.test(base))return 'lateral_delts';
    if(seed==='triceps'||/triceps/.test(base))return 'triceps';
    if(seed==='pullup'||/vertical pull/.test(base))return 'vertical_pull';
    if(seed==='row'||/horizontal pull/.test(base))return 'row';
    if(seed==='lat_iso'||/lat isolation/.test(base))return 'lat_iso';
    if(seed==='rear_delt'||/rear delt|scapular/.test(base))return 'rear_delts';
    if(seed==='curl'||seed==='hammer_curl'||/elbow flexion|brachialis/.test(base))return 'biceps';
    if(seed==='squat'||/squat/.test(base))return 'squat';
    if(seed==='hinge'||/hip hinge/.test(base))return 'hinge';
    if(seed==='split_squat'||/single-leg/.test(base))return 'unilateral';
    if(seed==='hip_thrust'||/hip extension/.test(base))return 'hip_extension';
    if(seed==='ham_curl'||/knee flexion/.test(base)||/hamstring curl/.test(name))return 'hamstrings';
    if(seed==='calves'||/calf/.test(base)||/calf/.test(name))return 'calves';
    if(seed==='core'||/core/.test(base)||/plank|rollout|pallof/.test(name))return 'core';
    return null;
  }

  function recentDose(user,count=6){
    const sessions=(user?.history||[]).filter(h=>(h.details||[]).some(d=>completedSets(d)>0)).slice(0,count);
    const dose=Object.fromEntries(Object.keys(TARGETS).map(k=>[k,0]));
    for(const h of sessions)for(const d of h.details||[]){const k=bucket(d);if(k)dose[k]+=completedSets(d)}
    return {sessions,dose};
  }

  function deficits(user){
    const {sessions,dose}=recentDose(user,6),scale=Math.max(.35,Math.min(1,sessions.length/6));
    return Object.keys(TARGETS).map(key=>{
      const expected=TARGETS[key]*scale,actual=dose[key]||0,ratio=expected?actual/expected:1;
      return {key,label:LABELS[key],actual,expected:Number(expected.toFixed(1)),ratio:Number(ratio.toFixed(2)),deficit:Number(Math.max(0,expected-actual).toFixed(1))};
    }).sort((a,b)=>b.deficit-a.deficit||a.ratio-b.ratio);
  }

  function repetition(user){
    const sessions=(user?.history||[]).slice(0,6),pairs=[];
    for(let i=0;i<sessions.length-1;i++){
      const a=new Set((sessions[i].details||[]).filter(d=>completedSets(d)>0).map(d=>d.name)),b=new Set((sessions[i+1].details||[]).filter(d=>completedSets(d)>0).map(d=>d.name));
      const repeated=[...a].filter(name=>b.has(name));
      if(repeated.length)pairs.push({newer:sessions[i].workoutKey||sessions[i].name,older:sessions[i+1].workoutKey||sessions[i+1].name,exercises:repeated});
    }
    return pairs;
  }

  function upcoming(user,count=3){
    const rotation=Array.isArray(window.ROTATION)?window.ROTATION:(typeof ROTATION!=='undefined'?ROTATION:[]);
    const current=user?.program?.currentWorkoutKey||rotation[0],start=Math.max(0,rotation.indexOf(current));
    const result=[];
    for(let i=0;i<Math.min(count,rotation.length);i++){
      const key=rotation[(start+i)%rotation.length],meta=(window.WORKOUT_META||globalThis.WORKOUT_META||{})[key]||{};
      result.push({key,name:meta.name||meta.short||key,purpose:SESSION_PURPOSE[key]||''});
    }
    return result;
  }

  function analyze(user){
    const {sessions,dose}=recentDose(user,6),gaps=deficits(user),repeats=repetition(user),next=upcoming(user,3);
    return {
      completedSessionsReviewed:sessions.length,
      directMovementDose:dose,
      undercovered:gaps.filter(x=>x.deficit>=1).slice(0,5),
      adjacentExactRepeats:repeats.slice(0,4),
      upcoming:next,
      rule:'Use deficits to prioritize future optional/accessory work, not to force catch-up volume. Preserve benchmark lifts when useful; vary redundant accessories and angles. Never rewrite an active workout.'
    };
  }

  // Enrich existing Groq requests. Existing server endpoints remain responsible for validating
  // any model output; this module only adds longitudinal context.
  const nativeFetch=window.fetch?.bind(window);
  if(nativeFetch&&!window.__ironSixProgramFetchWrapped){
    window.__ironSixProgramFetchWrapped=true;
    window.fetch=async(input,init={})=>{
      try{
        const url=typeof input==='string'?input:input?.url||'',method=String(init.method||'GET').toUpperCase();
        if(method==='POST'&&typeof init.body==='string'&&typeof activeUser==='function'&&(/\/api\/review-workout(?:\?|$)/.test(url)||/\/api\/coach(?:\?|$)/.test(url))){
          const body=JSON.parse(init.body),context=analyze(activeUser());
          if(/\/api\/review-workout/.test(url))body.programAnalysis=context;
          else {body.context=body.context||{};body.context.programAnalysis=context}
          init={...init,body:JSON.stringify(body)};
        }
      }catch(_){}
      return nativeFetch(input,init);
    };
  }

  function render(){
    if(typeof activeUser!=='function')return;
    const plan=document.getElementById('plan');if(!plan)return;
    let box=document.getElementById('rollingProgramIntelligence');
    if(!box){box=document.createElement('div');box.id='rollingProgramIntelligence';box.className='section';const anchor=document.getElementById('trainingBlockStatus');if(anchor)anchor.after(box);else plan.prepend(box)}
    const a=analyze(activeUser()),next=a.upcoming.map((x,i)=>`<div style="padding:${i?'9':'0'}px 0 9px;${i?'border-top:1px solid var(--line)':''}"><strong>${i+1}. ${escapeHtml?.(x.name)||x.name}</strong><br><span>${escapeHtml?.(x.purpose)||x.purpose}</span></div>`).join('');
    const gaps=a.undercovered.length?a.undercovered.slice(0,3).map(x=>x.label).join(' · '):'No major recurring gap detected in the completed-work window.';
    box.innerHTML=`<div class="section-head"><div><h2>Upcoming training logic</h2><small>Planned from completed work, not the calendar</small></div></div><div class="note">${next}<br><strong>Watch next:</strong> ${gaps}<br><br><span>The planner uses this as a priority signal, not a catch-up mandate. Groq receives the same history context after completed workouts.</span></div>`;
  }

  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="plan"]'))setTimeout(render,0)});
  window.IronSixProgramV3={analyze,recentDose,deficits,repetition,upcoming,targets:{...TARGETS},sessionPurpose:{...SESSION_PURPOSE},render};
  setTimeout(render,0);
})();
