const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('native API routing stays on the approved backend and preserves non-API requests',async()=>{
  const {apiUrl,API_ORIGIN,authCode}=await import('../native/runtime.mjs');
  assert.equal(apiUrl('/api/coach','https://localhost'),API_ORIGIN+'/api/coach');
  assert.equal(apiUrl('/api/config?test=1','https://localhost'),API_ORIGIN+'/api/config?test=1');
  assert.equal(apiUrl('/assets/exercises/push-ups-1.png','https://localhost'),'/assets/exercises/push-ups-1.png');
  assert.equal(apiUrl('https://other.test/api/coach','https://localhost'),'https://other.test/api/coach');
  assert.equal(authCode('https://evil.test/?code=hello'),null);
  assert.equal(authCode('com.ironsix.training://wrong/callback?code=hello'),null);
  assert.equal(authCode('com.ironsix.training://auth/callback#access_token=secret'),null);
  assert.deepEqual(authCode('com.ironsix.training://auth/callback?code=hello'),{code:'hello',flowId:undefined});
});

test('native callbacks handle cold launch, duplicates, cancellation and background saves',async()=>{
  const {installNative,AUTH_REDIRECT}=await import('../native/runtime.mjs');
  const dom=new JSDOM('<div id="today" class="active"></div><div class="modal-backdrop show"><button id="closeExerciseSwap">Cancel</button></div>',{url:'https://localhost'});
  const win=dom.window,events={},calls=[],messages=[];
  win.fetch=async(input,options)=>{calls.push(['fetch',input,options]);return {ok:true}};
  win.IronSixCircuit={pause:()=>calls.push(['pause'])};win.saveData=()=>calls.push(['save']);
  win.IronSixCloud={syncNow:()=>calls.push(['sync'])};
  const App={addListener:async(name,fn)=>{events[name]=fn},getLaunchUrl:async()=>({url:AUTH_REDIRECT+'?code=valid-code'}),minimizeApp:async()=>calls.push(['minimize'])};
  const Browser={open:async({url})=>calls.push(['open',url]),close:async()=>calls.push(['close'])};
  const client={auth:{exchangeCodeForSession:async code=>{calls.push(['exchange',code]);return {data:{session:{}}}},stopAutoRefresh:()=>calls.push(['stop']),startAutoRefresh:()=>calls.push(['start'])}};
  const native=installNative({win,App,Browser,createClient:()=>client,WorkoutBackup:{save:async({json})=>{calls.push(['export',json]);return {saved:true}}}});
  assert.equal(native.authOptions.flowType,'pkce');assert.equal(native.authOptions.detectSessionInUrl,false);
  await native.connectCloud(client,message=>messages.push(message));
  events.appUrlOpen({url:AUTH_REDIRECT+'?code=valid-code'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(c=>c[0]==='exchange').length,1);
  events.appUrlOpen({url:AUTH_REDIRECT+'?error=access_denied&error_description=%3Cscript%3E'});
  await new Promise(resolve=>setImmediate(resolve));
  assert(messages.at(-1).includes('cancelled'));assert(!messages.at(-1).includes('script'));
  events.appStateChange({isActive:false});events.appStateChange({isActive:true});
  for(const action of ['pause','save','stop','start','sync'])assert(calls.some(c=>c[0]===action));
  await win.fetch('/api/coach',{method:'POST',body:'test'});assert(calls.at(-1)[1].startsWith('https://iron-six-training-'));assert.equal(calls.at(-1)[2].body,'test');
  await native.exportBackup('{"test":true}');assert.equal(calls.at(-1)[0],'export');
  let closed=false;win.document.getElementById('closeExerciseSwap').onclick=()=>{closed=true};events.backButton();assert(closed);
  await assert.rejects(native.openOAuth('javascript:alert(1)'));
  dom.window.close();
});

test('Android configuration uses local assets, exact callbacks and limited permissions',()=>{
  require('node:child_process').execFileSync(process.execPath,['scripts/build-android-web.mjs'],{stdio:'pipe'});
  const config=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));
  assert.equal(config.appId,'com.ironsix.training');assert.equal(config.webDir,'www');assert(!config.server.url);
  const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
  assert(manifest.includes('android:usesCleartextTraffic="false"'));assert(manifest.includes('android:host="auth" android:path="/callback"'));
  assert(!manifest.includes('READ_EXTERNAL_STORAGE'));assert(!manifest.includes('WRITE_EXTERNAL_STORAGE'));
  const source=fs.readFileSync('scripts/build-android-web.mjs','utf8');assert(!source.includes("cp(resolve(root,'api')"));
  const index=fs.readFileSync('www/index.html','utf8');assert(index.indexOf('native.js')<index.indexOf('core.js'));
  assert(fs.statSync('www/native.js').size>1000);
  for(const match of index.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g))assert(fs.existsSync('www/'+match[1]),match[1]);
  assert(!fs.existsSync('www/api'));assert(!fs.existsSync('www/.env'));
  for(const record of require('../exercise-media-catalog.js').records)for(const path of record.frames)assert(fs.existsSync('www/'+path),path);
});
