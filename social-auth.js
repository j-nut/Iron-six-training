/* Social sign-in. Direct providers use Iron Six Supabase; Google can securely bridge through Nomad's existing verified OAuth setup. */
(() => {
  const IRON_SITE='https://iron-six-training.vercel.app';
  const NOMAD_AUTH='https://nemgmavvuoulrahvrdwh.supabase.co';
  const providers=[
    {id:'google',key:'google',name:'Google',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.2c0-.72-.06-1.24-.2-1.78H12v3.24h5.37a4.6 4.6 0 0 1-1.99 2.93l-.02.11 2.89 2.24.2.02c1.83-1.69 2.9-4.18 2.9-6.76z"/><path fill="#34A853" d="M12 21.7c2.62 0 4.82-.86 6.43-2.34l-3.07-2.38c-.82.55-1.9.94-3.36.94-2.52 0-4.66-1.7-5.42-4.06l-.11.01-3 2.32-.04.1A9.7 9.7 0 0 0 12 21.7z"/><path fill="#FBBC05" d="M6.58 13.86A5.85 5.85 0 0 1 6.26 12c0-.64.11-1.26.31-1.86l-.01-.13-3.05-2.36-.1.05A9.7 9.7 0 0 0 2.3 12c0 1.56.37 3.04 1.13 4.3l3.15-2.44z"/><path fill="#EA4335" d="M12 6.08c1.82 0 3.05.79 3.75 1.44l2.75-2.69C16.8 3.25 14.62 2.3 12 2.3a9.7 9.7 0 0 0-8.57 5.4l3.14 2.44C7.34 7.78 9.48 6.08 12 6.08z"/></svg>'},
    {id:'apple',key:'apple',name:'Apple',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.67 12.72c.03 3.08 2.7 4.1 2.73 4.12-.02.07-.43 1.47-1.4 2.91-.84 1.25-1.72 2.49-3.1 2.52-1.35.03-1.79-.8-3.34-.8-1.55 0-2.04.78-3.32.83-1.33.05-2.35-1.34-3.2-2.59-1.74-2.51-3.07-7.1-1.28-10.21A4.97 4.97 0 0 1 8 6.96c1.3-.03 2.53.87 3.33.87.8 0 2.3-1.08 3.87-.92.66.03 2.52.27 3.71 2.01-.1.06-2.22 1.3-2.24 3.8zM14.17 5.26c.7-.85 1.18-2.03 1.05-3.21-1.02.04-2.25.68-2.98 1.53-.65.75-1.22 1.95-1.07 3.11 1.14.09 2.3-.58 3-1.43z"/></svg>'},
    {id:'azure',key:'microsoft',name:'Microsoft',scopes:'email',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f25022" d="M2 2h9v9H2z"/><path fill="#7fba00" d="M13 2h9v9h-9z"/><path fill="#00a4ef" d="M2 13h9v9H2z"/><path fill="#ffb900" d="M13 13h9v9h-9z"/></svg>'},
    {id:'github',key:'github',name:'GitHub',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.22c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.29-5.27-1.29-5.27-5.72 0-1.26.45-2.3 1.19-3.11-.12-.29-.52-1.48.11-3.07 0 0 .97-.31 3.16 1.19a10.96 10.96 0 0 1 5.74 0c2.19-1.5 3.15-1.19 3.15-1.19.64 1.59.24 2.78.12 3.07.74.81 1.19 1.85 1.19 3.11 0 4.44-2.71 5.42-5.29 5.71.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.55A11.5 11.5 0 0 0 12 .7z"/></svg>'}
  ];
  let api=null,status=null,loading=false,settingsError=false,currentSession=null,bridgeBusy=false;
  const $=id=>document.getElementById(id);
  const direct=p=>status?.iron?.[p.key]===true;
  const bridged=p=>p.id==='google'&&status?.nomad?.google===true;
  const usable=(p,signed)=>direct(p)||(!signed&&bridged(p));
  function enabledProviders(signed=!!currentSession?.user){return providers.filter(p=>usable(p,signed))}

  function render(session=currentSession){
    currentSession=session;
    if(!$('socialProviders'))return;
    const signed=!!session?.user,linked=new Set((session?.user?.identities||[]).map(x=>x.provider)),available=enabledProviders(signed);
    $('socialTitle').textContent=signed?'Connected sign-in methods':'Sign in faster';
    $('socialHelp').textContent=signed?'Add another secure sign-in method without creating a separate training account.':'Use a secure provider, or continue with email below.';
    $('socialAvailability').textContent=loading?'Checking available sign-in methods…':settingsError?'Other sign-in methods could not be checked right now. Email sign-in still works.':available.length?'':'Email sign-in is available below.';
    $('socialRefresh').hidden=!settingsError;
    for(const p of providers){
      const button=$('social-'+p.id),connected=signed&&linked.has(p.id),enabled=usable(p,signed);
      button.hidden=!loading&&!enabled&&!connected;
      button.disabled=!!api?.isBusy()||bridgeBusy||!api||loading||!enabled||connected;
      button.querySelector('.social-label').textContent=connected?p.name+' connected':signed?'Connect '+p.name:'Continue with '+p.name;
      button.title=connected?'Already connected to this account':enabled?'':loading?'Checking availability':'Not available';
    }
    $('socialMethods').hidden=$('accountSubmit')?.textContent==='Save new password';
    const divider=$('socialDivider');if(divider)divider.hidden=signed||(!loading&&!available.length);
  }

  async function fetchStatus(url){
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Unavailable');
    const result=await response.json();
    if(!result.iron||!result.nomad)throw Error('Invalid settings');
    return result;
  }
  async function refresh(){
    if(!api||loading)return;loading=true;settingsError=false;render();
    // Same-origin first: that is what works on Vercel previews and what the native
    // bridge rewrites to the app's API origin. Fall back to the production host only
    // for static deployments (GitHub Pages) that serve no /api routes at all.
    try{
      try{status=await fetchStatus('/api/auth-status')}
      catch(_){status=await fetchStatus(IRON_SITE+'/api/auth-status')}
    }catch(_){status=null;settingsError=true}
    finally{loading=false;render()}
  }

  function clearBridgeUrl(){
    try{
      const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));
      hash.delete('nomad_access_token');url.searchParams.delete('bridge_error');url.searchParams.delete('bridge_description');
      url.hash=hash.toString();history.replaceState(null,'',url.pathname+url.search+(url.hash?'#'+url.hash.replace(/^#/, ''):''));
    }catch(_){}
  }

  // The diagnosis is worth more than the moment it happens in: a sign-in failure that is only
  // ever a disappearing message is one the user reports as "it just does nothing".
  const FAILURE_KEY='ironSixGoogleBridgeFailure';
  function rememberFailure(detail){
    try{localStorage.setItem(FAILURE_KEY,JSON.stringify({detail,at:new Date().toISOString()}))}catch(_){ }
  }
  function clearFailure(){try{localStorage.removeItem(FAILURE_KEY)}catch(_){ }}
  function lastFailure(){
    try{const raw=JSON.parse(localStorage.getItem(FAILURE_KEY)||'null');return raw&&raw.detail?raw:null}catch(_){return null}
  }
  function showRememberedFailure(){
    const failure=lastFailure();
    if(!failure||!api||api.session()?.user)return;
    api.notify('Last Google sign-in did not complete. '+failure.detail);
  }

  async function finishGoogleBridge(token){
    if(!api||bridgeBusy||typeof token!=='string'||token.length<80)return;
    clearBridgeUrl();bridgeBusy=true;api.setBusy(true);render();api.notify('Verifying Google sign-in…');
    try{
      const response=await fetch(api.config.url.replace(/\/$/,'')+'/functions/v1/auth-bridge',{
        method:'POST',headers:{apikey:api.config.publishableKey,'Content-Type':'application/json'},
        body:JSON.stringify({token}),signal:AbortSignal.timeout(15000)
      });
      const body=await response.json().catch(()=>({}));
      // Each step fails differently and the difference is the whole diagnosis, so say which one
      // it was. This used to collapse into one message that vanished after 1.9 seconds, which
      // is how a sign-in could fail repeatedly and look like it had worked.
      if(!response.ok||!body.token_hash){
        const reason=response.status===401||response.status===403
            ? 'Google verified you, but Iron Six would not accept that identity (step: verification, '+response.status+').'
          :response.status===503
            ? 'The Iron Six sign-in service is missing its server credentials (step: bridge, 503).'
          :response.ok
            ? 'The sign-in service replied without a one-time token (step: bridge).'
          :(body.error||'The sign-in service returned '+response.status)+' (step: bridge, '+response.status+').';
        throw Error(reason);
      }
      const result=await api.client.auth.verifyOtp({token_hash:body.token_hash,type:'email'});
      if(result.error)throw Error('Iron Six rejected the one-time sign-in token: '+(result.error.message||'unknown')+' (step: verifyOtp).');
      if(!result.data?.session)throw Error('Sign-in returned no session (step: verifyOtp).');
      clearFailure();
      api.notify('Signed in with Google. Loading your Iron Six account…');
    }catch(error){
      const detail=String(error?.message||'Unknown error');
      rememberFailure(detail);
      api.notify('Google sign-in did not complete. '+detail+' Your local workout is unchanged; try again or use email.');
      // A failure the user cannot see is a failure they will repeat. Put it in front of them.
      try{window.IronSixCloud?.openAccount?.()}catch(_){ }
    }
    finally{bridgeBusy=false;api.setBusy(false);render()}
  }

  async function startGoogleBridge(){
    if(api.session()?.user)return;
    const target=window.IronSixNative?'android':'web';
    const relay='https://mynomad.pet/iron-six-auth?target='+target;
    const url=NOMAD_AUTH+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(relay);
    api.notify('Opening Google…');
    if(window.IronSixNative)await window.IronSixNative.openOAuth(url);else location.assign(url);
  }

  async function start(id){
    const provider=providers.find(p=>p.id===id);if(!api||api.isBusy()||bridgeBusy||!provider)return;
    const signed=api.session()?.user;if(!usable(provider,!!signed))return;
    if(signed?.identities?.some(x=>x.provider===id))return;
    api.setBusy(true);render();
    try{
      window.IronSixCircuit?.pause('Paused for sign-in');
      if(!api.saveLocal()||window.IronSixJournal?.pending().some(e=>!e._durable))throw {code:'local_save_failed'};
      if(id==='google'&&!direct(provider)){api.setBusy(false);render();await startGoogleBridge();return}
      const options={redirectTo:window.IronSixNative?.redirectTo||IRON_SITE+'/?auth=oauth'};
      if(window.IronSixNative)options.skipBrowserRedirect=true;if(provider.scopes)options.scopes=provider.scopes;
      if(id==='google')options.queryParams={prompt:'select_account'};
      api.notify('Opening '+provider.name+'…');
      const result=signed?await api.client.auth.linkIdentity({provider:id,options}):await api.client.auth.signInWithOAuth({provider:id,options});
      if(result.error)throw result.error;if(!result.data?.url)throw {code:'missing_redirect'};
      if(window.IronSixNative){await window.IronSixNative.openOAuth(result.data.url);api.setBusy(false);render()}
    }catch(error){
      const messages={local_save_failed:'Your latest changes could not be saved on this device. Your workout is still here; try again after the save completes.',manual_linking_disabled:'Connecting another provider is not available right now. Your current account is unchanged.',identity_already_exists:'That sign-in method is already connected to another Iron Six account.',provider_disabled:'This sign-in method is not enabled yet.',provider_not_enabled:'This sign-in method is not enabled yet.'};
      api.notify(messages[error?.code]||'Could not open '+provider.name+'. Try again or continue with email.');api.setBusy(false);render();
    }
  }

  function callbackError(){
    const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));
    const bridge=url.searchParams.get('bridge_error');
    const code=bridge||url.searchParams.get('error_code')||url.searchParams.get('error')||hash.get('error_code')||hash.get('error');
    if(!code)return null;
    return {message:code==='access_denied'?'Sign-in was cancelled. You can try again or use email.':'The sign-in could not be completed. Please try again.',clear(){for(const key of ['error','error_code','error_description','bridge_error','bridge_description']){url.searchParams.delete(key);hash.delete(key)}url.hash=hash.toString();history.replaceState(null,'',url.pathname+url.search+url.hash)}};
  }

  function install(options){
    api=options;
    const section=document.createElement('section');section.id='socialMethods';section.className='account-section';
    section.innerHTML='<h3 id="socialTitle">Sign in faster</h3><p id="socialHelp" class="account-subcopy">Use a secure provider, or continue with email below.</p><div id="socialProviders"></div><p id="socialAvailability" role="status" aria-live="polite"></p><button type="button" class="account-link" id="socialRefresh">Check provider availability again</button><div id="socialDivider" class="auth-divider"><span>or continue with email</span></div>';
    $('accountTabs').before(section);
    for(const provider of providers){const button=document.createElement('button');button.id='social-'+provider.id;button.type='button';button.className='social-provider';button.innerHTML='<span class="social-icon">'+provider.icon+'</span><span class="social-label">Continue with '+provider.name+'</span><span class="social-chevron" aria-hidden="true">›</span>';button.onclick=()=>start(provider.id);$('socialProviders').append(button)}
    $('socialRefresh').onclick=refresh;
    const style=document.createElement('style');style.textContent='#socialMethods{margin:0}#socialMethods h3{margin:0 0 4px;font-size:15px;letter-spacing:.01em}#socialProviders{display:flex;flex-direction:column;gap:9px;margin-top:14px}.social-provider{width:100%;min-height:50px;display:grid;grid-template-columns:24px 1fr 18px;align-items:center;gap:10px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.035);color:var(--text);font:inherit;font-weight:780;cursor:pointer;text-align:left;transition:border-color .15s,background .15s,transform .08s}.social-provider:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2)}.social-provider:active{transform:scale(.985)}.social-provider:disabled{opacity:.55;cursor:default;transform:none}.social-icon{width:22px;height:22px;display:flex;align-items:center;justify-content:center}.social-icon svg{width:21px;height:21px;display:block}.social-chevron{font-size:22px;color:var(--muted);text-align:right}.account-subcopy,#socialAvailability{font-size:12.5px;line-height:1.45;color:var(--muted);margin:4px 0 0}.account-link{border:0;background:none;color:var(--accent);padding:5px 0;font:inherit;font-size:12px;font-weight:750;cursor:pointer}.auth-divider{display:flex;align-items:center;gap:10px;margin:18px 0 2px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.auth-divider:before,.auth-divider:after{content:"";height:1px;background:var(--line);flex:1}.auth-divider span{white-space:nowrap}';document.head.append(style);
    window.addEventListener('ironsix:google-bridge',event=>{if(event.detail?.error){api.notify('Google sign-in was cancelled. Your local workout is unchanged.');api.setBusy(false);render();return}void finishGoogleBridge(event.detail?.token)});
    const hash=new URLSearchParams(location.hash.slice(1)),token=hash.get('nomad_access_token');if(token)void finishGoogleBridge(token);
    else showRememberedFailure();
    refresh();
  }
  window.addEventListener('pageshow',()=>{if(api){api.setBusy(false);refresh()}});
  window.IronSixSocialAuth={install,render,callbackError,lastFailure,clearFailure};
})();
