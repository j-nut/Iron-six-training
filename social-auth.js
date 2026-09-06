/* Provider credentials stay in Supabase. Public Auth settings control availability. */
(() => {
  const providers=[{id:'google',name:'Google'},{id:'apple',name:'Apple'},{id:'azure',name:'Microsoft',scopes:'email'},{id:'github',name:'GitHub'}];
  let api=null,settings=null,loading=false,settingsError=false,currentSession=null;
  const $=id=>document.getElementById(id);
  function render(session=currentSession){
    currentSession=session;
    const box=$('socialProviders');if(!box)return;
    const signed=!!session?.user,linked=new Set((session?.user?.identities||[]).map(x=>x.provider));
    $('socialTitle').textContent=signed?'Connected sign-in methods':'Continue with your account';
    $('socialHelp').textContent=signed?'Connect another sign-in method here to keep the same workouts, even when it uses a different email address.':'Already have an Iron Six account? Use the same verified email, or sign in first to connect a different email.';
    $('socialAvailability').textContent=loading?'Checking available sign-in methods…':settingsError?'Could not check other sign-in methods. Email sign-in is still available.':providers.some(p=>settings?.external?.[p.id]===true)?'':'Other sign-in methods are not available yet. You can use email below.';
    $('socialRefresh').hidden=loading||(!settingsError&&providers.every(p=>settings?.external?.[p.id]===true));
    for(const p of providers){
      const button=$('social-'+p.id),connected=signed&&linked.has(p.id),enabled=settings?.external?.[p.id]===true;
      button.disabled=!!api?.isBusy()||!api||loading||!enabled||connected;
      button.textContent=connected?p.name+' · Connected':signed?'Connect '+p.name:'Continue with '+p.name;
      button.title=connected?'Already connected to this account':enabled?'':loading?'Checking availability':'Not available yet';
      button.setAttribute('aria-describedby','socialAvailability');
    }
    $('socialMethods').hidden=$('accountSubmit')?.textContent==='Save new password';
  }
  async function refresh(){
    if(!api||loading)return;loading=true;settingsError=false;render();
    try{
      const response=await fetch(api.config.url.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:api.config.publishableKey},cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Unavailable');const result=await response.json();
      if(!result.external||typeof result.external!=='object')throw Error('Invalid settings');
      settings=result;
    }catch(_){settings=null;settingsError=true}
    finally{loading=false;render()}
  }
  async function start(id){
    const provider=providers.find(p=>p.id===id);
    if(!api||api.isBusy()||!provider||settings?.external?.[id]!==true)return;
    const signed=api.session()?.user;
    if(signed?.identities?.some(x=>x.provider===id))return;
    api.setBusy(true);render();
    try{
      window.IronSixCircuit?.pause('Paused for sign-in');
      if(!api.saveLocal()||window.IronSixJournal?.pending().some(e=>!e._durable))throw {code:'local_save_failed'};
      const options={redirectTo:location.origin+location.pathname};
      if(provider.scopes)options.scopes=provider.scopes;
      if(id==='google')options.queryParams={prompt:'select_account'};
      api.notify('Opening '+provider.name+'… Your saved workout stays on this device.');
      const result=signed?await api.client.auth.linkIdentity({provider:id,options}):await api.client.auth.signInWithOAuth({provider:id,options});
      if(result.error)throw result.error;
      if(!result.data?.url)throw {code:'missing_redirect'};
      // Supabase owns the provider redirect and callback; never merge accounts in the client.
    }catch(error){
      const messages={
        local_save_failed:'Your latest changes could not be saved on this device. Keep this page open and export your workout before signing in.',
        manual_linking_disabled:'Connecting additional accounts is not available yet. Your current sign-in and workouts are unchanged.',
        identity_already_exists:'That sign-in is already connected to another Iron Six account. No workouts were moved.',
        provider_disabled:'This sign-in method is not available right now. Please use email.',
        provider_not_enabled:'This sign-in method is not available right now. Please use email.'
      };
      api.notify(messages[error.code]||'Could not open '+provider.name+'. Try again or continue with email. Your workout is still saved.');
      api.setBusy(false);render();
    }
  }
  function callbackError(){
    const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));
    const code=url.searchParams.get('error_code')||url.searchParams.get('error')||hash.get('error_code')||hash.get('error');
    if(!code)return null;
    return {message:code==='access_denied'?'Sign-in was cancelled or declined. You can try again or use email. Your saved workout is unchanged.':'The sign-in link could not be completed. Please try again. Your saved workout is unchanged.',
      clear(){for(const key of ['error','error_code','error_description']){url.searchParams.delete(key);hash.delete(key)}url.hash=hash.toString();history.replaceState(null,'',url.pathname+url.search+url.hash)}};
  }
  function install(options){
    api=options;
    const section=document.createElement('section');section.id='socialMethods';
    section.innerHTML='<h3 id="socialTitle">Continue with your account</h3><div id="socialProviders"></div><p id="socialAvailability" role="status" aria-live="polite"></p><button type="button" class="btn secondary" id="socialRefresh">Check availability again</button><p id="socialHelp"></p>';
    $('accountTabs').before(section);
    for(const provider of providers){const button=document.createElement('button');button.id='social-'+provider.id;button.type='button';button.className='btn secondary';button.onclick=()=>start(provider.id);$('socialProviders').append(button)}
    $('socialRefresh').onclick=refresh;
    const style=document.createElement('style');style.textContent='#socialMethods{padding:8px 0 18px;margin-bottom:16px;border-bottom:1px solid var(--line)}#socialProviders{display:grid;grid-template-columns:1fr 1fr;gap:10px}#socialProviders button{min-height:48px;text-align:center}#socialProviders button:disabled{opacity:.5;cursor:default}#socialHelp,#socialAvailability{font-size:12px;line-height:1.5;color:var(--muted)}@media(max-width:400px){#socialProviders{grid-template-columns:1fr}}';
    document.head.append(style);refresh();
  }
  window.addEventListener('pageshow',()=>{if(api){api.setBusy(false);render()}});
  window.IronSixSocialAuth={install,render,callbackError};
})();
