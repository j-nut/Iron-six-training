const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const window={};
const document={createElement:()=>({textContent:''}),head:{appendChild(){}},querySelector:()=>null};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const context={window,document,escapeHtml,setInterval,clearInterval,requestAnimationFrame:fn=>fn()};
vm.createContext(context);
vm.runInContext(fs.readFileSync('exercise-guide.js','utf8'),context);
vm.runInContext(fs.readFileSync('exercise-visuals.js','utf8'),context);

const samples=[
  {name:'Barbell Back Squat',requires:['barbell'],seedKey:'squat'},
  {name:'Dumbbell Bulgarian Split Squat',requires:['dumbbells','bench'],seedKey:'split_squat'},
  {name:'Barbell Romanian Deadlift',requires:['barbell'],seedKey:'hinge'},
  {name:'Barbell Hip Thrust',requires:['barbell','bench'],seedKey:'hip_thrust'},
  {name:'Band Hamstring Curl',requires:['bands'],seedKey:'ham_curl'},
  {name:'Weighted Standing Calf Raise',requires:['dumbbells'],seedKey:'calves'},
  {name:'Dumbbell Bench Press',requires:['dumbbells','bench'],seedKey:'bench'},
  {name:'Push-Up',requires:[],seedKey:'bench'},
  {name:'Dumbbell Fly',requires:['dumbbells','bench'],seedKey:'fly'},
  {name:'Dumbbell Shoulder Press',requires:['dumbbells'],seedKey:'overhead_press'},
  {name:'Dumbbell Lateral Raise',requires:['dumbbells'],seedKey:'lateral_raise'},
  {name:'Band Face Pull',requires:['bands'],seedKey:'rear_delt'},
  {name:'One-Arm Dumbbell Row',requires:['dumbbells','bench'],seedKey:'row'},
  {name:'Pull-Up',requires:['pullup'],seedKey:'pullup'},
  {name:'Band Straight-Arm Pulldown',requires:['bands'],seedKey:'lat_iso'},
  {name:'Dumbbell Curl',requires:['dumbbells'],seedKey:'curl'},
  {name:'Band Pressdown',requires:['bands'],seedKey:'triceps'},
  {name:'Ab Wheel Rollout',requires:['abwheel'],seedKey:'core'},
  {name:'Dumbbell Curl + Band Pressdown',requires:['dumbbells','bands'],seedKey:'arms',base:'Arms finisher'}
];

const diagrams=samples.map(exercise=>{
  const key=window.IronSixExerciseGuide.classify(exercise);
  const svg=window.IronSixVisualDebug.motionSvg(exercise,key);
  assert.match(svg,/^<svg/);
  assert.match(svg,/>START</);
  assert.match(svg,/>FINISH</);
  assert(!/undefined|NaN/.test(svg),`${exercise.name} diagram must contain valid coordinates`);
  return svg;
});

assert.equal(window.IronSixExerciseGuide.classify(samples.at(-1)),'arms');
assert(new Set(diagrams).size>=18,'exercise families must render distinct diagrams');
