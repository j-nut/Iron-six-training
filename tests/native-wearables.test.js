const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const DAY=86400000;
const iso=offsetDays=>new Date(Date.now()+offsetDays*DAY).toISOString();

function fakeHealth(overrides={}){
  const calls=[];
  const Health={
    calls,
    async isAvailable(){calls.push(['isAvailable']);return {available:true,platform:'android'}},
    async requestAuthorization(options){calls.push(['requestAuthorization',options]);return {readAuthorized:options.read,readDenied:[],writeAuthorized:[],writeDenied:[]}},
    async checkAuthorization(options){calls.push(['checkAuthorization',options]);return {readAuthorized:[],readDenied:options.read,writeAuthorized:[],writeDenied:[]}},
    async readSamples(options){calls.push(['readSamples',options]);return {samples:[{dataType:options.dataType,value:62,unit:'bpm'}]}},
    async queryWorkouts(options){calls.push(['queryWorkouts',options]);return {workouts:[{workoutType:'strengthTraining',duration:1800}],anchor:'next'}},
    async openHealthConnectSettings(){calls.push(['openSettings'])},
    async showPrivacyPolicy(){calls.push(['showPrivacyPolicy'])},
    async saveSample(){calls.push(['saveSample']);throw new Error('must never be called')},
    ...overrides
  };
  return Health;
}

function fakeBle(overrides={}){
  const calls=[],state={notify:null,disconnectCallbacks:{}};let next=0;
  const BleClient={
    calls,state,
    async initialize(options){calls.push(['initialize',options])},
    async requestDevice(options){calls.push(['requestDevice',options]);next++;return {deviceId:'dev-'+next,name:'Strap '+next}},
    async connect(deviceId,onDisconnect){calls.push(['connect',deviceId]);state.disconnectCallbacks[deviceId]=onDisconnect},
    async startNotifications(deviceId,service,characteristic,callback){calls.push(['startNotifications',deviceId,service,characteristic]);state.notify=callback},
    async stopNotifications(deviceId,service,characteristic){calls.push(['stopNotifications',deviceId,service,characteristic])},
    async disconnect(deviceId){calls.push(['disconnect',deviceId])},
    ...overrides
  };
  return BleClient;
}

function fakeWin(){
  const listeners={};
  const element={classList:{add(){},contains:()=>false},append(){},textContent:''};
  return {
    document:{documentElement:element,head:element,body:element,getElementById:()=>null,createElement:()=>({...element}),addEventListener(){},querySelector:()=>null},
    location:{origin:'https://localhost',href:'https://localhost/'},
    fetch:async()=>({ok:true}),
    addEventListener:(name,fn)=>{listeners[name]=fn},dispatchEvent(){},
    Event:class{constructor(type){this.type=type}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}}
  };
}

async function install(extra={}){
  const {installNative}=await import('../native/runtime.mjs');
  const win=fakeWin();
  const App={addListener:async()=>{},getLaunchUrl:async()=>null,minimizeApp:async()=>{}};
  const Browser={open:async()=>{},close:async()=>{}};
  const api=installNative({win,App,Browser,createClient:()=>null,WorkoutBackup:{save:async()=>({})},...extra});
  assert.equal(win.IronSixNative,api);
  return api;
}

