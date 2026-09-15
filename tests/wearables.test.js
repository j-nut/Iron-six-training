// Watch & heart rate: the app-facing half. The risks worth pinning are that finishing a workout can
// never break because of a watch, that health data never reaches the AI review, that nothing the
// user typed (readiness) is overwritten, and that the workout screen stays cheap.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const MIN=60000;
// Readings land on the clock, and the buffer rejects two samples with the same timestamp, so the
// fake sensor has to tick like a real one.
const wait=(ms=3)=>new Promise(r=>setTimeout(r,ms));
function app({journal, native, bluetooth, cardio}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.setInterval=()=>0;w.setTimeout=()=>0;w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.URL.createObjectURL=()=>'blob:test';
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run("window.__toasts=[];window.toast=function(m){window.__toasts.push(m)};window.IronSixCloud={session:()=>null,syncNow:()=>{}}");
  if(journal)w.IronSixJournal=journal;
  if(native)w.IronSixNative=native;
  if(bluetooth)Object.defineProperty(w.navigator,'bluetooth',{value:bluetooth,configurable:true});
  if(cardio)w.IronSixCardio={...(w.IronSixCardio||{}),...cardio};
  for(const file of ['wearable-core.js','wearables.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  return {w,run,errors,json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    user:()=>run('activeUser()'),
    // Let any in-flight promise (health reads, modal refreshes) settle before the window goes away,
    // or their continuations run against a torn-down document.
    close:async()=>{await wait(20);dom.window.close()}};
}
// A tiny fake of the Bluetooth heart-rate characteristic: flags byte 0 (uint8 bpm) + value.
function fakeBluetooth(){
  const listeners={};let notifying=false;
  const characteristic={
    addEventListener:(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn)},
    startNotifications:async()=>{notifying=true;return characteristic},
    stopNotifications:async()=>{notifying=false;return characteristic}
  };
  const device={name:'Polar H10',id:'dev-1',addEventListener:(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn)},
    gatt:{connect:async()=>({getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})}),disconnect(){(listeners.gattserverdisconnected||[]).forEach(fn=>fn())}}};
  return {api:{requestDevice:async()=>device},
    emit:bpm=>{const bytes=new Uint8Array([0,bpm]);(listeners.characteristicvaluechanged||[]).forEach(fn=>fn({target:{value:{buffer:bytes.buffer,byteOffset:0,byteLength:2}}}))},
    notifying:()=>notifying,device};
}
const hrSamples=(start,count,step=10000,bpm=130)=>Array.from({length:count},(_,i)=>({dataType:'heartRate',value:bpm+(i%5),unit:'bpm',startDate:new Date(start+i*step).toISOString(),endDate:new Date(start+i*step).toISOString(),sourceName:'Galaxy Watch'}));
const dailySamples=(dataType,days,value,now)=>Array.from({length:days},(_,i)=>({dataType,value,unit:dataType==='sleep'?'minute':'bpm',startDate:new Date(now-(i+1)*864e5+6*36e5).toISOString(),endDate:new Date(now-(i+1)*864e5+7*36e5).toISOString()}));

test('the profile menu offers Watch & heart rate and opens the modal',async()=>{
  const a=app();
  try{
    a.run('IronSixProfileMenu.render()');a.w.document.getElementById('profileMenuButton').click();
    const item=[...a.w.document.querySelectorAll('#profileMenu .pm-item')].find(b=>/Watch & heart rate/.test(b.textContent));
    assert(item,'menu item present');
    item.click();
    const modal=a.w.document.getElementById('wearablesModal');
    assert(modal&&modal.hidden===false,'modal opens');
    assert.match(modal.textContent,/heart rate/i);
    assert.deepEqual(a.errors,[]);
  }finally{await a.close()}
});

test('a browser without Bluetooth says so instead of offering a dead button',async()=>{
  const a=app();
  try{
    a.run('IronSixWearables.open()');
    const modal=a.w.document.getElementById('wearablesModal');
    assert.match(modal.textContent,/can’t connect to Bluetooth|iPhone and iPad browsers/);
  }finally{await a.close()}
});

