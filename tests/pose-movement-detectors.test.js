const {test}=require('node:test');
const assert=require('node:assert/strict');
const pose=require('../pose-rep-counter.js');
const detectors=require('../pose-movement-detectors.js');

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

test('family rules carry camera setup metadata',()=>{
  for(const [name,family] of cases){const rule=detectors.ruleFor({name});assert.equal(rule.detectorFamily,family);assert(rule.setup);assert(rule.preferredView);assert.equal(rule.joint.length,2)}
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
function oneRep(rule){return [...Array(6).fill(rule.top),...ramp(rule.top,rule.bottom,20),...ramp(rule.bottom,rule.top,20),...Array(6).fill(rule.top)]}

test('the proven counter can consume every new family rule',()=>{
  for(const [name] of cases){const rule=detectors.ruleFor({name}),counter=pose.createCounter(rule);let t=0,state;for(const angle of oneRep(rule)){state=counter.push({landmarks:frame(rule,angle),t,aspect:1,side:0,subjectPresent:true,minVisibility:.32,framed:true});t+=33}assert.equal(state.reps,1,`${name} should count one synthetic rep`)}
});

test('coverage reports registry-backed support rather than name-only guesses',()=>{
  const c=detectors.coverage();assert(c.total>0);assert(c.supported>0);for(const family of ['squat','hinge','horizontal_press','vertical_press','row','curl'])assert(c.byFamily[family]>0,`expected registry coverage for ${family}`);
});