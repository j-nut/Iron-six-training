// Rep counting is the whole question the camera spike exists to answer, so it is tested
// against synthetic landmark streams rather than only against a webcam. The failures that
// matter are not "misses a rep" — they are counting reps that never happened (jitter at the
// top, a bounce, a partial) and counting across a gap where the lifter was not visible.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const pose=require('../pose-rep-counter.js');

const FRAME_MS=33; // ~30fps, which is what a mid-range phone actually delivers

// Builds a 33-point pose whose tracked joint sits at exactly `theta` degrees. Everything the
// rule needs for framing is visible and inside the frame; everything else is not, matching
// what a real detector returns for body parts it cannot see.
function poseFrame(rule,theta,options){
  const {visibility=0.95,drop=[]}=options||{};
  const landmarks=[];
  for(let i=0;i<33;i++)landmarks[i]={x:0.5,y:0.5,visibility:0.05};
  rule.framing.forEach((index,n)=>{landmarks[index]={x:0.3+0.01*n,y:0.2+0.02*n,visibility}});
  rule.joint.forEach(([a,b,c],side)=>{
    const bx=0.4+side*0.12,by=0.5,radians=theta*Math.PI/180;
    landmarks[b]={x:bx,y:by,visibility};
    landmarks[a]={x:bx,y:by-0.2,visibility};
    landmarks[c]={x:bx+0.2*Math.sin(radians),y:by-0.2*Math.cos(radians),visibility};
  });
  for(const index of drop)landmarks[index]={...landmarks[index],visibility:0.05};
  return landmarks;
}

function feed(counter,rule,angles,clock,options){
  let t=clock.t,last=null;
  for(const theta of angles){last=counter.push({landmarks:poseFrame(rule,theta,options),t,aspect:1});t+=FRAME_MS}
  clock.t=t;
  return last;
}

function ramp(from,to,frames){
  const out=[];
  for(let i=0;i<frames;i++)out.push(from+(to-from)*(1-Math.cos(Math.PI*i/(frames-1)))/2);
  return out;
}

// One rep: hold at the top, descend, ascend, hold at the top again.
function repAngles(top,bottom,frames){return [...Array(6).fill(top),...ramp(top,bottom,frames),...ramp(bottom,top,frames),...Array(6).fill(top)]}

const squat=pose.RULES.find(r=>r.id==='squat');
const curl=pose.RULES.find(r=>r.id==='curl');
const pushup=pose.RULES.find(r=>r.id==='pushup');
const press=pose.RULES.find(r=>r.id==='press');

test('a clean set of five squats counts five',()=>{
  const counter=pose.createCounter(squat),clock={t:0};
  let state;
  for(let i=0;i<5;i++)state=feed(counter,squat,repAngles(175,85,30),clock);
  assert.equal(state.reps,5);
  assert.equal(state.rejected,0);
  assert.equal(state.log.length,5);
  assert(state.log.every(r=>r.extreme<=95),'each rep should record how deep it actually went');
});

test('shifting weight at the top does not count as reps',()=>{
  // Standing still is never perfectly still, and the landmarks jitter more than the lifter.
  const counter=pose.createCounter(squat),clock={t:0};
  const jitter=[];
  for(let i=0;i<200;i++)jitter.push(168+7*Math.sin(i/2));
  const state=feed(counter,squat,jitter,clock);
  assert.equal(state.reps,0,'small movement above the top threshold must never count');
});

test('a partial that never reaches the bottom does not count',()=>{
  const counter=pose.createCounter(squat),clock={t:0};
  let state;
  for(let i=0;i<4;i++)state=feed(counter,squat,repAngles(175,125,30),clock);
  assert.equal(state.reps,0,'quarter squats are not reps of the movement being counted');
});

test('a bounce faster than a real rep is rejected, not counted',()=>{
  const counter=pose.createCounter(squat),clock={t:0};
  const state=feed(counter,squat,repAngles(175,85,8),clock); // a ~0.5s dip, under minActiveMs
  assert.equal(state.reps,0);
  assert.equal(state.rejected,1,'the rejection is recorded so the spike can report it');
});

