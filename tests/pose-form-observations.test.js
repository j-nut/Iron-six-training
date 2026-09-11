// The existing form-coach test hand-feeds counterState:{phase:'bottom'} next to an already-deep
// pose, so it never exercises WHEN the evaluator captures depth. That is precisely how a cue that
// fired on 100% of squat reps, at every depth, survived. These drive the real rep counter and the
// real evaluator together from synthetic side-view landmarks.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const sandbox={window:{},console,Math,Number,Array,Object,String,JSON,Date};
  vm.runInNewContext(fs.readFileSync('pose-rep-counter.js','utf8'),sandbox);
  vm.runInNewContext(fs.readFileSync('pose-form-coach.js','utf8'),sandbox);
  return {counter:sandbox.window.IronSixRepCounter,form:sandbox.window.IronSixFormCoach};
}

// Side-on squat. The knee angle drives everything: hip swings around the knee, so hip-vs-knee
// height follows the angle the way a real squat does, and the deepest frame is the lowest angle.
function squatPose(kneeAngle,lean=8){
  const rad=d=>d*Math.PI/180;
  const knee={x:0.50,y:0.60},ankle={x:0.50,y:0.80};
  const phi=rad(180-kneeAngle);
  const hip={x:knee.x+0.22*Math.sin(phi),y:knee.y-0.22*Math.cos(phi)};
  const shoulder={x:hip.x+0.30*Math.sin(rad(lean)),y:hip.y-0.30*Math.cos(rad(lean))};
  const lm=[];
  for(let i=0;i<33;i++)lm[i]={x:0.5,y:0.5,visibility:0.05};
  for(const [i,p] of [[11,shoulder],[12,shoulder],[23,hip],[24,hip],[25,knee],[26,knee],[27,ankle],[28,ankle]])
    lm[i]={x:p.x,y:p.y,visibility:0.95,presence:0.95};
  return lm;
}

function ramp(from,to,frames){
  const out=[];
  for(let i=0;i<frames;i++)out.push(from+(to-from)*(1-Math.cos(Math.PI*i/(frames-1)))/2);
  return out;
}

// Runs one rep through both, returning the evaluator snapshot after the counter logs it.
function rep(api,c,e,clock,{bottom=70,lean=8,half=30}={}){ // half=30 is a controlled ~2.4s squat
  const angles=[...Array(6).fill(175),...ramp(175,bottom,half),...ramp(bottom,175,half),...Array(6).fill(175)];
  let snap=null;
  for(const a of angles){
    const landmarks=squatPose(a,lean);
    const state=c.push({landmarks,t:clock.t,aspect:1,framed:true,side:0});
    snap=e.push({landmarks,side:0,t:clock.t,aspect:1,counterState:state});
    clock.t+=33;
  }
  return snap;
}

test('a set of consistent deep squats produces no form observation at all',()=>{
  // The old cue read hip-vs-knee at the first frame of the bottom band — a third of the descent
  // short of the real bottom — where the hip is geometrically forced to sit above the knee. It
  // therefore fired on every rep, including textbook ones, and drowned out every other cue.
  const {counter:api,form}=load();
  const rule=api.RULES.find(r=>r.id==='squat');
  const c=api.createCounter(rule),e=form.createEvaluator(rule),clock={t:0};
  let snap;
  for(let i=0;i<5;i++)snap=rep(api,c,e,clock);
  assert.equal(c.state().reps,5,'the counter must actually count these');
  assert.equal(snap.latest.issues.length,0,`a clean, deep, consistent rep has nothing to report, got ${snap.latest.issues}`);
  assert.equal(snap.repeatedCue,null,'and nothing gets promoted to a repeated cue');
  assert.equal(Object.keys(e.summary().issues).length,0,'the end-of-exercise summary stays empty too');
});

test('a genuinely rushed rep still gets the tempo note',()=>{
  const {counter:api,form}=load();
  const rule=api.RULES.find(r=>r.id==='squat');
  const c=api.createCounter(rule),e=form.createEvaluator(rule),clock={t:0};
  let snap;
  for(let i=0;i<3;i++)snap=rep(api,c,e,clock,{half:12});
  assert(snap.latest.issues.includes('tempo'),'a sub-second descent is worth a hedged note');
});

