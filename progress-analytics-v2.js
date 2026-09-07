(() => {
  if(window.__ironSixProgressAnalyticsV2Loaded)return;
  window.__ironSixProgressAnalyticsV2Loaded=true;
  const DAY=864e5,WEEK=7*DAY;
  const MUSCLES=['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core'];
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function rows(user){return window.IronSixInsights?.flattenHistory?.(user)||[]}
  function weekStart(ts){const d=new Date(ts);d.setHours(0,0,0,0);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.getTime()}
  function sessionDate(ts){const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function weekly(user,now=Date.now(),weeks=8){
    const out=[];for(let i=weeks-1;i>=0;i--){const end=now-i*WEEK,start=end-WEEK;out.push({start,sets:0,volume:0,sessions:new Set(),e1rm:0})}
    for(const r of rows(user)){for(const w of out){if(r.ts>w.start&&r.ts<=w.start+WEEK){w.sets++;w.volume+=n(r.volume);w.sessions.add(r.ts);w.e1rm=Math.max(w.e1rm,n(r.e1rm));break}}}
    return out.map(w=>({start:w.start,sets:w.sets,volume:Math.round(w.volume),sessions:w.sessions.size,e1rm:w.e1rm}))
  }
  function exerciseHistory(user,name,limit=12){
    const grouped=new Map();
    for(const r of rows(user).filter(x=>x.exercise===name&&x.ts)){const g=grouped.get(r.ts)||{ts:r.ts,e1rm:0,volume:0,bestWeight:0,bestReps:0,sets:0};g.e1rm=Math.max(g.e1rm,n(r.e1rm));g.volume+=n(r.volume);g.bestWeight=Math.max(g.bestWeight,n(r.weight));g.bestReps=Math.max(g.bestReps,n(r.reps));g.sets++;grouped.set(r.ts,g)}
    return [...grouped.values()].sort((a,b)=>a.ts-b.ts).slice(-limit)
  }
  function records(user){
    const out=[];const by={};
    for(const r of rows(user)){const b=by[r.exercise]||(by[r.exercise]=[]);b.push(r)}
    for(const [exercise,items] of Object.entries(by)){
      const newest=Math.max(...items.map(x=>n(x.ts))),latest=items.filter(x=>n(x.ts)===newest),prior=items.filter(x=>n(x.ts)<newest);
      const bestWeight=Math.max(...items.map(x=>n(x.weight))),bestE1rm=Math.max(...items.map(x=>n(x.e1rm))),latestWeight=Math.max(...latest.map(x=>n(x.weight))),latestE1rm=Math.max(...latest.map(x=>n(x.e1rm)));
      const priorWeight=prior.length?Math.max(...prior.map(x=>n(x.weight))):0,priorE1rm=prior.length?Math.max(...prior.map(x=>n(x.e1rm))):0;
      const latestRepPR=latest.some(x=>{const same=prior.filter(p=>n(p.weight)===n(x.weight));return n(x.weight)>0&&n(x.reps)>0&&(!same.length||n(x.reps)>Math.max(...same.map(p=>n(p.reps))))});
      const types=[];if(prior.length&&latestWeight>priorWeight)types.push('weight');if(prior.length&&latestE1rm>priorE1rm+.5)types.push('strength');if(prior.length&&latestRepPR)types.push('reps');
      if(types.length)out.push({exercise,ts:newest,types,bestWeight,bestE1rm,latestWeight,latestE1rm});
    }
    return out.sort((a,b)=>b.ts-a.ts);
  }
  function consistency(user,now=Date.now()){
    const dates=[...new Set((user?.history||[]).map(h=>n(h.ts)).filter(Boolean).map(sessionDate))].sort().reverse();
    const sessions28=(user?.history||[]).filter(h=>now-n(h.ts)<=28*DAY).length;
    const activeWeeks=new Set((user?.history||[]).filter(h=>now-n(h.ts)<=56*DAY).map(h=>weekStart(n(h.ts)))).size;
    let streak=0;if(dates.length){const today=new Date(now);today.setHours(0,0,0,0);let cursor=today.getTime();const set=new Set(dates);if(!set.has(sessionDate(cursor)))cursor-=DAY;while(set.has(sessionDate(cursor))){streak++;cursor-=DAY}}
    return {sessions28,activeWeeks8:activeWeeks,dayStreak:streak};
  }
  function muscleMap(session){return (session?.muscles||[]).map(x=>String(x).toLowerCase()).flatMap(x=>x==='arms'?['biceps','triceps']:x.includes('front delt')||x.includes('rear delt')?['shoulders']:[x])}
  function muscleBalance(user,now=Date.now(),days=14){
    const count=Object.fromEntries(MUSCLES.map(m=>[m,0]));
    for(const h of user?.history||[]){if(now-n(h.ts)>days*DAY)continue;const muscles=[...new Set(muscleMap(h))].filter(m=>m in count);const setCount=(h.details||[]).reduce((sum,e)=>sum+(e.sets||[]).filter(s=>s.done||n(s.weight)||n(s.reps)).length,0);if(!muscles.length)continue;for(const m of muscles)count[m]+=setCount/muscles.length}
    return Object.entries(count).map(([muscle,sets])=>({muscle,sets:Math.round(sets*10)/10})).sort((a,b)=>b.sets-a.sets)
  }
  function recovery(user,now=Date.now()){
    const out={};
    const feedback=(user?.trainingFeedback||[]).filter(x=>now-n(x.ts)<=7*DAY);
    for(const muscle of MUSCLES){
      const sessions=(user?.history||[]).filter(h=>n(h.ts)>0&&muscleMap(h).some(x=>x===muscle||x.includes(muscle))).sort((a,b)=>n(b.ts)-n(a.ts));
      if(!sessions.length){out[muscle]={score:100,label:'Ready',hours:null,load:0};continue}
      const last=sessions[0],hours=Math.max(0,(now-n(last.ts))/36e5);let load=0,hard=0;
      for(const h of sessions.filter(x=>now-n(x.ts)<=96*36e5)){for(const e of h.details||[])for(const s of e.sets||[]){if(!(s.done||n(s.weight)||n(s.reps)))continue;load++;if(n(s.rir)<=1)hard++}}
      const related=feedback.filter(f=>String(f.base||'').toLowerCase().includes(muscle)||String(f.exercise||'').toLowerCase().includes(muscle));
      const pain=related.filter(f=>f.feedback==='pain').length,tooHard=related.filter(f=>f.feedback==='hard').length;
      const timeScore=clamp(hours/72*100,0,100);const penalty=Math.min(40,Math.max(0,load-8)*2+hard*2+tooHard*4+pain*12);const score=clamp(Math.round(timeScore-penalty),0,100);
      const label=score>=85?'Ready':score>=60?'Nearly ready':score>=35?'Recovering':'High recent load';out[muscle]={score,label,hours:Math.round(hours),load,hard,pain};
    }return out
  }
  function analyze(user,now=Date.now()){
    const w=weekly(user,now,8),rec=records(user),con=consistency(user,now),balance=muscleBalance(user,now,14),recover=recovery(user,now);
    const recent=w[w.length-1]||{},previous=w[w.length-2]||{};const volumeChange=previous.volume?Math.round((recent.volume-previous.volume)/previous.volume*100):null;
    return {weekly:w,records:rec,consistency:con,balance,recovery:recover,volumeChange};
  }
  function injectStyle(){if(document.getElementById('progressV2Style'))return;const s=document.createElement('style');s.id='progressV2Style';s.textContent=`.progress-v2{margin-top:12px}.spark{display:flex;align-items:end;gap:4px;height:58px;padding:8px 2px}.spark i{display:block;flex:1;min-width:4px;height:var(--h);background:var(--accent);border-radius:4px 4px 1px 1px;opacity:.8}.metric-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metric-mini{padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface2)}.metric-mini strong,.metric-mini span{display:block}.metric-mini strong{font-size:16px}.metric-mini span{font-size:10px;color:var(--muted);margin-top:3px}.pr-list,.balance-list{display:grid;gap:7px;margin-top:10px}.pr-item,.balance-item{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:11px;background:var(--surface2);font-size:11px}.balance-item i{display:block;height:4px;background:var(--accent);border-radius:999px;margin-top:5px}.progress-subhead{font-size:11px;color:var(--muted);margin:13px 0 5px}@media(max-width:430px){.metric-row{grid-template-columns:1fr 1fr}.metric-mini:last-child{grid-column:1/-1}}`;document.head.appendChild(s)}
  function render(){if(typeof activeUser!=='function')return;injectStyle();const host=document.getElementById('progressInsightBody');if(!host)return;const user=activeUser(),a=analyze(user),v=a.weekly.map(x=>x.volume),max=Math.max(1,...v),latest=a.weekly[a.weekly.length-1]||{};let box=document.getElementById('progressAnalyticsV2');if(!box){box=document.createElement('div');box.id='progressAnalyticsV2';box.className='progress-v2';host.appendChild(box)}box.innerHTML=`<div class="progress-subhead">8-week training volume</div><div class="spark" aria-label="Eight week training volume">${v.map(x=>`<i style="--h:${Math.max(4,Math.round(x/max*100))}%" title="${x.toLocaleString()} lb-reps"></i>`).join('')}</div><div class="metric-row"><div class="metric-mini"><strong>${a.consistency.sessions28}</strong><span>sessions · 28 days</span></div><div class="metric-mini"><strong>${a.consistency.activeWeeks8}/8</strong><span>active weeks</span></div><div class="metric-mini"><strong>${a.volumeChange==null?'—':`${a.volumeChange>0?'+':''}${a.volumeChange}%`}</strong><span>weekly volume change</span></div></div><div class="progress-subhead">Recent personal records</div>${a.records.length?`<div class="pr-list">${a.records.slice(0,5).map(p=>`<div class="pr-item"><span>${esc(p.exercise)}</span><strong>${p.types.map(x=>x==='strength'?'e1RM':x).join(' · ')}</strong></div>`).join('')}</div>`:'<div class="note">Repeat an exercise across sessions to unlock PR detection.</div>'}<div class="progress-subhead">14-day muscle-set balance</div><div class="balance-list">${a.balance.filter(x=>x.sets>0).slice(0,6).map(b=>`<div class="balance-item"><div style="flex:1"><span>${esc(b.muscle.replace(/\b\w/g,c=>c.toUpperCase()))}</span><i style="width:${Math.min(100,b.sets/Math.max(1,a.balance[0]?.sets||1)*100)}%"></i></div><strong>${b.sets}</strong></div>`).join('')||'<div class="note">Complete workouts to build muscle-volume balance.</div>'}</div>`;
    const recovery=document.getElementById('recoveryInsightBody');if(recovery){recovery.innerHTML=`<div class="fresh-grid">${MUSCLES.map(m=>{const f=a.recovery[m];return `<div class="fresh-row"><div class="fresh-top"><strong>${esc(m.replace(/\b\w/g,x=>x.toUpperCase()))}</strong><span>${f.label}</span></div><div class="fresh-bar"><i style="--fresh:${f.score}%"></i></div><div class="music-meta">${f.hours==null?'No recent load':`${f.hours}h · ${f.load} recent sets${f.hard?` · ${f.hard} hard`:''}`}</div></div>`}).join('')}</div>`}
  }
  function install(){if(typeof document==='undefined')return;document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="history"]'))setTimeout(render,10)});document.getElementById('finishBtn')?.addEventListener('click',()=>setTimeout(render,20));setTimeout(render,50)}
  window.IronSixProgressV2={weekly,exerciseHistory,records,consistency,muscleBalance,recovery,analyze,render};
  install();
})();