test('starting the camera mid-rep waits for the top before counting',()=>{
  const counter=pose.createCounter(squat),clock={t:0};
  // Tracking begins with the lifter already at the bottom.
  let state=feed(counter,squat,[...Array(10).fill(88),...ramp(88,175,25)],clock);
  assert.equal(state.reps,0,'the rep that was already underway must not be counted');
  state=feed(counter,squat,repAngles(175,85,30),clock);
  assert.equal(state.reps,1,'the next full rep counts normally');
});

test('an ordinary one-second-per-rep cadence counts',()=>{
  // The duration floor measures time below the top threshold, not the whole rep. Read as rep
  // duration it rejects a normal cadence outright and reports every rep as a bounce.
  for(const [rule,top,bottom] of [[squat,175,85],[curl,165,45],[pushup,170,85],[press,60,175]]){
    const counter=pose.createCounter(rule),clock={t:0};
    let state;
    for(let i=0;i<5;i++)state=feed(counter,rule,repAngles(top,bottom,15),clock); // ~1.0s per rep
    assert.equal(state.reps,5,`${rule.id} should count a one-second cadence`);
    assert.equal(state.rejected,0,`${rule.id} should not call a normal rep a bounce`);
  }
});

test('flickering occlusion re-arms just like a solid one',()=>{
  // Real occlusion is intermittent. A consecutive-null counter never fires on it, and the
  // machine bridges a gap it was effectively blind through — inventing a rep.
  const counter=pose.createCounter(squat),clock={t:0};
  const knees=[squat.joint[0][1],squat.joint[1][1]];
  feed(counter,squat,[...Array(6).fill(175),...ramp(175,85,25)],clock);
  assert.equal(counter.state().reps,0);
  // 270 frames in which the knees are visible only one frame in fifteen.
  for(let i=0;i<270;i++)feed(counter,squat,[85],clock,i%15===0?{}:{drop:knees});
  const state=feed(counter,squat,ramp(85,175,25),clock);
  assert.equal(state.reps,0,'a mostly-blind stretch must not be bridged into a rep');
});

test('a frame the caller marks badly framed is not counted',()=>{
  // The angle still computes when a lifter is half out of shot, and it still looks plausible.
  const counter=pose.createCounter(squat);
  let t=0;
  for(let i=0;i<4;i++)for(const theta of repAngles(175,85,20)){
    counter.push({landmarks:poseFrame(squat,theta),t,aspect:1,framed:false});t+=FRAME_MS;
  }
  assert.equal(counter.state().reps,0,'reps must not accumulate while framing is bad');
  // Counting resumes once framing is good again, after the quality window refills — about
  // half a second, so the rep in progress at the moment of recovery is not counted.
  const clock={t};
  let state;
  for(let i=0;i<2;i++)state=feed(counter,squat,repAngles(175,85,20),clock);
  assert(state.reps>=1,'counting must resume when the lifter is back in shot');
});

test('a brief occlusion keeps the rep; a long one re-arms from the top',()=>{
  const brief=pose.createCounter(squat),clock={t:0};
  const [hip]=squat.joint[0],[hip2]=squat.joint[1];
  feed(brief,squat,[...Array(6).fill(175),...ramp(175,85,25)],clock);
  feed(brief,squat,Array(5).fill(85),clock,{drop:[hip,hip2,squat.joint[0][1],squat.joint[1][1]]});
  let state=feed(brief,squat,ramp(85,175,25),clock);
  assert.equal(state.reps,1,'a few dropped frames mid-rep should not lose the rep');
  assert(state.dropped>0,'the dropped frames are still reported');

  const long=pose.createCounter(squat),clock2={t:0};
  feed(long,squat,[...Array(6).fill(175),...ramp(175,85,25)],clock2);
  feed(long,squat,Array(40).fill(85),clock2,{drop:[squat.joint[0][1],squat.joint[1][1]]});
  state=feed(long,squat,ramp(85,175,25),clock2);
  assert.equal(state.reps,0,'the counter must not count across a gap where it could not see the lifter');
});

