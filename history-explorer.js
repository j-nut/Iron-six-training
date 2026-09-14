/* Read-only history explorer. Keep recorded strings intact; never rewrite journal data. */
(() => {
  if (window.IronSixHistory) return;
  const DAY = 864e5;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const completed = s => s && s.done !== false && (s.done === true || Number(s.reps) > 0 || Number(s.seconds) > 0 || Number(s.duration) > 0);
  const sets = e => (Array.isArray(e?.sets) ? e.sets : []).filter(completed);
  const details = h => (Array.isArray(h?.details) ? h.details : []).filter(e => sets(e).length);
  const stamp = h => Number.isFinite(Number(h?.ts)) && Number(h.ts) > 0 ? Number(h.ts) : 0;
  const date = h => stamp(h) ? new Date(stamp(h)).toLocaleString(undefined, {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : String(h.date || 'Date unavailable');
  const volume = e => sets(e).reduce((total, s) => {
    const w = number(s.weight), r = number(s.reps);
    return total + (w > 0 && r > 0 ? w * r : 0);
  }, 0);
  const count = h => Array.isArray(h.details) && h.details.length ? details(h).reduce((sum,e)=>sum+sets(e).length,0) : Math.max(0, number(h.sets) || 0);
  function sessions(user) {
    return (Array.isArray(user?.history) ? user.history : []).filter(Boolean).slice().sort((a,b)=>stamp(b)-stamp(a));
  }
  function filter(user, options = {}, now = Date.now()) {
    const q = String(options.query || '').trim().toLowerCase();
    return sessions(user).filter(h => {
      if (options.days && (!stamp(h) || stamp(h)>now || stamp(h)<now-Number(options.days)*DAY)) return false;
      if (options.mode && (h.trainingMode || 'traditional') !== options.mode) return false;
      if (options.exercise && !details(h).some(e => e.name === options.exercise)) return false;
      return !q || [h.name, h.date, ...(h.muscles || []), ...details(h).map(e => e.name)].join(' ').toLowerCase().includes(q);
    });
  }
  function summarize(list) {
    return {sessions:list.length,sets:list.reduce((n,h)=>n+count(h),0),volume:Math.round(list.reduce((n,h)=>n+details(h).reduce((v,e)=>v+volume(e),0),0))};
  }
  function exerciseSessions(user, name) {
    return sessions(user).flatMap(h => {
      const exercises = details(h).filter(e => e.name === name);
      return exercises.length ? [{session:h,sets:exercises.flatMap(sets),volume:exercises.reduce((n,e)=>n+volume(e),0)}] : [];
    });
  }
  function bestSet(items) {
    // Return one actual set, never the heaviest load and highest reps from different sets.
    return items.filter(s => number(s.weight) != null && number(s.reps) > 0)
      .slice().sort((a,b)=>number(b.weight)-number(a.weight)||number(b.reps)-number(a.reps))[0] || null;
  }
  function setLabel(s) {
    if (!s) return 'No comparable load and reps';
    return (number(s.weight) == null ? 'Load not entered' : String(s.weight) + ' lb') + ' × ' + String(s.reps) + ' reps';
  }
  function csv(list) {
    // Prevent spreadsheet formulas in imported names or raw recorded values.
    const cell = v => '"' + String(v ?? '').replace(/^[ \t\r\n]*[=+@-]/, m => "'" + m).replace(/"/g,'""') + '"';
    const out = [['Date','Workout','Mode','Exercise','Set','Weight (lb as logged)','Reps','RIR','Seconds']];
    for (const h of list) for (const e of details(h)) sets(e).forEach((s,i) => out.push([
      stamp(h) ? new Date(stamp(h)).toISOString() : h.date, h.name,h.trainingMode || 'traditional',e.name,i+1,s.weight,s.reps,s.rir,s.seconds ?? s.duration ?? ''
    ]));
    return out.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  let owner = '', options = {query:'',days:'',mode:'',exercise:''}, limit = 20;
  function style() {
    if (document.getElementById('historyExplorerStyle')) return;
    const node=document.createElement('style');node.id='historyExplorerStyle';
    node.textContent='.history-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.history-tools label{display:grid;gap:5px;font-size:12px;color:var(--muted)}.history-tools input,.history-tools select{width:100%;min-width:0;background:var(--surface2);color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px}.history-session{border:1px solid var(--line);border-radius:12px;margin:10px 0;padding:12px}.history-session summary{cursor:pointer;line-height:1.7;overflow-wrap:anywhere}.history-session summary span{display:block;color:var(--muted);font-size:12px}.history-table{overflow:auto;margin:10px 0}.history-table table{border-collapse:collapse;width:100%;font-size:13px}.history-table th,.history-table td{text-align:left;padding:9px;border-bottom:1px solid var(--line);white-space:nowrap}.history-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.history-stats{font-size:13px;line-height:1.7;margin:10px 0}.history-exercise{padding-top:12px}.history-exercise h3{font-size:15px;margin:5px 0}.history-compare{color:var(--muted);font-size:12px;line-height:1.6}.history-trend{border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0}@media(max-width:400px){.history-tools{grid-template-columns:1fr}}';
    document.head.append(node);
  }
  function render() {
    if (typeof activeUser !== 'function') return;
    const user=activeUser(),host=document.getElementById('historyList');
    if (!user || !host) return;
    style();
    const identity=(window.ironSixAccountScope || 'guest')+':'+user.id;
    if (owner !== identity) { owner=identity;options={query:'',days:'',mode:'',exercise:''};limit=20; }
    document.getElementById('historyTitle').textContent=user.name+'’s training history.';
    let tools=document.getElementById('historyExplorerTools');
    if (!tools) { tools=document.createElement('div');tools.id='historyExplorerTools';host.before(tools); }
    const names=[...new Set(sessions(user).flatMap(h=>details(h).map(e=>e.name)).filter(Boolean))].sort();
    const focused=document.activeElement,focusedId=focused?.id;
    const selection=focusedId==='historySearch'?[focused.selectionStart,focused.selectionEnd]:null;
    tools.innerHTML='<div class="history-tools"><label>Search workouts or exercises<input id="historySearch" type="search" placeholder="e.g. bench press" value="'+esc(options.query)+'"></label>'+
      '<label>Time range<select id="historyRange">'+[['','All time'],['30','Last 30 days'],['90','Last 90 days'],['365','Last year']].map(([v,t])=>'<option value="'+v+'" '+(options.days===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      '<label>Exercise progress<select id="historyExercise"><option value="">All exercises</option>'+names.map(name=>'<option '+(name===options.exercise?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>'+
      '<label>Workout mode<select id="historyMode">'+[['','All modes'],['traditional','Traditional'],['circuit','Circuit']].map(([v,t])=>'<option value="'+v+'" '+(options.mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label></div>'+
      '<div class="history-actions"><button type="button" class="btn secondary" id="historyClear">Clear filters</button><button type="button" class="btn secondary" id="historyExport">Export filtered sets (CSV)</button></div><div id="historyResultsSummary" class="history-stats" role="status" aria-live="polite"></div><div id="historyExerciseTrend"></div>';
    const list=filter(user,options),total=summarize(list);
    document.getElementById('historyResultsSummary').textContent=total.sessions+' sessions · '+total.sets+' completed sets · '+total.volume.toLocaleString()+' logged lb-reps';
    const update=(key,value)=>{options[key]=value;limit=20;render()};
    document.getElementById('historySearch').oninput=e=>update('query',e.target.value);
    document.getElementById('historyRange').onchange=e=>update('days',e.target.value);
    document.getElementById('historyExercise').onchange=e=>update('exercise',e.target.value);
    document.getElementById('historyMode').onchange=e=>update('mode',e.target.value);
    document.getElementById('historyClear').onclick=()=>{options={query:'',days:'',mode:'',exercise:''};limit=20;render()};
    document.getElementById('historyExport').disabled=!list.some(h=>details(h).length);
    document.getElementById('historyExport').onclick=()=>{
      let url;
      try { url=URL.createObjectURL(new Blob(['\ufeff'+csv(list)],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='iron-six-history.csv';document.body.append(a);a.click();a.remove(); }
      catch (_) { if(typeof toast==='function')toast('Could not export history on this device.'); }
      finally { if(url)setTimeout(()=>URL.revokeObjectURL(url),1000); }
    };
    if (options.exercise) {
      const timeline=exerciseSessions({history:list},options.exercise),recent=timeline[0],prior=timeline[1];
      const best=bestSet(timeline.flatMap(t=>t.sets));
      document.getElementById('historyExerciseTrend').innerHTML='<div class="history-trend"><strong>'+esc(options.exercise)+'</strong><p class="history-compare">Heaviest recorded set in this range: '+esc(setLabel(best))+
        (prior?'<br>Latest: '+esc(setLabel(bestSet(recent.sets)))+'<br>Previous: '+esc(setLabel(bestSet(prior.sets))):'<br>Log this exercise in another session to compare progress.')+
        '</p><div class="history-table"><table><caption>Exercise sessions in this range (latest 12)</caption><thead><tr><th>Date</th><th>Heaviest set</th><th>Completed sets</th><th>Logged lb-reps</th></tr></thead><tbody>'+
        timeline.slice(0,12).map(t=>'<tr><td>'+esc(date(t.session))+'</td><td>'+esc(setLabel(bestSet(t.sets)))+'</td><td>'+t.sets.length+'</td><td>'+Math.round(t.volume).toLocaleString()+'</td></tr>').join('')+'</tbody></table></div></div>';
    }
    const opened=new Set([...host.querySelectorAll('details[open]')].map(n=>n.dataset.historyKey));
    const key=h=>String(h.sessionId || h.ts || '')+':'+String(h.name||'');
    host.innerHTML=list.slice(0,limit).map(h=>{
      const keyValue=key(h),actual=number(h.elapsedMinutes),planned=number(h.duration);
      const time=actual>0?actual+' min recorded':planned>0?planned+' min planned':'';
      return '<details class="history-session" data-history-key="'+esc(keyValue)+'" '+(opened.has(keyValue)?'open':'')+'><summary><strong>'+esc(h.name||'Workout')+'</strong><span>'+esc(date(h))+' · '+count(h)+(number(h.plannedSets)>0?' / '+Number(h.plannedSets):'')+' sets'+(time?' · '+time:'')+' · '+esc(h.trainingMode||'traditional')+'</span></summary>'+
        (details(h).map(e=>{
          const earlier=exerciseSessions(user,e.name).find(t=>stamp(t.session)>0&&stamp(t.session)<stamp(h));
          return '<div class="history-exercise"><h3>'+esc(e.name)+'</h3><button type="button" class="btn secondary" data-history-exercise="'+esc(e.name)+'">View exercise progress</button>'+
            '<p class="history-compare">'+(earlier?'Previous session · '+esc(date(earlier.session))+': '+esc(earlier.sets.map(setLabel).join(' · ')):'First recorded session for this exercise, or no earlier dated record.')+'</p>'+
            '<div class="history-table"><table><caption>'+esc(e.name)+' — completed sets</caption><thead><tr><th>Set</th><th>lb as logged</th><th>Reps</th><th>RIR</th><th>Hold (sec)</th></tr></thead><tbody>'+
            sets(e).map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.weight==null||s.weight===''?'—':s.weight)+'</td><td>'+esc(s.reps==null||s.reps===''?'—':s.reps)+'</td><td>'+esc(s.rir==null||s.rir===''?'—':s.rir)+'</td><td>'+esc(s.seconds??s.duration??'—')+'</td></tr>').join('')+'</tbody></table></div></div>';
        }).join('')||'<p class="note">This older session has a summary only. No individual sets were recorded.</p>')+'</details>';
    }).join('') || '<div class="note">'+(sessions(user).length?'No sessions match these filters. Clear filters to see your full history.':'Complete your first workout to see your sets and progress here.')+'</div>';
    host.querySelectorAll('[data-history-exercise]').forEach(button=>button.onclick=()=>{update('exercise',button.dataset.historyExercise);document.getElementById('historyExercise').focus()});
    if(list.length>limit){const more=document.createElement('button');more.type='button';more.className='btn secondary';more.textContent='Show 20 more sessions';more.onclick=()=>{limit+=20;render()};host.append(more)}
    const note=document.createElement('p');note.className='note';note.textContent='Volume = entered load × completed reps. Bodyweight, timed holds and unentered loads are not estimated. Dumbbell loads stay exactly as logged. RIR = reps left in reserve; — = not entered.';host.append(note);
    if (tools.contains(document.getElementById(focusedId))) {
      const replacement=document.getElementById(focusedId);replacement?.focus();
      if(selection)replacement?.setSelectionRange(...selection);
    }
  }
  window.IronSixHistory={sessions,filter,summarize,exerciseSessions,bestSet,setLabel,csv,completed,render};
  const original=window.renderHistory;
  window.renderHistory=function(){if(!document.getElementById('historyList'))return original?.apply(this,arguments);render()};
  render();
})();
