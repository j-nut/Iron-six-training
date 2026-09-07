const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const raf2=w=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));

// Mirrors the JSDOM harness used by tests/session-recovery.test.js: load the app's static
// scripts (excluding the cloud modules, which make network calls), stub scroll/timeout, and
// let the caller separately load session-resume.js the same way cloud-history-sync.js would
// load it at runtime — it is a dynamically-injected runtime module, not a static <script>.
function app(saved={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[],scrollCalls=[];
  w.confirm=()=>true;w.fetch=async()=>({ok:false,json:async()=>({})});w.setInterval=()=>0;
  w.setTimeout=(fn,ms)=>{if(ms===0)queueMicrotask(fn);return 0};
  w.scrollTo=(...args)=>{scrollCalls.push({type:'scrollTo',args})};
  w.HTMLElement.prototype.scrollIntoView=function(...args){scrollCalls.push({type:'scrollIntoView',args,target:this})};
  for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,value);
  w.addEventListener('error',e=>errors.push(e.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  return {
    w,context,errors,scrollCalls,
    run:code=>vm.runInContext(code,context),
    loadResumeModule:()=>vm.runInContext(fs.readFileSync('session-resume.js','utf8'),context,{filename:'session-resume.js'}),
    // Drains the hydration promise (and this module's RAF-deferred scroll) so no
    // asynchronous activity is left pending once a test closes the window.
    settle:async function(){await this.w.IronSixJournal.hydrated;await turn();await turn();await raf2(this.w);await turn()},
    snapshot:()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)])),
    close:()=>dom.window.close()
  };
}

function markSetDone(a,ei,i){
  a.run(`activeUser().today['${ei}-${i}']={weight:'95',reps:'8',rir:'2',done:true,_updatedAt:Date.now()}`);
}
function markExerciseDone(a,ei){
  a.run(`(function(){const u=activeUser(),ex=finalWorkout(u)[${ei}];for(let i=0;i<ex.sets;i++)u.today['${ei}-'+i]={weight:'95',reps:'8',rir:'2',done:true,_updatedAt:Date.now()}})()`);
}
function assertTarget(a,expected,message){
  const target=a.run('IronSixSessionResume.computeTarget(activeUser(),finalWorkout(activeUser()))');
  if(expected===null){assert.equal(target,null,message);return}
  assert(target,message||'expected a target');
  assert.equal(target.ei,expected.ei,message);assert.equal(target.i,expected.i,message);
}

test('next incomplete set is found correctly within a partially completed exercise',async()=>{
  const a=app();a.loadResumeModule();await a.settle();
  const workout=a.run('finalWorkout(activeUser())');
  const idx=workout.findIndex(e=>e.sets>=2);
  assert(idx>=0,'fixture workout needs an exercise with at least two sets');
  for(let ei=0;ei<idx;ei++)markExerciseDone(a,ei);
  markSetDone(a,idx,0);
  assertTarget(a,{ei:idx,i:1});
  a.close();
});

test('a stale or invalid pointer hint is ignored and the real state is recomputed',async()=>{
  const a=app();a.loadResumeModule();await a.settle();
  const workout=a.run('finalWorkout(activeUser())');
  const idx=workout.findIndex(e=>e.sets>=2);
  for(let ei=0;ei<idx;ei++)markExerciseDone(a,ei);
  markSetDone(a,idx,0);
  const expected={ei:idx,i:1};

  a.run(`activeUser().activeSetPointer={ei:9999,i:0}`); // points past the end of the workout
  assertTarget(a,expected,'a pointer past the end of the workout must be ignored');

  a.run(`activeUser().activeSetPointer={ei:${idx},i:0}`); // points at a set that is already done
  assertTarget(a,expected,'a pointer at an already-completed set must be ignored');

  a.run(`activeUser().activeSetPointer={ei:'nope',i:null}`); // malformed
  assertTarget(a,expected,'a malformed pointer must be ignored');

  a.run(`activeUser().activeSetPointer={ei:${idx},i:1}`); // valid, matches the real answer
  assertTarget(a,expected,'a valid pointer that matches real state should still be honored');
  a.close();
});

