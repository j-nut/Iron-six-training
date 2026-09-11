// The camera spike sits next to the set logging it is meant to help with, so the thing worth
// asserting is containment: off by default, present only on movements it can actually count,
// and writing a count through the same path a typed rep uses rather than around it.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const synth=require('./helpers/pose-synth.js');

function app(enabled,configure){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.setInterval=()=>0;w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.URL.createObjectURL=()=>'blob:test';
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  if(enabled)w.localStorage.setItem('ironSixPoseSpike','1');
  if(configure)configure(w);
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
    let source=fs.readFileSync(file,'utf8');
    if(file==='pose-spike.js'&&w.__poseVision)source=source.replace('await import(VISION)','await window.__poseVision()');
    vm.runInContext(source,context,{filename:file});
  }
  const run=code=>vm.runInContext(code,context);
  run("window.toast=function(){};activeUser().trainingMode='traditional';activeUser().today={};activeUser().program.currentWorkoutKey='lower_strength';saveData();renderAll()");
  run("document.getElementById('sessionBeginBtn').click()");
  return {w,run,errors,json:code=>JSON.parse(run(`JSON.stringify(${code})`)),close:()=>dom.window.close()};
}

test('the spike is completely absent unless it is switched on',()=>{const a=app(false);try{assert.equal(a.w.IronSixPoseSpike,undefined);assert.equal(a.w.document.querySelectorAll('.pose-bar').length,0);assert.deepEqual(a.errors,[])}finally{a.close()}});
function firstCard(a){return [...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')].find(c=>c.querySelector('.pose-bar'))}
function openExercise(a,item){return a.w.IronSixPoseSpike.open(firstCard(a),item)}
function openSquat(a){return openExercise(a,{name:'Bodyweight squat',base:'squat'})}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}

test('closing while permission is pending immediately stops a late camera stream',async()=>{
  const permission=deferred();let stops=0,loads=0;const a=app(true,w=>{Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>permission.promise}});w.__poseVision=async()=>{loads++;throw new Error('must not load after close')}});
  try{const opening=openSquat(a);a.w.IronSixPoseSpike.close();permission.resolve({getTracks:()=>[{stop:()=>stops++}]});await opening;assert.equal(stops,1);assert.equal(loads,0);assert.equal(a.w.document.getElementById('poseVideo').srcObject,null);assert.equal(a.w.document.getElementById('poseSheet').classList.contains('show'),false)}finally{a.close()}
});

test('closing during model load does not restart inference or a wake lock',async()=>{
  const model=deferred(),entered=deferred();let stops=0,wakes=0,frames=0,options;const a=app(true,w=>{Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops++}]})}});Object.defineProperty(w.navigator,'wakeLock',{value:{request:async()=>{wakes++;return {release:async()=>{}}}}});Object.defineProperty(w.HTMLVideoElement.prototype,'videoWidth',{get:()=>960});w.HTMLMediaElement.prototype.play=async()=>{};w.HTMLVideoElement.prototype.requestVideoFrameCallback=()=>{frames++;return 1};w.__poseVision=async()=>({FilesetResolver:{forVisionTasks:async()=>({})},PoseLandmarker:{createFromOptions:async(_,o)=>{options=o;entered.resolve();return model.promise}}})});
  // Multi-person pose with the recovery build's tolerant confidences: bystanders become candidates
  // for the lifter lock instead of the model being forced to return one person.
  try{const opening=openSquat(a);await entered.promise;a.w.IronSixPoseSpike.close();const before=frames;model.resolve({detectForVideo:()=>({landmarks:[]})});await opening;assert.equal(stops,1);assert.equal(wakes,0);assert.equal(frames,before);assert.equal(options.numPoses,3);assert.equal(options.minTrackingConfidence,0.38);assert.equal(a.w.document.getElementById('poseVideo').srcObject,null)}finally{a.close()}
});

test('re-lock control is present and does not write to a workout',async()=>{const a=app(true);try{await openSquat(a);const before=a.json('activeUser().today'),button=a.w.document.getElementById('poseRelock');assert.equal(button.textContent,'Re-lock user');a.w.HTMLCanvasElement.prototype.getContext=()=>({clearRect:()=>{}});button.click();assert.match(a.w.document.getElementById('poseLock').textContent,/hold still/);assert.deepEqual(a.json('activeUser().today'),before);assert.equal(a.w.IronSixPoseSpike.diagnostics().version,7)}finally{a.close()}});

