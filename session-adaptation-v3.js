(() => {
  if(window.__ironSixSessionAdaptationV3Loaded)return;
  window.__ironSixSessionAdaptationV3Loaded=true;
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const recentPain=(u,name)=>{
    const cutoff=Date.now()-7*864e5;
    return (u?.trainingFeedback||[]).some(f=>n(f.ts)>=cutoff&&f.feedback==='pain'&&String(f.exercise||'').toLowerCase()===String(name||'').toLowerCase());
  };
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
    const occupied=new Set((plan||[]).map(ex=>String(ex.name).toLowerCase()));
    return (plan||[]).map(ex=>{
      let chosen={...ex};
      const pain=recentPain(u,chosen.name);
      if(pain&&Array.isArray(chosen._alternatives)){
        const alt=chosen._alternatives.find(a=>!occupied.has(String(a.name).toLowerCase())&&!recentPain(u,a.name)&&(typeof exerciseAvailable!=='function'||exerciseAvailable(u,a))&&(u.trainingMode!=='circuit'||typeof circuitSuitable!=='function'||circuitSuitable(a))&&(u.trainingMode==='circuit'||typeof traditionalSetSeconds!=='function'||traditionalSetSeconds({...chosen,...a,priority:chosen.priority})<=traditionalSetSeconds(chosen)));
        if(alt){occupied.delete(String(ex.name).toLowerCase());occupied.add(String(alt.name).toLowerCase());chosen={...chosen,...alt,sets:ex.sets,priority:ex.priority,_programSlot:ex._programSlot,_anchor:ex._anchor,_alternatives:[ex,...chosen._alternatives].filter(x=>x.name!==alt.name),_adaptReason:'Recent pain feedback: swapped to a saved alternative.'};}
      }
      const score=readinessScore(u,chosen);
      let factor=overallFactor;
      if(score<25)factor=Math.min(factor,.65);else if(score<45)factor=Math.min(factor,.8);
      if(soreness>=4)factor=Math.min(factor,.75);
      const oldSets=Math.max(1,n(chosen.sets)||1),sets=Math.max(1,Math.min(oldSets,Math.ceil(oldSets*factor)));
      if(sets<oldSets){chosen.sets=sets;chosen._adaptReason=chosen._adaptReason||`${state.phase==='Build'?'Readiness':'How recovered you are'} adjusted volume (${oldSets}→${sets} sets).`;chosen.prescription=String(chosen.prescription||'').replace(/^\d+\s*×/,sets+' ×')}
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
  window.IronSixAdaptiveSessionV3={adaptPlan,readinessScore,summary};
})();
