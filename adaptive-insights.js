(() => {
  window.__ironSixAdaptiveInsightsLoaded=true;
  const MUSCLES=['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core'];
  const FEEDBACK={
    easy:{label:'Too easy',delta:1.015},
    right:{label:'About right',delta:1},
    hard:{label:'Too hard',delta:.98},
    pain:{label:'Pain / discomfort',delta:1}
  };
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function estimatedMax(weight,reps,rir=0){
    const w=num(weight),r=num(reps),reserve=clamp(num(rir),0,5);
    if(!w||!r)return 0;
    return Math.round(w*(1+clamp(r+reserve,1,15)/30)*10)/10;
  }
  function flattenHistory(user){
    const rows=[];
    for(const session of user?.history||[]){
      for(const exercise of session.details||[]){
        for(const set of exercise.sets||[]){
          const weight=num(set.weight),reps=num(set.reps),rir=num(set.rir);
          if(!set.done&&!weight&&!reps)continue;
          rows.push({ts:num(session.ts),date:session.date||'',workoutKey:session.workoutKey||'',exercise:exercise.name||'Exercise',base:exercise.base||'',weight,reps,rir,volume:weight*reps,e1rm:estimatedMax(weight,reps,rir)});
        }
      }
    }
    return rows.sort((a,b)=>b.ts-a.ts);
  }
  function muscleFreshness(user,now=Date.now()){
    const result={};
    for(const muscle of MUSCLES){
      const sessions=(user?.history||[]).filter(h=>(h.muscles||[]).map(String).map(x=>x.toLowerCase()).some(x=>x===muscle||x.includes(muscle))&&num(h.ts)>0).sort((a,b)=>num(b.ts)-num(a.ts));
      if(!sessions.length){result[muscle]={score:100,label:'Ready',hours:null,recentSessions:0};continue}
      const hours=Math.max(0,(now-num(sessions[0].ts))/36e5),recentSessions=sessions.filter(h=>now-num(h.ts)<=72*36e5).length;
      const score=clamp(Math.round((hours/72)*100-Math.max(0,recentSessions-1)*12),0,100);
      const label=score>=85?'Ready':score>=60?'Nearly ready':score>=30?'Recovering':'Recently trained';
      result[muscle]={score,label,hours:Math.round(hours),recentSessions};
    }
    return result;
  }
  function analyze(user,now=Date.now()){
    const rows=flattenHistory(user),week=rows.filter(r=>now-r.ts<=7*864e5),sessions=(user?.history||[]).filter(h=>now-num(h.ts)<=7*864e5);
    const byExercise={};
    for(const r of rows){
      const bucket=byExercise[r.exercise]||(byExercise[r.exercise]=[]);bucket.push(r);
    }
    const trends=[];
    for(const [exercise,items] of Object.entries(byExercise)){
      const sessionBest=new Map();
      for(const item of items){if(!item.e1rm||!item.ts)continue;sessionBest.set(item.ts,Math.max(sessionBest.get(item.ts)||0,item.e1rm))}
      const dated=[...sessionBest.entries()].map(([ts,e1rm])=>({ts,e1rm})).sort((a,b)=>a.ts-b.ts);
      if(dated.length<2)continue;
      const a=dated[0].e1rm,b=dated[dated.length-1].e1rm;
      if(!a||!b)continue;
      trends.push({exercise,change:Math.round(((b-a)/a)*1000)/10,current:b,previous:a});
    }
    trends.sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
    const prs=[];
    for(const [exercise,items] of Object.entries(byExercise)){
      const best=items.reduce((a,b)=>b.e1rm>a.e1rm?b:a,items[0]);
      if(best?.e1rm)prs.push({exercise,e1rm:best.e1rm,weight:best.weight,reps:best.reps,ts:best.ts});
    }
    prs.sort((a,b)=>b.ts-a.ts);
    return {
      sessions7:sessions.length,
      sets7:week.length,
      volume7:Math.round(week.reduce((s,r)=>s+r.volume,0)),
      exercises:Object.keys(byExercise).length,
      trends:trends.slice(0,6),
      prs:prs.slice(0,6),
      freshness:muscleFreshness(user,now)
    };
  }
  function injectStyle(){
    if(typeof document==='undefined'||document.getElementById('adaptiveInsightsStyle'))return;
    const style=document.createElement('style');style.id='adaptiveInsightsStyle';style.textContent=`
      .insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}.insight-card{padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--surface2)}.insight-card strong,.insight-card span{display:block}.insight-card strong{font-size:20px}.insight-card span{font-size:11px;color:var(--muted);margin-top:4px}.fresh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.fresh-row{padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:var(--surface2)}.fresh-top{display:flex;justify-content:space-between;gap:8px;font-size:12px}.fresh-top span{color:var(--muted)}.fresh-bar{height:5px;background:rgba(255,255,255,.08);border-radius:999px;margin-top:8px;overflow:hidden}.fresh-bar i{display:block;height:100%;width:var(--fresh);background:var(--accent);border-radius:inherit}.trend-list{display:grid;gap:8px;margin-top:10px}.trend-row{display:flex;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:var(--surface2);font-size:12px}.trend-row span{color:var(--muted)}.trend-up{color:var(--accent)}.set-feedback{grid-column:1/-1;padding:8px 0 4px}.set-feedback-label{font-size:11px;color:var(--muted);margin-bottom:7px}.set-feedback-actions{display:flex;gap:6px;flex-wrap:wrap}.set-feedback-btn{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:999px;padding:7px 10px;font-size:11px}.set-feedback-btn.active{border-color:var(--accent);background:rgba(46,229,128,.12)}.fresh-summary{margin-top:9px;font-size:12px;color:var(--muted)}@media(max-width:460px){.insight-grid{grid-template-columns:1fr 1fr}.insight-card:last-child{grid-column:1/-1}.fresh-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
  }
  function ensureUI(){
    if(typeof document==='undefined')return;
    injectStyle();
    const history=document.getElementById('history');
    if(history&&!document.getElementById('progressInsights')){
      const recent=history.querySelector('.section');
      const progress=document.createElement('div');progress.className='section';progress.id='progressInsights';progress.innerHTML='<div class="section-head"><div><h2>Progress</h2><small>Calculated from your logged sets</small></div></div><div id="progressInsightBody"></div>';
      const recovery=document.createElement('div');recovery.className='section';recovery.id='recoveryInsights';recovery.innerHTML='<div class="section-head"><div><h2>Training freshness</h2><small>Time and recent-session load, not a medical recovery score</small></div></div><div id="recoveryInsightBody"></div>';
      if(recent){history.insertBefore(recovery,recent);history.insertBefore(progress,recovery)}else{history.append(progress,recovery)}
    }
    const readiness=document.getElementById('readinessNote');
    if(readiness&&!document.getElementById('freshnessSummary')){const div=document.createElement('div');div.id='freshnessSummary';div.className='fresh-summary';readiness.insertAdjacentElement('afterend',div)}
  }
  function render(){
    if(typeof document==='undefined'||typeof activeUser!=='function')return;
    ensureUI();const user=activeUser(),a=analyze(user),body=document.getElementById('progressInsightBody'),recovery=document.getElementById('recoveryInsightBody');
    if(body){
      const trend=a.trends[0];body.innerHTML=`<div class="insight-grid"><div class="insight-card"><strong>${a.sessions7}</strong><span>sessions · 7 days</span></div><div class="insight-card"><strong>${a.sets7}</strong><span>logged sets · 7 days</span></div><div class="insight-card"><strong>${a.volume7.toLocaleString()}</strong><span>logged lb-reps · 7 days</span></div></div>${trend?`<div class="trend-list"><div class="trend-row"><div><strong>${esc(trend.exercise)}</strong><br><span>estimated strength trend</span></div><strong class="${trend.change>=0?'trend-up':''}">${trend.change>=0?'+':''}${trend.change}%</strong></div>${a.trends.slice(1,4).map(t=>`<div class="trend-row"><span>${esc(t.exercise)}</span><strong class="${t.change>=0?'trend-up':''}">${t.change>=0?'+':''}${t.change}%</strong></div>`).join('')}</div>`:'<div class="note" style="margin-top:10px">Log the same exercise in at least two sessions to unlock strength trends.</div>'}`;
    }
    if(recovery){recovery.innerHTML=`<div class="fresh-grid">${MUSCLES.map(m=>{const f=a.freshness[m];return `<div class="fresh-row"><div class="fresh-top"><strong>${esc(m.replace(/\b\w/g,x=>x.toUpperCase()))}</strong><span>${f.label}</span></div><div class="fresh-bar"><i style="--fresh:${f.score}%"></i></div></div>`}).join('')}</div>`}
    const summary=document.getElementById('freshnessSummary');if(summary){const key=user.program?.currentWorkoutKey||'lower_strength',muscles=(typeof WORKOUT_META!=='undefined'&&WORKOUT_META[key]?.muscles)||[],scores=muscles.flatMap(m=>{const k=String(m).toLowerCase().replace('front delts','shoulders').replace('rear delts','shoulders').replace('arms','biceps');return a.freshness[k]?[a.freshness[k].score]:[]});const avg=scores.length?Math.round(scores.reduce((x,y)=>x+y,0)/scores.length):100;summary.textContent=`Training freshness for today’s main muscles: ${avg}% · combined with your energy and soreness check-in.`}
  }
  function feedbackPrompt(row,key,current){
    let box=row.nextElementSibling;
    if(box?.classList?.contains('set-feedback')&&box.dataset.setKey===key){box.querySelectorAll('.set-feedback-btn').forEach(b=>b.classList.toggle('active',b.dataset.setFeedback===current));return box}
    if(box?.classList?.contains('set-feedback'))box.remove();
    box=document.createElement('div');box.className='set-feedback';box.dataset.setKey=key;box.innerHTML=`<div class="set-feedback-label">How did that set feel?</div><div class="set-feedback-actions">${Object.entries(FEEDBACK).map(([value,meta])=>`<button type="button" class="set-feedback-btn ${current===value?'active':''}" data-set-feedback="${value}">${meta.label}</button>`).join('')}</div>`;row.insertAdjacentElement('afterend',box);return box;
  }
  function showFeedbackForDone(done){
    const row=done?.closest?.('.set-row');if(!row)return;
    if(!done.classList.contains('active')){if(row.nextElementSibling?.classList?.contains('set-feedback'))row.nextElementSibling.remove();return}
    const card=done.closest('[data-exercise-index]');if(!card)return;const ei=Number(card.dataset.exerciseIndex),rows=[...row.parentElement.querySelectorAll('.set-row')],si=rows.indexOf(row),key=`${ei}-${si}`,user=activeUser();feedbackPrompt(row,key,user.today?.[key]?.feedback||'');
  }
  function recordFeedback(button){
    const value=button.dataset.setFeedback,meta=FEEDBACK[value],box=button.closest('.set-feedback');if(!meta||!box)return;const user=activeUser(),key=box.dataset.setKey,state=user.today?.[key];if(!state||!state.done)return;
    state.feedback=value;state._updatedAt=Date.now();const [ei,si]=key.split('-').map(Number),workout=typeof finalWorkout==='function'?finalWorkout(user):[],exercise=workout[ei];
    user.trainingFeedback=Array.isArray(user.trainingFeedback)?user.trainingFeedback:[];
    const record={ts:Date.now(),workoutKey:user.program?.currentWorkoutKey||'',exercise:exercise?.name||'',base:exercise?.base||'',set:si+1,feedback:value,weight:state.weight||'',reps:state.reps||'',rir:state.rir||''};
    user.trainingFeedback.unshift(record);user.trainingFeedback=user.trainingFeedback.slice(0,300);
    if((state.rir===''||state.rir==null)&&value!=='pain'&&meta.delta!==1){const prior=num(user.sessionCalibration?.factor)||1;user.sessionCalibration={factor:clamp(prior*meta.delta,.9,1.1),source:'Set feedback',summary:`${meta.label} feedback adjusted the remaining session conservatively.`,updatedAt:Date.now()};}
    if(window.IronSixJournal?.captureSet&&exercise)window.IronSixJournal.captureSet(user,workout,ei,si,state);if(typeof saveData==='function')saveData();box.querySelectorAll('.set-feedback-btn').forEach(b=>b.classList.toggle('active',b===button));
    if(value==='pain'){if(typeof toast==='function')toast('Pain noted • stop this movement if pain is sharp or worsening and choose a pain-free substitute.')}else if(typeof refreshRemainingWorkout==='function'&&(state.rir===''||state.rir==null)){refreshRemainingWorkout(user,workout);if(typeof toast==='function')toast('Set feedback saved • remaining targets refreshed')}else if(typeof toast==='function')toast('Set feedback saved');
  }
  function install(){
    if(typeof document==='undefined')return;ensureUI();render();
    document.addEventListener('click',e=>{const feedback=e.target.closest?.('[data-set-feedback]');if(feedback){recordFeedback(feedback);return}const done=e.target.closest?.('.done');if(done)setTimeout(()=>showFeedbackForDone(done),0);const nav=e.target.closest?.('[data-view="history"]');if(nav)setTimeout(render,0)});
    document.getElementById('userSelect')?.addEventListener('change',()=>setTimeout(render,0));document.getElementById('energy')?.addEventListener('change',()=>setTimeout(render,0));document.getElementById('soreness')?.addEventListener('change',()=>setTimeout(render,0));document.getElementById('finishBtn')?.addEventListener('click',()=>setTimeout(render,0));
    const history=document.getElementById('historyList');if(history)new MutationObserver(()=>render()).observe(history,{childList:true});
    const list=document.getElementById('exerciseList');if(list)new MutationObserver(()=>{list.querySelectorAll('.done').forEach(showFeedbackForDone)}).observe(list,{childList:true,subtree:true});
  }
  window.IronSixInsights={estimatedMax,flattenHistory,muscleFreshness,analyze,render,FEEDBACK};
  if(typeof document!=='undefined')install();
})();
