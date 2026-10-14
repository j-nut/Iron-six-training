// In-app updates: the server only ever points at this repository's signed release downloads, the
// app only offers an update that is genuinely newer, and the banner never interrupts setup or a
// modal flow. The Java side is compiled by CI; its wiring is asserted here.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const SHA='a'.repeat(64),SHA2='b'.repeat(64);
const DL='https://github.com/j-nut/Iron-six-training/releases/download/';
const release=(build,{tag='android-build-'+build,apkUrl=DL+tag+'/iron-six.apk',sums=true,apk=true,draft=false}={})=>({
  tag_name:tag,draft,prerelease:false,published_at:'2026-10-14T01:43:45Z',
  assets:[...(apk?[{name:'iron-six.apk',state:'uploaded',browser_download_url:apkUrl}]:[]),{name:'iron-six.aab',state:'uploaded',browser_download_url:DL+tag+'/iron-six.aab'},...(sums?[{name:'SHA256SUMS.txt',state:'uploaded',browser_download_url:DL+tag+'/SHA256SUMS.txt'}]:[])]
});

async function callApi({releases,sums=`${SHA}  iron-six.apk\n${SHA2}  iron-six.aab\n`,listingOk=true,sumsOk=true,env={},method='GET',throwOn=null}={}){
  const requests=[];let status,body;const headers={};
  const context={process:{env},AbortSignal:{timeout:()=>undefined},fetch:async(url,init)=>{
    requests.push({url,init});
    if(throwOn&&url.includes(throwOn))throw new Error('ECONNRESET internal-upstream-detail');
    if(url.startsWith('https://api.github.com/'))return {ok:listingOk,status:listingOk?200:403,json:async()=>listingOk?releases:{message:'API rate limit exceeded for 1.2.3.4'}};
    return {ok:sumsOk,status:sumsOk?200:404,text:async()=>sums};
  }};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('api/app-version.js','utf8').replace('export default async function handler','async function handler').replace(/export function /g,'function '),context);
  await context.handler({method},{setHeader(k,v){headers[k.toLowerCase()]=v},status(code){status=code;return this},json(x){body=x;return this}});
  return {status,body,headers,requests};
}

test('app-version picks the highest signed build and parses its checksum',async()=>{
  const {status,body,headers,requests}=await callApi({releases:[release(1019),release(1021),release(1020),release(1030,{tag:'v1.3.0'}),release(1031,{tag:'android-build-x'})],env:{MIN_ANDROID_BUILD:'1020'}});
  assert.equal(status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)),{android:{build:1021,tag:'android-build-1021',apkUrl:DL+'android-build-1021/iron-six.apk',sha256:SHA,publishedAt:'2026-10-14T01:43:45Z'},minimumAndroidBuild:1020});
  assert.match(headers['cache-control'],/s-maxage=300/);assert.match(headers['cache-control'],/stale-while-revalidate=3600/);
  assert.equal(requests[1].url,DL+'android-build-1021/SHA256SUMS.txt','the checksum comes from the same release');
  assert.equal(requests[0].init.headers.Authorization,undefined,'unauthenticated without GITHUB_TOKEN');
});

test('app-version skips drafts, releases without an APK or checksum file, and non-allowlisted URLs',async()=>{
  const {body}=await callApi({releases:[
    release(1040,{draft:true}),release(1039,{apk:false}),release(1038,{sums:false}),
    release(1037,{apkUrl:'https://evil.example/iron-six.apk'}),
    release(1036,{apkUrl:DL+'android-build-1035/iron-six.apk'}),
    release(1035,{apkUrl:'https://github.com/someone-else/Iron-six-training/releases/download/android-build-1035/iron-six.apk'}),
    release(1022)
  ],env:{GITHUB_TOKEN:'t'}});
  assert.equal(body.android.build,1022);assert.equal(body.minimumAndroidBuild,null);
  assert(body.android.apkUrl.startsWith(DL));
});

test('app-version sends the token when configured and fails closed without leaking upstream detail',async()=>{
  const ok=await callApi({releases:[release(1021)],env:{GITHUB_TOKEN:'secret-token'}});
  assert.equal(ok.requests[0].init.headers.Authorization,'Bearer secret-token');
  assert(!JSON.stringify(ok.body).includes('secret-token'));
  for(const options of [{listingOk:false,releases:[]},{releases:[release(1021)],sumsOk:false},{releases:[release(1021)],sums:`${SHA2}  iron-six.aab\n`},{releases:[release(1021)],throwOn:'api.github.com'},{releases:[]},{releases:[release(1021)],sums:'x'.repeat(5000)}]){
    const {status,body,headers}=await callApi(options);
    assert.equal(status,502);assert.equal(headers['cache-control'],'no-store');
    const text=JSON.stringify(body);
    assert(!/rate limit|ECONNRESET|internal-upstream|1\.2\.3\.4/.test(text),'no upstream detail');
    assert.equal(body.android,undefined);
  }
  const post=await callApi({method:'POST',releases:[]});assert.equal(post.status,405);
});

