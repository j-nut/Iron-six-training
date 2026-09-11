// tests/pose-tracking.test.js exercises counterApi.createTracker — but pose-form-coach.js REPLACES
// that with createSubjectTracker whenever `window` exists, so in a browser none of those guarantees
// are the ones running. These tests drive the tracker that actually ships.
//
// The failure that matters is not "loses the lock". It is attributing someone else's reps to the
// lifter, which silently corrupts the log the load recommendations are built from.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const sandbox={window:{},console,Math,Number,Array,Object,String,JSON,Date,Set,Infinity};
  vm.runInNewContext(fs.readFileSync('pose-rep-counter.js','utf8'),sandbox);
  vm.runInNewContext(fs.readFileSync('pose-form-coach.js','utf8'),sandbox);
  vm.runInNewContext(fs.readFileSync('pose-person-isolation.js','utf8'),sandbox);
  const counter=sandbox.window.IronSixRepCounter;
  return {counter,form:sandbox.window.IronSixFormCoach,iso:sandbox.window.IronSixPersonIsolation,
          squat:counter.RULES.find(r=>r.id==='squat'),curl:counter.RULES.find(r=>r.id==='curl')};
}

// A whole body at a given horizontal position. `arms` adds elbows/wrists; `legs:false` drops the
// lower body entirely, which is how a curl filmed per its own setup instructions actually looks.
function person({cx=0.5,cy=0.5,scale=0.19,conf=0.9,arms=false,legs=true}={}){
  const lm=[];
  for(let i=0;i<33;i++)lm[i]={x:0.5,y:0.5,visibility:0.02,presence:0.02};
  const put=(i,x,y,c=conf)=>{lm[i]={x,y,visibility:c,presence:c}};
  const shoulderY=cy-scale/2,hipY=cy+scale/2;
  put(11,cx,shoulderY);put(12,cx+0.02,shoulderY);
  put(23,cx,hipY);put(24,cx+0.02,hipY);
  if(legs){put(25,cx,hipY+0.18);put(26,cx+0.02,hipY+0.18);put(27,cx,hipY+0.34);put(28,cx+0.02,hipY+0.34)}
  if(arms){put(13,cx-0.05,shoulderY+0.10);put(14,cx+0.07,shoulderY+0.10);put(15,cx-0.05,shoulderY+0.20);put(16,cx+0.07,shoulderY+0.20)}
  return lm;
}

// Locks the tracker onto one body by holding it still long enough to satisfy the acquire window.
function acquire(tracker,pose,{frames=24,step=33}={}){
  let t=0,r=null;
  for(let i=0;i<frames;i++){r=tracker.push([pose],t,1,{subjectPresent:true});t+=step}
  assert(r.locked,'setup failed: the tracker never locked on');
  return {t,result:r};
}

const hipX=landmarks=>landmarks&&landmarks[23]?landmarks[23].x:null;

test('a stranger cannot inherit the lock when the lifter drops out for a frame',()=>{
  // One missing frame used to transfer the lock permanently to a body up to a third of the frame
  // away, and their reps were then logged as the lifter's.
  const {form,squat}=load();
  const tracker=form.createSubjectTracker(squat);
  const lifter=person({cx:0.42}),stranger=person({cx:0.64});
  let {t}=acquire(tracker,lifter);
  let adopted=false;
  for(let i=0;i<40;i++){
    const r=tracker.push([stranger],t,1,{subjectPresent:true});
    if(r.landmarks&&Math.abs(hipX(r.landmarks)-0.64)<0.03)adopted=true;
    t+=33;
  }
  assert(!adopted,'the tracker must not start returning the other person as the lifter');
});

test('the adoption envelope is bounded rather than a third of the frame',()=>{
  const {form,squat}=load();
  // Closer than about 0.6 torso widths a stranger and the lifter-having-moved are genuinely
  // indistinguishable without an appearance model, which this deliberately does not have.
  for(const dx of [0.20,0.35]){
    const tracker=form.createSubjectTracker(squat);
    const lifter=person({cx:0.50});
    let {t}=acquire(tracker,lifter);
    const r=tracker.push([person({cx:0.50+dx})],t,1,{subjectPresent:true});
    const took=r.landmarks&&Math.abs(hipX(r.landmarks)-(0.50+dx))<0.03;
    assert(!took,`a body ${dx} of the frame away must not be adopted on sight`);
  }
});

test('coasting on a held person box is bounded, not indefinite',()=>{
  // The presence branch returned before the elapsed-time check, so nobody in frame for five
  // minutes still reported a live lock — and the next person to walk in inherited it.
  const {form,squat}=load();
  const tracker=form.createSubjectTracker(squat);
  let {t}=acquire(tracker,person({cx:0.42}));
  let relockAt=null;
  for(let i=0;i<400&&relockAt===null;i++){
    const r=tracker.push([],t,1,{subjectPresent:true});
    if(r.needsRelock)relockAt=t;
    t+=33;
  }
  assert(relockAt!==null,'an empty frame must eventually demand a re-lock');
  assert(relockAt<12000,`it should not take ${relockAt}ms of nobody being there`);
});

