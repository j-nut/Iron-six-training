const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function engine(){const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync('engine.js','utf8'),c);return c}
const user={weight:210,trainingLevel:'intermediate',age:35,capacities:{dumbbellMax:30,barbellMax:300},history:[]};
test('goblet and metadata-defined dumbbell exercises respect actual dumbbell capacity',()=>{
 const c=engine();for(const name of ['Goblet Squat','Dumbbell Front Squat','One-Arm Supported Row']){
  const ex={name,requires:['dumbbells'],seedKey:'squat',prescription:'3 × 8–12'};
  assert(c.demographicSeed(user,ex)<=30,name);
  assert.equal(c.roundLoad(75,ex,user),30,name);
 }
 assert.equal(c.roundLoad(200,{name:'Barbell Back Squat',requires:['barbell','rack']},user),200);
 assert.equal(c.roundLoad(60,{name:'Cable Row',requiresCustom:['cable machine']},{capacities:{barbellMax:20}}),60,'barbell caps must not apply to unrelated equipment');
});
test('unloaded exercises never receive demographic pound estimates',()=>{
 const c=engine();for(const ex of [{name:'Single-Leg Hip Hinge',requires:[],seedKey:'hinge'},{name:'Cyclist Squat',requires:[],seedKey:'squat'},{name:'Bench Step-Up',requires:['bench'],seedKey:'split_squat'}]){
  assert.equal(c.demographicSeed(user,ex),null,ex.name);
  assert.equal(c.baselineLoadObject(user,{...ex,prescription:'3 × 10–15'}).load,null,ex.name);
 }
 assert(c.demographicSeed(user,{name:'Weighted Single-Leg Hip Hinge',requires:[],seedKey:'hinge'})>0,'explicit loaded variants remain load-capable');
});
test('exact recorded goblet performance stays in its recorded load units',()=>{
 const c=engine(),ex={name:'Goblet Squat',requires:['dumbbells'],seedKey:'squat',base:'Squat',prescription:'3 × 8–12'};
 const u={...user,capacities:{dumbbellMax:100},history:[{ts:1,details:[{...ex,sets:[{weight:'60',reps:'10',rir:'2',done:true}]}]}]};
 assert.equal(c.baselineLoadObject(u,ex).load,60,'only demographic estimates are scaled; actual goblet data must not be divided by two');
});
test('unloaded hip hinge runtime renders one Bodyweight marker per row across repeated refreshes',()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<div data-exercise-index="0"><div class="field-labels"><span>Set</span><span>Weight</span></div><div class="set-row"><input class="weight" value="85"></div><div class="set-row"><input class="weight" value="85"></div></div>',{runScripts:'outside-only'});
 try{
  const c=dom.getInternalVMContext();dom.window.setTimeout=()=>0;
  vm.runInContext(fs.readFileSync('engine.js','utf8'),c);
  vm.runInContext('function refreshRemainingWorkout(){}',c);
  vm.runInContext(fs.readFileSync('bodyweight-load-fix.js','utf8'),c);
  const ex={name:'Single-Leg Hip Hinge',requires:[],seedKey:'hinge',prescription:'3 × 12–15',sets:2};
  const suggestion=dom.window.baselineLoadObject(user,ex);assert.equal(suggestion.load,null);assert.match(suggestion.text,/Bodyweight/);
  for(let i=0;i<5;i++)dom.window.refreshRemainingWorkout(user,[ex]);
  for(const row of dom.window.document.querySelectorAll('.set-row')){assert.equal(row.querySelectorAll('.bodyweight-load').length,1);assert.equal(row.querySelector('.weight').value,'bodyweight');assert.equal(row.querySelector('.weight').style.display,'none')}
 }finally{dom.window.close()}
});
