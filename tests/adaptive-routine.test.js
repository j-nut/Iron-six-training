const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function run(code){const c={console,Date,Math,localStorage:{getItem:()=>null},document:{addEventListener(){}},setTimeout(){}};c.window=c;vm.createContext(c);for(const f of ['core.js','program-intelligence-v3.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);return JSON.parse(vm.runInContext(`JSON.stringify((()=>{${code}})())`,c))}
test('manual choice preserves the displaced session and forecasts the saved queue',()=>{
  const result=run(`const u=makeUser();prepareManualWorkout(u,'pull_a');u.program.currentWorkoutKey='pull_a';
    const forecast=routineForecast(u);completeRoutine(u,{ts:1,workoutKey:'pull_a',details:[]});
    return {forecast,key:u.program.currentWorkoutKey,queue:u.program.pendingWorkouts,shown:IronSixProgramV3.upcoming(u,6).map(x=>x.key)};`);
  assert.deepEqual(result.forecast,['pull_a','push_a','lower_a','push_b','lower_b','pull_b']);
  assert.equal(result.key,'push_a');assert.equal(new Set(result.queue).size,6);assert.deepEqual(result.shown,result.queue);
});
test('actual logged lower work avoids another immediate lower session without dropping it',()=>{
  const result=run(`const u=makeUser();const session={ts:1,workoutKey:'push_a',details:[{name:'Squat',seedKey:'squat',sets:[{done:true},{done:true},{done:false}]}]};
    const before=JSON.stringify(u);const next=routineAfter(u,session);const unchanged=before===JSON.stringify(u);completeRoutine(u,session);return {next,unchanged,key:u.program.currentWorkoutKey};`);
  assert.equal(result.key,'pull_a');assert.equal(result.next[1],'lower_a');assert.equal(result.unchanged,true);
});
test('unfinished entries never count as work and an empty manual switch does not consume an exposure',()=>{
  const result=run(`const u=makeUser();prepareManualWorkout(u,'lower_a');u.program.currentWorkoutKey='lower_a';prepareManualWorkout(u,'push_a');u.program.currentWorkoutKey='push_a';return {queue:routineForecast(u),exposures:u.program.exposures,next:routineAfter(u,{workoutKey:'push_a',details:[{seedKey:'squat',sets:[{done:false},{done:false}]}]})};`);
  assert.equal(result.next[0],'lower_a');assert.deepEqual(result.exposures,{});assert.equal(result.queue[0],'push_a');
});
test('interrupted completed sets affect the following session and clear after finishing',()=>{
  const result=run(`const u=makeUser();u.today={'0-0':{done:true},'0-1':{done:true},'0-2':{done:false}};recordInterruptedRoutine(u,[{name:'Squat',seedKey:'squat',sets:3}],'draft');const n=u.program.interruptedWork[0].details[0].sets.length;completeRoutine(u,{ts:3,workoutKey:'push_a',details:[]});return {n,key:u.program.currentWorkoutKey,pending:u.program.interruptedWork};`);
  assert.equal(result.n,2);assert.equal(result.key,'pull_a');assert.deepEqual(result.pending,[]);
});
test('finish recovery is idempotent and retains the exact saved schedule',()=>{
  const result=run(`const u=makeUser();prepareManualWorkout(u,'pull_a');u.program.currentWorkoutKey='pull_a';const s={ts:1,sessionId:'finish-1',workoutKey:'pull_a',details:[]};s.routineAfter=routineAfter(u,s);completeRoutine(u,s);const once=JSON.stringify(u);completeRoutine(u,s);return {same:once===JSON.stringify(u),key:u.program.currentWorkoutKey};`);
  assert.equal(result.same,true);assert.equal(result.key,'push_a');
});
test('normal completed sessions retain the six-session sequence across multiple cycles',()=>{
  const result=run(`const u=makeUser(),keys=[];for(let i=0;i<18;i++){keys.push(u.program.currentWorkoutKey);completeRoutine(u,{ts:i+1,workoutKey:u.program.currentWorkoutKey,details:[]})}return keys;`);
  assert.deepEqual(result,Array(3).fill(['push_a','lower_a','pull_a','push_b','lower_b','pull_b']).flat());
});
test('leg press and leg curls never count as upper-body work',()=>{
  const dose=run(`return routineDose({details:[{name:'Leg Press',sets:[{done:true}]},{name:'Hamstring Curl',sets:[{done:true}]}]});`);
  assert.deepEqual(dose,{push:0,pull:0,lower:2});
});
test('manual choice clears reviewed targets and accessory caches while retaining benchmarks',()=>{
  const result=run(`const u=makeUser();u.trainerMemory.verifiedPlan=[{verifiedSets:8}];u.trainerMemory.verifiedForWorkoutKey='push_a';u.program.selectionCache={'v5:push_a:press:block0':'Bench','v5:push_a:lateral:0':'Raise'};prepareManualWorkout(u,'pull_a');return {memory:u.trainerMemory,cache:u.program.selectionCache};`);
  assert.deepEqual(result.memory.verifiedPlan,[]);assert.equal(result.memory.verifiedForWorkoutKey,null);assert.deepEqual(result.cache,{'v5:push_a:press:block0':'Bench'});
});

test('forecast separates two pressing days after a manual Push B choice',()=>{
  const result=run(`const u=makeUser();prepareManualWorkout(u,'push_b');u.program.currentWorkoutKey='push_b';return routineForecast(u);`);
  assert.equal(result[0],'push_b');assert.equal(result[1],'lower_a');assert(result.includes('push_a'));
});