test('a demanded re-lock is not cancelled by a person box merely existing',()=>{
  const {form,squat}=load();
  const tracker=form.createSubjectTracker(squat);
  let {t}=acquire(tracker,person({cx:0.38}));
  let r=null;
  for(let i=0;i<220;i++){r=tracker.push([],t,1,{subjectPresent:false});t+=33}
  assert.equal(r.needsRelock,true,'setup failed: the tracker should have given up by now');
  // subjectPresent only means "some person box exists", and that box may be the wrong person.
  const stranger=person({cx:0.63});
  for(let i=0;i<30;i++){
    r=tracker.push([stranger],t,1,{subjectPresent:true});
    assert.equal(r.needsRelock,true,'the re-lock must stand until the user asks for one');
    assert.equal(r.landmarks,null,'and nothing may be tracked in the meantime');
    t+=33;
  }
});

test('a curl filmed the way its own setup text instructs can actually lock',()=>{
  // Side chains were the legs for every exercise, so a curl framed with knees out of shot — which
  // is what RULES.curl.setup asks for — could never lock at all.
  const {form,curl}=load();
  const tracker=form.createSubjectTracker(curl);
  const lifter=person({cx:0.5,arms:true,legs:false});
  let t=0,r=null;
  for(let i=0;i<30;i++){r=tracker.push([lifter],t,1,{subjectPresent:true});t+=33}
  assert.equal(r.locked,true,`an arms-only curl framing must lock; got "${r.message}"`);
  assert(r.side===0||r.side===1,'and must pick a working arm');
});

test('the tracked side for an arm exercise does not follow the legs',()=>{
  // A leg hidden by a bench used to flip the working side mid-set, after which the counter read
  // the resting arm as "back at the top" and banked a rep the lifter never performed.
  const {form,curl}=load();
  const tracker=form.createSubjectTracker(curl);
  let t=0,r=null;
  for(let i=0;i<30;i++){r=tracker.push([person({cx:0.5,arms:true})],t,1,{subjectPresent:true});t+=33}
  const side=r.side;
  let flips=0;
  for(let i=0;i<60;i++){
    // Both arms stay clearly visible; the legs vanish.
    const body=person({cx:0.5,arms:true,legs:false});
    r=tracker.push([body],t,1,{subjectPresent:true});
    if(r.locked&&r.side!==side)flips++;
    t+=33;
  }
  assert.equal(flips,0,'losing the legs must not change which arm is being counted');
});

test('the person box does not jump to a body it does not overlap at all',()=>{
  const {iso}=load();
  const tracker=iso.createPersonTracker();
  let t=0;
  for(;t<=400;t+=55)tracker.push([{x:0.35,y:0.12,w:0.30,h:0.76}],t);
  const before=tracker.diagnostics().box.x;
  const r=tracker.push([{x:0.02,y:0.10,w:0.30,h:0.80}],455);
  assert.equal(iso.iou({x:0.35,y:0.12,w:0.30,h:0.76},{x:0.02,y:0.10,w:0.30,h:0.80}),0,'setup: these must not overlap');
  assert(Math.abs(tracker.diagnostics().box.x-before)<0.1,'the lock must not teleport onto a non-overlapping body');
  assert.equal(r.visible,false,'and it must not report that as seeing the user');
});

test('a spurious second detection off to the side does not block the lock',()=>{
  // The pose model is asked for up to three poses, and requiring EXACTLY one viable candidate meant
  // any flickering extra body refused the lock outright — which reads as "it only locks when I do a
  // perfect rep".
  const {form,squat}=load();
  const tracker=form.createSubjectTracker(squat);
  const lifter=person({cx:0.50}),ghost=person({cx:0.82,scale:0.13});
  let t=0,r=null;
  for(let i=0;i<24;i++){r=tracker.push([lifter,ghost],t,1,{subjectPresent:true});t+=33}
  assert.equal(r.locked,true,`a clearly central lifter must lock; got "${r.message}"`);
  assert(Math.abs(hipX(r.landmarks)-0.50)<0.03,'and it must lock onto the central one, not the ghost');
});

test('two equally central people still refuse to lock',()=>{
  const {form,squat}=load();
  const tracker=form.createSubjectTracker(squat);
  let t=0,r=null;
  for(let i=0;i<24;i++){r=tracker.push([person({cx:0.44}),person({cx:0.56})],t,1,{subjectPresent:true});t+=33}
  assert.equal(r.locked,false,'genuine ambiguity must not be resolved by guessing');
  assert.match(r.message,/central|centre/i);
});