test('health bridge only requests allowlisted read types and never write access',async()=>{
  const {HEALTH_READ_TYPES}=await import('../native/runtime.mjs');
  assert.deepEqual([...HEALTH_READ_TYPES],['heartRate','restingHeartRate','heartRateVariability','sleep','calories','totalCalories','workouts']);
  const Health=fakeHealth();
  const api=await install({Health});
  assert.equal(typeof api.exportBackup,'function','existing members stay intact');
  assert.equal(typeof api.listenVoice,'function');
  const status=await api.health.requestAuthorization({read:['heartRate','sleep','workouts','heartRate']});
  assert.deepEqual(status.readAuthorized,['heartRate','sleep','workouts']);
  assert.deepEqual(Health.calls.at(-1),['requestAuthorization',{read:['heartRate','sleep','workouts']}]);
  assert(!('write' in Health.calls.at(-1)[1]));assert(!('requestHistoryAccess' in Health.calls.at(-1)[1]));
  await api.health.checkAuthorization({read:['restingHeartRate','heartRateVariability']});
  assert.deepEqual(Health.calls.at(-1),['checkAuthorization',{read:['restingHeartRate','heartRateVariability']}]);
  const before=Health.calls.length;
  await assert.rejects(api.health.requestAuthorization({read:['steps']}),/not allowed/);
  await assert.rejects(api.health.requestAuthorization({read:['heartRate','weight']}),/not allowed/);
  await assert.rejects(api.health.requestAuthorization({read:['heartRate'],write:['heartRate']}),/only reads/);
  await assert.rejects(api.health.checkAuthorization({read:[]}),/at least one/);
  await assert.rejects(api.health.checkAuthorization({}),/at least one/);
  await assert.rejects(api.health.readSamples({dataType:'steps',startDate:iso(-1),endDate:iso(0)}),/not allowed/);
  await assert.rejects(api.health.readSamples({dataType:'workouts',startDate:iso(-1),endDate:iso(0)}),/not allowed/);
  assert.equal(Health.calls.length,before,'rejected requests never reach the plugin');
  assert(!Health.calls.some(call=>call[0]==='saveSample'));
});

test('health bridge validates dates and clamps limits',async()=>{
  const Health=fakeHealth();
  const api=await install({Health});
  const result=await api.health.readSamples({dataType:'heartRate',startDate:iso(-7),endDate:iso(0),limit:999999,ascending:true});
  assert.equal(result.samples.length,1);
  const [,query]=Health.calls.at(-1);
  assert.equal(query.dataType,'heartRate');assert.equal(query.limit,5000);assert.equal(query.ascending,true);
  assert.match(query.startDate,/^\d{4}-\d{2}-\d{2}T/);
  await api.health.readSamples({dataType:'sleep',startDate:iso(-2),endDate:iso(0),limit:0});
  assert.equal(Health.calls.at(-1)[1].limit,1);assert.equal(Health.calls.at(-1)[1].ascending,false);
  await api.health.readSamples({dataType:'calories',startDate:iso(-2),endDate:iso(0),limit:'abc'});
  assert.equal(Health.calls.at(-1)[1].limit,100);
  const before=Health.calls.length;
  await assert.rejects(api.health.readSamples({dataType:'heartRate',startDate:iso(-401),endDate:iso(0)}),/last 400 days/);
  await assert.rejects(api.health.readSamples({dataType:'heartRate',startDate:iso(0),endDate:iso(-1)}),/before end/);
  await assert.rejects(api.health.readSamples({dataType:'heartRate',startDate:'yesterday',endDate:iso(0)}),/ISO/);
  await assert.rejects(api.health.readSamples({dataType:'heartRate',startDate:Date.now()-DAY,endDate:iso(0)}),/ISO/);
  await assert.rejects(api.health.readSamples({dataType:'heartRate',startDate:iso(-1)}),/ISO/);
  await assert.rejects(api.health.queryWorkouts({startDate:iso(-1),endDate:iso(5)}),/future/);
  assert.equal(Health.calls.length,before);
  const workouts=await api.health.queryWorkouts({startDate:iso(-30),endDate:iso(0),limit:20});
  assert.deepEqual(Object.keys(workouts),['workouts']);assert.equal(workouts.workouts.length,1);
  assert.equal(Health.calls.at(-1)[0],'queryWorkouts');assert.equal(Health.calls.at(-1)[1].limit,20);
  await api.health.openSettings();await api.health.showPrivacyPolicy();
  assert.deepEqual(Health.calls.slice(-2).map(call=>call[0]),['openSettings','showPrivacyPolicy']);
});