test('a rep that stops noticeably higher than the others is reported',()=>{
  const {counter:api,form}=load();
  const rule=api.RULES.find(r=>r.id==='squat');
  const c=api.createCounter(rule),e=form.createEvaluator(rule),clock={t:0};
  for(let i=0;i<3;i++)rep(api,c,e,clock);
  const shallow=rep(api,c,e,clock,{bottom:95});
  assert(shallow.latest.issues.includes('depthConsistency'),'a 25-degree shallower rep is worth flagging');
});

test('depth is measured at the real bottom, not where the counter enters the bottom band',()=>{
  const {counter:api,form}=load();
  const rule=api.RULES.find(r=>r.id==='squat');
  const c=api.createCounter(rule),e=form.createEvaluator(rule),clock={t:0};
  const snap=rep(api,c,e,clock);
  // At the 100-degree crossing the hip sits ABOVE the knee for this geometry; at the true bottom
  // it is below it. A negative recorded value means the old capture point is back.
  assert(snap.latest.depthRatio>0,`depth must be captured at the bottom, got ${snap.latest.depthRatio}`);
  assert(Math.abs(snap.latest.extreme-70)<8,'the counter records the true minimum knee angle');
});

test('a rep the counter rejected does not pin its numbers onto the next one',()=>{
  const {counter:api,form}=load();
  const rule=api.RULES.find(r=>r.id==='squat');
  const c=api.createCounter(rule),e=form.createEvaluator(rule),clock={t:0};
  // A fast bounce with a big torso collapse. The counter rejects it and logs nothing.
  rep(api,c,e,clock,{half:7,lean:70});
  assert.equal(c.state().reps,0);
  assert.equal(c.state().rejected,1,'this test needs the counter to actually reject that rep');
  const clean=rep(api,c,e,clock,{lean:8});
  assert.equal(c.state().reps,1);
  assert(clean.latest.maxLeanDelta<25,`the clean rep must not inherit the bounce's lean, got ${clean.latest.maxLeanDelta}`);
  assert(!clean.latest.issues.includes('torso'),'and must not be blamed for it');
});

test('a per-rep comment does not linger over an empty frame',()=>{
  const {counter:api,form}=load();
  const rule=api.RULES.find(r=>r.id==='squat');
  const c=api.createCounter(rule),e=form.createEvaluator(rule),clock={t:0};
  for(let i=0;i<4;i++)rep(api,c,e,clock);
  rep(api,c,e,clock,{bottom:95});
  assert(e.state().latest,'there should be a standing comment to clear');
  let snap=null;
  for(let i=0;i<200;i++){
    const state=c.push({landmarks:null,t:clock.t,aspect:1,framed:false});
    snap=e.push({landmarks:null,side:0,t:clock.t,aspect:1,counterState:state});
    clock.t+=33;
  }
  assert.equal(c.state().phase,'lost','the counter should report the track as lost');
  assert.equal(snap.latest,null,'the comment must not stand over a frame with nobody in it');
});

test('landmark jitter alone does not manufacture a torso cue',()=>{
  // maxLeanDelta was a max over per-frame samples, which under noise can only move one way.
  const {counter:api,form}=load();
  const rule=api.RULES.find(r=>r.id==='squat');
  const c=api.createCounter(rule),e=form.createEvaluator(rule),clock={t:0};
  let seed=7;const rand=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff-0.5};
  let flagged=0;
  for(let i=0;i<12;i++){
    const angles=[...Array(6).fill(175),...ramp(175,70,30),...ramp(70,175,30),...Array(6).fill(175)];
    let snap=null;
    for(const a of angles){
      const landmarks=squatPose(a,8);
      for(const idx of [11,12,23,24,25,26,27,28]){landmarks[idx].x+=rand()*0.012;landmarks[idx].y+=rand()*0.012}
      const state=c.push({landmarks,t:clock.t,aspect:1,framed:true,side:0});
      snap=e.push({landmarks,side:0,t:clock.t,aspect:1,counterState:state});
      clock.t+=33;
    }
    if(snap?.latest?.issues.includes('torso'))flagged++;
  }
  assert(flagged<=1,`an upright lifter should not be told their torso moved; flagged ${flagged}/12 reps`);
});