test('Web Bluetooth readings feed the live reading and the workout chip',async()=>{
  const ble=fakeBluetooth(),a=app({bluetooth:ble.api});
  try{
    const result=await a.run('IronSixWearables.connectHeartRate()');
    assert.equal(result.ok,true);assert.equal(result.device,'Polar H10');
    assert.equal(ble.notifying(),true,'notifications started');
    ble.emit(132);await wait();
    assert.equal(a.json('IronSixWearables.currentHeartRate()').bpm,132);
    // The chip only appears while the active-workout nav is on screen, so it costs nothing on Today.
    const nav=a.w.document.getElementById('sessionCardNav');
    assert(nav.classList.contains('sc-hidden'),'nav starts hidden before a workout');
    assert.equal(a.w.document.getElementById('wearableHrChip'),null,'no chip while the nav is hidden');
    nav.classList.remove('sc-hidden');
    ble.emit(141);await wait();
    assert.equal(a.w.document.getElementById('wearableHrChip')?.textContent.replace(/\D/g,''),'141');
    assert.equal(a.json('activeUser().trainerMemory.wearables.consent.liveHeartRate'),true);
    await a.run('IronSixWearables.disconnectHeartRate()');
    assert.equal(a.json('IronSixWearables.currentHeartRate()'),null);
    assert.equal(a.w.document.getElementById('wearableHrChip').hidden,true);
  }finally{await a.close()}
});

test('finishing a workout attaches the heart-rate summary, and never fails when anything goes wrong',async()=>{
  const ble=fakeBluetooth();
  const now=Date.now(),start=now-30*MIN;
  const events=[{kind:'start',session_id:'sess-1',row_key:'session',client_at:new Date(start).toISOString(),payload:{}},
    {kind:'set',session_id:'sess-1',row_key:'0-0',client_at:new Date(start+10*MIN).toISOString(),payload:{done:true}}];
  let captured=null;
  const journal={all:()=>events,finish:(u,session)=>{captured=session;return true}};
  const a=app({bluetooth:ble.api,journal});
  try{
    a.run("activeUser().workoutDraft={id:'sess-1',plan:[],key:'push_a',heads:{}}");
    await a.run('IronSixWearables.connectHeartRate()');
    for(let i=0;i<8;i++){ble.emit(120+i);await wait();}
    a.run("IronSixJournal.finish(activeUser(),{ts:Date.now(),sessionId:'sess-1',name:'Push A',sets:10,plannedSets:10,details:[]})");
    assert(captured.startedAt<=start+1000,'session records when it started');
    assert(captured.wearable&&captured.wearable.summary.count>=3,'heart rate attached');
    assert.equal(captured.wearable.source,'bluetooth');
    assert.equal(captured.wearable.device,'Polar H10');
    assert(Array.isArray(captured.wearable.series)&&captured.wearable.series.length,'series stored');
    // A broken core must not stop someone finishing their workout.
    a.run("IronSixWearableCore.summarize=()=>{throw new Error('boom')}");
    captured=null;
    const out=a.run("IronSixJournal.finish(activeUser(),{ts:Date.now(),sessionId:'sess-1',name:'Push A',sets:10,plannedSets:10,details:[]})");
    assert.equal(out,true,'finish still returns the journal result');
    assert.equal(captured.wearable,undefined,'no half-written watch data');
  }finally{await a.close()}
});

