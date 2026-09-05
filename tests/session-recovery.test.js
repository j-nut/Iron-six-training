const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(saved={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.fetch=async()=>({ok:false,json:async()=>({})});w.setInterval=()=>0;w.setTimeout=()=>0;
  for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,value);
  w.addEventListener('error',e=>errors.push(e.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  const run=code=>vm.runInContext(code,context),storage=()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
  return {w,run,storage,errors,close:()=>dom.window.close()};
}
test('unfinished edits and deliberate blanks survive a reload and reset remains recoverable',async()=>{
  const a=app();await a.w.IronSixJournal.hydrated;
  const weight=a.w.document.querySelector('.weight');weight.value='42.5';weight.dispatchEvent(new a.w.Event('input'));
  const reps=a.w.document.querySelector('.reps');reps.value='';reps.dispatchEvent(new a.w.Event('input'));
  assert.equal(a.w.IronSixJournal.all().filter(e=>e.kind==='set').length,2);
  assert.equal(a.w.IronSixJournal.all().at(-1).completed,false);
  const snapshot=a.storage();a.close();
  const b=app(snapshot);await b.w.IronSixJournal.hydrated;
  b.run('IronSixJournal.restore(activeUser());renderAll()');
  assert.equal(b.w.document.querySelector('.weight').value,'42.5');
  assert.equal(b.w.document.querySelector('.reps').value,'');
  b.run('resetWorkout()');
  assert(b.w.IronSixJournal.replay(b.run('activeUser().id')).some(s=>s.status==='archived'&&s.today['0-0'].weight==='42.5'));
  assert.deepEqual(b.errors,[]);b.close();
});
test('offline queue, late acknowledgements, and account boundaries retain newer edits',async()=>{
  const a=app();const j=a.w.IronSixJournal;a.w.ironSixAccountScope='account-a';
  a.run("activeUser().today['0-0']={weight:'25',reps:'8',done:false};IronSixJournal.captureSet(activeUser(),finalWorkout(activeUser()),0,0,activeUser().today['0-0'])");
  j.setTransport(async()=>{throw Error('offline')});assert.equal(await j.flush(),false);assert.equal(j.pending().length,2);
  let sequence=0,added=false;
  j.setTransport(async event=>{
    if(event.kind==='set'&&!added){added=true;a.run("activeUser().today['0-0'].reps='12';IronSixJournal.captureSet(activeUser(),finalWorkout(activeUser()),0,0,activeUser().today['0-0'])")}
    return {sequence:++sequence,saved_at:new Date().toISOString()};
  });
  await j.flush();assert.equal(j.pending().length,1);assert.equal(j.pending()[0].reps_text,'12');await j.flush();assert.equal(j.pending().length,0);
  a.w.ironSixAccountScope='account-b';assert.equal(j.all().length,0);
  a.w.ironSixAccountScope='account-a';assert.equal(j.all().filter(x=>x.kind==='set').length,2);
  a.close();
});
test('storage exhaustion is visible and destructive resets are refused',()=>{
  const a=app();a.w.Storage.prototype.setItem=()=>{throw Error('quota')};
  a.run("activeUser().today['0-0']={weight:'99',reps:'7'};IronSixJournal.captureSet(activeUser(),finalWorkout(activeUser()),0,0,activeUser().today['0-0'])");
  assert.match(a.w.IronSixJournal.status().message,/NOT SAVED/);
  assert.equal(a.run("IronSixJournal.archive(activeUser(),'test')"),false);
  assert.equal(a.run("activeUser().today['0-0'].weight"),'99');a.close();
});
test('legacy history import is idempotent and timer checkpoints preserve session identity',()=>{
  const a=app();
  a.run("activeUser().history=[{ts:100,workoutKey:'lower_strength',details:[{name:'Squat',sets:[{weight:'10',reps:'8',done:true}]}]}];IronSixJournal.migrateUser(activeUser());IronSixJournal.migrateUser(activeUser())");
  assert.equal(a.w.IronSixJournal.all().filter(x=>x.kind==='finish').length,1);
  a.run("IronSixJournal.ensure(activeUser());IronSixJournal.timerCheckpoint(activeUser(),{index:1,remaining:22000})");
  const s=a.w.IronSixJournal.replay(a.run('activeUser().id')).find(s=>s.status==='active');
  assert.equal(s.key,'lower_strength');assert(s.plan.length);assert.equal(s.timer.remaining,22000);a.close();
});
test('both modes fit 15 and 20 minute budgets for every workout and equipment profile',()=>{
  const a=app();
  a.run(`for(const trainingMode of ['traditional','circuit'])for(const minutes of [10,15,20,30,45,60])for(const key of ROTATION)for(const equipment of [DEFAULT_EQUIPMENT,{}]){
    const u=makeUser('Budget tester',180,equipment);u.trainingMode=trainingMode;u.workoutMinutes=minutes;u.program.currentWorkoutKey=key;
    const plan=finalWorkout(u);if(!plan.length)throw Error('Empty '+trainingMode+' '+key);
    if(sessionSeconds(u,plan)>minutes*60)throw Error('Over budget '+trainingMode+' '+minutes+' '+key);
    if(trainingMode==='circuit'){if(!plan.every(circuitSuitable))throw Error('Unsuitable circuit exercise');if(circuitTimeline(u,plan).reduce((n,x)=>n+x.seconds,0)!==sessionSeconds(u,plan))throw Error('Timer budget mismatch')}
  }`);
  a.close();
});
test('clock uses elapsed time, pauses safely and never fast-forwards through unseen intervals',()=>{
  const a=app(),clock=a.run("circuitClock([{seconds:30},{seconds:20}])");
  clock.start(1000);clock.tick(14500);assert.equal(clock.state.remaining,16500);
  clock.pause(16000);clock.tick(99000);assert.equal(clock.state.remaining,15000);
  clock.start(100000);clock.tick(999999);assert.equal(clock.state.index,1);assert.equal(clock.state.remaining,20000);
  const recovered=a.run("circuitClock([{seconds:30},{seconds:20}],{index:1,remaining:8000,running:true})");
  assert.equal(recovered.state.running,false);assert.equal(recovered.state.remaining,8000);a.close();
});
test('repeated short sessions keep actual major muscle coverage across the rolling program',()=>{
  const a=app();
  a.run(`for(const mode of ['traditional','circuit']){
    const u=makeUser('Coverage tester');u.trainingMode=mode;u.workoutMinutes=15;
    for(let i=0;i<24;i++){
      const plan=finalWorkout(u);
      u.history.unshift({workoutKey:u.program.currentWorkoutKey,muscles:[...new Set(plan.flatMap(exerciseMuscles))],details:plan.map(e=>({...e,sets:[]}))});
      u.program.currentWorkoutKey=nextWorkoutKey(u);
      if(i>=7&&muscleCoverage(u).missing.length)throw Error(mode+' missing '+muscleCoverage(u).missing+' at '+i);
    }
  }`);
  a.close();
});
test('circuit controls, swaps and profile switching use the current saved plan',async()=>{
  const a=app(),d=a.w.document;
  d.querySelector('[data-training-mode="circuit"]').click();assert.equal(d.getElementById('circuitPlayer').hidden,false);
  d.getElementById('circuitStart').click();await Promise.resolve();await Promise.resolve();
  assert(a.run('!!activeUser().workoutDraft'));
  d.getElementById('circuitStart').click();assert.match(d.getElementById('circuitStatus').textContent,/Paused|paused/);
  a.run("const testOptions=swapOptionsForExercise(activeUser(),finalWorkout(activeUser())[0]);if(testOptions.length)applyExerciseSwap(0,testOptions[0])");
  assert.deepEqual(a.errors,[]);
  a.run("const another=makeUser('Another');data.users.push(another);switchUser(another.id)");
  assert.equal(d.getElementById('circuitPlayer').hidden,true);a.close();
});
module.exports={app};
