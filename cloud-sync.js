/* Authenticated account boundaries and conflict-aware profile sync. Workout edits
   travel independently through the append-only journal, never through a delete. */
(() => {
  if(window.__ironSixCloudLoaded)return;window.__ironSixCloudLoaded=true;
  const SDK='https://esm.sh/@supabase/supabase-js@2.112.4';
  const DEFAULT_SUPABASE={url:'https://btfrkfbxyowglrdwclei.supabase.co',publishableKey:'sb_publishable_lhLxwVoR5VcpNpOPs1bBVQ_ik42s4wi'};
  const baseSave=window.saveData,ensuring=new Map();
  let client=null,session=null,epoch=0,activated,syncing=null,syncTimer,activation=Promise.resolve(),mode='login',busy=false,message='Connecting…';
  const scope=()=>window.ironSixAccountScope||null;
  const own=()=>!!session?.user&&session.user.id===scope();
  const $=id=>document.getElementById(id);
  const journal=()=>window.IronSixJournal;
  function notify(text){message=text;if($('accountStatus'))$('accountStatus').textContent=text}
  function runtimeState(u){return {today:u.today||{},draftWorkoutKey:u.draftWorkoutKey||null,draftUpdatedAt:Number(u.draftUpdatedAt)||0,workoutDraft:u.workoutDraft||null,history:u.history||[],customEquipment:u.customEquipment||[],coachMessages:u.coachMessages||[],coachOverrides:u.coachOverrides||null,sessionCalibration:u.sessionCalibration||null,trainerMemory:u.trainerMemory||null,localUpdatedAt:Number(u.localUpdatedAt)||0,importedGuestId:u.importedGuestId||null,trainingMode:u.trainingMode||'traditional',circuitPace:u.circuitPace||'balanced'}}
  function payload(u,userId){return {user_id:userId,client_id:String(u.id),display_name:u.name,body_weight_lb:Number(u.weight)||null,age:u.age||null,height_in:u.heightIn||null,training_level:u.trainingLevel||'unknown',bench_reference:u.benchBest||null,equipment:u.equipment||{},capacities:u.capacities||{},workout_minutes:Number(u.workoutMinutes)||60,readiness:u.readiness||{},program_state:u.program||{},runtime_state:runtimeState(u)}}
  const fingerprint=u=>JSON.stringify(payload(u,scope()));
  function fromRow(r){
    const s=r.runtime_state||{};
    const u=normalizeUser({...s,id:r.client_id,name:r.display_name,weight:Number(r.body_weight_lb)||213,age:r.age,heightIn:r.height_in,trainingLevel:r.training_level,benchBest:r.bench_reference||'',equipment:r.equipment||{},capacities:r.capacities||{},workoutMinutes:r.workout_minutes,readiness:r.readiness||{},program:r.program_state||{},cloudId:r.id,accountOwner:r.user_id,_cloudVersion:r.updated_at});
    u._cloudFingerprint=fingerprint(u);return u;
  }
  function mergeSetDrafts(local,cloud){const out={...cloud};for(const [key,set] of Object.entries(local||{})){if(!cloud?.[key]||Number(set?._updatedAt||0)>=Number(cloud[key]?._updatedAt||0))out[key]=set}return out}
  function applyRow(u,row){
    const remote=fromRow(row),draft=u.workoutDraft,today=u.today,draftKey=u.draftWorkoutKey;
    Object.assign(u,remote);delete u._remoteProfile;
    if(draft){u.workoutDraft=draft;u.today=draft.id===remote.workoutDraft?.id?mergeSetDrafts(today,remote.today):today;u.draftWorkoutKey=draftKey;u.program.currentWorkoutKey=draft.key}
  }
  async function ensureProfile(u){
    const userId=scope(),version=epoch;
    if(!own()||u.accountOwner!==userId)throw new Error('Sign in to the account that owns this workout.');
    if(u.cloudId)return u.cloudId;
    const key=userId+':'+u.id;if(ensuring.has(key))return ensuring.get(key);
    const work=(async()=>{
      const {error}=await client.from('profiles').upsert({...payload(u,userId),updated_at:new Date().toISOString()},{onConflict:'user_id,client_id',ignoreDuplicates:true});if(error)throw error;
      const result=await client.from('profiles').select('id,updated_at').eq('user_id',userId).eq('client_id',u.id).single();if(result.error)throw result.error;
      if(version!==epoch)throw new Error('Account changed; this save will resume when you sign back in.');
      u.cloudId=result.data.id;u._cloudVersion=result.data.updated_at;baseSave();return u.cloudId;
    })();ensuring.set(key,work);try{return await work}finally{ensuring.delete(key)}
  }
  async function saveEntry(event){
    if(!own()||event.user_id!==scope())throw new Error('Sign in again to finish backing up this account.');
    const version=epoch,u=data.users.find(u=>u.id===event.profile_client_id);
    if(!u)throw new Error('The training profile must be recovered before this entry can sync.');
    await ensureProfile(u);if(version!==epoch)throw new Error('Account changed.');
    const {_order,_durable,sequence,saved_at,...row}=event;
    let result=await client.from('workout_entries').insert(row).select('event_id,sequence,saved_at').single();
    if(result.error?.code==='23505')result=await client.from('workout_entries').select('event_id,sequence,saved_at').eq('event_id',event.event_id).eq('user_id',event.user_id).single();
    if(result.error)throw result.error;return result.data;
  }
  async function pullProfiles(version){
    const result=await client.from('profiles').select('*').eq('user_id',scope()).order('updated_at',{ascending:false});if(result.error)throw result.error;if(version!==epoch)return;
    const rows=result.data||[],blank=data.fresh===true&&!data.users.some(u=>u.history.length||Object.keys(u.today).length);
    if(rows.length&&blank){data.users=rows.map(fromRow);data.activeUserId=data.users[0].id;data.fresh=false;return}
    for(const row of rows){const u=data.users.find(u=>u.id===row.client_id);if(!u){data.users.push(fromRow(row));continue}
      if(row.updated_at!==u._cloudVersion){
        if(u._cloudFingerprint&&fingerprint(u)===u._cloudFingerprint)applyRow(u,row);
        else if(!u.cloudId&&!u.localUpdatedAt)applyRow(u,row);
        else u._remoteProfile=row;
      }
      u.cloudId=row.id;u.accountOwner=scope();
    }
  }
  async function pushProfiles(version){
    for(const u of data.users){
      if(version!==epoch)return;if(u._remoteProfile||u.accountOwner!==scope())continue;
      await ensureProfile(u);if(version!==epoch)return;
      const mark=fingerprint(u);if(mark===u._cloudFingerprint)continue;
      const updated_at=new Date(Math.max(Date.now(),Date.parse(u._cloudVersion||0)+1||0)).toISOString();
      const result=await client.from('profiles').update({...payload(u,scope()),updated_at}).eq('id',u.cloudId).eq('user_id',scope()).eq('updated_at',u._cloudVersion).select('updated_at');
      if(result.error)throw result.error;if(version!==epoch)return;
      if(result.data?.length){u._cloudVersion=result.data[0].updated_at;u._cloudFingerprint=mark}
      else {const remote=await client.from('profiles').select('*').eq('id',u.cloudId).single();if(remote.error)throw remote.error;if(version!==epoch)return;u._remoteProfile=remote.data}
    }
  }
  async function pullEntries(version){
    let cursor=0;
    while(version===epoch){
      const result=await client.from('workout_entries').select('*').eq('user_id',scope()).gt('sequence',cursor).order('sequence').limit(500);if(result.error)throw result.error;if(version!==epoch)return;
      for(const row of result.data||[])journal().ingest(row);
      if((result.data||[]).length<500)break;cursor=result.data[result.data.length-1].sequence;
    }
  }
  async function syncNow(showToast=false){
    if(!own())return false;if(syncing)return syncing;
    const version=epoch;
    syncing=(async()=>{try{
      notify('Syncing…');await pullProfiles(version);if(version!==epoch)return false;
      await pushProfiles(version);if(version!==epoch)return false;
      await journal().flush();if(version!==epoch)return false;
      await pullEntries(version);if(version!==epoch)return false;
      const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
      if(!editing){for(const u of data.users)journal().restore(u);baseSave();renderAll()}else baseSave();
      const conflicts=data.users.some(u=>u._remoteProfile),pending=journal().pending().length;
      notify(conflicts?'Profile settings changed on another device. Choose which settings to keep below.':pending?'Workout edits are saved locally; database upload needs a retry.':'Account and workout records are backed up.');
      renderConflicts();journal().status();if(showToast)toast(message);return !pending&&!conflicts;
    }catch(error){if(version===epoch){notify('Cloud unavailable: '+(error.message||'please retry')+'. Local workout entries are retained.');if(showToast)toast('Cloud save needs a retry; local records retained.')}return false}
    finally{syncing=null}})();return syncing;
  }
  function queueSync(){clearTimeout(syncTimer);if(own())syncTimer=setTimeout(()=>syncNow(false),1200)}
  async function activate(next){
    const nextId=next?.user?.id||null;session=next||null;
    if(activated===nextId){renderAccount();return}
    window.IronSixCircuit?.pause('Account changed');const version=++epoch;activated=nextId;clearTimeout(syncTimer);
    if(typeof calibrationRequest!=='undefined')calibrationRequest++;
    baseSave();window.ironSixAccountScope=nextId;
    try{if(nextId)localStorage.setItem('ironSixAccountScope',nextId);else localStorage.removeItem('ironSixAccountScope')}catch(_){notify('Account preference could not be saved on this device.')}
    data=loadData();data.ownerId=nextId;
    for(const u of data.users){if(nextId)u.accountOwner=nextId}
    baseSave();renderAll();renderAccount();await journal().hydrated;if(version!==epoch)return;
    for(const u of data.users){journal().migrateUser(u);journal().restore(u)}
    journal().setTransport(saveEntry);baseSave();renderAll();
    notify(nextId?'Signed in. Checking your saved records…':'Guest mode: saved on this device only.');
    if(nextId){if(syncing)await syncing;await syncNow(false)}
  }
  function renderConflicts(){
    const box=$('profileConflicts');if(!box)return;box.replaceChildren();
    if(!own())return;
    for(const u of data.users.filter(u=>u._remoteProfile)){
      const row=document.createElement('p'),label=document.createElement('span');label.textContent=u.name+': conflicting profile settings. ';row.append(label);
      for(const [title,remote] of [['Keep device settings',false],['Use cloud settings',true]]){
        const button=document.createElement('button');button.className='btn secondary';button.type='button';button.textContent=title;
        button.onclick=()=>{if(remote)applyRow(u,u._remoteProfile);else{u._cloudVersion=u._remoteProfile.updated_at;delete u._remoteProfile}baseSave();renderAll();renderConflicts();syncNow(true)};row.append(button);
      }box.append(row);
    }
  }
  function renderAccount(){
    if(!$('accountForm'))return;
    const signed=own(),password=mode==='password';
    $('ironCloudButton').textContent=signed?'Account':'Sign in';
    $('accountIdentity').textContent=signed?'Signed in as '+session.user.email:'One account can contain multiple training profiles. Guest data stays separate until you choose to import it.';
    $('accountActions').hidden=!signed;$('accountTabs').hidden=signed;
    $('accountForm').hidden=signed&&!password;
    $('accountEmailWrap').hidden=password;$('accountPasswordWrap').hidden=!['login','signup','password'].includes(mode);
    $('accountConfirmWrap').hidden=!['signup','password'].includes(mode);
    $('accountEmail').required=!password;$('accountPassword').required=['login','signup','password'].includes(mode);
    $('accountPassword').autocomplete=mode==='login'?'current-password':'new-password';
    $('accountConfirm').required=['signup','password'].includes(mode);
    $('accountSubmit').textContent=({login:'Sign in',signup:'Create account',magic:'Send sign-in link',reset:'Send password reset',password:'Save new password'})[mode];
    $('accountSubmit').disabled=busy||!client;$('accountStatus').textContent=message;renderConflicts();window.IronSixSocialAuth?.render(session);
  }
  function openAccount(){renderAccount();$('cloudModal')?.classList.add('show');$('cloudClose')?.focus()}
  function clearPasswords(){$('accountPassword').value='';$('accountConfirm').value=''}
  async function submitAccount(event){
    event.preventDefault();if(!client||busy)return;
    const email=$('accountEmail').value.trim(),password=$('accountPassword').value,confirmPassword=$('accountConfirm').value;
    if(['signup','password'].includes(mode)&&(password.length<12||password!==confirmPassword)){notify('Use at least 12 characters and matching passwords.');return}
    busy=true;renderAccount();const redirectTo=location.origin+location.pathname,action=mode;
    try{
      let result;
      if(action==='login')result=await client.auth.signInWithPassword({email,password});
      if(action==='signup')result=await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
      if(action==='magic')result=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:false}});
      if(action==='reset')result=await client.auth.resetPasswordForEmail(email,{redirectTo});
      if(action==='password')result=await client.auth.updateUser({password});
      if(result.error)throw result.error;
      clearPasswords();
      if(action==='password'){mode='login';notify('Password updated.')}
      else if(result.data?.session)notify('Signed in. Loading your account…');
      else notify('Check your email for the confirmation or recovery link. It may take a few minutes.');
    }catch(error){notify(action==='login'?'Could not sign in. Check your email and password, confirm your email, or use password reset.':error.message||'Please try again.')}
    finally{busy=false;renderAccount()}
  }
  async function signOut(){
    if(!client)return;await journal().flush();
    if(journal().pending().length&&!confirm('Some entries are only saved on this device. Sign out anyway? They will wait here for this account to sign back in.'))return;
    const {error}=await client.auth.signOut({scope:'local'});if(error){notify(error.message);return}
    mode='login';await activate(null);clearPasswords();renderAccount();
  }
  function importGuests(){
    if(!own())return;let saved;
    try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(_){toast('Could not read guest profiles.');return}
    if(!saved?.users?.length||saved.ownerId){toast('No unclaimed guest profiles to import.');return}
    if(!confirm('Copy this device’s guest profiles and workouts into '+session.user.email+'? Only continue if this data belongs to this account.'))return;
    for(const source of saved.users){
      if(data.users.some(u=>u.importedGuestId===source.id))continue;
      const u=normalizeUser(JSON.parse(JSON.stringify(source))),plan=u.workoutDraft?.plan;
      u.id=crypto.randomUUID();u.accountOwner=scope();u.importedGuestId=source.id;u.localUpdatedAt=Date.now();u.workoutDraft=null;
      for(const key of ['cloudId','_cloudVersion','_cloudFingerprint','_remoteProfile','cloudNormalizedThrough'])delete u[key];
      data.users.push(u);journal().migrateUser(u,plan);
    }baseSave();renderAll();queueSync();notify('Guest profiles copied. Originals remain on this device.');
  }
  function installUI(){
    const top=document.querySelector('.topbar');if(!top)return;
    const button=document.createElement('button');button.id='ironCloudButton';button.className='iconbtn';button.type='button';button.textContent='Sign in';button.onclick=openAccount;top.insertBefore(button,top.querySelector('.user-switch'));
    const modal=document.createElement('div');modal.id='cloudModal';modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="accountTitle"><h2 id="accountTitle">Your account</h2><p id="accountIdentity"></p><p id="accountStatus" role="status" aria-live="polite"></p><div id="accountTabs" class="cta"><button type="button" class="btn secondary" data-auth="login">Sign in</button><button type="button" class="btn secondary" data-auth="signup">Create account</button><button type="button" class="btn secondary" data-auth="magic">Email link</button><button type="button" class="btn secondary" data-auth="reset">Forgot password?</button></div><form id="accountForm"><div class="setting" id="accountEmailWrap"><label for="accountEmail">Email</label><input id="accountEmail" type="email" autocomplete="email" maxlength="254" required></div><div class="setting" id="accountPasswordWrap"><label for="accountPassword">Password</label><input id="accountPassword" type="password" autocomplete="current-password" maxlength="256"></div><div class="setting" id="accountConfirmWrap"><label for="accountConfirm">Confirm password (12+ characters)</label><input id="accountConfirm" type="password" autocomplete="new-password" maxlength="256"></div><button id="accountSubmit" class="btn primary" type="submit">Sign in</button></form><div id="accountActions" class="cta" hidden><button type="button" class="btn primary" id="accountSync">Sync now</button><button type="button" class="btn secondary" id="accountChangePassword">Change password</button><button type="button" class="btn secondary" id="accountImport">Import guest profiles</button><button type="button" class="btn secondary" id="accountSignOut">Sign out</button></div><div id="profileConflicts"></div><p>Passwords are managed by Supabase Auth, not stored in training profiles. Offline entries stay on this device until the database confirms them.</p><button type="button" class="btn secondary" id="cloudClose">Close</button></div>';
    document.body.append(modal);
    $('accountForm').onsubmit=submitAccount;
    modal.querySelectorAll('[data-auth]').forEach(button=>button.onclick=()=>{mode=button.dataset.auth;clearPasswords();renderAccount()});
    $('accountSync').onclick=()=>syncNow(true);$('accountImport').onclick=importGuests;$('accountSignOut').onclick=signOut;
    $('accountChangePassword').onclick=()=>{mode='password';renderAccount()};
    const close=()=>{modal.classList.remove('show');clearPasswords();$('ironCloudButton').focus()};
    $('cloudClose').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});
    modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button,input')].filter(n=>!n.disabled&&!n.closest('[hidden]'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
    const style=document.createElement('style');style.textContent='[hidden]{display:none!important}#cloudModal .modal{max-height:90vh;overflow:auto}#ironCloudButton{margin-left:auto;margin-right:8px;min-width:72px}#workoutSaveStatus{padding:12px;border:1px solid var(--line);border-radius:10px;margin:12px 0;font-size:13px}#workoutSaveStatus[data-state="error"]{color:#ffb2a9;border-color:#e77}#workoutSaveStatus[data-state="saved"]{color:var(--accent)}#savedWorkoutTable table{width:100%;border-collapse:collapse;font-size:13px}#savedWorkoutTable th,#savedWorkoutTable td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);white-space:nowrap}#workoutRecovery{display:flex;flex-wrap:wrap;gap:8px}#accountStatus{overflow-wrap:anywhere}.exercise-name-link{display:block;border:0;background:none;color:var(--text);padding:0;text-align:left;font:inherit;font-weight:850;font-size:16px;text-decoration:underline;text-underline-offset:4px;cursor:pointer}.exercise-help-btn{border:0;background:none;color:var(--accent);padding:7px 0;font-size:12px;font-weight:800;cursor:pointer}';
    document.head.append(style);renderAccount();
  }
  async function getConfig(){
    if(window.IRON_SIX_SUPABASE?.url&&window.IRON_SIX_SUPABASE?.publishableKey)return window.IRON_SIX_SUPABASE;
    try{const result=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(result.ok){const cfg=await result.json();if(cfg.supabaseUrl&&cfg.supabasePublishableKey)return {url:cfg.supabaseUrl,publishableKey:cfg.supabasePublishableKey}}}catch(_){}
    return DEFAULT_SUPABASE;
  }
  async function init(){
    installUI();const callbackIssue=window.IronSixSocialAuth?.callbackError();try{
      const cfg=await getConfig(),mod=await import(SDK);client=mod.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      window.IronSixSocialAuth?.install({client,config:cfg,session:()=>session,isBusy:()=>busy,setBusy:value=>{busy=value;renderAccount()},saveLocal:baseSave,notify});
      client.auth.onAuthStateChange((event,next)=>{setTimeout(()=>{if(event==='PASSWORD_RECOVERY')mode='password';activation=activation.then(()=>activate(next)).then(()=>{if(event==='PASSWORD_RECOVERY')openAccount()}).catch(error=>notify(error.message))},0)});
      const result=await client.auth.getSession();if(result.error)throw result.error;
      activation=activation.then(()=>activate(result.data.session));await activation;
      if(callbackIssue){callbackIssue.clear();notify(callbackIssue.message);openAccount()}
    }catch(error){if(callbackIssue){callbackIssue.clear();notify(callbackIssue.message);openAccount()}else notify('Sign-in unavailable. Local workout logging still works. '+(error.message||''));renderAccount()}
  }
  window.saveData=function(){data.fresh=false;const u=typeof activeUser==='function'?activeUser():null;if(u){u.localUpdatedAt=Date.now();if(own())u.accountOwner=scope()}const saved=baseSave();queueSync();return saved};
  window.IronSixCloud={saveLocal:baseSave,syncNow,client:()=>client,session:()=>session,openAccount};
  window.addEventListener('online',()=>syncNow(false));
  setInterval(()=>syncNow(false),30000);init();
})();