test('with the flag on, the camera control appears only on movements that have a rule',()=>{const a=app(true);try{assert(a.w.IronSixPoseSpike);const workout=a.json('finalWorkout(activeUser())'),cards=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')];assert(cards.length);for(const card of cards){const exercise=workout[Number(card.dataset.exerciseIndex)],expected=!!a.w.IronSixRepCounter.ruleFor(exercise);assert.equal(!!card.querySelector('.pose-bar'),expected,`${exercise.name} should ${expected?'':'not '}offer camera counting`)}assert(cards.some(card=>card.querySelector('.pose-bar')));assert.deepEqual(a.errors,[])}finally{a.close()}});

test('re-rendering does not stack duplicate camera controls',()=>{const a=app(true);try{a.run('renderExercises();renderExercises();renderExercises()');for(const card of a.w.document.querySelectorAll('#exerciseList [data-exercise-index]'))assert(card.querySelectorAll('.pose-bar').length<=1)}finally{a.close()}});

test('a counted rep is written through the normal logging path, not around it',()=>{const a=app(true);try{const card=firstCard(a);assert(card);const index=card.dataset.exerciseIndex,input=a.w.IronSixPoseSpike.applyCount(card,8);assert(input);assert.equal(input.value,'8');assert.equal(a.json(`activeUser().today['${index}-0']`).reps,'8');assert.equal(a.json(`activeUser().today['${index}-0']`).done,false)}finally{a.close()}});

test('a count goes to the set being worked on, not the first row',()=>{const a=app(true);try{const card=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')].find(c=>c.querySelectorAll('.set-row').length>1&&c.querySelector('.pose-bar'));assert(card);card.querySelectorAll('.set-row')[0].querySelector('.done').click();const input=a.w.IronSixPoseSpike.applyCount(card,6);assert.equal(input,card.querySelectorAll('.set-row')[1].querySelector('.reps'));assert.equal(a.json(`activeUser().today['${card.dataset.exerciseIndex}-1']`).reps,'6')}finally{a.close()}});

test('a camera that never starts leaves the set untouched and offers no count to keep',async()=>{const a=app(true);try{const card=firstCard(a),index=card.dataset.exerciseIndex;await a.run(`IronSixPoseSpike.open(document.querySelector('[data-exercise-index="${index}"]'),finalWorkout(activeUser())[${index}])`);assert(a.w.document.getElementById('poseSheet').classList.contains('show'));assert.match(a.w.document.getElementById('poseStatus').textContent,/camera/i);assert.equal(a.w.document.getElementById('poseUse').disabled,true);assert.equal(a.json(`activeUser().today['${index}-0']||null`),null);assert.deepEqual(a.errors,[])}finally{a.close()}});

test('a caution is shown for variants a single camera handles badly',async()=>{const a=app(true);try{const cards=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')],workout=a.json('finalWorkout(activeUser())'),risky=cards.find(c=>c.querySelector('.pose-bar')&&a.w.IronSixRepCounter.cautionFor(workout[Number(c.dataset.exerciseIndex)]));if(!risky)return;const index=risky.dataset.exerciseIndex;await a.run(`IronSixPoseSpike.open(document.querySelector('[data-exercise-index="${index}"]'),finalWorkout(activeUser())[${index}])`);const caution=a.w.document.getElementById('poseCaution');assert.equal(caution.hidden,false);assert(caution.textContent.length>20)}finally{a.close()}});

test('the spike ships no camera or upload path that runs without the flag, and stays pose-only',()=>{
  const source=fs.readFileSync('pose-spike.js','utf8');
  assert(source.indexOf("if(!readFlag())return")<source.indexOf('getUserMedia'));assert(!/fetch\(|XMLHttpRequest|supabase|\.upload\(/.test(source));
  // A second synchronous person detector in the live loop froze camera and UI on a physical phone.
  assert(!/ObjectDetector|categoryAllowlist/.test(source),'no second detector in the live camera loop');
  assert.equal((source.match(/detectForVideo\(/g)||[]).length,1,'exactly one inference call site');
  for(const page of ['index.html','live.html']){const html=fs.readFileSync(page,'utf8');assert(/pose-rep-counter\.js\?v=\d+/.test(html));const order=['pose-rep-counter.js','pose-view-classifier.js','pose-movement-detectors.js','pose-spike.js'].map(f=>html.indexOf(f));assert(order.every(i=>i>=0),`${page} must load the whole camera chain`);for(let i=1;i<order.length;i++)assert(order[i-1]<order[i],`${page} load order`)}
});

// Exercise the actual frame loop and UI, with camera/model output supplied deterministically.
const ASPECT=960/720;
function cameraApp(){
  const state={t:1,videoTime:0,frame:null,poses:[],stops:0,throwPose:false,detects:0,objectDetector:false};
  const a=app(true,w=>{
    Object.defineProperty(w.performance,'now',{value:()=>state.t});
    Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>state.stops++}]})}});
    for(const [key,get] of Object.entries({videoWidth:()=>960,videoHeight:()=>720,readyState:()=>4,currentTime:()=>state.videoTime}))Object.defineProperty(w.HTMLVideoElement.prototype,key,{get});
    w.HTMLMediaElement.prototype.play=async()=>{};
    w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
    w.HTMLVideoElement.prototype.requestVideoFrameCallback=function(fn){state.frame=()=>fn(state.t,{mediaTime:state.videoTime});return 1};
    w.HTMLVideoElement.prototype.cancelVideoFrameCallback=()=>{};
    w.__poseVision=async()=>({FilesetResolver:{forVisionTasks:async()=>({})},PoseLandmarker:{createFromOptions:async()=>({detectForVideo:()=>{state.detects++;if(state.throwPose)throw Error('test inference failure');return {landmarks:state.poses}}})},ObjectDetector:{createFromOptions:async()=>{state.objectDetector=true;return {detectForVideo:()=>({detections:[]})}}}});
  });
  const next=(ms=33,{frozen=false}={})=>{state.t+=ms;if(!frozen)state.videoTime+=ms/1000;state.frame()};
  return {a,state,next};
}
const text=(a,id)=>a.w.document.getElementById(id).textContent;
function squatPose(theta,cx=.5){
  const rad=d=>d*Math.PI/180,knee={x:cx,y:.6},ankle={x:cx,y:.8},hip={x:cx+.22*Math.sin(rad(180-theta)),y:.6-.22*Math.cos(rad(180-theta))},shoulder={x:hip.x+.03,y:hip.y-.27};
  const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:.01,presence:.01}));
  for(const [i,p] of [[11,shoulder],[12,shoulder],[23,hip],[24,hip],[25,knee],[26,knee],[27,ankle],[28,ankle]])lm[i]={...p,visibility:.95,presence:.95};
  return lm;
}

test('a frozen camera clears current measurement and shows a recovery instruction',async()=>{
  const {a,state,next}=cameraApp();
  try{await openSquat(a);next();next(800,{frozen:true});assert.match(text(a,'poseStatus'),/frames paused/);assert.match(text(a,'poseFormCue'),/paused/);assert.equal(a.w.IronSixPoseSpike.diagnostics().measurementValid,false);assert.equal(a.w.IronSixPoseSpike.diagnostics().stalls,1);assert.equal(state.stops,0,'temporary stalls keep the camera available to recover')}finally{a.close()}
});
test('repeated inference failures stop the camera and expose a retry message',async()=>{
  const {a,state,next}=cameraApp();
  try{await openSquat(a);state.throwPose=true;for(let i=0;i<8;i++)next();assert.equal(state.stops,1);assert.match(text(a,'poseStatus'),/analysis failed/);assert.equal(a.w.IronSixPoseSpike.diagnostics().inferenceErrors,8);assert.equal(a.w.document.getElementById('poseVideo').srcObject,null);assert.match(text(a,'poseFormCue'),/unavailable/)}finally{a.close()}
});
test('a transient inference error does not stop the camera',async()=>{
  const {a,state,next}=cameraApp();
  try{await openSquat(a);state.throwPose=true;for(let i=0;i<3;i++)next();state.throwPose=false;next();state.throwPose=true;for(let i=0;i<3;i++)next();assert.equal(state.stops,0);assert.equal(a.w.IronSixPoseSpike.diagnostics().inferenceErrors,6)}finally{a.close()}
});
test('the live loop runs exactly one pose inference per frame and never a person detector',async()=>{
  const {a,state,next}=cameraApp();
  try{await openSquat(a);state.poses=[squatPose(175)];for(let i=0;i<6;i++)next();assert.equal(state.detects,6);assert.equal(state.objectDetector,false);assert.equal(a.w.IronSixPoseSpike.diagnostics().personDetector,false)}finally{a.close()}
});
test('multi-person ambiguity from the pose tracker pauses counting instead of switching people',async()=>{
  const {a,state,next}=cameraApp();
  try{
    let inputs=[],ambiguous=false;
    a.w.IronSixFormCoach.createSubjectTracker=()=>({reset(){},push(poses){inputs.push(poses.length);return ambiguous?{landmarks:null,locked:true,needsRelock:false,side:0,message:'Two people overlap the predicted track. Counting paused until the view separates.'}:{landmarks:null,locked:true,side:0,message:'Lock held · pose confidence dipped.'}},diagnostics:()=>({})});
    await openSquat(a);state.poses=[squatPose(175,.45),squatPose(175,.6)];next();ambiguous=true;next();
    assert.equal(inputs.at(-1),2,'every candidate reaches the lifter tracker');assert.match(text(a,'poseStatus'),/Two people/);
    const d=a.w.IronSixPoseSpike.diagnostics();assert.equal(d.measurementValid,false);assert.equal(d.reps,0);
  }finally{a.close()}
});
test('side-view squat reps count through the live loop (validated family regression)',async()=>{
  const {a,state,next}=cameraApp();
  try{
    await openSquat(a);
    for(let r=0;r<3;r++)for(let i=0;i<90;i++){const s=i/30,theta=s<.4||s>2.4?175:175-105*Math.sin(Math.PI*(s-.4)/2);state.poses=[squatPose(theta)];next()}
    const d=a.w.IronSixPoseSpike.diagnostics();
    assert.equal(d.reps,3);assert.equal(d.exercise.family,'squat');assert.equal(d.exercise.validated,true);
    assert.equal(d.movement.view.label,'side');assert.equal(d.movement.viewGate.status,'ok');assert.equal(d.movement.viewBlockedFrames,0);
    assert(d.traceFrames>200);const trace=a.w.IronSixPoseSpike.traceExport();assert.equal(trace.kind,'iron-six-pose-trace');assert.equal(trace.frames.length,d.traceFrames);
    assert.match(text(a,'poseView'),/side-on/);
  }finally{a.close()}
});
test('a face-on hinge pauses counting and tells the lifter to turn side-on',async()=>{
  const {a,state,next}=cameraApp();
  try{
    await openExercise(a,{name:'Barbell Romanian Deadlift',pattern:'hinge'});const rand=synth.rng(2);
    for(let i=0;i<60;i++){const pitch=i<30?0:60*Math.sin(Math.PI*(i-30)/30);state.poses=[synth.frame(synth.hinge(pitch),{yaw:0,aspect:ASPECT,noise:.002,rand})];next()}
    const d=a.w.IronSixPoseSpike.diagnostics();
    assert(d.trackedPercent>50,'the lifter stays locked; this is a camera-angle problem, not a tracking one');
    assert.equal(d.exercise.family,'hinge');assert.equal(d.exercise.validated,false);
    assert.equal(d.movement.view.label,'front');assert.equal(d.movement.viewGate.status,'blocked');assert.equal(d.measurementValid,false);
    assert.match(text(a,'poseStatus'),/Turn side-on/);assert.match(text(a,'poseView'),/Turn side-on/);
    assert.match(text(a,'poseFormCue'),/not validated/);
  }finally{a.close()}
});

test('camera startup failure never claims that form watch is active',async()=>{const a=app(true);try{await openSquat(a);assert.match(text(a,'poseFormCue'),/unavailable/);assert.match(text(a,'poseLock'),/Camera unavailable/);assert.equal(a.w.document.getElementById('poseUse').disabled,true)}finally{a.close()}});