test('health-platform heart rate fills in recent sessions, and only with consent',async()=>{
  const now=Date.now(),sessionStart=now-40*MIN;
  const native={health:{isAvailable:async()=>({available:true,platform:'android'}),
    requestAuthorization:async()=>({readAuthorized:['heartRate','sleep']}),
    readSamples:async({dataType})=>({samples:dataType==='heartRate'?hrSamples(sessionStart,20,60000):[]}),
    queryWorkouts:async()=>({workouts:[]}),openSettings:async()=>{},showPrivacyPolicy:async()=>{}}};
  const a=app({native});
  try{
    a.run(`activeUser().history=[{ts:${now-10*MIN},sessionId:'sess-9',name:'Pull A',sets:10,plannedSets:10,duration:30,startedAt:${sessionStart},details:[]}]`);
    let out=await a.run('IronSixWearables.enrichRecentSessions()');
    assert.equal(out.skipped,true,'nothing happens before the user connects');
    const connected=await a.run('IronSixWearables.connectHealth()');
    assert.equal(connected.ok,true);
    out=await a.run('IronSixWearables.enrichRecentSessions()');
    const stored=a.json("activeUser().trainerMemory.wearables.sessions['sess-9']");
    assert(stored&&stored.summary.avg>100,'summary stored');
    assert.equal(stored.source,'health-platform');assert.equal(stored.device,'Galaxy Watch');
    assert.match(a.run("IronSixWearables.historyLine(activeUser().history[0])"),/Heart rate avg \d+ · max \d+ bpm · Galaxy Watch/);
  }finally{await a.close()}
});

test('watch recovery data is shown as context and never edits the readiness answers',async()=>{
  const now=Date.now();
  const native={health:{isAvailable:async()=>({available:true,platform:'android'}),
    requestAuthorization:async()=>({readAuthorized:['heartRate','sleep','restingHeartRate']}),
    readSamples:async({dataType})=>({samples:dataType==='sleep'?dailySamples('sleep',20,420,now).map(s=>({...s,endDate:new Date(Date.parse(s.startDate)+420*MIN).toISOString(),sleepState:'asleep'}))
      :dataType==='restingHeartRate'?dailySamples('restingHeartRate',20,57,now):[]}),
    queryWorkouts:async()=>({workouts:[]}),openSettings:async()=>{},showPrivacyPolicy:async()=>{}}};
  const a=app({native});
  try{
    const energyBefore=a.run("document.getElementById('energy').value"),soreBefore=a.run("document.getElementById('soreness').value");
    await a.run('IronSixWearables.connectHealth()');
    await a.run('IronSixWearables.readinessInsight({force:true})');
    const block=a.w.document.getElementById('wearableReadiness');
    assert(block&&!block.hidden,'watch context shown');
    assert.match(block.textContent,/From your watch/);
    assert.match(block.textContent,/Context only/);
    assert.equal(a.run("document.getElementById('energy').value"),energyBefore,'energy untouched');
    assert.equal(a.run("document.getElementById('soreness').value"),soreBefore,'soreness untouched');
  }finally{await a.close()}
});

test('a TCX file attaches heart rate to the workout it overlaps',async()=>{
  const now=Date.now(),start=now-50*MIN;
  const points=Array.from({length:12},(_,i)=>`<Trackpoint><Time>${new Date(start+i*90000).toISOString()}</Time><HeartRateBpm><Value>${125+i}</Value></HeartRateBpm></Trackpoint>`).join('');
  const tcx=`<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Other"><Lap><Calories>210</Calories><Track>${points}</Track></Lap><Creator><Name>Forerunner 255</Name></Creator></Activity></Activities></TrainingCenterDatabase>`;
  const a=app();
  try{
    a.run(`activeUser().history=[{ts:${now-30*MIN},sessionId:'sess-5',name:'Legs B',sets:12,plannedSets:12,duration:45,startedAt:${start},details:[]}]`);
    const result=await a.run(`IronSixWearables.importWorkoutFile(${JSON.stringify(tcx)})`);
    assert.equal(result.ok,true,result.message);
    assert.equal(result.sessionId,'sess-5');
    const stored=a.json("activeUser().trainerMemory.wearables.sessions['sess-5']");
    assert.equal(stored.source,'file');assert(stored.summary.avg>=125);
  }finally{await a.close()}
});

