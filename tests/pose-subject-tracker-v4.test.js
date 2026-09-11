const {test}=require('node:test');
const assert=require('node:assert/strict');
const counter=require('../pose-rep-counter.js');
const form=require('../pose-form-coach.js');
const squat=counter.RULES.find(r=>r.id==='squat');

function pose({x=0,near=0.78,far=0.08,depth=0}={}){
  const p=Array.from({length:33},()=>({x:0.5,y:0.45,visibility:0.03,presence:0.03}));
  const side=(base,offset,confidence)=>{
    const hipX=0.48+x+offset;
    p[11+base]={x:hipX,y:0.22+depth*0.17,visibility:confidence,presence:confidence};
    p[23+base]={x:hipX,y:0.43+depth*0.17,visibility:confidence,presence:confidence};
    p[25+base]={x:hipX+depth*0.04,y:0.63,visibility:confidence,presence:confidence};
    p[27+base]={x:hipX,y:0.84,visibility:confidence,presence:confidence};
  };
  side(0,0,near);side(1,0.025,far);return p;
}
function acquire(tracker,p,start=0){let r;for(let t=start;t<=start+600;t+=33)r=tracker.push([p],t,1);return {r,t:start+627}}

test('true side profile locks with one usable body side and the far side hidden',()=>{
  const tracker=form.createSubjectTracker(squat),{r}=acquire(tracker,pose({near:0.52,far:0.06}));
  assert(r.landmarks,'one-side pose should acquire');
  assert.equal(r.locked,true);assert.equal(r.side,0);assert.equal(r.tier,'high');
});

test('existing lock survives a low-confidence side-profile dip instead of becoming a new person',()=>{
  const tracker=form.createSubjectTracker(squat),{t}=acquire(tracker,pose({near:0.72,far:0.05}));
  const r=tracker.push([pose({near:0.24,far:0.04,x:0.004})],t,1);
  assert(r.landmarks,'low-confidence matching pose should recover the existing subject');
  assert.equal(r.locked,true);assert.equal(r.needsRelock,false);assert.equal(r.tier,'low');
  assert.equal(tracker.diagnostics().lowConfidenceMatches,1);
});

test('a distant high-confidence bystander cannot replace the locked lifter',()=>{
  const tracker=form.createSubjectTracker(squat),{t}=acquire(tracker,pose({x:-0.08,near:0.8}));
  for(let i=0;i<10;i++){
    const user=pose({x:-0.08+i*0.002,near:0.3}),bystander=pose({x:0.28,near:0.98,far:0.95});
    const r=tracker.push(i%2?[bystander,user]:[user,bystander],t+i*33,1);
    assert(r.landmarks,'the nearby low-confidence user should remain associated');
    assert(Math.abs(r.landmarks[23].x-(0.40+i*0.002))<0.05,'tracker must not jump to the bystander');
  }
});

test('brief total occlusion coasts the identity but does not invent landmarks',()=>{
  const tracker=form.createSubjectTracker(squat),{t}=acquire(tracker,pose());
  for(let i=0;i<15;i++){
    const r=tracker.push([],t+i*33,1);assert.equal(r.landmarks,null);assert.equal(r.needsRelock,false);assert.equal(r.tier,'coast');
  }
  const recovered=tracker.push([pose({x:0.01,near:0.6})],t+15*33,1);
  assert(recovered.landmarks);assert.equal(recovered.needsRelock,false);
});

test('long loss never auto-locks onto somebody else',()=>{
  const tracker=form.createSubjectTracker(squat),{t}=acquire(tracker,pose({x:-0.08}));
  let r;for(let i=0;i<35;i++)r=tracker.push([pose({x:0.35,near:0.98,far:0.95})],t+i*33,1);
  assert.equal(r.landmarks,null);assert.equal(r.needsRelock,true);
  assert.equal(tracker.push([pose({x:-0.08})],t+1300,1).landmarks,null,'explicit re-lock is required after sustained loss');
});

test('overlapping plausible people pause association rather than choosing array order',()=>{
  const tracker=form.createSubjectTracker(squat),{t}=acquire(tracker,pose());
  const a=pose({x:0.015,near:0.8}),b=pose({x:-0.015,near:0.82});
  const r=tracker.push([a,b],t,1);
  assert.equal(r.landmarks,null);assert.equal(r.needsRelock,false);assert.equal(r.tier,'coast');
  assert(tracker.diagnostics().ambiguities>=1);
});
