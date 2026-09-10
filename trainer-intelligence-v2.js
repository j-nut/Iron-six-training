(() => {
  if (window.__ironSixTrainerIntelligenceV2Loaded) return;
  window.__ironSixTrainerIntelligenceV2Loaded = true;
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function sessionLoad(session){
    let volume=0,hard=0,sets=0;
    for(const ex of session?.details||[])for(const s of ex.sets||[]){
      const w=n(s.weight),r=n(s.reps),rir=n(s.rir);sets++;volume+=w*r;if(rir<=1)hard++;
    }
    return {sets,volume,hard};
  }
  function trainingState(user,now=Date.now()){
    const history=(user?.history||[]).filter(h=>n(h.ts)>0).sort((a,b)=>n(b.ts)-n(a.ts));
    const recent=history.filter(h=>now-n(h.ts)<=14*864e5),prior=history.filter(h=>now-n(h.ts)>14*864e5&&now-n(h.ts)<=28*864e5);
    const summarize=list=>list.reduce((a,h)=>{const l=sessionLoad(h);a.sessions++;a.sets+=l.sets;a.volume+=l.volume;a.hard+=l.hard;const e=n(h.readiness?.energy);if(e){a.energy+=e;a.energyN++}return a},{sessions:0,sets:0,volume:0,hard:0,energy:0,energyN:0});
    const r=summarize(recent),p=summarize(prior),feedback=(user?.trainingFeedback||[]).filter(x=>now-n(x.ts)<=14*864e5),hardFeedback=feedback.filter(x=>x.feedback==='hard'||x.feedback==='pain').length,easyFeedback=feedback.filter(x=>x.feedback==='easy').length;
    const avgEnergy=r.energyN?r.energy/r.energyN:null,volumeChange=p.volume?((r.volume-p.volume)/p.volume)*100:null;
    let fatigue=0; if(avgEnergy!=null)fatigue+=(5-avgEnergy)*12; if(r.sets>=35)fatigue+=12;if(r.sets>=50)fatigue+=10;if(r.hard>=8)fatigue+=10;if(hardFeedback>=3)fatigue+=12;if(hardFeedback>=6)fatigue+=8;if(volumeChange!=null&&volumeChange>35)fatigue+=10;
    fatigue=clamp(Math.round(fatigue),0,100);
    let phase='Build',recommendation='Continue progressive training and let performance drive small load changes.';
    if(recent.length<3){phase='Learning';recommendation='Keep logging your weight, reps and how hard each set felt. A few sessions in, your coach can start setting targets from your real numbers.'}
    else if(fatigue>=65){phase='Deload suggested';recommendation='Reduce working sets about 25–35% for the next several sessions, keep technique crisp, and avoid forcing failure.'}
    else if(fatigue>=45){phase='Manage fatigue';recommendation='Keep priority lifts, trim accessory volume about 10–20%, and avoid unnecessary failure work until readiness improves.'}
    else if(easyFeedback>=4&&hardFeedback===0){phase='Progress';recommendation='Performance feedback supports gradual progression; increase only where rep quality and RIR remain on target.'}
    return {phase,fatigue,recommendation,recent14:{sessions:r.sessions,sets:r.sets,volume:Math.round(r.volume),hardSets:r.hard,avgEnergy:avgEnergy==null?null:Math.round(avgEnergy*10)/10},prior14:{sessions:p.sessions,sets:p.sets,volume:Math.round(p.volume)},volumeChange:volumeChange==null?null:Math.round(volumeChange),feedback14:{easy:easyFeedback,hard:feedback.filter(x=>x.feedback==='hard').length,pain:feedback.filter(x=>x.feedback==='pain').length,right:feedback.filter(x=>x.feedback==='right').length}};
  }
  function coachPayload(user){
    const analytics=window.IronSixInsights?.analyze?.(user)||null;
    return {trainingState:trainingState(user),setFeedback:(user?.trainingFeedback||[]).slice(0,30),analytics:analytics?{sessions7:analytics.sessions7,sets7:analytics.sets7,volume7:analytics.volume7,trends:analytics.trends?.slice(0,6),freshness:analytics.freshness}:null};
  }
  const nativeFetch=window.fetch?.bind(window);
  if(nativeFetch&&!window.__ironSixTrainerFetchWrapped){
    window.__ironSixTrainerFetchWrapped=true;
    window.fetch=async(input,init={})=>{
      try{
        const url=typeof input==='string'?input:input?.url||'';
        if(/\/api\/coach(?:\?|$)/.test(url)&&String(init.method||'GET').toUpperCase()==='POST'&&typeof init.body==='string'&&typeof activeUser==='function'){
          const body=JSON.parse(init.body);body.context=body.context||{};Object.assign(body.context,coachPayload(activeUser()));init={...init,body:JSON.stringify(body)};
        }
      }catch(_){}
      return nativeFetch(input,init);
    };
  }
  function renderPlan(){
    if(typeof document==='undefined'||typeof activeUser!=='function')return;const plan=document.getElementById('plan');if(!plan)return;
    let box=document.getElementById('trainingBlockStatus');if(!box){box=document.createElement('div');box.id='trainingBlockStatus';box.className='section';const first=plan.querySelector('.section');if(first)plan.insertBefore(box,first);else plan.appendChild(box)}
    const state=trainingState(activeUser()),pct=state.volumeChange==null?'Not enough history':`${state.volumeChange>=0?'+':''}${state.volumeChange}% vs prior 14 days`;
    box.innerHTML=`<div class="section-head"><div><h2>How recovered you are</h2><small>Based on your recent sessions and how you have been feeling</small></div></div><div class="note"><strong>${state.phase}</strong><br><br>${state.recommendation}<br><br><strong>How fatigued you are:</strong> ${state.fatigue}/100<br><strong>Recent work:</strong> ${state.recent14.sets} logged sets across ${state.recent14.sessions} sessions<br><strong>Trend:</strong> ${pct}</div>`;
  }
  const oldRender=window.IronSixInsights?.render;
  if(oldRender)window.IronSixInsights.render=function(){const out=oldRender.apply(this,arguments);renderPlan();return out};
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="plan"]'))setTimeout(renderPlan,0)});
  document.getElementById('finishBtn')?.addEventListener('click',()=>setTimeout(renderPlan,0));
  window.IronSixTrainerV2={trainingState,coachPayload,renderPlan};
  renderPlan();
})();
