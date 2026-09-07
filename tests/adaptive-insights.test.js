const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={window:{},Date,Math,Number,Object,Array,String};
vm.createContext(context);
vm.runInContext(fs.readFileSync('adaptive-insights.js','utf8'),context,{filename:'adaptive-insights.js'});
const insights=context.window.IronSixInsights;
assert(insights,'adaptive insights API must be available');

assert.equal(insights.estimatedMax(100,10,0),133.3);
assert.equal(insights.estimatedMax(100,8,2),133.3,'RIR should contribute to estimated strength without exceeding the cap');
assert.equal(insights.estimatedMax('',10,2),0);

const now=Date.UTC(2026,8,6,20,0,0);
const user={history:[
  {ts:now-24*36e5,workoutKey:'chest',muscles:['chest','triceps'],details:[{name:'Bench Press',base:'press',sets:[{weight:'135',reps:'10',rir:'2',done:true},{weight:'145',reps:'8',rir:'1',done:true}]}]},
  {ts:now-8*864e5,workoutKey:'chest',muscles:['chest','triceps'],details:[{name:'Bench Press',base:'press',sets:[{weight:'115',reps:'10',rir:'2',done:true},{weight:'125',reps:'8',rir:'1',done:true}]}]},
  {ts:now-48*36e5,workoutKey:'back',muscles:['back','biceps'],details:[{name:'Row',base:'row',sets:[{weight:'100',reps:'12',rir:'2',done:true}]}]}
]};

const analysis=insights.analyze(user,now);
assert.equal(analysis.sessions7,2);
assert.equal(analysis.sets7,3);
assert.equal(analysis.volume7,135*10+145*8+100*12);
assert(analysis.trends.some(t=>t.exercise==='Bench Press'&&t.change>0),'bench trend should improve from the older session');
assert(analysis.freshness.chest.score<analysis.freshness.back.score,'more recently trained chest should be less fresh than back');
assert.equal(analysis.freshness.quads.score,100,'never-trained muscles should be fully fresh');

const recentStack={history:[
  {ts:now-6*36e5,muscles:['quads'],details:[]},
  {ts:now-30*36e5,muscles:['quads'],details:[]}
]};
const freshness=insights.muscleFreshness(recentStack,now);
assert(freshness.quads.score<10,'two recent quad sessions should show substantial accumulated fatigue');