test('the native runtime routes /api/app-version and guards update downloads',async()=>{
  const {apiUrl,API_ORIGIN,installNative,updateUrlAllowed}=await import('../native/runtime.mjs');
  assert.equal(apiUrl('/api/app-version','https://localhost'),API_ORIGIN+'/api/app-version');
  assert(updateUrlAllowed(DL+'android-build-1021/iron-six.apk',1021));
  assert(!updateUrlAllowed(DL+'android-build-1021/iron-six.apk',1022));
  assert(!updateUrlAllowed('https://evil.example/android-build-1021/iron-six.apk',1021));
  const dom=new JSDOM('<div id="today" class="active"></div>',{url:'https://localhost'});
  const win=dom.window;win.fetch=async()=>({ok:true});
  const calls=[];
  const App={addListener:async()=>{},getLaunchUrl:async()=>null,minimizeApp:async()=>{},getInfo:async()=>({build:'1021',version:'1.3.0'})};
  const Browser={open:async({url})=>calls.push(['open',url]),close:async()=>{}};
  const AppUpdate={download:async args=>{calls.push(['download',args]);return {build:args.build}},install:async args=>{calls.push(['install',args]);return {launched:true}},addListener:async(name,fn)=>{calls.push(['listen',name]);fn({received:1,total:2});return {remove:async()=>{}}}};
  const native=installNative({win,App,Browser,createClient:()=>({}),WorkoutBackup:{save:async()=>({})},AppUpdate});
  assert.deepEqual(await native.appInfo(),{build:1021,version:'1.3.0'});
  assert.equal(native.canInstallUpdates(),true);
  await assert.rejects(native.downloadUpdate({url:'https://evil.example/x.apk',sha256:SHA,build:1022}),/not an Iron Six release/);
  await assert.rejects(native.downloadUpdate({url:DL+'android-build-1022/iron-six.apk',sha256:'nothex',build:1022}),/not an Iron Six release/);
  await native.downloadUpdate({url:DL+'android-build-1022/iron-six.apk',sha256:SHA.toUpperCase(),build:1022});
  assert.deepEqual(calls.at(-1),['download',{url:DL+'android-build-1022/iron-six.apk',sha256:SHA,build:1022}]);
  await native.installUpdate({build:1022});assert.deepEqual(calls.at(-1),['install',{build:1022}]);
  let seen=null;await native.onUpdateProgress(e=>{seen=e});assert.deepEqual(seen,{received:1,total:2});
  await assert.rejects(native.openUpdateDownload('https://evil.example/iron-six.apk'));
  await native.openUpdateDownload(DL+'android-build-1022/iron-six.apk');assert.equal(calls.at(-1)[0],'open');
  const bareWin=new JSDOM('',{url:'https://localhost'}).window;bareWin.fetch=async()=>({ok:true});
  const bare=installNative({win:bareWin,App,Browser,createClient:()=>({}),WorkoutBackup:{save:async()=>({})}});
  assert.equal(bare.canInstallUpdates(),false);
  await assert.rejects(bare.downloadUpdate({url:DL+'android-build-1022/iron-six.apk',sha256:SHA,build:1022}),e=>e.code==='UNIMPLEMENTED');
  dom.window.close();bareWin.close();
});

