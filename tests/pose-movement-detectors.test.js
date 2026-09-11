const {test}=require('node:test');
const assert=require('node:assert/strict');
const pose=require('../pose-rep-counter.js');
const detectors=require('../pose-movement-detectors.js');
const synth=require('./helpers/pose-synth.js');

const cases=[
  ['Barbell Back Squat','squat'],
  ['Barbell Romanian Deadlift','hinge'],
  ['Barbell Bench Press','horizontal_press'],
  ['Barbell Overhead Press','vertical_press'],
  ['Barbell Row','row'],
  ['Barbell Curl','curl']
];

test('canonical registry exercises route into movement families',()=>{
  for(const [name,family] of cases)assert.equal(detectors.familyFor({name}),family,name);
});

test('hamstring curls do not get mistaken for arm curls',()=>{
  assert.notEqual(detectors.familyFor({name:'Band Hamstring Curl'}),'curl');
});

test('family rules carry camera setup metadata and a view policy for every plane',()=>{
  for(const [name,family] of cases){const rule=detectors.ruleFor({name});assert.equal(rule.detectorFamily,family);assert(rule.setup);assert(rule.preferredView);assert.equal(rule.joint.length,2);for(const plane of ['frontal','oblique','sagittal'])assert(['ok','degraded','blocked'].includes(rule.views[plane]),`${family} ${plane}`)}
});

test('only squat is marked validated by real footage',()=>{
  for(const [name,family] of cases)assert.equal(!!detectors.ruleFor({name}).validated,family==='squat',family);
});

test('exercise overrides adjust a family instead of adding an algorithm',()=>{
  assert.equal(detectors.ruleFor({name:'Barbell Overhead Press'}).detector,'vertical_press_phase');
  assert.equal(detectors.ruleFor({name:'Dumbbell Shoulder Press'}).detector,'vertical_press_phase');
  const pike=detectors.ruleFor({name:'Pike Push-Up'});assert.equal(pike.detectorFamily,'vertical_press');assert.equal(pike.detector,'angle');assert(pike.top>pike.bottom);
  const landmine=detectors.ruleFor({name:'Landmine Press'});assert.equal(landmine.press.lockHeight,0.45);assert.equal(landmine.press.rackMax,detectors.PRESS.rackMax);
  assert.equal(detectors.familyFor({name:'Machine Chest Press',pattern:'chest_press'}),'horizontal_press');
});

function frame(rule,theta){
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:.05,presence:.05}));
  for(const index of rule.framing)landmarks[index]={x:.45,y:.45,visibility:.98,presence:.98};
  rule.joint.forEach((chain,side)=>{
    if(chain.length!==3)return;
    const [a,b,c]=chain,bx=.42+side*.16,by=.5,r=theta*Math.PI/180;
    landmarks[b]={x:bx,y:by,visibility:.98,presence:.98};
    landmarks[a]={x:bx,y:by-.2,visibility:.98,presence:.98};
    landmarks[c]={x:bx+.2*Math.sin(r),y:by-.2*Math.cos(r),visibility:.98,presence:.98};
  });
  return landmarks;
}
function ramp(a,b,n){return Array.from({length:n},(_,i)=>a+(b-a)*(i/(n-1)))}
// Real reps pass through their thresholds. A ramp that stops exactly on one never gets there once
// the counter's median filter has had its say, which is why this fixture used to fail.
function oneRep(rule){const dir=rule.top>rule.bottom?1:-1,top=rule.top+dir*12,bottom=rule.bottom-dir*12;return [...Array(6).fill(top),...ramp(top,bottom,20),...Array(4).fill(bottom),...ramp(bottom,top,20),...Array(6).fill(top)]}

test('the proven angle counter can consume every angle-family rule',()=>{
  for(const [name] of cases){const rule=detectors.ruleFor({name});if(rule.detector==='vertical_press_phase')continue;const counter=pose.createCounter(rule);let t=0,state;for(const angle of oneRep(rule)){state=counter.push({landmarks:frame(rule,angle),t,aspect:1,side:0,subjectPresent:true,minVisibility:.32,framed:true});t+=33}assert.equal(state.reps,1,`${name} should count one synthetic rep`)}
});

test('coverage reports registry-backed support rather than name-only guesses',()=>{
  const c=detectors.coverage();assert(c.total>0);assert(c.supported>0);for(const family of ['squat','hinge','horizontal_press','vertical_press','row','curl'])assert(c.byFamily[family]>0,`expected registry coverage for ${family}`);
});

test('view gate: a face-on hinge is blocked with a turn-side-on instruction; squat is never blocked',()=>{
  const hinge=detectors.ruleFor({name:'Barbell Romanian Deadlift'}),squat=detectors.ruleFor({name:'Barbell Back Squat'});
  const g=detectors.viewGate(hinge,{plane:'frontal',label:'front'});assert.equal(g.status,'blocked');assert.match(g.message,/side-on/);
  assert.equal(detectors.viewGate(hinge,{plane:'sagittal',label:'side'}).status,'ok');
  assert.equal(detectors.viewGate(hinge,{plane:'oblique',label:'front-quarter'}).status,'degraded');
  for(const plane of ['frontal','oblique','sagittal'])assert.notEqual(detectors.viewGate(squat,{plane}).status,'blocked');
  assert.equal(detectors.viewGate(hinge,{plane:null,label:'unknown'}).status,'unknown','no view yet must not block');
});

