const {test}=require('node:test');
const assert=require('node:assert/strict');
const pose=require('../pose-rep-counter.js');
const squat=pose.RULES.find(r=>r.id==='squat');
const FRAME=33;

function sideFrame(theta,{near=.52,far=.08}={}){
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:.02,presence:.02}));
  function chain(base,x,c){
    const r=theta*Math.PI/180,bx=x,by=.55;
    p[11+base]={x,y:.24,visibility:c,presence:c};
    p[23+base]={x,y:.44,visibility:c,presence:c};
    p[25+base]={x:bx,y:by,visibility:c,presence:c};
    p[27+base]={x:bx+.19*Math.sin(r),y:by-.19*Math.cos(r),visibility:c,presence:c};
  }
  chain(0,.44,near);chain(1,.56,far);return p;
}
function ramp(a,b,n){return Array.from({length:n},(_,i)=>a+(b-a)*(1-Math.cos(Math.PI*i/(n-1)))/2)}
function rep(){return [...Array(6).fill(175),...ramp(175,85,30),...ramp(85,175,30),...Array(6).fill(175)]}

test('selected near side counts a side-profile squat while hidden far side is ignored',()=>{
  const counter=pose.createCounter(squat),angles=rep();let state,t=0;
  for(const theta of angles){state=counter.push({landmarks:sideFrame(theta),t,aspect:1,side:0,subjectPresent:true});t+=FRAME}
  assert.equal(state.reps,1);assert.equal(state.rejected,0);
});

test('side-profile confidence between old 0.60 cutoff and new threshold remains measurable',()=>{
  const landmarks=sideFrame(120,{near:.46,far:.05});
  assert(pose.jointAngle(squat,landmarks,1,0)!==null,'near-side 0.46 landmarks should be usable');
  assert.equal(pose.jointAngle(squat,landmarks,1,1),null,'hidden far side should stay unusable');
});

test('working-side framing does not require the occluded far side',()=>{
  const framed=pose.framing(squat,sideFrame(170,{near:.7,far:.03}),0);
  assert.equal(framed.ok,true);
});

test('person isolation lets a short pose dropout keep an in-progress rep alive',()=>{
  const counter=pose.createCounter(squat);let t=0,state;
  const down=[...Array(6).fill(175),...ramp(175,85,24)];
  for(const theta of down){state=counter.push({landmarks:sideFrame(theta,{near:.6}),t,aspect:1,side:0,subjectPresent:true});t+=FRAME}
  for(let i=0;i<28;i++){state=counter.push({landmarks:null,t,aspect:1,side:0,subjectPresent:true});t+=FRAME}
  for(const theta of ramp(85,175,24)){state=counter.push({landmarks:sideFrame(theta,{near:.6}),t,aspect:1,side:0,subjectPresent:true});t+=FRAME}
  assert.equal(state.reps,1,'~0.9 s pose dropout should not erase the rep while the person box remains locked');
});

test('the same long pose dropout resets when person isolation is not present',()=>{
  const counter=pose.createCounter(squat);let t=0,state;
  for(const theta of [...Array(6).fill(175),...ramp(175,85,24)]){state=counter.push({landmarks:sideFrame(theta,{near:.6}),t,aspect:1,side:0});t+=FRAME}
  for(let i=0;i<28;i++){state=counter.push({landmarks:null,t,aspect:1,side:0});t+=FRAME}
  for(const theta of ramp(85,175,24)){state=counter.push({landmarks:sideFrame(theta,{near:.6}),t,aspect:1,side:0});t+=FRAME}
  assert.equal(state.reps,0,'without an independent person lock the counter must not infer across the gap');
});
