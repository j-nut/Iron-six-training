(() => {
  if(window.__ironSixHistoryCloudLoaded)return;window.__ironSixHistoryCloudLoaded=true;
  let timer=null,running=false;

  function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
  async function syncHistory(){
    if(running||!window.IronSixCloud)return;
    const client=window.IronSixCloud.client?.(),session=window.IronSixCloud.session?.();
    if(!client||!session?.user)return;
    running=true;
    try{
      for(const u of data.users||[]){
        if(!u.cloudId)continue;
        const through=Number(u.cloudNormalizedThrough)||0;
        const pending=(u.history||[]).filter(h=>Number(h.ts)>through).sort((a,b)=>Number(a.ts)-Number(b.ts));
        let newest=through;
        for(const h of pending){
          const clientSessionId=String(h.ts||Date.now());
          const started=new Date(Number(h.ts)||Date.now()).toISOString();
          const sessionRow={user_id:session.user.id,profile_id:u.cloudId,client_session_id:clientSessionId,workout_key:h.workoutKey||'unknown',workout_name:h.name||h.workoutKey||'Workout',variant:h.variant||null,duration_minutes:num(h.duration),readiness:h.readiness||{},planned_sets:num(h.plannedSets),completed_sets:num(h.sets),started_at:started,completed_at:started};
          const {data:saved,error:sessionError}=await client.from('workout_sessions').upsert(sessionRow,{onConflict:'profile_id,client_session_id'}).select('id').single();
          if(sessionError)throw sessionError;
          const rows=[];(h.details||[]).forEach(d=>(d.sets||[]).forEach((s,i)=>rows.push({user_id:session.user.id,profile_id:u.cloudId,session_id:saved.id,exercise_name:d.name,movement_base:d.base||null,seed_key:d.seedKey||null,set_index:i,actual_weight_lb:num(s.weight),reps:num(s.reps),rir:num(s.rir),completed:!!s.done,performed_at:started})));
          if(rows.length){const {error:setError}=await client.from('exercise_sets').upsert(rows,{onConflict:'session_id,exercise_name,set_index'});if(setError)throw setError}
          newest=Math.max(newest,Number(h.ts)||0);
        }
        if(newest>through){u.cloudNormalizedThrough=newest;localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
      }
    }catch(err){console.warn('Iron Six normalized history sync:',err)}finally{running=false}
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(syncHistory,1800)}
  const priorSave=window.saveData;window.saveData=function(){priorSave();schedule()};
  window.IronSixCloudHistory={syncHistory};
  setInterval(syncHistory,30000);schedule();
})();
