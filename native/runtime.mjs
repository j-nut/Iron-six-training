export const API_ORIGIN='https://iron-six-training-jordman55-3386s-projects.vercel.app';
export const AUTH_REDIRECT='com.ironsix.training://auth/callback';
const API_PATHS=new Set(['/api/config','/api/coach','/api/equipment-exercises','/api/recalculate','/api/review-workout','/api/auth-status']);

export function apiUrl(value,localOrigin){
  const url=new URL(value,localOrigin);
  return url.origin===localOrigin&&API_PATHS.has(url.pathname)?API_ORIGIN+url.pathname+url.search:value;
}

function exactCallback(url){return url.protocol==='com.ironsix.training:'&&url.hostname==='auth'&&url.pathname==='/callback'}

export function bridgeCallback(value){
  try{
    const url=new URL(value);if(!exactCallback(url))return null;
    const hash=new URLSearchParams(url.hash.slice(1));
    const token=hash.get('nomad_access_token');
    if(token&&token.length>=80&&token.length<=10000)return {token};
    const error=url.searchParams.get('bridge_error');if(error)return {error:true};
    return null;
  }catch(_){return null}
}

export function authCode(value){
  try{
    const url=new URL(value);
    if(!exactCallback(url)||url.hash)return null;
    if(url.searchParams.has('error'))return {error:true};
    const code=url.searchParams.get('code');
    return code&&code.length<=2048?{code,flowId:url.searchParams.get('sb_flow_id')||undefined}:null;
  }catch(_){return null}
}

function installSafeArea(win){
  win.document.documentElement.classList.add('iron-six-native');
  if(win.document.getElementById('ironSixNativeInsets'))return;
  const style=win.document.createElement('style');style.id='ironSixNativeInsets';
  style.textContent='.iron-six-native body{min-height:100dvh}.iron-six-native .app{padding-top:max(16px,calc(env(safe-area-inset-top,0px) + 10px));padding-bottom:calc(100px + env(safe-area-inset-bottom,0px))}.iron-six-native .modal-backdrop{padding-top:max(14px,calc(env(safe-area-inset-top,0px) + 8px));padding-bottom:max(14px,calc(env(safe-area-inset-bottom,0px) + 8px))}.iron-six-native .toast{bottom:calc(88px + env(safe-area-inset-bottom,0px))}';
  win.document.head.append(style);
}

function validBackup(json){
  if(typeof json!=='string'||json.length<20||json.length>10000000)return false;
  try{const value=JSON.parse(json);return !!value&&typeof value==='object'&&Array.isArray(value.entries)&&value.profiles&&typeof value.profiles==='object'&&typeof value.exportedAt==='string'}catch(_){return false}
}

export function installNative({win,App,Browser,createClient,WorkoutBackup}){
  let client=null,pendingUrl=null,notify=()=>{},lastCode=null,inFlightCode=null;
  let callbacks=Promise.resolve();
  installSafeArea(win);
  const originalFetch=win.fetch.bind(win);
  win.fetch=(input,options)=>{
    if(typeof input==='string'||input instanceof URL)return originalFetch(apiUrl(String(input),win.location.origin),options);
    const mapped=apiUrl(input.url,win.location.origin);
    return originalFetch(mapped===input.url?input:new Request(mapped,input),options);
  };
  function onUrl(url){
    const bridge=bridgeCallback(url),parsed=authCode(url);
    if(!bridge&&!parsed)return Promise.resolve();
    if(!client){pendingUrl=url;return Promise.resolve()}
    callbacks=callbacks.then(async()=>{
      if(bridge){
        if(bridge.error)notify('Google sign-in was cancelled. Your saved workout is unchanged.');
        else win.dispatchEvent(new win.CustomEvent('ironsix:google-bridge',{detail:{token:bridge.token}}));
        try{await Browser.close()}catch(_){}
        win.dispatchEvent(new win.Event('pageshow'));return;
      }
      if(parsed.code&&(lastCode===parsed.code||inFlightCode===parsed.code))return;
      if(parsed.error){notify('Sign-in was cancelled or declined. Your saved workout is unchanged.');return}
      inFlightCode=parsed.code;
      try{
        const result=await client.auth.exchangeCodeForSession(parsed.code,parsed.flowId?{flowId:parsed.flowId}:undefined);
        if(result.error)throw result.error;
        lastCode=parsed.code;
        notify('Sign-in complete. Syncing your account…');
      }catch(_){
        lastCode=null;
        notify('This sign-in callback did not complete. You can retry sign-in without losing your workout.');
      } finally {
        inFlightCode=null;
        try{await Browser.close()}catch(_){}
        win.dispatchEvent(new win.Event('pageshow'));
      }
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
    const imageDialog=win.document.querySelector('dialog[data-exercise-image][open]');
    if(imageDialog){imageDialog.close();return}
    const modal=win.document.querySelector('.modal-backdrop.show');
    if(modal){modal.querySelector('button[id*="Close"],button[id^="cancel"],button[id^="close"]')?.click();return}
    if(!win.document.getElementById('today')?.classList.contains('active')){win.showView?.('today');return}
    win.saveData?.();void App.minimizeApp();
  });
  win.document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link)return;
    const url=new URL(link.href,win.location.href);
    if(url.origin===win.location.origin&&/^\/assets\/exercises\/[a-z0-9-]+\.png$/.test(url.pathname)){
      event.preventDefault();
      const dialog=win.document.createElement('dialog'),image=win.document.createElement('img'),close=win.document.createElement('button');
      dialog.dataset.exerciseImage='true';dialog.setAttribute('aria-label','Exercise illustration');
      dialog.style.cssText='max-width:94vw;max-height:90vh;border:0;border-radius:16px;padding:12px;background:#fff;color:#111';
      image.src=url.href;image.alt=link.querySelector('img')?.alt||'Exercise position';image.style.cssText='display:block;max-width:86vw;max-height:72vh;object-fit:contain';
      close.type='button';close.textContent='Close image';close.className='btn';close.style.cssText='display:block;margin:10px auto 0;background:#0b0c0f;color:#fff';close.onclick=()=>dialog.close();
      dialog.append(image,close);dialog.addEventListener('close',()=>dialog.remove());win.document.body.append(dialog);dialog.showModal();return;
    }
    if(url.protocol==='https:'&&url.origin!==win.location.origin){event.preventDefault();void Browser.open({url:url.href}).catch(()=>notify('Could not open the browser. Try again.'));}
  });
  const api={
    redirectTo:AUTH_REDIRECT,supabase:{createClient},
    exportBackup:json=>validBackup(json)?WorkoutBackup.save({json}):Promise.reject(new Error('Backup payload is empty or invalid. Your workout remains saved on this device.')),
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
