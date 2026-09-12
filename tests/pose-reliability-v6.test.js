const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const api=require('../pose-rep-counter.js');
const form=require('../pose-form-coach.js');
const iso=require('../pose-person-isolation.js');
const squat=api.ruleFor({name:'Goblet squat'});
function pose(theta=175,cx=.5){
  const rad=d=>d*Math.PI/180,knee={x:cx,y:.6},ankle={x:cx,y:.8};
  const hip={x:cx+.22*Math.sin(rad(180-theta)),y:.6-.22*Math.cos(rad(180-theta))};
  const shoulder={x:hip.x+.03,y:hip.y-.27};
  const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:.01,presence:.01}));
  for(const [i,p] of [[11,shoulder],[12,shoulder],[23,hip],[24,hip],[25,knee],[26,knee],[27,ankle],[28,ankle]])lm[i]={...p,visibility:.95,presence:.95};
  return lm;
}
const ramp=(a,b,n=30)=>Array.from({length:n},(_,i)=>a+(b-a)*(1-Math.cos(Math.PI*i/(n-1)))/2);
const rep=[...Array(6).fill(175),...ramp(175,80),...ramp(80,175),...Array(6).fill(175)];
function feed(c,angles,clock,extra={}){for(const a of angles){c.push({landmarks:a===null?null:pose(a),t:clock.t,side:0,aspect:1,...extra});clock.t+=33}return c.state()}

