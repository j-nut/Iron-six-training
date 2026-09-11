const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../pose-rep-counter.js');
const rule=api.RULES.find(r=>r.id==='squat');

function person({x=0,y=0,depth=0,jitter=0}={}){
  const p=Array.from({length:33},()=>({x:0.5,y:0.4,visibility:0.1,presence:0.1}));
  for(let side=0;side<2;side++){
    const offset=side*0.05,hipX=0.45-depth*0.17;
    for(const [i,px,py] of [[11,hipX,0.18+depth*0.2],[23,hipX,0.42+depth*0.2],[25,0.45+depth*0.03,0.60],[27,0.45,0.82]])
      p[i+side]={x:px+offset+x+(i===25?jitter:0),y:py+y,visibility:side?0.82:0.96,presence:0.96};
  }
  return p;
}
function acquire(tracker,pose=person(),start=0){
  let r;
  for(let t=start;t<=start+1100;t+=33)r=tracker.push([pose],t,1);
  assert(r.landmarks,'a clear stationary lifter should lock');
  return start+1122;
}
function spread(a){const avg=a.reduce((n,x)=>n+x,0)/a.length;return Math.sqrt(a.reduce((n,x)=>n+(x-avg)**2,0)/a.length)}

test('locks only after stable acquisition and draws only the working side',()=>{
  const tracker=api.createTracker(rule);
  assert.equal(tracker.push([person()],0).landmarks,null);
  const t=acquire(tracker),r=tracker.push([person()],t);
  assert.equal(r.side,0);
  assert(r.landmarks[25].visibility>0.7);
  assert.equal(r.landmarks[26].visibility,0);
  assert.equal(r.landmarks[0].visibility,0);
});

test('stationary leg jitter is reduced before rendering and measurement',()=>{
  const tracker=api.createTracker(rule),start=acquire(tracker),raw=[],filtered=[];
  for(let i=0;i<90;i++){
    const pose=person({jitter:0.012*Math.sin(i*2.2)}),r=tracker.push([pose],start+i*33);
    assert(r.landmarks);
    if(i>10){raw.push(pose[25].x);filtered.push(r.landmarks[25].x)}
  }
  assert(spread(filtered)<spread(raw)*0.6,'must remove jitter, not just rename raw landmarks');
});

test('both legs are never averaged and confidence flicker cannot switch the working leg',()=>{
  const tracker=api.createTracker(rule),t=acquire(tracker),p=person();
  p[26].x=0.9;p[26].visibility=1;
  const r=tracker.push([p],t);
  assert.equal(r.side,0);
  assert.equal(api.jointAngle(rule,r.landmarks,1),180);
  p[25].visibility=0.2;
  assert.equal(tracker.push([p],t+33).landmarks,null);
});

test('rejects non-finite, low-presence and off-frame working joints',()=>{
  for(const changes of [{x:NaN},{presence:0.2},{x:1.1}]){
    const tracker=api.createTracker(rule),t=acquire(tracker),p=person();
    Object.assign(p[25],changes);
    assert.equal(tracker.push([p],t).landmarks,null);
  }
});

test('rejects an implausible joint teleport before smoothing it',()=>{
  const tracker=api.createTracker(rule),t=acquire(tracker),p=person();
  p[25].x+=0.4;
  assert.equal(tracker.push([p],t).landmarks,null);
});

test('stable subject survives result reordering and a distant bystander',()=>{
  const tracker=api.createTracker(rule),t=acquire(tracker);
  for(let i=0;i<30;i++){
    const user=person(),bystander=person({x:0.4}),poses=i%2?[user,bystander]:[bystander,user];
    const r=tracker.push(poses,t+i*33);
    assert(r.landmarks);
    assert(Math.abs(r.landmarks[23].x-0.45)<0.01);
  }
});

test('multiple people in the acquisition region never select an arbitrary person',()=>{
  const tracker=api.createTracker(rule);
  for(let t=0;t<2000;t+=33)assert.equal(tracker.push([person(),person({x:0.18})],t).landmarks,null);
});

test('crossing ambiguity latches paused until explicit re-lock',()=>{
  const tracker=api.createTracker(rule),t=acquire(tracker);
  const r=tracker.push([person(),person({x:0.06})],t);
  assert.equal(r.needsRelock,true);
  for(let i=1;i<40;i++)assert.equal(tracker.push([person()],t+i*33).landmarks,null);
  tracker.reset();acquire(tracker,person(),t+1500);
});

test('losing the user does not lock onto a distant person or auto-reacquire later',()=>{
  const tracker=api.createTracker(rule),t=acquire(tracker);
  for(let i=0;i<30;i++)assert.equal(tracker.push([person({x:0.4})],t+i*33).landmarks,null);
  assert.equal(tracker.diagnostics().needsRelock,true);
  assert.equal(tracker.push([person()],t+1100).landmarks,null);
});

test('an inference time gap requires explicit re-lock even when the next pose matches',()=>{
  const tracker=api.createTracker(rule),t=acquire(tracker);
  assert.equal(tracker.push([person()],t+900).needsRelock,true);
});

test('invalid frames break the acquisition dwell',()=>{
  const tracker=api.createTracker(rule);
  for(let t=0;t<800;t+=33)tracker.push([person()],t);
  tracker.push([],800);
  assert.equal(tracker.push([person()],1100).landmarks,null);
});

test('tracker and counter count deliberate squats without false stillness reps',()=>{
  const tracker=api.createTracker(rule),counter=api.createCounter(rule);
  let t=0;
  function feed(p){const r=tracker.push([p],t);if(!r.landmarks)counter.interrupt();counter.push({landmarks:r.landmarks,t,aspect:1});t+=33}
  for(let i=0;i<80;i++)feed(person({jitter:0.009*Math.sin(i*2)}));
  assert.equal(counter.state().reps,0);
  for(let rep=0;rep<3;rep++){
    for(let i=0;i<40;i++)feed(person({depth:(1-Math.cos(Math.PI*i/39))/2}));
    for(let i=0;i<12;i++)feed(person({depth:1}));
    for(let i=0;i<40;i++)feed(person({depth:(1+Math.cos(Math.PI*i/39))/2}));
    for(let i=0;i<15;i++)feed(person());
  }
  assert.equal(counter.state().reps,3);
  assert.equal(tracker.diagnostics().needsRelock,false);
  counter.interrupt();
  assert.equal(counter.state().reps,3,'re-lock must retain completed reps');
  assert.equal(counter.state().angle,null,'uncertain tracking must clear the angle');
});

test('tracking loss at the bottom cannot complete a rep after returning',()=>{
  const tracker=api.createTracker(rule),counter=api.createCounter(rule);
  let t=0;
  const feed=poses=>{const r=tracker.push(poses,t);if(!r.landmarks)counter.interrupt();counter.push({landmarks:r.landmarks,t,aspect:1});t+=33};
  for(let i=0;i<70;i++)feed([person()]);
  for(let i=0;i<40;i++)feed([person({depth:i/39})]);
  for(let i=0;i<10;i++)feed([person({depth:1})]);
  feed([]);
  for(let i=0;i<40;i++)feed([person({depth:1-i/39})]);
  for(let i=0;i<20;i++)feed([person()]);
  assert.equal(counter.state().reps,0);
});