// Romanian deadlift set through the full pipeline: tracker output -> view -> gate -> counter.
function rdlFrames({yaw,reps=5,fps=24,seed=5}){
  const rand=synth.rng(seed),segments=[[900,0,0]];for(let i=0;i<reps;i++)segments.push([1100,0,85],[250,85,85],[1000,85,0],[500,0,0]);
  return synth.timeline(segments,fps).map(({t,p})=>({t,landmarks:synth.frame(synth.hinge(p),{yaw,noise:0.003,rand})}));
}
function runSession(exercise,frames){const s=detectors.createSession(exercise);let last;for(const f of frames)last=s.push({...f,aspect:synth.ASPECT,side:0});return {session:s,last}}

test('side-view RDL counts every rep through the session pipeline',()=>{
  const {session,last}=runSession({name:'Barbell Romanian Deadlift'},rdlFrames({yaw:90}));
  assert.equal(last.state.reps,5);assert.equal(last.view.label,'side');assert.equal(last.gate.status,'ok');
  assert.equal(session.diagnostics().viewBlockedFrames,0);
});

test('face-on RDL: the angle never moves, and the app now says so instead of silently missing reps',()=>{
  const rule=detectors.ruleFor({name:'Barbell Romanian Deadlift'}),frames=rdlFrames({yaw:0});
  const raw=pose.createCounter(rule);for(const f of frames)raw.push({...f,aspect:synth.ASPECT,side:0,subjectPresent:true,minVisibility:.32});
  assert.equal(raw.state().reps,0,'the old path silently counts nothing face-on');
  const {session,last}=runSession({name:'Barbell Romanian Deadlift'},frames);
  assert.equal(last.state.reps,0);assert.equal(last.gate.status,'blocked');assert.match(last.gate.message,/Turn side-on/);
  assert(session.diagnostics().viewBlockedFrames>frames.length*0.8);
});

test('a front-quarter RDL still counts but advises turning further',()=>{
  const {last}=runSession({name:'Barbell Romanian Deadlift'},rdlFrames({yaw:50}));
  assert.equal(last.state.reps,5);assert.equal(last.gate.status,'degraded');assert.match(last.gate.message,/side-on/);
});

// The validated squat must behave identically through the new session as through the raw counter.
function squatPose(theta){
  const rad=d=>d*Math.PI/180,knee={x:.5,y:.6},ankle={x:.5,y:.8},hip={x:.5+.22*Math.sin(rad(180-theta)),y:.6-.22*Math.cos(rad(180-theta))},shoulder={x:hip.x+.03,y:hip.y-.27};
  const lm=Array.from({length:33},()=>({x:.5,y:.5,visibility:.01,presence:.01}));
  for(const [i,p] of [[11,shoulder],[12,shoulder],[23,hip],[24,hip],[25,knee],[26,knee],[27,ankle],[28,ankle]])lm[i]={...p,visibility:.95,presence:.95};
  return lm;
}
test('squat counting is unchanged by the session pipeline (frame-by-frame parity)',()=>{
  const rule=detectors.ruleFor({name:'Barbell Back Squat'}),raw=pose.createCounter(rule),s=detectors.createSession(rule);let t=0;
  for(let r=0;r<4;r++)for(let i=0;i<72;i++){
    const theta=i<10||i>60?175:175-95*Math.sin(Math.PI*(i-10)/50),lm=squatPose(theta);
    const framed=pose.framing(rule,lm,0,.32).ok,a=raw.push({landmarks:lm,t,aspect:1,side:0,subjectPresent:true,minVisibility:.32,framed}),b=s.push({landmarks:lm,t,aspect:1,side:0}).state;
    assert.equal(b.phase,a.phase);assert.equal(b.reps,a.reps);t+=33;
  }
  assert.equal(s.state().reps,4);
});

test('a recorded landmark trace replays through the same pipeline to the same count',()=>{
  const frames=rdlFrames({yaw:90,reps:3}),live=runSession({name:'Barbell Romanian Deadlift'},frames).last.state;
  const trace={version:1,exercise:{name:'Barbell Romanian Deadlift'},aspect:synth.ASPECT,frames:frames.map(f=>[Math.round(f.t),0,0,detectors.encodeTraceFrame(f.landmarks)])};
  const json=JSON.stringify(trace),replayed=detectors.replayTrace(JSON.parse(json));
  assert.equal(replayed.state.reps,live.reps);assert.equal(replayed.state.reps,3);
  assert(json.length/frames.length<260,'a trace frame must stay small enough to copy off a phone');
  assert.equal(detectors.decodeTraceFrame(null),null);
});