test('health bridge reports unavailability and turns plugin failures into readable rejections',async()=>{
  const missing=await install({});
  assert.deepEqual(await missing.health.isAvailable(),{available:false,platform:'android',reason:'This build does not include Health Connect.'});
  await assert.rejects(missing.health.requestAuthorization({read:['heartRate']}),/does not include Health Connect/);
  const available=await install({Health:fakeHealth()});
  assert.equal((await available.health.isAvailable()).available,true);
  const broken=await install({Health:fakeHealth({
    isAvailable:async()=>{throw new Error('Health Connect is not installed')},
    readSamples:async()=>{throw {code:'UNAVAILABLE'}}
  })});
  const status=await broken.health.isAvailable();
  assert.equal(status.available,false);assert.equal(status.reason,'Health Connect is not installed');
  await assert.rejects(broken.health.readSamples({dataType:'heartRate',startDate:iso(-1),endDate:iso(0)}),error=>error instanceof Error&&error.message==='Could not read health data.');
});

test('BLE heart-rate bridge wires the standard service, forwards bytes and keeps one connection',async()=>{
  const {HR_SERVICE,HR_MEASUREMENT}=await import('../native/runtime.mjs');
  assert.equal(HR_SERVICE,'0000180d-0000-1000-8000-00805f9b34fb');
  assert.equal(HR_MEASUREMENT,'00002a37-0000-1000-8000-00805f9b34fb');
  const BleClient=fakeBle();
  const api=await install({BleClient});
  assert.equal(await api.heartRateBle.isAvailable(),true);
  assert.equal(BleClient.calls.length,0,'availability check does not prompt for permissions');
  const readings=[],disconnects=[];
  const info=await api.heartRateBle.connect({onReading:(bytes,device)=>readings.push([bytes,device]),onDisconnect:device=>disconnects.push(device)});
  assert.deepEqual(info,{deviceId:'dev-1',deviceName:'Strap 1'});
  assert.deepEqual(BleClient.calls[0],['initialize',{androidNeverForLocation:true}]);
  assert.deepEqual(BleClient.calls[1],['requestDevice',{services:[HR_SERVICE],optionalServices:[]}]);
  assert.deepEqual(BleClient.calls[2],['connect','dev-1']);
  assert.deepEqual(BleClient.calls[3],['startNotifications','dev-1',HR_SERVICE,HR_MEASUREMENT]);
  const buffer=new Uint8Array([9,9,0x16,72,0x10,0x03,9]).buffer;
  BleClient.state.notify(new DataView(buffer,2,4));
  assert.deepEqual(readings,[[[0x16,72,0x10,0x03],{deviceId:'dev-1',deviceName:'Strap 1'}]]);
  const first=BleClient.state.notify;
  await api.heartRateBle.connect({onReading:bytes=>readings.push([bytes])});
  assert(BleClient.calls.some(call=>call[0]==='stopNotifications'&&call[1]==='dev-1'));
  assert(BleClient.calls.some(call=>call[0]==='disconnect'&&call[1]==='dev-1'));
  assert.equal(disconnects.length,0,'intentional disconnects do not report a lost sensor');
  first(new DataView(new Uint8Array([0,99]).buffer));
  assert.equal(readings.length,1,'stale connection readings are ignored');
  BleClient.state.disconnectCallbacks['dev-2']('dev-2');
  await api.heartRateBle.disconnect();await api.heartRateBle.disconnect();
});