test('the overhead press counts even though it finishes straight',()=>{
  // top < bottom for this rule, so the comparisons invert. This is the case that silently
  // counts zero reps forever if the inversion is dropped.
  assert(press.top<press.bottom);
  const counter=pose.createCounter(press),clock={t:0};
  let state;
  for(let i=0;i<3;i++)state=feed(counter,press,repAngles(60,175,30),clock);
  assert.equal(state.reps,3);
});

test('curls and push-ups count on the same machine',()=>{
  for(const [rule,top,bottom] of [[curl,165,45],[pushup,170,85]]){
    const counter=pose.createCounter(rule),clock={t:0};
    let state;
    for(let i=0;i<4;i++)state=feed(counter,rule,repAngles(top,bottom,28),clock);
    assert.equal(state.reps,4,`${rule.id} should count four reps`);
  }
});

test('framing names the body part that is out of shot',()=>{
  const ok=pose.framing(squat,poseFrame(squat,175));
  assert.equal(ok.ok,true);

  const noAnkles=poseFrame(squat,175,{drop:[pose.POINTS.LANKLE,pose.POINTS.RANKLE]});
  const bad=pose.framing(squat,noAnkles);
  assert.equal(bad.ok,false);
  assert.deepEqual(bad.missing,['ankles']);
  assert(bad.message.includes('ankles'),'the lifter needs to be told what to fix, not "no pose detected"');

  assert.equal(pose.framing(squat,[]).ok,false);
});

test('angles are corrected for frame aspect ratio',()=>{
  // Landmarks are normalized per axis, so a wide frame stretches x. Measuring without the
  // correction reads a different angle for the same body position.
  const a={x:0.5,y:0.3},b={x:0.5,y:0.5},c={x:0.7,y:0.5};
  assert.equal(Math.round(pose.angle(a,b,c,1)),90);
  const wide=pose.angle({x:0.5,y:0.3},{x:0.5,y:0.5},{x:0.6,y:0.6},16/9);
  const square=pose.angle({x:0.5,y:0.3},{x:0.5,y:0.5},{x:0.6,y:0.6},1);
  assert.notEqual(Math.round(wide),Math.round(square),'aspect must actually reach the measurement');
});

test('a joint the detector cannot see yields no angle rather than a plausible one',()=>{
  const hidden=poseFrame(squat,120,{drop:[pose.POINTS.LKNEE,pose.POINTS.RKNEE]});
  assert.equal(pose.jointAngle(squat,hidden,1),null);
  const oneSide=poseFrame(squat,120,{drop:[pose.POINTS.LKNEE]});
  assert(Math.abs(pose.jointAngle(squat,oneSide,1)-120)<1,'one clearly visible side is enough');
});

test('exercises are matched to rules by name, and unmatched ones get nothing',()=>{
  assert.equal(pose.ruleFor({name:'Goblet squat',base:'squat'})?.id,'squat');
  assert.equal(pose.ruleFor({name:'Dumbbell biceps curl'})?.id,'curl');
  assert.equal(pose.ruleFor({name:'Lying leg curl'}),null,'a leg curl is not an elbow movement');
  assert.equal(pose.ruleFor({name:'Barbell deadlift',base:'hinge'}),null,'unvalidated movements must not offer camera counting');
  assert.equal(pose.ruleFor(null),null);
});

test('variants that are known to track badly say so instead of being quietly excluded',()=>{
  assert(pose.cautionFor({name:'Barbell Back Squat'}),'a racked bar occludes the hips and the lifter should be told');
  assert(pose.cautionFor({name:'Dumbbell Bulgarian Split Squat'}),'a staggered stance needs a camera angle warning');
  assert.equal(pose.cautionFor({name:'Goblet squat'}),null,'the variant this is actually good at needs no warning');
  assert.equal(pose.cautionFor(null),null);
  // A caution must never become a silent exclusion — the movement still offers counting.
  assert.equal(pose.ruleFor({name:'Barbell Back Squat',base:'squat'})?.id,'squat');
});

test('reset clears the count without rebuilding the counter',()=>{
  const counter=pose.createCounter(squat),clock={t:0};
  feed(counter,squat,repAngles(175,85,30),clock);
  assert.equal(counter.state().reps,1);
  counter.reset();
  assert.equal(counter.state().reps,0);
  assert.equal(counter.state().phase,'waiting');
});
