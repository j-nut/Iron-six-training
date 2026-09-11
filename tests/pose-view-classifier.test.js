const {test}=require('node:test');
const assert=require('node:assert/strict');
const view=require('../pose-view-classifier.js');
const synth=require('./helpers/pose-synth.js');

const A=synth.ASPECT;
function feed(c,yawAt,ms,{t0=0,fps=24,points=()=>synth.standing(),noise=0.003,seed=3}={}){
  const rand=synth.rng(seed);let s,t=t0;
  for(;t<t0+ms;t+=1000/fps)s=c.push(synth.frame(points(t),{yaw:yawAt(t),noise,rand}),t,A);
  return {state:s,t};
}

test('single-frame yaw estimate separates front, quarter and side views',()=>{
  for(const [yaw,lo,hi] of [[0,0,22],[45,32,58],[90,65,90],[-90,65,90],[180,0,22]]){
    const e=view.estimate(synth.frame(synth.standing(),{yaw}),A);
    assert(e.yaw>=lo&&e.yaw<=hi,`yaw ${yaw} estimated ${e.yaw.toFixed(1)}`);
  }
});

test('classifier labels front, front-quarter, side and rear views',()=>{
  for(const [yaw,label] of [[0,'front'],[45,'front-quarter'],[90,'side'],[-90,'side'],[180,'rear']]){
    const c=view.createViewClassifier();const {state}=feed(c,()=>yaw,1500);
    assert.equal(state.label,label,`yaw ${yaw}`);assert.equal(state.stable,true);
  }
});

test('a hip hinge keeps its view: side stays side at the bottom, front stays front',()=>{
  for(const [yaw,label] of [[90,'side'],[0,'front']]){
    const c=view.createViewClassifier();
    const {state}=feed(c,()=>yaw,4000,{points:t=>synth.hinge(85*(1-Math.cos(Math.PI*2*t/2000))/2)});
    assert.equal(state.label,label);
  }
});

test('one outlier frame does not change the view; a sustained turn does after the dwell',()=>{
  const c=view.createViewClassifier();let {t}=feed(c,()=>0,1200);
  let s=c.push(synth.frame(synth.standing(),{yaw:90}),t,A);t+=40;
  assert.equal(s.label,'front','a single side-looking frame must not flip the view');
  ({t}=feed(c,()=>0,300,{t0:t}));
  s=feed(c,()=>90,350,{t0:t}).state;assert.equal(s.label,'front','still inside the dwell');
  s=feed(c,()=>90,1200,{t0:t+350}).state;assert.equal(s.label,'side');
});

test('noise straddling a plane boundary does not flicker the label',()=>{
  const c=view.createViewClassifier(),labels=[];const rand=synth.rng(9);
  for(let t=0;t<6000;t+=40){const yaw=33+(rand()*2-1)*8;labels.push(c.push(synth.frame(synth.standing(),{yaw,noise:0.004,rand}),t,A).label)}
  const changes=labels.slice(1).filter((l,i)=>l!==labels[i]).length;
  assert(changes<=2,`label changed ${changes} times`);
});

test('a long dropout forgets the view; a short one keeps it',()=>{
  const c=view.createViewClassifier();let {t}=feed(c,()=>0,1200);
  let s;for(let k=0;k<10;k++){s=c.push(null,t,A);t+=40}
  assert.equal(s.label,'front');
  for(let k=0;k<50;k++){s=c.push(null,t,A);t+=40}
  assert.equal(s.label,'unknown');
});

test('works without MediaPipe z and on 2D fixtures where both shoulders coincide',()=>{
  const lm=synth.frame(synth.standing(),{yaw:90});for(const p of lm)delete p.z;
  assert(view.estimate(lm,A).yaw>65);
  const flat=Array.from({length:33},()=>({x:.5,y:.5,visibility:.01,presence:.01}));
  for(const [i,p] of [[11,{x:.53,y:.33}],[12,{x:.53,y:.33}],[23,{x:.5,y:.6}],[24,{x:.5,y:.6}]])flat[i]={...p,visibility:.95,presence:.95};
  assert(view.estimate(flat,1).yaw>80);
});

test('no torso means no estimate rather than a guess',()=>{
  assert.equal(view.estimate(null,A),null);
  const lm=synth.frame(synth.standing(),{yaw:0});lm[23].visibility=lm[24].visibility=0.1;
  assert.equal(view.estimate(lm,A),null);
});
