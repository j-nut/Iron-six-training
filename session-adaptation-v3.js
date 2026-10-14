(() => {
  if(window.__ironSixSessionAdaptationV3Loaded)return;
  window.__ironSixSessionAdaptationV3Loaded=true;
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lower=v=>String(v||'').toLowerCase();
  const recentPain=(u,name)=>{
    const cutoff=Date.now()-7*864e5;
    return (u?.trainingFeedback||[]).some(f=>n(f.ts)>=cutoff&&f.feedback==='pain'&&lower(f.exercise)===lower(name));
  };
  // Pain is about the joint and movement, not the exercise's name: an alternative in the same slot
  // loads the same pattern, so recent pain anywhere in the pattern lightens it for two weeks.
  function painInPattern(u,ex){
    const cutoff=Date.now()-14*864e5,bases=new Map();
    for(const h of u?.history||[])for(const d of h.details||[])if(d?.name&&d?.base)bases.set(lower(d.name),d.base);
    for(const alt of [ex,...(ex?._alternatives||[])])if(alt?.name&&alt?.base)bases.set(lower(alt.name),alt.base);
    return (u?.trainingFeedback||[]).some(f=>n(f.ts)>=cutoff&&f.feedback==='pain'&&(lower(f.exercise)===lower(ex?.name)||(ex?.base&&bases.get(lower(f.exercise))===ex.base)));
  }
  function daysSinceLastSession(u,now=Date.now()){
    // History dated before 2024 (imported without real timestamps) never counts as a layoff.
    const last=Math.max(0,...(u?.history||[]).map(h=>n(h.ts)).filter(ts=>ts>0&&ts<=now));
    return last>=Date.UTC(2024,0,1)?(now-last)/864e5:0;
  }
  // Volume cuts must actually remove work (Math.ceil turned 3 × 0.82 back into 3).
  function reduce(sets,factor){if(typeof reducedSets==='function')return reducedSets(sets,factor);const old=Math.max(1,Math.round(n(sets)||1));if(!(factor<1))return old;let next=Math.round(old*factor);if(factor<=.75&&old>=2)next=Math.min(next,old-1);return Math.max(1,Math.min(old,next))}
  function readinessScore(u,ex){
    const recovery=window.IronSixProgressV2?.recovery?.(u)||{};
    const muscles=typeof exerciseMuscles==='function'?exerciseMuscles(ex):[];
    const scores=muscles.map(m=>recovery[String(m).toLowerCase()]?.score).filter(Number.isFinite);
    return scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):100;
  }
  function adaptPlan(u,plan){
    const state=window.IronSixTrainerV2?.trainingState?.(u)||{phase:'Build',fatigue:0};
    const energy=Number(u?.readiness?.energy||4),soreness=Number(u?.readiness?.soreness||0);
    const overallFactor=state.phase==='Deload suggested'?.65:state.phase==='Manage fatigue'?.82:energy<=2?.85:1;
    const daysOff=daysSinceLastSession(u),returning=daysOff>=14;
    const occupied=new Set((plan||[]).map(ex=>String(ex.name).toLowerCase()));
    return (plan||[]).map(ex=>{
      let chosen={...ex};
      const pain=recentPain(u,chosen.name);
      if(pain&&Array.isArray(chosen._alternatives)){
        const alt=chosen._alternatives.find(a=>!occupied.has(String(a.name).toLowerCase())&&!recentPain(u,a.name)&&(typeof exerciseAvailable!=='function'||exerciseAvailable(u,a))&&(u.trainingMode!=='circuit'||typeof circuitSuitable!=='function'||circuitSuitable(a))&&(u.trainingMode==='circuit'||typeof traditionalSetSeconds!=='function'||traditionalSetSeconds({...chosen,...a,priority:chosen.priority})<=traditionalSetSeconds(chosen)));
        if(alt){occupied.delete(String(ex.name).toLowerCase());occupied.add(String(alt.name).toLowerCase());chosen={...chosen,...alt,sets:ex.sets,priority:ex.priority,_programSlot:ex._programSlot,_anchor:ex._anchor,_alternatives:[ex,...chosen._alternatives].filter(x=>x.name!==alt.name),_adaptReason:'Recent pain feedback: swapped to a saved alternative.'};}
      }
      const score=readinessScore(u,chosen);
      // "Manage fatigue" keeps priority lifts intact and trims accessories, as its advice says.
      let factor=state.phase==='Manage fatigue'&&n(chosen.priority)===1?1:overallFactor;
      if(score<25)factor=Math.min(factor,.65);else if(score<45)factor=Math.min(factor,.8);
      if(soreness>=4)factor=Math.min(factor,.75);
      let loadFactor=1,loadReason='';
      if(state.phase==='Deload suggested'){loadFactor=.9;loadReason='Deload: about 10% lighter with more reps in reserve.'}
      if(returning){factor=Math.min(factor,.75);loadReason=`First session after ${Math.round(daysOff)} days off: fewer sets while you ease back in.`}
      if(painInPattern(u,chosen)){factor=Math.min(factor,.75);loadFactor=Math.min(loadFactor,.85);loadReason='Recent pain on this movement: about 15% lighter and one fewer set. Stop the set if it hurts.'}
      if(loadFactor<1)chosen._loadFactor=loadFactor;
      const oldSets=Math.max(1,n(chosen.sets)||1),sets=reduce(oldSets,factor);
      const volumeReason=sets<oldSets?`${state.phase==='Build'?'Readiness':'How recovered you are'} adjusted volume (${oldSets}→${sets} sets).`:'';
      const reasons=[loadReason,volumeReason].filter(Boolean).join(' ');
      if(reasons)chosen._adaptReason=chosen._adaptReason?`${chosen._adaptReason} ${reasons}`:reasons;
      if(sets<oldSets){chosen.sets=sets;chosen.prescription=String(chosen.prescription||'').replace(/^\d+\s*×/,sets+' ×')}
      // Alternatives carry template prescriptions; the cards must describe the
      // actual budgeted sets and the same timed rounds used by the circuit player.
      if(u.trainingMode==='circuit'){const work=typeof circuitPace==='function'?circuitPace(u).work:parseInt(ex.prescription,10);if(Number.isFinite(work))chosen.prescription=work+'s controlled work · '+chosen.sets+' rounds'}
      else chosen.prescription=String(chosen.prescription||'').replace(/^\d+\s*×/,chosen.sets+' ×');
      chosen._readinessScore=score;
      return chosen;
    });
  }
  function summary(u,plan){
    const state=window.IronSixTrainerV2?.trainingState?.(u)||{phase:'Build',fatigue:0};
    const changed=(plan||[]).filter(x=>x._adaptReason);
    return {phase:state.phase,fatigue:state.fatigue,changed:changed.length,reasons:changed.map(x=>`${x.name}: ${x._adaptReason}`)};
  }
  if(typeof budgetSessionWorkout==='function'&&!window.__ironSixBudgetWrappedV3){
    window.__ironSixBudgetWrappedV3=true;
    const base=budgetSessionWorkout;
    budgetSessionWorkout=function(u,workout){return adaptPlan(u,base(u,workout))};
  }
  function renderNote(){
    if(typeof activeUser!=='function'||typeof finalWorkout!=='function')return;
    const host=document.getElementById('sessionBudget')?.parentElement||document.getElementById('today');if(!host)return;
    let note=document.getElementById('adaptiveSessionNote');if(!note){note=document.createElement('div');note.id='adaptiveSessionNote';note.className='note';note.style.marginTop='8px';host.appendChild(note)}
    const u=activeUser(),plan=finalWorkout(u),s=summary(u,plan);
    note.innerHTML=s.changed?`<strong>Adaptive session:</strong> ${s.phase} · ${s.changed} exercise${s.changed===1?'':'s'} adjusted from recent recovery/load signals.`:`<strong>Adaptive session:</strong> ${s.phase} · no recovery-based volume reduction needed today.`;
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="today"]'))setTimeout(renderNote,20)});
  for(const id of ['energy','soreness'])document.getElementById(id)?.addEventListener('change',()=>setTimeout(()=>{if(typeof renderAll==='function')renderAll();renderNote()},10));
  setTimeout(()=>{if(typeof renderAll==='function')renderAll();renderNote()},60);
  window.IronSixAdaptiveSessionV3={adaptPlan,readinessScore,summary,painInPattern,daysSinceLastSession};
})();
