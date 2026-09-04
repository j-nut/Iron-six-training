(() => {
  if(window.__ironSixCloudLoaded)return;
  window.__ironSixCloudLoaded=true;

  const SDK='https://esm.sh/@supabase/supabase-js@2.112.4';
  const DEFAULT_SUPABASE={url:'https://btfrkfbxyowglrdwclei.supabase.co',publishableKey:'sb_publishable_lhLxwVoR5VcpNpOPs1bBVQ_ik42s4wi'};
  let client=null,session=null,syncTimer=null,baseSave=window.saveData,ready=false;

  function cloudState(text,tone='muted'){
    const b=document.getElementById('ironCloudButton');if(!b)return;
    b.textContent=text;b.dataset.tone=tone;b.title=text;
  }

  async function getConfig(){
    if(window.IRON_SIX_SUPABASE?.url&&window.IRON_SIX_SUPABASE?.publishableKey)return window.IRON_SIX_SUPABASE;
    try{const r=await fetch('/api/config',{cache:'no-store'});if(r.ok){const j=await r.json();if(j.supabaseUrl&&j.supabasePublishableKey)return {url:j.supabaseUrl,publishableKey:j.supabasePublishableKey}}}catch(_){}
    try{const j=JSON.parse(localStorage.getItem('ironSixCloudConfig')||'null');if(j?.url&&j?.publishableKey)return j}catch(_){}
    return DEFAULT_SUPABASE;
  }

  function installUI(){
    if(document.getElementById('ironCloudButton'))return;
    const top=document.querySelector('.topbar');if(!top)return;
    const btn=document.createElement('button');btn.id='ironCloudButton';btn.className='iconbtn cloud-btn';btn.type='button';btn.textContent='☁';btn.title='Cloud sync';top.insertBefore(btn,top.querySelector('.user-switch'));
    const back=document.createElement('div');back.className='modal-backdrop';back.id='cloudModal';back.innerHTML=`<div class="modal"><h3>Iron Six Cloud</h3><p id="cloudModalText">Sign in to sync profiles and training history across devices.</p><div class="setting" id="cloudEmailWrap"><label for="cloudEmail">Email</label><input id="cloudEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="cta"><button class="btn secondary" id="cloudClose" type="button">Close</button><button class="btn secondary" id="cloudSignOut" type="button" style="display:none">Sign out</button><button class="btn primary" id="cloudAction" type="button">Email sign-in link</button></div></div>`;document.body.appendChild(back);
    btn.addEventListener('click',renderModal);document.getElementById('cloudClose').addEventListener('click',()=>back.classList.remove('show'));back.addEventListener('click',e=>{if(e.target===back)back.classList.remove('show')});document.getElementById('cloudAction').addEventListener('click',cloudAction);document.getElementById('cloudSignOut').addEventListener('click',async()=>{if(client)await client.auth.signOut();session=null;cloudState('☁','muted');renderModal()});
    const style=document.createElement('style');style.textContent=`.cloud-btn{font-size:17px;margin-left:auto;margin-right:8px}.cloud-btn[data-tone="ok"]{border-color:rgba(157,223,104,.55);color:var(--accent)}.cloud-btn[data-tone="busy"]{opacity:.7}.exercise-name-link{display:block;border:0;background:none;color:var(--text);padding:0;text-align:left;font:inherit;font-weight:850;font-size:16px;text-decoration:underline;text-decoration-color:rgba(157,223,104,.45);text-underline-offset:4px;cursor:pointer}.exercise-help-btn{border:0;background:none;color:var(--accent);padding:7px 0 2px;font-size:12px;font-weight:800;cursor:pointer}`;document.head.appendChild(style);
  }

  function renderModal(){
    const m=document.getElementById('cloudModal');if(!m)return;m.classList.add('show');
    const text=document.getElementById('cloudModalText'),email=document.getElementById('cloudEmailWrap'),action=document.getElementById('cloudAction'),out=document.getElementById('cloudSignOut');
    if(!client){text.textContent='Cloud sync is not configured on this deployment yet.';email.style.display='none';action.style.display='none';out.style.display='none';return}
    if(session?.user){text.textContent=`Signed in as ${session.user.email||'your account'}. Profiles and history sync automatically.`;email.style.display='none';action.style.display='';action.textContent='Sync now';out.style.display=''}else{text.textContent='Sign in to sync profiles and training history across devices.';email.style.display='';action.style.display='';action.textContent='Email sign-in link';out.style.display='none'}
  }

  async function cloudAction(){
    if(!client)return;
    if(session?.user){await syncNow(true);renderModal();return}
    const email=document.getElementById('cloudEmail').value.trim();if(!email){toast('Enter your email');return}
    const redirectTo=location.origin+location.pathname;
    const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
    if(error){toast(error.message);return}
    document.getElementById('cloudModalText').textContent='Check your email for the secure sign-in link.';toast('Sign-in link sent')
  }

  function runtimeState(u){return {today:u.today||{},draftWorkoutKey:u.draftWorkoutKey||null,draftUpdatedAt:Number(u.draftUpdatedAt)||0,history:u.history||[],coachMessages:u.coachMessages||[],coachOverrides:u.coachOverrides||null,sessionCalibration:u.sessionCalibration||null,trainerMemory:u.trainerMemory||null,localUpdatedAt:Number(u.localUpdatedAt)||Date.now()}}
  function payload(u,userId){return {user_id:userId,client_id:String(u.id),display_name:u.name,body_weight_lb:Number(u.weight)||null,age:u.age||null,height_in:u.heightIn||null,training_level:u.trainingLevel||'unknown',bench_reference:u.benchBest||null,equipment:u.equipment||{},capacities:u.capacities||{},workout_minutes:Number(u.workoutMinutes)||60,readiness:u.readiness||{},program_state:u.program||{},runtime_state:runtimeState(u),updated_at:new Date().toISOString()}}
  function fromRow(r){const s=r.runtime_state||{};return normalizeUser({id:r.client_id,name:r.display_name,weight:Number(r.body_weight_lb)||213,age:r.age||null,heightIn:r.height_in||null,trainingLevel:r.trainingLevel||r.training_level||'unknown',benchBest:r.bench_reference||'',equipment:r.equipment||{},capacities:r.capacities||{},workoutMinutes:r.workout_minutes||60,readiness:r.readiness||{},program:r.program_state||{},today:s.today||{},draftWorkoutKey:s.draftWorkoutKey||null,draftUpdatedAt:Number(s.draftUpdatedAt)||0,history:s.history||[],coachMessages:s.coachMessages||[],coachOverrides:s.coachOverrides||null,sessionCalibration:s.sessionCalibration||null,trainerMemory:s.trainerMemory||null,localUpdatedAt:Number(s.localUpdatedAt)||Date.parse(r.updated_at)||0,cloudId:r.id})}
  function hasDraft(today){return Object.values(today||{}).some(s=>s&&(s.done||(s.weight!=null&&s.weight!=='')||(s.reps!=null&&s.reps!=='')||(s.rir!=null&&s.rir!=='')))}
  function mergeSetDrafts(local,cloud){const out={...cloud};for(const [key,set] of Object.entries(local||{})){const remote=cloud?.[key];if(!remote||Number(set?._updatedAt||0)>=Number(remote?._updatedAt||0))out[key]=set}return out}
  function isBlankLocal(){if(data.users.length!==1)return false;const u=data.users[0];return !(u.history||[]).length&&!Object.keys(u.today||{}).length&&!Object.values(u.program?.exposures||{}).some(Number)}

  async function pullAndMerge(){
    if(!client||!session?.user)return;
    const {data:rows,error}=await client.from('profiles').select('*').order('updated_at',{ascending:false});if(error)throw error;
    if(!rows?.length)return;
    if(isBlankLocal()){data.users=rows.map(fromRow);data.activeUserId=data.users[0]?.id||data.activeUserId;baseSave();renderAll();return}
    const localById=new Map(data.users.map(u=>[String(u.id),u]));
    for(const r of rows){const cloud=fromRow(r),local=localById.get(String(r.client_id));if(!local){data.users.push(cloud);continue}const localTs=Number(local.localUpdatedAt)||0,cloudTs=Number(cloud.localUpdatedAt)||Date.parse(r.updated_at)||0;if(cloudTs>localTs){const localToday=local.today||{},localDraftKey=local.draftWorkoutKey,localDraftAt=Number(local.draftUpdatedAt)||0;Object.assign(local,cloud);if(hasDraft(localToday)&&localDraftKey&&localDraftKey===cloud.draftWorkoutKey){local.today=mergeSetDrafts(localToday,cloud.today||{});local.draftUpdatedAt=Math.max(localDraftAt,Number(cloud.draftUpdatedAt)||0)}else if(hasDraft(localToday)&&localDraftAt>Number(cloud.draftUpdatedAt||0)){local.today=localToday;local.draftWorkoutKey=localDraftKey;local.draftUpdatedAt=localDraftAt}}}
    if(!data.users.some(u=>u.id===data.activeUserId))data.activeUserId=data.users[0]?.id;baseSave();renderAll();
  }

  async function pushProfiles(){
    if(!client||!session?.user)return;
    for(const u of data.users){const {data:row,error}=await client.from('profiles').upsert(payload(u,session.user.id),{onConflict:'user_id,client_id'}).select('id').single();if(error)throw error;if(row?.id)u.cloudId=row.id}
    baseSave();
  }

  async function syncNow(showToast=false){
    if(!client||!session?.user)return false;
    cloudState('☁…','busy');
    try{await pullAndMerge();await pushProfiles();cloudState('☁✓','ok');if(showToast)toast('Cloud sync complete');return true}catch(err){console.warn('Iron Six cloud sync:',err);cloudState('☁!','muted');if(showToast)toast('Cloud sync failed');return false}
  }
  function queueSync(){if(!ready||!session?.user)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow(false),900)}

  async function init(){
    installUI();cloudState('☁','muted');
    const cfg=await getConfig();if(!cfg)return;
    try{const mod=await import(SDK);client=mod.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const s=await client.auth.getSession();session=s.data.session||null;client.auth.onAuthStateChange((_event,next)=>{session=next||null;if(session?.user){cloudState('☁✓','ok');setTimeout(()=>syncNow(false),0)}else cloudState('☁','muted')});ready=true;if(session?.user){cloudState('☁✓','ok');await syncNow(false)}}catch(err){console.warn('Supabase init failed',err);client=null;cloudState('☁!','muted')}
  }

  window.saveData=function(){const u=typeof activeUser==='function'?activeUser():null;if(u)u.localUpdatedAt=Date.now();baseSave();queueSync()};
  window.IronSixCloud={syncNow,client:()=>client,session:()=>session};
  init();
})();