test('no frames during a camera stall cannot finish the rep in progress',()=>{
  const c=api.createCounter(squat),clock={t:0};
  feed(c,[...Array(6).fill(175),...ramp(175,80)],clock,{subjectPresent:true});
  clock.t+=2500;
  feed(c,ramp(80,175),clock,{subjectPresent:true});
  assert.equal(c.state().reps,0);
  assert.equal(feed(c,rep,clock).reps,1,'a fresh complete rep still counts');
});
test('first good frame after an overdue dropout re-arms before accepting its angle',()=>{
  const c=api.createCounter(squat),clock={t:0};feed(c,[...Array(6).fill(175),...ramp(175,80)],clock);
  feed(c,[null],clock);clock.t+=700;
  assert.equal(feed(c,ramp(80,175),clock).reps,0);
});
test('duplicate and backwards timestamps cannot manufacture evidence',()=>{
  const c=api.createCounter(squat),clock={t:0};feed(c,Array(8).fill(175),clock);
  for(const t of [clock.t-33,clock.t-100])for(const a of rep)c.push({landmarks:pose(a),t,side:0});
  assert.equal(c.state().reps,0);
});
test('a missing measurement is reported immediately even while rep continuity is held',()=>{
  const c=api.createCounter(squat),clock={t:0};feed(c,Array(8).fill(175),clock);
  assert.equal(c.state().measurementValid,true);feed(c,[null],clock,{subjectPresent:true});
  assert.equal(c.state().measurementValid,false);assert.equal(c.state().tracking,false);
});
test('browser-installed counter interrupts immediately on side change and keeps completed reps',()=>{
  const w={window:{},console};vm.createContext(w);
  for(const f of ['pose-rep-counter.js','pose-form-coach.js','pose-form-continuity.js'])vm.runInContext(fs.readFileSync(f,'utf8'),w);
  const c=w.window.IronSixRepCounter.createCounter(squat),clock={t:0};feed(c,rep,clock);
  feed(c,[...Array(6).fill(175),...ramp(175,80)],clock);c.interrupt();
  assert.equal(c.state().phase,'lost','a single interrupt must take effect');
  assert.equal(feed(c,ramp(80,175),clock).reps,1);
});
test('normal rep counts agree at 10, 15, 30 and 60 fps',()=>{
  for(const fps of [10,15,30,60]){
    const c=api.createCounter(squat);let t=0;
    for(let r=0;r<4;r++)for(let i=0;i<fps*3;i++){
      const seconds=i/fps,theta=seconds<.4||seconds>2.4?175:175-95*Math.sin(Math.PI*(seconds-.4)/2);
      c.push({landmarks:pose(theta),t,side:0,aspect:1});t+=1000/fps;
    }
    assert.equal(c.state().reps,4,`${fps}fps`);
  }
});
test('person ambiguity survives sample and cannot be cleared by a pose refresh',()=>{
  const tracker=iso.createPersonTracker(),box={x:.3,y:.1,w:.4,h:.8};
  for(let t=0;t<600;t+=100)tracker.push([box],t);
  let s=tracker.push([box,{...box,x:.31}],650);assert.equal(s.ambiguous,true);
  s=tracker.sample(680);assert.equal(s.ambiguous,true);
  s=tracker.observePose(pose(),700);assert.equal(s.ambiguous,true);
  s=tracker.push([box],750);assert.equal(s.ambiguous,false);
});
test('an expired person track cannot revive on the first frame after a stall',()=>{
  const tracker=iso.createPersonTracker(),box={x:.3,y:.1,w:.4,h:.8};
  for(let t=0;t<600;t+=100)tracker.push([box],t);
  assert.equal(tracker.push([box],10000).needsRelock,true);
});
test('the shipping pose tracker expires a matching pose after a long unsampled gap',()=>{
  const tracker=form.createSubjectTracker(squat);for(let t=0;t<900;t+=33)tracker.push([pose()],t,1,{subjectPresent:true});
  const result=tracker.push([pose()],10000,1,{subjectPresent:true});
  assert.equal(result.needsRelock,true);assert.equal(result.landmarks,null);
});
test('pose acquisition refuses a torso outside the independent person box',()=>{
  const tracker=form.createSubjectTracker(squat);let s;
  for(let t=0;t<1000;t+=33)s=tracker.push([pose(175,.65)],t,1,{subjectPresent:true,personBox:{x:.1,y:.1,w:.2,h:.8}});
  assert.equal(s.locked,false);
});
test('form evidence with an unseen bottom is insufficient rather than a clean bill of form',()=>{
  const c=api.createCounter(squat),e=form.createEvaluator(squat);let t=0,s;
  const angles=[...Array(6).fill(175),...ramp(175,80),...Array(12).fill(80),...ramp(80,175),...Array(6).fill(175)];
  for(let i=0;i<angles.length;i++){
    const landmarks=pose(angles[i]),state=c.push({landmarks,t,side:0});
    s=e.push({landmarks:i>=30&&i<48?null:landmarks,t,side:0,counterState:state});t+=33;
  }
  assert.equal(c.state().reps,1);assert.equal(s.latest.analysisComplete,false);assert.equal(s.latest.confidence,'insufficient');assert.equal(s.latest.issues.length,0);
});
test('repeated form cues are suppressed immediately when the camera loses the measurement',()=>{
  const e=form.createEvaluator(squat);
  // A stored cue need not be deleted; it must not be presented as current observation.
  const s=e.push({landmarks:null,t:1,side:0,counterState:{phase:'top',measurementValid:false,log:[]}});
  assert.equal(s.paused,true);assert.equal(s.repeatedCue,null);
});
test('arm landmarks are smoothed in the tracker actually used by the browser',()=>{
  const rule=api.ruleFor({name:'Biceps curl'}),tracker=form.createSubjectTracker(rule);
  const p=pose();for(const i of [13,14,15,16])p[i]={x:.48,y:i<15?.35:.5,visibility:.95,presence:.95};
  for(let t=0;t<900;t+=33)tracker.push([p],t,1);
  const jitter=p.map(x=>({...x}));jitter[15].x+=.015;
  const out=tracker.push([jitter],924,1);
  assert(out.landmarks);assert(out.landmarks[15].x>p[15].x);assert(out.landmarks[15].x<jitter[15].x,'wrist jitter must be filtered too');
});

test('quality is time-weighted when good frames arrive in bursts between long blind intervals',()=>{
  const c=api.createCounter(squat),clock={t:0};feed(c,[...Array(6).fill(175),...ramp(175,80)],clock,{subjectPresent:true});
  for(let cycle=0;cycle<16;cycle++){
    c.push({landmarks:null,t:clock.t,side:0,subjectPresent:true});clock.t+=350;
    for(let j=0;j<8;j++){c.push({landmarks:pose(80),t:clock.t,side:0,subjectPresent:true});clock.t+=5}
  }
  assert.equal(c.state().phase,'lost');assert.equal(feed(c,ramp(80,175),clock).reps,0);
});
test('front-on squat footage does not receive side-view form conclusions',()=>{
  const e=form.createEvaluator(squat),lm=pose();lm[11].x=.35;lm[12].x=.65;lm[23].x=.38;lm[24].x=.62;
  const s=e.push({landmarks:lm,t:100,side:0,counterState:{phase:'descending',log:[]}});
  assert.equal(s.paused,true);assert.match(s.reason,/side-on/);
});
