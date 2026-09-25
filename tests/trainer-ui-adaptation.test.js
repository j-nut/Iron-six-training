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

test('completed set edits immediately update untouched rows and preserve feedback across render',()=>{
  const a=app(),d=a.w.document;
  a.run("nextSetRecommendation=(u,ex,ei)=>currentSessionCompleted(u,ei).length?{load:Number(u.today[ei+'-0'].weight)+5,reps:12,text:'Updated'}:null");
  const rows=d.querySelectorAll('[data-exercise-index="0"] .set-row');
  const first=rows[0],second=rows[1];
  first.querySelector('.weight').value='50';first.querySelector('.reps').value='10';first.querySelector('.done').click();
  a.run("activeUser().today['0-0'].feedback='hard'");
  first.querySelector('.weight').value='60';first.querySelector('.weight').dispatchEvent(new a.w.Event('input'));
  assert.equal(a.run("activeUser().today['0-0'].feedback"),'hard');
  assert.equal(second.querySelector('.weight').value,'65');
  a.run('renderExercises()');
  assert.equal(d.querySelectorAll('[data-exercise-index="0"] .weight')[1].value,'65');
  assert.equal(d.querySelectorAll('[data-exercise-index="0"] .weight')[0].value,'60');a.close();
});
test('backoff load uses actual top set once and evaluates later backoffs in their own rep range',()=>{
  const a=app();
  a.run("var ex={name:'Barbell Bench Press',base:'Horizontal press',sets:3,prescription:'1 top set × 4–6, then 2 × 8–10'};activeUser().today={'0-0':{weight:'100',reps:'5',rir:'2',done:true}};roundLoad=x=>Math.round(x)");
  assert.equal(a.run('plannedSetTarget(activeUser(),ex,{load:110},1,0).load'),90);
  a.run("activeUser().today['0-1']={weight:'90',reps:'9',rir:'2',done:true}");
  assert.equal(a.run('plannedSetTarget(activeUser(),ex,{load:85},2,0).load'),90);
  assert.equal(a.run('plannedSetTarget(activeUser(),ex,{load:85},2,0).reps'),9);a.close();
});
test('cloud responses cannot recalibrate a replacement session or override newer edits',async()=>{
  for(const change of ["resetWorkout()", "chooseWorkout('lower_strength')", "activeUser().today['0-0'].reps='3';calibrationRequest++", "window.ironSixAccountScope='other-account'"]){
    const a=app();
    a.run("activeUser().today['0-0']={weight:'50',reps:'10',done:true};IronSixJournal.captureSet(activeUser(),finalWorkout(activeUser()),0,0,activeUser().today['0-0'])");
    let resolve;a.w.fetch=()=>new Promise(r=>resolve=r);
    const pending=a.run('refineWorkoutWithCloud(activeUser(),finalWorkout(activeUser()))');
    a.run(change);const before=a.run('JSON.stringify(activeUser().sessionCalibration)');
    resolve({ok:true,json:async()=>({factor:1.06,summary:'old response'})});await pending;
    assert.equal(a.run('JSON.stringify(activeUser().sessionCalibration)'),before,change);a.close();
  }
});

test('visible prescription matches reduced working-set count',()=>{const a=app();assert.equal(a.run("visiblePrescription({prescription:'4 × 8–12',sets:2})"),'2 × 8–12');a.close()});
