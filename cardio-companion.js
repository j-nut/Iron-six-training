/* Optional companion. Its only durable writes are user.program.cardio. */
(() => {
  if (window.IronSixCardio) return;
  const modes = ['walk', 'cycle', 'run', 'swim'];
  const DAY = 86400000;
  const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== '' && value != null ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function settings(user) {
    const c = user?.program?.cardio || {};
    return { enabled: c.enabled === true, mode: modes.includes(c.mode) ? c.mode : 'walk', baselineWeeklyMinutes: bounded(c.baselineWeeklyMinutes, 0, 0, 1500), minutes: [10,20,30].includes(Number(c.minutes)) ? Number(c.minutes) : 10, intensity: c.intensity === 'moderate' ? 'moderate' : 'easy' };
  }
  function recentLoad(user, now = Date.now()) {
    const seen = new Set();
    const entries = (Array.isArray(user?.program?.cardio?.logs) ? user.program.cardio.logs : []).filter(x => {
      const at = Date.parse(x?.completedAt);
      if (!x?.id || seen.has(x.id) || x.completed !== true || !modes.includes(x.mode) || !['easy','moderate'].includes(x.intensity) || !(Number(x.minutes)>0 && Number(x.minutes)<=300) || !Number.isFinite(at) || at > now || now-at >= 7*DAY) return false;
      seen.add(x.id); return true;
    });
    return { minutes: entries.reduce((n,x)=>n+Number(x.minutes),0), moderateMinutes: entries.filter(x=>x.intensity==='moderate').reduce((n,x)=>n+Number(x.minutes),0), last24hMinutes: entries.filter(x=>now-Date.parse(x.completedAt)<DAY).reduce((n,x)=>n+Number(x.minutes),0), demandingLowerBody: entries.some(x=>now-Date.parse(x.completedAt)<2*DAY && (x.mode==='run' && Number(x.minutes)>=20 || x.mode==='cycle' && x.intensity==='moderate' && Number(x.minutes)>=30)), entries };
  }
  function recommend(user, now = Date.now(), nextKey) {
    const s = settings(user), load = recentLoad(user,now);
    const lowerSoon = /lower|legs/i.test(`${user?.program?.currentWorkoutKey || ''} ${nextKey || ''}`);
    const easier = lowerSoon || load.demandingLowerBody || s.baselineWeeklyMinutes < 60;
    const minutes = Math.min(s.minutes, s.baselineWeeklyMinutes<60 ? 10 : s.baselineWeeklyMinutes<120 ? 20 : 30);
    return { enabled:s.enabled, mode: easier && s.mode==='run' ? 'walk' : s.mode, minutes, intensity:easier ? 'easy' : s.intensity, restSuggested:load.last24hMinutes>=30, lowerSoon, recent:load,
      reason:load.last24hMinutes>=30 ? 'You already logged cardio in the last 24 hours. Rest is a useful option today.' : lowerSoon ? 'A lower-body workout is current or next. Keep cardio easy so your legs are ready.' : load.demandingLowerBody ? 'Recent running or cycling added leg work. Choose easy movement or rest.' : s.baselineWeeklyMinutes<60 ? 'Start with short, easy sessions and build gradually as recovery allows.' : 'Keep this comfortable and fit it around your strength training.' };
  }
  function updateSettings(user, patch) {
    const value = settings({program:{cardio:{...settings(user),...patch}}});
    user.program = user.program || {};
    user.program.cardio = {...(user.program.cardio || {}),...value};
    return value;
  }
  function logSession(user, entry, now = Date.now()) {
    const at=Date.parse(entry?.completedAt), minutes=Number(entry?.minutes);
    if (!entry?.id || typeof entry.id!=='string' || entry.id.length>100 || entry.completed!==true || !modes.includes(entry.mode) || !['easy','moderate'].includes(entry.intensity) || !Number.isFinite(minutes) || minutes<1 || minutes>300 || !Number.isFinite(at) || at>now) return false;
    const logs=Array.isArray(user?.program?.cardio?.logs) ? user.program.cardio.logs : [];
    if(logs.some(x=>x.id===entry.id))return false;
    user.program=user.program || {};
    user.program.cardio={...(user.program.cardio||{}),logs:[{id:entry.id,mode:entry.mode,minutes,intensity:entry.intensity,completed:true,completedAt:new Date(at).toISOString(),source:'manual'},...logs]};
    return true;
  }
  const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const options = (values, selected) => values.map(x=>`<option value="${x}"${x===selected?' selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('');
  let lastLog=0;
  function render() {
    if(typeof activeUser!=='function') return;
    const user=activeUser(), host=document.getElementById('today');
    if(!user || !host)return;
    const owner=user.id, scope=window.ironSixAccountScope||null;
    const current=()=>typeof activeUser==='function' && activeUser()?.id===owner && (window.ironSixAccountScope||null)===scope && activeUser()===user;
    const s=settings(user), rec=recommend(user,Date.now(),typeof nextWorkoutKey==='function'?nextWorkoutKey(user):undefined);
    let panel=document.getElementById('cardioCompanion');
    if(!panel){panel=document.createElement('div');panel.id='cardioCompanion';panel.className='section';host.append(panel);}
    panel.innerHTML=`<h2>Optional cardio</h2>
      <label style="display:flex;gap:10px;align-items:center"><input id="cardioEnabled" type="checkbox" style="width:auto" ${s.enabled?'checked':''}> Recommend cardio alongside my strength plan</label>
      <p class="note">Rest or skipping cardio never advances or penalizes your strength plan.</p>
      <div class="readiness"><div class="select-wrap"><label for="cardioMode">Preferred activity</label><select id="cardioMode">${options(modes,s.mode)}</select></div>
      <div class="select-wrap"><label for="cardioBaseline">Usual cardio minutes per week</label><input id="cardioBaseline" type="number" min="0" max="1500" value="${s.baselineWeeklyMinutes}"></div>
      <div class="select-wrap"><label for="cardioTime">Time available</label><select id="cardioTime">${[10,20,30].map(n=>`<option ${n===s.minutes?'selected':''} value="${n}">${n} minutes</option>`).join('')}</select></div>
      <div class="select-wrap"><label for="cardioIntensity">Preferred intensity</label><select id="cardioIntensity">${options(['easy','moderate'],s.intensity)}</select></div></div>
      <p class="note">${s.enabled?`<strong>${rec.restSuggested?'Rest, or optionally ':''}${rec.minutes} minutes · ${rec.mode} · ${rec.intensity}</strong><br>${rec.reason}`:'Suggestions are off. You can still log walks, rides, runs, and swims below.'}</p>
      <p class="note">Easy: relaxed conversation. Moderate: you can talk but not sing. If combining sessions, do strength first when strength is your priority. Build gradually toward the general adult reference of 150 moderate minutes per week; it is not a quota or a requirement to add on top of activity you already do. <a href="https://www.cdc.gov/physical-activity-basics/guidelines/adults.html" target="_blank" rel="noopener noreferrer">Activity guidance</a></p>
      <p>${rec.recent.minutes} minutes logged in the last 7 days (${rec.recent.moderateMinutes} moderate).</p>
      <details><summary>Log completed cardio</summary><p class="note">Log only activity you have finished. This also works when suggestions are off.</p>
      <div class="readiness"><div class="select-wrap"><label for="cardioLogMode">Activity completed</label><select id="cardioLogMode">${options(modes,s.mode)}</select></div>
      <div class="select-wrap"><label for="cardioLogMinutes">Minutes completed</label><input id="cardioLogMinutes" type="number" min="1" max="300" value="${rec.minutes}"></div>
      <div class="select-wrap"><label for="cardioLogIntensity">Actual intensity</label><select id="cardioLogIntensity">${options(['easy','moderate'],rec.intensity)}</select></div>
      <div class="select-wrap"><label for="cardioLogDate">Date completed</label><input id="cardioLogDate" type="date" max="${today()}" value="${today()}"></div></div>
      <button type="button" class="btn secondary" id="cardioLogSave">Log completed cardio</button><p id="cardioLogStatus" role="status"></p></details>
      ${rec.recent.entries.length?`<details><summary>Recent cardio</summary>${rec.recent.entries.slice(0,10).map(e=>`<p>${escape(new Date(e.completedAt).toLocaleDateString())} · ${e.minutes}m ${e.mode} · ${e.intensity}</p>`).join('')}</details>`:''}`;
    const el=id=>panel.querySelector('#'+id);
    for(const [id,key] of Object.entries({cardioEnabled:'enabled',cardioMode:'mode',cardioBaseline:'baselineWeeklyMinutes',cardioTime:'minutes',cardioIntensity:'intensity'}))el(id).onchange=event=>{if(!current())return;updateSettings(user,{[key]:key==='enabled'?event.target.checked:event.target.value});if(typeof saveData==='function')saveData();render();};
    const token=window.crypto?.randomUUID?.() || `cardio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    el('cardioLogSave').onclick=()=>{
      if(!current() || Date.now()-lastLog<1500)return;
      const date=el('cardioLogDate').value;
      const completedAt=date===today()?new Date().toISOString():new Date(date+'T12:00:00').toString();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date>today() || !logSession(user,{id:token,mode:el('cardioLogMode').value,minutes:el('cardioLogMinutes').value,intensity:el('cardioLogIntensity').value,completed:true,completedAt})){el('cardioLogStatus').textContent='Enter a completed date and 1–300 minutes.';return;}
      lastLog=Date.now();const saved=typeof saveData==='function'?saveData():false;
      render();const status=document.getElementById('cardioLogStatus');if(status){status.closest('details').open=true;status.textContent=saved===false?'Logged in this page, but device storage could not save. Keep this page open.':'Cardio logged. Your strength workout stays in place.';}
    };
  }
  window.IronSixCardio={settings,recommend,recentLoad,updateSettings,logSession,render};
  const original=window.renderAll;
  if(typeof original==='function')window.renderAll=function(...args){const result=original.apply(this,args);render();return result;};
  render();window.addEventListener('load',render);
})();
