// The camera spike sits next to the set logging it is meant to help with, so the thing worth
// asserting is containment: off by default, present only on movements it can actually count,
// and writing a count through the same path a typed rep uses rather than around it.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

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
function openSquat(a){const card=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')].find(c=>c.querySelector('.pose-bar'));return a.w.IronSixPoseSpike.open(card,{name:'Bodyweight squat',base:'squat'})}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}

test('closing while permission is pending immediately stops a late camera stream',async()=>{
  const permission=deferred();let stops=0,loads=0;const a=app(true,w=>{Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>permission.promise}});w.__poseVision=async()=>{loads++;throw new Error('must not load after close')}});
  try{const opening=openSquat(a);a.w.IronSixPoseSpike.close();permission.resolve({getTracks:()=>[{stop:()=>stops++}]});await opening;assert.equal(stops,1);assert.equal(loads,0);assert.equal(a.w.document.getElementById('poseVideo').srcObject,null);assert.equal(a.w.document.getElementById('poseSheet').classList.contains('show'),false)}finally{a.close()}
});

test('closing during model load does not restart inference or a wake lock',async()=>{
  const model=deferred(),entered=deferred();let stops=0,wakes=0,frames=0,options;const a=app(true,w=>{Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops++}]})}});Object.defineProperty(w.navigator,'wakeLock',{value:{request:async()=>{wakes++;return {release:async()=>{}}}}});Object.defineProperty(w.HTMLVideoElement.prototype,'videoWidth',{get:()=>960});w.HTMLMediaElement.prototype.play=async()=>{};w.requestAnimationFrame=()=>{frames++;return 1};w.cancelAnimationFrame=()=>{};w.__poseVision=async()=>({FilesetResolver:{forVisionTasks:async()=>({})},PoseLandmarker:{createFromOptions:async(_,o)=>{options=o;entered.resolve();return model.promise}}})});
  try{const opening=openSquat(a);await entered.promise;a.w.IronSixPoseSpike.close();const before=frames;model.resolve({detectForVideo:()=>({landmarks:[]})});await opening;assert.equal(stops,1);assert.equal(wakes,0);assert.equal(frames,before);assert.equal(options.numPoses,3);assert.equal(options.minTrackingConfidence,0.5);assert.equal(a.w.document.getElementById('poseVideo').srcObject,null)}finally{a.close()}
});

test('re-lock control is present and does not write to a workout',async()=>{const a=app(true);try{await openSquat(a);const before=a.json('activeUser().today'),button=a.w.document.getElementById('poseRelock');assert.equal(button.textContent,'Re-lock user');a.w.HTMLCanvasElement.prototype.getContext=()=>({clearRect:()=>{}});button.click();assert.match(a.w.document.getElementById('poseLock').textContent,/hold still/);assert.deepEqual(a.json('activeUser().today'),before);assert.equal(a.w.IronSixPoseSpike.diagnostics().version,2)}finally{a.close()}});