const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
function client({installed=1021,latest=1025,minimum=null,apkUrl=null,plugin=true,android=true,releases=null,onboarding=false}={}){
  const dom=new JSDOM('<!doctype html><html><head></head><body><div class="modal-backdrop" id="modal"></div><div id="toast"></div></body></html>',{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext();
  const log={fetch:[],toasts:[],calls:[]};
  let clock=Date.parse('2026-10-13T12:00:00Z');
  w.Date.now=()=>clock;
  let release=latest,webIndex=0;
  w.fetch=async url=>{
    log.fetch.push(url);
    if(url==='/api/app-version')return {ok:true,json:async()=>({android:{build:release,tag:'android-build-'+release,apkUrl:apkUrl||DL+'android-build-'+release+'/iron-six.apk',sha256:SHA,publishedAt:null},minimumAndroidBuild:minimum})};
    if(url==='/release.json'){const files=releases[Math.min(webIndex++,releases.length-1)];return {ok:true,json:async()=>({files})}}
    return {ok:false};
  };
  w.toast=message=>log.toasts.push(message);
  w.saveData=()=>log.calls.push('save');
  w.IronSixJournal={flush:async()=>log.calls.push('flush')};
  w.IronSixOnboarding={isOpen:()=>onboarding};
  if(android){
    w.IronSixNative={
      appInfo:async()=>({build:installed,version:'1.3.0'}),
      canInstallUpdates:()=>plugin,
      downloadUpdate:async args=>{log.calls.push(['download',args]);if(w.__downloadError)throw w.__downloadError;return {build:args.build}},
      installUpdate:async args=>{log.calls.push(['install',args]);return w.__installResult||{launched:true}},
      onUpdateProgress:async fn=>{fn({received:50,total:100});return {remove:async()=>{}}},
      openUpdateDownload:async url=>log.calls.push(['browser',url])
    };
  }
  vm.runInContext(fs.readFileSync('app-update.js','utf8'),context,{filename:'app-update.js'});
  const $=id=>w.document.getElementById(id);
  return {w,log,$,
    api:()=>w.IronSixAppUpdate,
    advance:ms=>{clock+=ms},
    setLatest:b=>{release=b},
    setOnboarding:v=>{onboarding=v},
    shown:()=>!!$('appUpdateBanner')&&!$('appUpdateBanner').hidden,
    title:()=>$('appUpdateTitle')?.textContent||'',
    message:()=>$('appUpdateMessage')?.textContent||'',
    close:()=>dom.window.close()};
}

test('a newer build shows a non-blocking banner; the same build shows nothing',async()=>{
  const a=client({installed:1021,latest:1025});
  try{
    await settle();
    assert(a.shown());assert.equal(a.title(),'Update available — build 1025');
    assert.equal(a.$('appUpdateBanner').getAttribute('role'),'status');
    assert.equal(a.$('appUpdateLater').hidden,false);
  }finally{a.close()}
  const b=client({installed:1025,latest:1025});
  try{await settle();assert(!b.shown())}finally{b.close()}
});

test('Later snoozes for 24 hours and checks are throttled to every 6 hours',async()=>{
  const a=client({installed:1021,latest:1025});
  try{
    await settle();
    assert.equal(a.log.fetch.filter(u=>u==='/api/app-version').length,1);
    a.$('appUpdateLater').click();assert(!a.shown());
    a.advance(2*3600e3);await a.api().check();
    assert.equal(a.log.fetch.filter(u=>u==='/api/app-version').length,1,'resume within 6 h does not refetch');
    assert(!a.shown(),'still snoozed');
    a.advance(5*3600e3);await a.api().check();
    assert.equal(a.log.fetch.filter(u=>u==='/api/app-version').length,2,'after 6 h it checks again');
    assert(!a.shown(),'snooze lasts 24 h');
    a.advance(18*3600e3);await a.api().check();
    assert(a.shown(),'the banner returns after the snooze');
    a.$('appUpdateLater').click();a.setLatest(1026);a.advance(7*3600e3);await a.api().check();
    assert(a.shown(),'a newer build is not covered by the old snooze');
  }finally{a.close()}
});

test('below the minimum build the banner is persistent and cannot be snoozed',async()=>{
  const a=client({installed:1020,latest:1025,minimum:1022});
  try{
    await settle();
    assert(a.shown());assert.match(a.title(),/no longer supported — update to keep syncing/);
    assert.equal(a.$('appUpdateLater').hidden,true);
    assert(a.$('appUpdateBanner').classList.contains('urgent'));
    assert(!a.w.document.querySelector('.modal-backdrop.show'),'it never opens a blocking modal');
  }finally{a.close()}
});

test('Check for updates bypasses the throttle and reports up to date',async()=>{
  const a=client({installed:1025,latest:1025});
  try{
    await settle();
    await a.api().checkNow();
    assert.equal(a.log.fetch.filter(u=>u==='/api/app-version').length,2);
    assert.equal(a.log.toasts.at(-1),"You're up to date");
    assert.equal(a.api().label(),'Build 1025');
    a.setLatest(1027);await a.api().checkNow();assert(a.shown());assert.match(a.title(),/build 1027/);
  }finally{a.close()}
});

test('Update saves first, downloads with progress, then installs; permission and checksum failures explain themselves',async()=>{
  const a=client({installed:1021,latest:1025});
  try{
    await settle();
    a.w.__installResult={needsPermission:true};
    await a.api().update();
    const download=a.log.calls.findIndex(c=>c[0]==='download'),install=a.log.calls.findIndex(c=>c[0]==='install');
    assert(a.log.calls.indexOf('save')>-1&&a.log.calls.indexOf('save')<download,'saves before downloading');
    assert(a.log.calls.lastIndexOf('flush')<install&&a.log.calls.lastIndexOf('flush')>download,'flushes the journal before the installer opens');
    assert.deepEqual(JSON.parse(JSON.stringify(a.log.calls[download][1])),{url:DL+'android-build-1025/iron-six.apk',sha256:SHA,build:1025});
    assert.match(a.message(),/Allow installs from Iron Six, then tap Update again/);
    assert(a.shown());assert.equal(a.$('appUpdateGo').disabled,false);
    a.w.__downloadError=Object.assign(new Error('x'),{code:'CHECKSUM'});
    await a.api().update();assert.match(a.message(),/didn't match the published release/);
  }finally{a.close()}
});

test('without the native plugin the APK opens in the browser instead',async()=>{
  const a=client({installed:1021,latest:1025,plugin:false});
  try{
    await settle();
    await a.api().update();
    assert.deepEqual(a.log.calls.find(c=>c[0]==='browser'),['browser',DL+'android-build-1025/iron-six.apk']);
    assert(!a.log.calls.some(c=>c[0]==='download'));
    assert.match(a.message(),/Open the downloaded file to install it/);
  }finally{a.close()}
});

test('an update URL outside the release allowlist is ignored',async()=>{
  const a=client({installed:1021,latest:1025,apkUrl:'https://evil.example/android-build-1025/iron-six.apk'});
  try{await settle();assert(!a.shown())}finally{a.close()}
});

test('the banner waits for onboarding and open modals to close',async()=>{
  const a=client({installed:1021,latest:1025,onboarding:true});
  try{
    await settle();assert(!a.shown(),'never over the setup wizard');
    a.setOnboarding(false);a.$('modal').classList.add('show');a.api().render();
    assert(!a.shown(),'never over a modal flow');
    a.$('modal').classList.remove('show');a.api().render();
    assert(a.shown(),'shown once the flow is done');
  }finally{a.close()}
});

test('web: a changed release.json offers Reload and never reloads by itself',async()=>{
  const a=client({android:false,releases:[{'core.js':'1'},{'core.js':'1'},{'core.js':'2'}]});
  try{
    await settle();assert(!a.shown());assert.equal(a.api().label(),'Web app');
    await a.api().check();assert(!a.shown(),'unchanged files, no banner');
    await a.api().check();assert(a.shown());assert.equal(a.title(),'A new version of Iron Six is ready');
    assert.equal(a.$('appUpdateGo').textContent,'Reload');
    assert(a.log.fetch.every(u=>u==='/release.json'),'the web never calls the Android version API');
    a.$('appUpdateLater').click();assert(!a.shown());
  }finally{a.close()}
});

test('Android wiring: permission, provider, cache path, plugin registration and packaging',()=>{
  const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
  assert(manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES'));
  const provider=manifest.match(/<provider[\s\S]*?<\/provider>/)[0];
  assert(provider.includes('android:exported="false"'),'the FileProvider stays private');
  assert(provider.includes('android:grantUriPermissions="true"'));
  const paths=fs.readFileSync('android/app/src/main/res/xml/file_paths.xml','utf8');
  assert(paths.includes('<cache-path name="updates" path="updates/" />'));
  const main=fs.readFileSync('android/app/src/main/java/com/ironsix/training/MainActivity.java','utf8');
  assert(main.includes('registerPlugin(AppUpdatePlugin.class)'));
  assert(main.indexOf('registerPlugin(AppUpdatePlugin.class)')<main.indexOf('super.onCreate'),'plugins register before the bridge starts');
  const plugin=fs.readFileSync('android/app/src/main/java/com/ironsix/training/AppUpdatePlugin.java','utf8');
  assert(plugin.includes('@CapacitorPlugin(name = "AppUpdate")'));
  assert(plugin.includes('"https://github.com/j-nut/Iron-six-training/releases/download/android-build-"'));
  assert(plugin.includes('canRequestPackageInstalls()')&&plugin.includes('Build.VERSION_CODES.O'));
  assert(plugin.includes('FLAG_GRANT_READ_URI_PERMISSION')&&plugin.includes('"SHA-256"'));
  const entry=fs.readFileSync('native/entry.mjs','utf8');assert(entry.includes("registerPlugin('AppUpdate')"));
  const native=fs.readFileSync('native/runtime.mjs','utf8');assert(native.includes("'/api/app-version'"));
  for(const page of ['index.html','live.html'])assert(fs.readFileSync(page,'utf8').includes('app-update.js?v=1'),`${page} loads app-update.js`);
  // Both builders package every <script src> in index.html, so app-update.js ships on web and Android.
  for(const builder of ['scripts/build-web.mjs','scripts/build-android-web.mjs'])assert(fs.readFileSync(builder,'utf8').includes('<script src="([^"?]+)'),`${builder} packages index.html scripts`);
  const html=fs.readFileSync('index.html','utf8');
  assert([...html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]).includes('app-update.js'));
  // The builder is exercised by tests/android.test.js; running it here too raced that test for www/.
  assert(fs.readFileSync('profile-menu.js','utf8').includes('data-action="updates"'),'the profile menu offers App updates');
});
