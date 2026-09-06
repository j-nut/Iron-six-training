export const API_ORIGIN='https://iron-six-training-jordman55-3386s-projects.vercel.app';
export const AUTH_REDIRECT='com.ironsix.training://auth/callback';
const API_PATHS=new Set(['/api/config','/api/coach','/api/equipment-exercises','/api/recalculate','/api/review-workout']);

export function apiUrl(value,localOrigin){
  const url=new URL(value,localOrigin);
  return url.origin===localOrigin&&API_PATHS.has(url.pathname)?API_ORIGIN+url.pathname+url.search:value;
}

export function authCode(value){
  try{
    const url=new URL(value);
    if(url.protocol!=='com.ironsix.training:'||url.hostname!=='auth'||url.pathname!=='/callback'||url.hash)return null;
    if(url.searchParams.has('error'))return {error:true};
    const code=url.searchParams.get('code');
    return code&&code.length<=2048?{code,flowId:url.searchParams.get('sb_flow_id')||undefined}:null;
  }catch(_){return null}
}

export function installNative({win,App,Browser,createClient,WorkoutBackup}){
  let client=null,pendingUrl=null,notify=()=>{},lastCode=null;
  let callbacks=Promise.resolve();
  const originalFetch=win.fetch.bind(win);
  win.fetch=(input,options)=>{
    if(typeof input==='string'||input instanceof URL)return originalFetch(apiUrl(String(input),win.location.origin),options);
    const mapped=apiUrl(input.url,win.location.origin);
    return originalFetch(mapped===input.url?input:new Request(mapped,input),options);
  };
  function onUrl(url){
    const parsed=authCode(url);if(!parsed)return Promise.resolve();
    if(!client){pendingUrl=url;return Promise.resolve()}
    callbacks=callbacks.then(async()=>{
      if(parsed.code&&lastCode===parsed.code)return;
      if(parsed.error){notify('Sign-in was cancelled or declined. Your saved workout is unchanged.');return}
      lastCode=parsed.code;
      try{
        const result=await client.auth.exchangeCodeForSession(parsed.code,parsed.flowId?{flowId:parsed.flowId}:undefined);
        if(result.error)throw result.error;
        notify('Sign-in complete. Syncing your account…');
      }catch(_){notify('This sign-in link could not be completed. Start sign-in again on this device. Your workout is still saved.');}
      finally{try{await Browser.close()}catch(_){}win.dispatchEvent(new win.Event('pageshow'))}
    });
    return callbacks;
  }
  const ready=App.addListener('appUrlOpen',({url})=>{void onUrl(url)});
  App.addListener('appStateChange',({isActive})=>{
    if(!isActive){win.IronSixCircuit?.pause('Paused while the app is in the background');win.saveData?.();client?.auth.stopAutoRefresh();}
    else {client?.auth.startAutoRefresh();void win.IronSixCloud?.syncNow(false);win.dispatchEvent(new win.Event('pageshow'));}
  });
  App.addListener('backButton',()=>{
    win.IronSixCircuit?.pause('Paused');
    const modal=win.document.querySelector('.modal-backdrop.show');
    if(modal){modal.querySelector('button[id*="Close"],button[id^="cancel"],button[id^="close"]')?.click();return}
    if(!win.document.getElementById('today')?.classList.contains('active')){win.showView?.('today');return}
    win.saveData?.();void App.minimizeApp();
  });
  win.document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link)return;
    const url=new URL(link.href,win.location.href);
    if(url.protocol==='https:'&&url.origin!==win.location.origin){event.preventDefault();void Browser.open({url:url.href}).catch(()=>notify('Could not open the browser. Try again.'));}
  });
  const api={
    redirectTo:AUTH_REDIRECT,supabase:{createClient},
    exportBackup:json=>WorkoutBackup.save({json}),
    authOptions:{flowType:'pkce',detectSessionInUrl:false},
    async openOAuth(url){if(new URL(url).protocol!=='https:')throw Error('Invalid sign-in URL');await Browser.open({url})},
    async connectCloud(value,message){
      client=value;notify=message;await ready;
      const launch=await App.getLaunchUrl();
      if(pendingUrl){const url=pendingUrl;pendingUrl=null;await onUrl(url)}
      if(launch?.url)await onUrl(launch.url);
    }
  };
  win.IronSixNative=api;return api;
}
