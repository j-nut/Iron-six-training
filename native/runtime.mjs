export const API_ORIGIN='https://iron-six-training-jordman55-3386s-projects.vercel.app';
export const AUTH_REDIRECT='com.ironsix.training://auth/callback';
const API_PATHS=new Set(['/api/config','/api/coach','/api/equipment-exercises','/api/recalculate','/api/review-workout','/api/auth-status','/api/music']);

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

// Wearables: read-only data the user's watch already collects (never raw motion, never writes).
// Names are @capgo/capacitor-health HealthDataType identifiers; 'workouts' authorizes exercise sessions.
export const HEALTH_READ_TYPES=Object.freeze(['heartRate','restingHeartRate','heartRateVariability','sleep','calories','totalCalories','workouts']);
export const HEALTH_SAMPLE_TYPES=Object.freeze(HEALTH_READ_TYPES.filter(type=>type!=='workouts'));
export const HR_SERVICE='0000180d-0000-1000-8000-00805f9b34fb';
export const HR_MEASUREMENT='00002a37-0000-1000-8000-00805f9b34fb';
const HEALTH_MISSING='This build does not include Health Connect.';
const BLE_MISSING='This build does not include Bluetooth heart-rate support.';
const DAY_MS=86400000,MAX_LOOKBACK_DAYS=400;

function nativeError(error,fallback){
  const text=error&&typeof error.message==='string'&&error.message.trim()?error.message.trim():fallback;
  return new Error(text.slice(0,300));
}

function readTypes(options){
  const read=options?.read;
  if(!Array.isArray(read)||!read.length)throw new Error('Choose at least one health data type to read.');
  if(options.write!==undefined)throw new Error('Iron Six only reads health data; write access is never requested.');
  for(const type of read)if(!HEALTH_READ_TYPES.includes(type))throw new Error(`Health data type "${String(type).slice(0,40)}" is not allowed.`);
  return [...new Set(read)];
}

function isoWindow(options,now=Date.now()){
  const {startDate,endDate}=options||{};
  if(typeof startDate!=='string'||typeof endDate!=='string')throw new Error('Start and end dates must be ISO date strings.');
  const start=Date.parse(startDate),end=Date.parse(endDate);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!/^\d{4}-\d{2}-\d{2}/.test(startDate)||!/^\d{4}-\d{2}-\d{2}/.test(endDate))throw new Error('Start and end dates must be ISO date strings.');
  if(start>=end)throw new Error('Start date must be before end date.');
  if(start<now-MAX_LOOKBACK_DAYS*DAY_MS)throw new Error(`Health data can only be read from the last ${MAX_LOOKBACK_DAYS} days.`);
  if(end>now+DAY_MS)throw new Error('End date cannot be in the future.');
  return {startDate:new Date(start).toISOString(),endDate:new Date(end).toISOString()};
}

function clampLimit(value){
  const number=Math.round(Number(value));
  return Number.isFinite(number)?Math.min(5000,Math.max(1,number)):100;
}

export function createHealthBridge(Health){
  const present=!!Health&&typeof Health.isAvailable==='function';
  async function run(method,options,fallback){
    if(!present||typeof Health[method]!=='function')throw new Error(HEALTH_MISSING);
    try{return await Health[method](options)}catch(error){throw nativeError(error,fallback)}
  }
  return {
    async isAvailable(){
      if(!present)return {available:false,platform:'android',reason:HEALTH_MISSING};
      try{
        const result=await Health.isAvailable();
        return {available:result?.available===true,platform:result?.platform||'android',reason:typeof result?.reason==='string'?result.reason:undefined};
      }catch(error){return {available:false,platform:'android',reason:nativeError(error,'Health Connect is unavailable on this device.').message}}
    },
    async requestAuthorization(options){return run('requestAuthorization',{read:readTypes(options)},'Health permission request failed.')},
    async checkAuthorization(options){return run('checkAuthorization',{read:readTypes(options)},'Could not check health permissions.')},
    async readSamples(options={}){
      if(!HEALTH_SAMPLE_TYPES.includes(options.dataType))throw new Error(`Health data type "${String(options.dataType).slice(0,40)}" is not allowed.`);
      const query={dataType:options.dataType,...isoWindow(options),limit:clampLimit(options.limit),ascending:options.ascending===true};
      const result=await run('readSamples',query,'Could not read health data.');
      return {samples:Array.isArray(result?.samples)?result.samples:[]};
    },
    async queryWorkouts(options={}){
      const query={...isoWindow(options),limit:clampLimit(options.limit),ascending:options.ascending===true};
      const result=await run('queryWorkouts',query,'Could not read workouts.');
      return {workouts:Array.isArray(result?.workouts)?result.workouts:[]};
    },
    async openSettings(){await run('openHealthConnectSettings',undefined,'Could not open Health Connect settings.')},
    async showPrivacyPolicy(){await run('showPrivacyPolicy',undefined,'Could not show the privacy policy.')}
  };
}