test('a fully complete exercise advances to the next exercise',async()=>{
  const a=app();a.loadResumeModule();await a.settle();
  const workout=a.run('finalWorkout(activeUser())');
  assert(workout.length>=2,'fixture workout needs at least two exercises');
  markExerciseDone(a,0);
  assertTarget(a,{ei:1,i:0});
  a.close();
});

test('a fully complete workout yields no target and never scrolls',async()=>{
  const a=app();a.loadResumeModule();await a.settle();
  const workout=a.run('finalWorkout(activeUser())');
  for(let ei=0;ei<workout.length;ei++)markExerciseDone(a,ei);
  assertTarget(a,null);
  assert.equal(a.run('IronSixSessionResume.resumeNow()'),false,'a complete workout must never scroll');
  await a.settle();
  assert.equal(a.scrollCalls.length,0);
  a.close();
});

test('nothing is scrolled when no set has been logged yet',async()=>{
  const a=app();a.loadResumeModule();await a.settle();
  assert.equal(a.scrollCalls.length,0,'a brand-new workout must not move the viewport');
  a.close();
});

test('auto-scroll fires on genuine page-load resume, and the target row is briefly highlighted',async()=>{
  const seed=app();
  const workout=seed.run('finalWorkout(activeUser())');
  const idx=workout.findIndex(e=>e.sets>=2);
  for(let ei=0;ei<idx;ei++)markExerciseDone(seed,ei);
  markSetDone(seed,idx,0);
  seed.run('saveData()');
  const saved=seed.snapshot();seed.close();

  const a=app(saved);a.loadResumeModule();await a.settle();
  assert(a.scrollCalls.length>=1,'a workout already in progress must be scrolled to on page load');
  const row=a.w.document.querySelector(`.exercise[data-exercise-index="${idx}"] .rows .set-row:nth-child(2)`);
  assert(row,'the target set row must exist in the rendered DOM');
  assert(row.classList.contains('resume-highlight'),'the resumed set must be highlighted');
  a.close();
});

test('auto-scroll does NOT fire on an ordinary re-render (editing a set, saving a profile, changing readiness)',async()=>{
  const a=app();a.loadResumeModule();await a.settle();
  assert.equal(a.scrollCalls.length,0,'nothing logged yet, so page load must not scroll');

  // Log a set through the real UI path, the way a user actually would.
  const weight=a.w.document.querySelector('.exercise[data-exercise-index="0"] .set-row .weight');
  weight.value='95';weight.dispatchEvent(new a.w.Event('input'));
  const done=a.w.document.querySelector('.exercise[data-exercise-index="0"] .set-row .done');
  done.click();
  await turn();
  assert.equal(a.scrollCalls.length,0,'logging a set itself must not scroll');

  // Ordinary actions that call renderAll()/renderExercises() must never yank the viewport.
  a.run('renderAll()'); // what saveProfile() and other everyday actions ultimately trigger
  await turn();await raf2(a.w);await turn();
  assert.equal(a.scrollCalls.length,0,'an ordinary renderAll() must not trigger auto-scroll');

  // A genuine foreground-resume (the event native/runtime.mjs dispatches on Capacitor
  // appStateChange, and what a browser fires on real tab switching) must still resume-scroll.
  a.w.dispatchEvent(new a.w.Event('pageshow'));
  await turn();await raf2(a.w);await turn();
  assert(a.scrollCalls.length>=1,'returning to the foreground with a set already logged must resume-scroll');
  const scrollsAfterResume=a.scrollCalls.length;

  // Changing readiness must not itself yank the viewport, whatever else it does to the session.
  a.run("document.getElementById('energy').value='2';readiness()");
  await turn();await raf2(a.w);await turn();
  assert.equal(a.scrollCalls.length,scrollsAfterResume,'changing readiness must not trigger auto-scroll');

  assert.deepEqual(a.errors,[]);
  a.close();
});