test('BLE heart-rate bridge reports sensor loss and disconnect never throws',async()=>{
  const BleClient=fakeBle({disconnect:async()=>{throw new Error('already disconnected')},stopNotifications:async()=>{throw new Error('not connected')}});
  const api=await install({BleClient});
  await api.heartRateBle.disconnect();
  const lost=[];
  await api.heartRateBle.connect({onReading(){},onDisconnect:device=>lost.push(device)});
  BleClient.state.disconnectCallbacks['dev-1']('dev-1');
  assert.deepEqual(lost,[{deviceId:'dev-1',deviceName:'Strap 1'}]);
  await api.heartRateBle.disconnect();await api.heartRateBle.disconnect();
  await assert.rejects(api.heartRateBle.connect({}),/callback is required/);
  const cancelled=await install({BleClient:fakeBle({requestDevice:async()=>{throw new Error('User cancelled the device chooser')}})});
  await assert.rejects(cancelled.heartRateBle.connect({onReading(){}}),/User cancelled/);
  const failing=fakeBle({startNotifications:async()=>{throw new Error('Characteristic not found')}});
  const partial=await install({BleClient:failing});
  await assert.rejects(partial.heartRateBle.connect({onReading(){}}),/Characteristic not found/);
  assert(failing.calls.some(call=>call[0]==='disconnect'&&call[1]==='dev-1'),'failed setup releases the device');
  const none=await install({});
  assert.equal(await none.heartRateBle.isAvailable(),false);
  await assert.rejects(none.heartRateBle.connect({onReading(){}}),/does not include Bluetooth/);
  await none.heartRateBle.disconnect();
});

test('Android project declares read-only health access and location-free Bluetooth',()=>{
  const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
  assert(manifest.includes('xmlns:tools="http://schemas.android.com/tools"'));
  const kept=['READ_HEART_RATE','READ_RESTING_HEART_RATE','READ_HEART_RATE_VARIABILITY','READ_SLEEP','READ_EXERCISE','READ_ACTIVE_CALORIES_BURNED','READ_TOTAL_CALORIES_BURNED'];
  for(const name of kept)assert.match(manifest,new RegExp(`<uses-permission android:name="android\\.permission\\.health\\.${name}" />`),name);
  const pluginManifest=fs.readFileSync('node_modules/@capgo/capacitor-health/android/src/main/AndroidManifest.xml','utf8');
  const pluginPermissions=[...pluginManifest.matchAll(/android\.permission\.health\.(\w+)/g)].map(match=>match[1]);
  assert(pluginPermissions.length>40);
  for(const name of pluginPermissions){
    if(kept.includes(name))continue;
    assert.match(manifest,new RegExp(`android\\.permission\\.health\\.${name}" tools:node="remove"`),`${name} must be removed`);
  }
  for(const match of manifest.matchAll(/<uses-permission android:name="android\.permission\.health\.(WRITE_\w+)"([^>]*)>/g))assert.match(match[2],/tools:node="remove"/,match[1]);
  assert(!manifest.includes('android.permission.health.READ_HEALTH_DATA_HISTORY'));
  assert.match(manifest,/android:name="android\.permission\.BLUETOOTH_SCAN"\s+android:usesPermissionFlags="neverForLocation"/);
  assert(manifest.includes('android.permission.BLUETOOTH_CONNECT'));
  for(const name of ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION'])assert.match(manifest,new RegExp(`android:name="android\\.permission\\.${name}"\\s+android:maxSdkVersion="30"\\s+tools:node="replace"`),name);
  assert.match(manifest,/android\.hardware\.bluetooth_le" android:required="false"/);
  for(const name of ['INTERNET','CAMERA','RECORD_AUDIO'])assert(manifest.includes(`android.permission.${name}"`),name);
  assert.match(fs.readFileSync('android/variables.gradle','utf8'),/minSdkVersion = 26\b/);
  assert(fs.readFileSync('android/app/src/main/res/values/strings.xml','utf8').includes('<string name="health_connect_privacy_policy_url">https://iron-six-training.vercel.app/privacy</string>'));
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  assert.equal(pkg.dependencies['@capgo/capacitor-health'],'8.11.1');
  assert.equal(pkg.dependencies['@capacitor-community/bluetooth-le'],'8.3.0');
  const settings=fs.readFileSync('android/capacitor.settings.gradle','utf8');
  assert(settings.includes(':capgo-capacitor-health'));assert(settings.includes(':capacitor-community-bluetooth-le'));
  const entry=fs.readFileSync('native/entry.mjs','utf8');
  assert(entry.includes("from '@capgo/capacitor-health'"));assert(entry.includes("from '@capacitor-community/bluetooth-le'"));
});
