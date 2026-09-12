const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const registry = require('../exercise-registry.js');
const context = {document:{addEventListener(){},getElementById(){return null}},setTimeout(){},IronSixExerciseRegistry:registry};
context.window=context;
vm.createContext(context);
for(const file of ['progress-analytics-v2.js','trainer-intelligence-v2.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const api=context.IronSixProgressV2, now=Date.now(), DAY=864e5;
const user={history:[{ts:now-DAY,muscles:['chest','back','quads'],details:[
  {name:'Barbell Bench Press',sets:[{done:true,reps:8,weight:100,rir:''},{done:true,reps:8,rir:0},{done:false,reps:8,weight:100,rir:0}]},
  {name:'Row without registry entry',seedKey:'row',sets:[{done:true,reps:10,rir:null}]},
  {name:'Bench',base:'Horizontal press',sets:[{reps:8,weight:100},{weight:100},{}]},
  {name:'Unknown custom exercise',sets:[{done:true,reps:10}]}
]}]};
let balance=api.muscleBalance(user,now);
const muscle=name=>balance.find(row=>row.muscle===name);
assert.equal(muscle('chest').direct,3);
assert.equal(muscle('chest').indirect,0);
assert.equal(muscle('back').direct,1);
assert.equal(muscle('triceps').indirect,3);
assert.equal(muscle('triceps').sets,1.5);
assert.equal(muscle('quads').sets,0,'session labels never allocate unrelated work');
assert.equal(muscle('shoulders').sets,2);
const recovery=api.recovery(user,now);
assert.equal(recovery.chest.load,3);
assert.equal(recovery.chest.hard,1,'blank/null/absent RIR is unknown');
assert.equal(recovery.back.hard,0);
assert.equal(recovery.triceps.load,1.5);
assert.equal(recovery.triceps.hard,.5);
assert.equal(recovery.quads.hours,null);
assert.equal(recovery.chest.estimated,true);
const load=context.IronSixTrainerV2.trainingState(user,now).recent14;
assert.equal(load.sets,5,'includes unmapped completed work in overall load, not weight-only placeholders');
assert.equal(load.hardSets,1);
assert.equal(load.volume,1600);
assert.equal(api.completedSet({done:false,reps:20}),false);
assert.equal(api.completedSet({seconds:30}),true);
assert.equal(api.knownRir({rir:' '}),null);
assert.equal(api.knownRir({rir:-1}),null);
assert.equal(api.knownRir({rir:'0'}),0);
assert.deepEqual(Array.from(api.exerciseMuscles({base:'Knee flexion'}).direct),['hamstrings']);
assert.deepEqual(Array.from(api.exerciseMuscles({name:'Custom',primaryMuscles:['chest'],secondaryMuscles:['chest','triceps']}).indirect),['triceps']);
// Future and out-of-window sessions cannot inflate recent work.
user.history.push({ts:now+DAY,details:[{seedKey:'squat',sets:[{done:true,reps:8}]}]});
user.history.push({ts:now-15*DAY,details:[{seedKey:'squat',sets:[{done:true,reps:8}]}]});
balance=api.muscleBalance(user,now);
assert.equal(muscle('quads').sets,0);
assert.equal(context.IronSixTrainerV2.trainingState(user,now).recent14.sets,5);
// Trainer works when loaded alone, independently of the analytics script.
const standalone={document:context.document,setTimeout(){}};standalone.window=standalone;
vm.createContext(standalone);vm.runInContext(fs.readFileSync('trainer-intelligence-v2.js','utf8'),standalone);
assert.equal(standalone.IronSixTrainerV2.trainingState(user,now).recent14.hardSets,1);
assert.equal(standalone.IronSixTrainerV2.trainingState(user,now).recent14.sets,5);
console.log('muscle-accounting tests passed');