test('with the flag on, the camera control appears only on movements that have a rule',()=>{const a=app(true);try{assert(a.w.IronSixPoseSpike);const workout=a.json('finalWorkout(activeUser())'),cards=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')];assert(cards.length);for(const card of cards){const exercise=workout[Number(card.dataset.exerciseIndex)],expected=!!a.w.IronSixRepCounter.ruleFor(exercise);assert.equal(!!card.querySelector('.pose-bar'),expected,`${exercise.name} should ${expected?'':'not '}offer camera counting`)}assert(cards.some(card=>card.querySelector('.pose-bar')));assert.deepEqual(a.errors,[])}finally{a.close()}});

test('re-rendering does not stack duplicate camera controls',()=>{const a=app(true);try{a.run('renderExercises();renderExercises();renderExercises()');for(const card of a.w.document.querySelectorAll('#exerciseList [data-exercise-index]'))assert(card.querySelectorAll('.pose-bar').length<=1)}finally{a.close()}});

test('a counted rep is written through the normal logging path, not around it',()=>{const a=app(true);try{const card=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')].find(c=>c.querySelector('.pose-bar'));assert(card);const index=card.dataset.exerciseIndex,input=a.w.IronSixPoseSpike.applyCount(card,8);assert(input);assert.equal(input.value,'8');assert.equal(a.json(`activeUser().today['${index}-0']`).reps,'8');assert.equal(a.json(`activeUser().today['${index}-0']`).done,false)}finally{a.close()}});

test('a count goes to the set being worked on, not the first row',()=>{const a=app(true);try{const card=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')].find(c=>c.querySelectorAll('.set-row').length>1&&c.querySelector('.pose-bar'));assert(card);card.querySelectorAll('.set-row')[0].querySelector('.done').click();const input=a.w.IronSixPoseSpike.applyCount(card,6);assert.equal(input,card.querySelectorAll('.set-row')[1].querySelector('.reps'));assert.equal(a.json(`activeUser().today['${card.dataset.exerciseIndex}-1']`).reps,'6')}finally{a.close()}});

test('a camera that never starts leaves the set untouched and offers no count to keep',async()=>{const a=app(true);try{const card=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')].find(c=>c.querySelector('.pose-bar')),index=card.dataset.exerciseIndex;await a.run(`IronSixPoseSpike.open(document.querySelector('[data-exercise-index="${index}"]'),finalWorkout(activeUser())[${index}])`);assert(a.w.document.getElementById('poseSheet').classList.contains('show'));assert.match(a.w.document.getElementById('poseStatus').textContent,/camera/i);assert.equal(a.w.document.getElementById('poseUse').disabled,true);assert.equal(a.json(`activeUser().today['${index}-0']||null`),null);assert.deepEqual(a.errors,[])}finally{a.close()}});

test('a caution is shown for variants a single camera handles badly',async()=>{const a=app(true);try{const cards=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')],workout=a.json('finalWorkout(activeUser())'),risky=cards.find(c=>c.querySelector('.pose-bar')&&a.w.IronSixRepCounter.cautionFor(workout[Number(c.dataset.exerciseIndex)]));if(!risky)return;const index=risky.dataset.exerciseIndex;await a.run(`IronSixPoseSpike.open(document.querySelector('[data-exercise-index="${index}"]'),finalWorkout(activeUser())[${index}])`);const caution=a.w.document.getElementById('poseCaution');assert.equal(caution.hidden,false);assert(caution.textContent.length>20)}finally{a.close()}});

test('the spike ships no camera or upload path that runs without the flag',()=>{const source=fs.readFileSync('pose-spike.js','utf8');assert(source.indexOf("if(!readFlag())return")<source.indexOf('getUserMedia'));assert(!/fetch\(|XMLHttpRequest|supabase|\.upload\(/.test(source));assert(source.includes("categoryAllowlist:['person']"));assert(source.includes('trackingVersion:5'));for(const page of ['index.html','live.html']){const html=fs.readFileSync(page,'utf8');assert(/pose-rep-counter\.js\?v=\d+/.test(html));assert(html.indexOf('pose-rep-counter.js')<html.indexOf('pose-spike.js'))}});

// Exercise the actual animation loop and UI, with camera/model output supplied deterministically.
function cameraApp(){
  const state={t:1,videoTime:0,frame:null,poses:[],boxes:[],stops:0,throwPose:false};
  const a=app(true,w=>{
    Object.defineProperty(w.performance,'now',{value:()=>state.t});
    Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>state.stops++}]})}});
    for(const [key,get] of Object.entries({videoWidth:()=>960,videoHeight:()=>720,readyState:()=>4,currentTime:()=>state.videoTime}))Object.defineProperty(w.HTMLVideoElement.prototype,key,{get});
    w.HTMLMediaElement.prototype.play=async()=>{};
    w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
    w.requestAnimationFrame=fn=>{state.frame=fn;return 1};w.cancelAnimationFrame=()=>{};
    w.__poseVision=async()=>({FilesetResolver:{forVisionTasks:async()=>({})},PoseLandmarker:{createFromOptions:async()=>({detectForVideo:()=>{if(state.throwPose)throw Error('test inference failure');return {landmarks:state.poses}}})},ObjectDetector:{createFromOptions:async()=>({detectForVideo:()=>({detections:state.boxes})})}});
  });
  const next=(ms=33,{frozen=false}={})=>{state.t+=ms;if(!frozen)state.videoTime+=ms/1000;state.frame()};
  return {a,state,next};
}
test('a frozen camera clears current measurement and shows a recovery instruction',async()=>{
  const {a,state,next}=cameraApp();
  try{await openSquat(a);next();next(800,{frozen:true});assert.match(a.w.document.getElementById('poseStatus').textContent,/frames paused/);assert.match(a.w.document.getElementById('poseFormCue').textContent,/paused/);assert.equal(a.w.IronSixPoseSpike.diagnostics().measurementValid,false);assert.equal(state.stops,0,'temporary stalls keep the camera available to recover')}finally{a.close()}
});
test('repeated inference failures stop the camera and expose a retry message',async()=>{
  const {a,state,next}=cameraApp();
  try{await openSquat(a);state.throwPose=true;for(let i=0;i<5;i++)next();assert.equal(state.stops,1);assert.match(a.w.document.getElementById('poseStatus').textContent,/analysis failed/);assert.equal(a.w.IronSixPoseSpike.diagnostics().inferenceErrors,5);assert.equal(a.w.document.getElementById('poseVideo').srcObject,null)}finally{a.close()}
});
test('person-detector ambiguity vetoes a pose even when the pose tracker would accept it',async()=>{
  const {a,state,next}=cameraApp();
  try{
    let inputs=[],ambiguous=false;
    a.w.IronSixPersonIsolation.createPersonTracker=()=>({reset(){},push(){},sample:()=>({locked:true,ambiguous,needsRelock:false,message:'Two people overlap your track.'}),observePose:()=>({locked:true}),diagnostics:()=>({})});
    a.w.IronSixRepCounter.createTracker=()=>({reset(){},push(poses){inputs.push(poses.length);return {landmarks:null,locked:true,side:0}},diagnostics:()=>({})});
    await openSquat(a);state.poses=[Array(33).fill({x:.5,y:.5,visibility:1})];next();ambiguous=true;next();
    assert.equal(inputs.at(-1),0);assert.match(a.w.document.getElementById('poseStatus').textContent,/Two people/);assert.equal(a.w.IronSixPoseSpike.diagnostics().measurementValid,false);
  }finally{a.close()}
});