test('a watch workout can be added to the cardio log once, marked as coming from the watch',async()=>{
  const now=Date.now(),logged=[];
  const native={health:{isAvailable:async()=>({available:true,platform:'android'}),
    requestAuthorization:async()=>({readAuthorized:['heartRate','sleep']}),
    readSamples:async()=>({samples:[]}),
    queryWorkouts:async()=>({workouts:[{workoutType:'running',duration:1800,startDate:new Date(now-40*MIN).toISOString(),endDate:new Date(now-10*MIN).toISOString(),platformId:'w-1',sourceName:'Garmin'}]}),
    openSettings:async()=>{},showPrivacyPolicy:async()=>{}}};
  const a=app({native,cardio:{logSession:(u,entry)=>{if(logged.some(x=>x.id===entry.id))return false;logged.push(entry);return true},render:()=>{}}});
  try{
    await a.run('IronSixWearables.connectHealth()');
    const list=await a.run('IronSixWearables.recentWatchWorkouts()');
    assert.equal(list.length,1);assert.equal(list[0].mode,'run');
    assert.equal(a.run(`IronSixWearables.importWatchWorkout(${JSON.stringify(list[0])})`),true);
    assert.equal(logged.length,1);
    assert.equal(logged[0].source,'watch');assert.equal(logged[0].minutes,30);assert.equal(logged[0].intensity,'moderate');
    const again=await a.run('IronSixWearables.recentWatchWorkouts()');
    assert.equal(again.length,0,'an imported workout is not offered twice');
  }finally{await a.close()}
});

test('watch data is never sent to the AI review, and survives the post-workout trainer update',()=>{
  const source=fs.readFileSync('ui3.js','utf8');
  assert(source.includes('withoutWatchData'),'review payload strips watch data');
  assert(/completedSession:withoutWatchData\(/.test(source),'completed session stripped');
  assert(/history:u\.history\.slice\(0,8\)\.map\(withoutWatchData\)/.test(source),'history entries stripped');
  assert(/wearables:target\.trainerMemory\?\.wearables/.test(source),'trainer review keeps watch state');
  const cardio=fs.readFileSync('cardio-companion.js','utf8');
  assert(/source:\['watch','file'\]/.test(cardio),'cardio log records where an entry came from');
  const loader=fs.readFileSync('cloud-history-sync.js','utf8');
  assert(loader.indexOf('wearable-core.js')<loader.indexOf("'wearables.js"),'core loads before the UI');
  for(const builder of ['scripts/build-web.mjs','scripts/build-android-web.mjs']){
    const s=fs.readFileSync(builder,'utf8');
    assert(s.includes('wearable-core.js')&&s.includes('wearables.js'),`${builder} ships both files`);
  }
});

test('deleting watch data clears the profile state and stops showing saved summaries',async()=>{
  const ble=fakeBluetooth(),now=Date.now();
  const a=app({bluetooth:ble.api});
  try{
    await a.run('IronSixWearables.connectHeartRate()');
    ble.emit(130);
    a.run(`activeUser().history=[{ts:${now-10*MIN},sessionId:'sess-3',name:'Push B',duration:30,details:[],wearable:{v:1,source:'bluetooth',device:'Polar H10',summary:{avg:131,max:150,min:110,count:40,coverage:0.9,durationMs:1800000}}}]`);
    assert.match(a.run('IronSixWearables.historyLine(activeUser().history[0])'),/avg 131/);
    assert.equal(await a.run('IronSixWearables.deleteWatchData({confirmed:true})'),true);
    assert.equal(a.json('activeUser().trainerMemory.wearables.consent.healthPlatform'),false);
    assert.deepEqual(a.json('activeUser().trainerMemory.wearables.sessions'),{});
    assert.equal(a.run('IronSixWearables.currentHeartRate()'),null);
    assert.equal(a.run('IronSixWearables.historyLine(activeUser().history[0])'),'','saved summaries are no longer shown');
  }finally{await a.close()}
});
