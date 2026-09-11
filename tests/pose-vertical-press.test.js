// Vertical press redesign. A real barbell overhead press set counted only 2 of 6 valid reps under
// the old single elbow-angle rule. These fixtures reproduce the failure modes a single angle has —
// a rack whose projected elbow angle depends on elbow position, and lockouts that read 150-160
// degrees face-on — and hold the phase detector to counting what a coach would count.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const pose=require('../pose-rep-counter.js');
const detectors=require('../pose-movement-detectors.js');
const synth=require('./helpers/pose-synth.js');

const A=synth.ASPECT,ohp=detectors.ruleFor({name:'Barbell Overhead Press'}),legacy=pose.RULES.find(r=>r.id==='press');

// Builds frames from a progress timeline; per-rep variation is looked up by rep index.
function pressFrames({reps=6,yaw=0,fps=24,grip=synth.BARBELL,bends=[],rackLifts=[],noise=0.003,seed=11,farVisibility=null,lead=[[900,0,0]],rep=synth.pressRep}={}){
  const rand=synth.rng(seed),segments=[...lead],owner=[];lead.forEach(()=>owner.push(-1));
  for(let r=0;r<reps;r++)for(const s of rep){segments.push(s);owner.push(r)}
  const out=[];let start=0,idx=0;const dt=1000/fps;let t=0;
  for(const [ms,from,to] of segments){const end=start+ms,r=owner[idx++];for(;t<end;t+=dt){const f=ms?(t-start)/ms:1,p=from+(to-from)*(1-Math.cos(Math.PI*f))/2;out.push({t,landmarks:synth.frame(synth.press(p,{grip,bend:bends[r]??0,rackLift:rackLifts[r]??0}),{yaw,noise,rand,farVisibility})})}start=end}
  return out;
}
// side: the tracker's working side. In the app it is the better-seen arm; tests pick it explicitly.
function count(rule,frames,{session=true,side=0}={}){
  if(session){const s=detectors.createSession(rule);for(const f of frames)s.push({...f,aspect:A,side});return s.state()}
  const c=pose.createCounter(rule);for(const f of frames)c.push({...f,aspect:A,side,subjectPresent:true,minVisibility:.32,framed:true});return c.state();
}
const REAL_SET={bends:[0,0.6,1,0.8,0.3,0.9],rackLifts:[0,0.08,0.02,0.12,0.05,0.1]};

test('face-on barbell OHP: all six reps count where the single-angle rule missed most of them',()=>{
  const frames=pressFrames(REAL_SET),old=count(legacy,frames,{session:false}),now=count(ohp,frames);
  assert.equal(now.reps,6);assert.equal(now.rejected,0);
  assert(old.reps<6,`the legacy rule is expected to miss soft lockouts (counted ${old.reps})`);
});

test('the press counts from side-on and angled cameras too',()=>{
  for(const yaw of [90,-90,40,-35]){const s=count(ohp,pressFrames({...REAL_SET,yaw}));assert.equal(s.reps,6,`yaw ${yaw}`)}
});

test('side view with the far arm hidden still counts from the near arm',()=>{
  assert.equal(count(ohp,pressFrames({...REAL_SET,yaw:90,farVisibility:0.1}),{side:1}).reps,6);
});

test('dumbbell shoulder press counts with a higher start position',()=>{
  const rule=detectors.ruleFor({name:'Dumbbell Shoulder Press'});
  for(const yaw of [0,30])assert.equal(count(rule,pressFrames({grip:synth.DUMBBELL,yaw,bends:[0,0.5,1,0.4,0.8,0.2]})).reps,6,`yaw ${yaw}`);
});

test('standing in the rack with the bar does not create reps',()=>{
  const s=count(ohp,pressFrames({reps:0,lead:[[6000,0,0]],noise:0.006}));
  assert.equal(s.reps,0);assert.equal(s.rejected,0);assert.equal(s.phase,'rack');
});

test('presses that stop short of lockout are rejected, not counted',()=>{
  const short=[[500,0,0],[650,0,0.7],[200,0.7,0.7],[650,0.7,0]];
  const s=count(ohp,pressFrames({reps:4,rep:short}));
  assert.equal(s.reps,0);assert.equal(s.rejected,4);assert.match(s.message,/lockout/);
});