export function createHeartRateBle(BleClient){
  const present=!!BleClient&&['initialize','requestDevice','connect','startNotifications','stopNotifications','disconnect'].every(name=>typeof BleClient[name]==='function');
  let active=null;
  async function close(connection){
    connection.closing=true;
    try{await BleClient.stopNotifications(connection.deviceId,HR_SERVICE,HR_MEASUREMENT)}catch(_){}
    try{await BleClient.disconnect(connection.deviceId)}catch(_){}
  }
  const api={
    // No permission prompt here: initialize() is deferred until the user asks to connect.
    async isAvailable(){return present},
    async connect({onReading,onDisconnect}={}){
      if(!present)throw new Error(BLE_MISSING);
      if(typeof onReading!=='function')throw new Error('A heart-rate reading callback is required.');
      await api.disconnect();
      let connection=null;
      try{
        await BleClient.initialize({androidNeverForLocation:true});
        const device=await BleClient.requestDevice({services:[HR_SERVICE],optionalServices:[]});
        if(!device||typeof device.deviceId!=='string')throw new Error('No heart-rate sensor was selected.');
        connection={deviceId:device.deviceId,deviceName:typeof device.name==='string'?device.name.slice(0,80):'',closing:false};
        const info={deviceId:connection.deviceId,deviceName:connection.deviceName};
        await BleClient.connect(connection.deviceId,()=>{
          if(active===connection)active=null;
          if(connection.closing)return;
          connection.closing=true;
          try{onDisconnect?.(info)}catch(_){}
        });
        active=connection;
        await BleClient.startNotifications(connection.deviceId,HR_SERVICE,HR_MEASUREMENT,dataView=>{
          if(active!==connection||!dataView?.buffer)return;
          try{onReading(Array.from(new Uint8Array(dataView.buffer,dataView.byteOffset,dataView.byteLength)),info)}catch(_){}
        });
        return info;
      }catch(error){
        if(connection){if(active===connection)active=null;await close(connection)}
        throw nativeError(error,'Could not connect to the heart-rate sensor.');
      }
    },
    async disconnect(){
      const connection=active;active=null;
      if(connection&&present)await close(connection);
    }
  };
  return api;
}

export function installNative({win,App,Browser,createClient,WorkoutBackup,VoiceCommand=null,Health=null,BleClient=null}){
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
    if(!isActive){win.IronSixPoseSpike?.close?.();win.IronSixCircuit?.pause('Paused while the app is in the background');win.saveData?.();client?.auth.stopAutoRefresh();}
    else {client?.auth.startAutoRefresh();void win.IronSixCloud?.syncNow(false);win.dispatchEvent(new win.Event('pageshow'));}
  });
  App.addListener('backButton',()=>{
    if(win.document.getElementById('poseSheet')?.classList.contains('show')){win.IronSixPoseSpike?.close?.();return}
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
    async listenVoice(options={}){
      if(!VoiceCommand?.listen)throw new Error('Native voice recognition is unavailable in this build.');
      return VoiceCommand.listen({language:String(options.language||'en-US').slice(0,32)});
    },
    async stopVoice(){if(VoiceCommand?.stop)await VoiceCommand.stop();},
    health:createHealthBridge(Health),
    heartRateBle:createHeartRateBle(BleClient),
    async connectCloud(value,message){
      client=value;notify=message;await ready;
      const launch=await App.getLaunchUrl();
      if(pendingUrl){const url=pendingUrl;pendingUrl=null;await onUrl(url)}
      if(launch?.url)await onUrl(launch.url);
    }
  };
  win.IronSixNative=api;return api;
}
