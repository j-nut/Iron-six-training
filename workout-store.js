/* An edit is an immutable record, not a replacement of a user's entire profile. */
(() => {
  const PREFIX='ironSixEntry:', events=new Map();
  let db=null, localError='', cloudError='', flushing=null, timer=null, transport=null;
  const owner=()=>window.ironSixAccountScope||'guest';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const uuid=()=>crypto.randomUUID();
  function storageKey(event){return PREFIX+event.user_id+':'+event.event_id}
  function persist(event){
    let stored=false;
    try{localStorage.setItem(storageKey(event),JSON.stringify(event));stored=true}catch(_){localError='Device storage is full or unavailable. Keep this page open and export your log.'}
    if(db)try{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put(copy(event));tx.oncomplete=()=>{event._durable=true;status()};tx.onerror=()=>{localError='The local backup could not be written.';status()}}catch(_){localError='The local backup could not be written.'}
    event._durable=stored||event._durable;
    return stored;
  }
  function ingest(event){const previous=events.get(event.event_id);if(previous?.sequence&&!event.sequence)return;events.set(event.event_id,event);persist(event)}
  function all(scope=owner()){return [...events.values()].filter(e=>e.user_id===scope).sort((a,b)=>{
    if(a.sequence&&b.sequence)return Number(a.sequence)-Number(b.sequence);
    if(a.sequence!==undefined&&b.sequence===undefined)return -1;
    if(b.sequence!==undefined&&a.sequence===undefined)return 1;
    return a._order-b._order||a.event_id.localeCompare(b.event_id);
  })}
  function pending(scope=owner()){return all(scope).filter(event=>!event.sequence)}
  function snapshot(u,plan){return {key:u.program.currentWorkoutKey,plan:copy(plan||u.workoutDraft?.plan||finalWorkout(u)),today:copy(u.today||{}),exposure:Number(u.program.exposures?.[u.program.currentWorkoutKey])||0,workoutMinutes:u.workoutMinutes,readiness:copy(u.readiness||{}),trainingMode:u.trainingMode||'traditional',circuitPace:u.circuitPace||'balanced',timer:u.workoutDraft?.timer||null}}
  function append(u,kind,rowKey,payload,fields={}){
    const draft=u.workoutDraft;
    const order=pending().reduce((n,e)=>Math.max(n,(e._order||0)+1),Date.now());
    const event={event_id:uuid(),user_id:owner(),profile_client_id:u.id,session_id:draft.id,kind,row_key:rowKey,base_event_id:draft.heads?.[rowKey]||null,payload:copy(payload),client_at:new Date().toISOString(),completed:false,...fields,_order:order};
    events.set(event.event_id,event);persist(event);
    draft.heads=draft.heads||{};draft.heads[rowKey]=event.event_id;
    status();schedule();return event;
  }
  function ensure(u,plan){
    if(u.workoutDraft)return u.workoutDraft;
    u.workoutDraft={id:uuid(),plan:copy(plan||finalWorkout(u)),key:u.program.currentWorkoutKey,heads:{}};
    append(u,'start','session',snapshot(u));return u.workoutDraft;
  }
  function captureSet(u,plan,exerciseIndex,setIndex,set){
    ensure(u,plan);
    const exercise=u.workoutDraft.plan[exerciseIndex],rowKey=`${exerciseIndex}-${setIndex}`;
    if(!exercise)throw new Error('This exercise is no longer in the saved workout.');
    return append(u,'set',rowKey,{...set,exerciseIndex,setIndex,exerciseName:exercise.name},{exercise_name:exercise.name,set_index:setIndex,weight_text:String(set.weight??'').slice(0,32),reps_text:String(set.reps??'').slice(0,32),rir_text:String(set.rir??'').slice(0,32),completed:!!set.done});
  }
  function archive(u,reason){
    window.IronSixCircuit?.pause(reason);
    if(!u.workoutDraft&&!Object.keys(u.today||{}).length)return true;
    ensure(u);const event=append(u,'archive','session',{...snapshot(u),reason});
    if(!event._durable){toast('Cannot safely reset yet. Export your log or restore device storage.');return false}
    u.workoutDraft=null;return true;
  }
  function finish(u,session){
    window.IronSixCircuit?.pause('Workout finished');
    ensure(u);session.sessionId=u.workoutDraft.id;
    const event=append(u,'finish','session',{...snapshot(u),history:session});
    if(!event._durable){toast('Cannot safely finish yet. Export your log or restore device storage.');return false}
    u.workoutDraft=null;return true;
  }
  function changePlan(u,index,exercise){
    if(!u.workoutDraft)return;
    u.workoutDraft.plan[index]=copy(exercise);
    append(u,'plan','session',{...snapshot(u),changedIndex:index});
  }
  function timerCheckpoint(u,timer){
    ensure(u);u.workoutDraft.timer=copy(timer);
    append(u,'plan','timer',{timer:copy(timer),timerOnly:true});
  }
  function legacyId(value){const hex=[0,1,2,3].map(n=>stableNumber(n+':'+value).toString(16).padStart(8,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20)}
  function migrateUser(u,plan){
    const known=new Set(all().filter(e=>e.profile_client_id===u.id&&e.kind==='finish').map(e=>e.session_id));
    const original=u.workoutDraft;
    for(const h of u.history||[]){
      h.sessionId=h.sessionId||legacyId(owner()+':'+u.id+':'+h.ts);
      if(known.has(h.sessionId))continue;
      const migratedPlan=(h.details||[]).map(d=>({...d,sets:d.sets?.length||1})),today={};
      u.workoutDraft={id:h.sessionId,plan:migratedPlan,key:h.workoutKey,heads:{}};
      (h.details||[]).forEach((d,ei)=>(d.sets||[]).forEach((s,i)=>{
        today[ei+'-'+i]=copy(s);
        append(u,'set',ei+'-'+i,{...s,exerciseIndex:ei,setIndex:i,exerciseName:d.name},{event_id:legacyId(h.sessionId+':'+ei+':'+i),exercise_name:d.name,set_index:i,weight_text:String(s.weight??''),reps_text:String(s.reps??''),rir_text:String(s.rir??''),completed:!!s.done});
      }));
      append(u,'finish','session',{key:h.workoutKey,plan:migratedPlan,today,history:h,workoutMinutes:h.duration||60,trainingMode:h.trainingMode||'traditional'},{event_id:legacyId(h.sessionId+':finish')});
    }
    u.workoutDraft=original;
    if(!u.workoutDraft&&Object.keys(u.today||{}).length)ensure(u,plan);
  }
  function replay(profileId,scope=owner()){
    const sessions=new Map();
    for(const event of all(scope).filter(e=>e.profile_client_id===profileId)){
      let s=sessions.get(event.session_id);
      if(!s){s={id:event.session_id,heads:{},today:{},conflicts:0,status:'active'};sessions.set(s.id,s)}
      if(event.base_event_id&&s.heads[event.row_key]&&event.base_event_id!==s.heads[event.row_key])s.conflicts++;
      s.heads[event.row_key]=event.event_id;s.lastAt=event.client_at;
      if(event.payload.timerOnly){s.timer=event.payload.timer;continue}
      if(event.kind==='set')s.today[event.row_key]=copy(event.payload);
      else {Object.assign(s,{key:event.payload.key,plan:event.payload.plan,exposure:event.payload.exposure,workoutMinutes:event.payload.workoutMinutes,readiness:event.payload.readiness});
        // Plan changes may clear the replaced movement, but the old records remain in this journal.
        if(event.kind==='plan'&&Number.isInteger(event.payload.changedIndex)){for(const key of Object.keys(s.today))if(key.startsWith(event.payload.changedIndex+'-'))delete s.today[key]}
        else s.today=copy(event.payload.today||s.today);
        s.trainingMode=event.payload.trainingMode||'traditional';s.circuitPace=event.payload.circuitPace||'balanced';s.timer=event.payload.timer||s.timer;
        if(event.kind==='finish'){s.status='finished';s.history=event.payload.history}
        if(event.kind==='archive')s.status='archived';
      }
    }
    return [...sessions.values()];
  }
  function restore(u){
    const sessions=replay(u.id),known=new Set((u.history||[]).map(h=>h.sessionId||String(h.ts)));
    for(const s of sessions)if(s.history&&!known.has(s.history.sessionId||String(s.history.ts))){u.history.unshift(copy(s.history));known.add(s.history.sessionId||String(s.history.ts))}
    u.history.sort((a,b)=>b.ts-a.ts);
    for(const key of ROTATION)u.program.exposures[key]=Math.max(Number(u.program.exposures[key])||0,u.history.filter(h=>h.workoutKey===key).length);
    const current=sessions.find(s=>s.id===u.workoutDraft?.id);
    if(current&&current.status!=='active'){u.workoutDraft=null;u.today={};u.program.currentWorkoutKey=nextWorkoutKey(u)}
    const s=current?.status==='active'?current:[...sessions].reverse().find(s=>s.status==='active'&&s.plan?.length);
    if(!s)return;
    u.workoutDraft={id:s.id,key:s.key,plan:copy(s.plan),heads:copy(s.heads),timer:s.timer};
    u.trainingMode=s.trainingMode||'traditional';u.circuitPace=s.circuitPace||'balanced';
    u.program.currentWorkoutKey=s.key;u.workoutMinutes=s.workoutMinutes||60;u.today=copy(s.today);
    u.draftWorkoutKey=s.key;
  }
  async function flush(){
    if(flushing)return flushing;
    const scope=owner();if(scope==='guest'||!transport||navigator.onLine===false){status();return false}
    flushing=(async()=>{try{
      for(const event of pending(scope)){
        if(scope!==owner())return false;
        const saved=await transport(copy(event));
        if(!saved?.sequence)throw new Error('The database did not confirm this entry.');
        ingest({...event,...saved});cloudError='';status();
      }
      return true;
    }catch(error){cloudError=error.message||'Cloud save failed';status();return false}})();
    try{return await flushing}finally{flushing=null}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(flush,250)}
  function status(){
    if(document.getElementById('history')?.classList.contains('active'))renderTable();
    const items=pending(),unsaved=items.some(e=>!e._durable),scope=owner();
    const message=unsaved?'NOT SAVED — keep this page open':localError||
      (scope==='guest'?'Saved on this device only — sign in to back up':items.length?`${items.length} edits saved locally · ${cloudError?'cloud retry needed':navigator.onLine===false?'offline':'sending to database…'}`:'All workout edits saved to database');
    const element=document.getElementById('workoutSaveStatus');if(element){element.textContent=message;element.dataset.state=unsaved||localError?'error':items.length||scope==='guest'?'pending':'saved'}
    window.dispatchEvent(new CustomEvent('iron-six-save-status',{detail:{message,pending:items.length,error:cloudError||localError}}));
    return {message,pending:items.length,error:cloudError||localError};
  }
  function exportLog(){
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),profiles:data,entries:all()},null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='iron-six-workout-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function renderTable(){
    const u=activeUser(),el=document.getElementById('savedWorkoutTable');if(!el)return;
    const rows=all().filter(e=>e.profile_client_id===u.id&&e.kind==='set').slice(-100).reverse();
    el.innerHTML=`<p>Last 100 edits, newest first. Earlier revisions are retained. Blank means not entered—not zero.</p><div style="overflow:auto"><table><thead><tr><th>Exercise / set</th><th>lb</th><th>Reps</th><th>RIR</th><th>Done</th><th>Save</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${escapeHtml(e.exercise_name)} · ${e.set_index+1}</td><td>${escapeHtml(e.weight_text)}</td><td>${escapeHtml(e.reps_text)}</td><td>${escapeHtml(e.rir_text)}</td><td>${e.completed?'✓':'—'}</td><td>${e.sequence?'Database':'Local / pending'}</td></tr>`).join('')||'<tr><td colspan="6">No recorded edits yet.</td></tr>'}</tbody></table></div>`;
    const sessions=replay(u.id);const recovery=document.getElementById('workoutRecovery');
    if(recovery){recovery.innerHTML=sessions.slice(-20).reverse().map(s=>`<button type="button" class="btn secondary" data-recover="${s.id}">${escapeHtml(WORKOUT_META[s.key]?.short||s.key)} · ${escapeHtml(s.status)}${s.conflicts?' · concurrent edits retained':''} · Restore copy</button>`).join('');recovery.querySelectorAll('[data-recover]').forEach(b=>b.addEventListener('click',()=>{
      const s=sessions.find(x=>x.id===b.dataset.recover);if(!s?.plan)return;
      if(!confirm('Restore a copy of this saved session? Your current session will be archived, not deleted.'))return;
      if(!archive(u,'Restore another session'))return;
      u.program.currentWorkoutKey=s.key;u.workoutMinutes=s.workoutMinutes;u.trainingMode=s.trainingMode||'traditional';u.circuitPace=s.circuitPace||'balanced';u.today=copy(s.today);ensure(u,s.plan);saveData();renderAll();showView('today');
    }))}
  }
  function installUI(){
    if(!document.getElementById('workoutSaveStatus')){const statusBox=document.createElement('div');statusBox.id='workoutSaveStatus';statusBox.setAttribute('role','status');statusBox.setAttribute('aria-live','polite');document.getElementById('exerciseList')?.before(statusBox)}
    if(!document.getElementById('savedWorkoutTable')){const section=document.createElement('div');section.className='section';section.innerHTML='<h2>Saved workout table</h2><button type="button" class="btn secondary" id="retryWorkoutSaves">Retry saves</button> <button type="button" class="btn secondary" id="exportWorkoutLog">Export backup</button><div id="savedWorkoutTable"></div><h3>Recover a session</h3><div id="workoutRecovery"></div>';document.getElementById('history')?.append(section);section.querySelector('#retryWorkoutSaves').onclick=async()=>{await flush();renderTable()};section.querySelector('#exportWorkoutLog').onclick=exportLog}
    status();renderTable();
  }
  try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(PREFIX)){try{const event=JSON.parse(localStorage.getItem(key));event._durable=true;events.set(event.event_id,event)}catch(_){localError='A local journal record needs recovery.'}}}}catch(_){localError='Device storage is unavailable.'}
  const hydrated=new Promise(resolve=>{
    if(!window.indexedDB){resolve();return}
    const request=indexedDB.open('iron-six-workout-journal',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('entries',{keyPath:'event_id'});
    request.onerror=()=>resolve();request.onblocked=()=>resolve();
    request.onsuccess=()=>{db=request.result;const read=db.transaction('entries').objectStore('entries').getAll();read.onsuccess=()=>{for(const event of read.result){const local=events.get(event.event_id);if(!local||(!local.sequence&&event.sequence)){event._durable=true;events.set(event.event_id,event)}}resolve()};read.onerror=()=>resolve()};
  });
  window.IronSixJournal={captureSet,ensure,archive,finish,changePlan,timerCheckpoint,migrateUser,restore,replay,pending,all,ingest,flush,status,renderTable,installUI,exportLog,hydrated,setTransport:fn=>{transport=fn;schedule()}};
  window.addEventListener('online',schedule);
  window.addEventListener('storage',event=>{if(event.key?.startsWith(PREFIX)&&event.newValue){try{const record=JSON.parse(event.newValue);const old=events.get(record.event_id);if(!old?.sequence||record.sequence){record._durable=true;events.set(record.event_id,record);status();schedule()}}catch(_){}}});
  window.addEventListener('beforeunload',event=>{if(pending().some(e=>!e._durable)){event.preventDefault();event.returnValue='Some edits are not saved.'}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
  setInterval(flush,15000);
})();