test('a three-quarter press after real lockouts is rejected even if the arm reads nearly straight',()=>{
  // Two full reps establish this lifter's reach; the next stops well short of it.
  const full=pressFrames({reps:2}),s=detectors.createSession(ohp);let last=0;
  for(const f of full){s.push({...f,aspect:A,side:0});last=f.t}
  const short=pressFrames({reps:1,lead:[],rep:[[600,0,0],[700,0,0.8],[250,0.8,0.8],[800,0.8,0],[450,0,0]],bends:[1],seed:21});
  for(const f of short)s.push({...f,t:f.t+last+40,aspect:A,side:0});
  assert.equal(s.state().reps,2);assert.equal(s.state().rejected,1);
});

test('small bar movements near the shoulders are neither reps nor rejections',()=>{
  const bump=[[500,0,0],[500,0,0.45],[500,0.45,0]];
  const s=count(ohp,pressFrames({reps:4,rep:bump}));assert.equal(s.reps,0);assert.equal(s.rejected,0);
});

test('cleaning the bar to the shoulders and setting it down again is not a rep',()=>{
  const down=synth.standing(),rack=synth.press(0),rand=synth.rng(4),frames=[];
  const plan=[[800,0,0],[700,0,1],[1500,1,1],[700,1,0],[1500,0,0]];
  for(const {t,p} of synth.timeline(plan,24))frames.push({t,landmarks:synth.frame(synth.mix(down,rack,p),{noise:0.003,rand})});
  const s=count(ohp,frames);assert.equal(s.reps,0);assert.equal(s.rejected,0);assert.equal(s.phase,'waiting');
});

test('rep counts agree at 10, 15, 30 and 60 fps',()=>{
  for(const fps of [10,15,30,60])assert.equal(count(ohp,pressFrames({reps:4,fps,bends:[0.5,1,0,0.7]})).reps,4,`${fps}fps`);
});

test('a camera stall mid-press cannot complete that rep; the next full rep still counts',()=>{
  // Cut halfway up the first press (lead 900 ms + rack settle 800 ms + 500 ms of pressing).
  const first=pressFrames({reps:1}),cut=first.findIndex(f=>f.t>900+800+500),s=detectors.createSession(ohp);
  for(const f of first.slice(0,cut))s.push({...f,aspect:A,side:0});
  for(const f of first.slice(cut))s.push({...f,t:f.t+2500,aspect:A,side:0});
  assert.equal(s.state().reps,0);
  for(const f of pressFrames({reps:1,seed:3}))s.push({...f,t:f.t+10000,aspect:A,side:0});
  assert.equal(s.state().reps,1);
});

test('starting at lockout: the first descent is not a rep, the presses after it are',()=>{
  const lead=[[900,1,1],[1000,1,0],[500,0,0]];
  assert.equal(count(ohp,pressFrames({reps:3,lead})).reps,3);
});

test('interrupt keeps completed reps and requires a fresh start from the shoulders',()=>{
  const c=pose.createCounter(ohp),frames=pressFrames({reps:2});let last=0;
  for(const f of frames){c.push({...f,aspect:A,side:0,subjectPresent:true,minVisibility:.32,framed:true});last=f.t}
  assert.equal(c.state().reps,2);c.interrupt();assert.equal(c.state().phase,'lost');assert.equal(c.state().reps,2);
  for(const f of pressFrames({reps:1,seed:8}))c.push({...f,t:f.t+last+100,aspect:A,side:0,subjectPresent:true,minVisibility:.32,framed:true});
  assert.equal(c.state().reps,3);
});

test('press state exposes the phase signals diagnostics need',()=>{
  const s=count(ohp,pressFrames({reps:1}));
  assert.equal(s.detector,'vertical_press_phase');assert.equal(s.log.length,1);
  const rep=s.log[0];assert(rep.peakHeight>0.9);assert(rep.rackHeight<0.4);assert(rep.ms>=450);
  assert(Number.isFinite(s.signal.height));assert.equal(typeof s.signal.locked,'boolean');
});

test('the new press detector is only used by the vertical press family',()=>{
  const squat=pose.createCounter(detectors.ruleFor({name:'Barbell Back Squat'})).state();
  assert.equal(squat.detector,undefined);assert.equal(squat.rule,'squat');
  assert.equal(pose.createCounter(detectors.ruleFor({name:'Pike Push-Up'})).state().detector,undefined);
});
