const {test}=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../iron-marks-engine.js');
const DAY=864e5,T0=Date.UTC(2026,0,5,17);
const legacy=['chest','shoulders_arms','lower_strength','back','upper_specialization','lower_hypertrophy'];
function sessions(keys,n=1,start=0){return Array.from({length:n},(_,cycle)=>keys.map((key,index)=>({sessionId:`${start}-${cycle}-${key}`,ts:T0+(start+cycle*keys.length+index)*2*DAY,workoutKey:key,sets:4,plannedSets:4,readiness:{energy:4,soreness:1},details:[{name:'Lift',sets:Array.from({length:4},()=>({weight:'100',reps:'8',rir:'2',done:true}))}]}))).flat()}
const user=history=>({id:'goal-user',history,program:{currentWorkoutKey:'push_a'}});
test('legacy rotation progress cannot recommend evolution of an unearned emblem',()=>{
 const result=engine.evaluate(user(sessions(legacy,4)));
 const hex=result.marks.find(m=>m.id==='emblem_hex_2');
 assert.equal(hex.value,hex.target,'fixture exposes full progress but locked prerequisite');
 assert.equal(hex.unlocked,false);
 assert(!engine.closestMarks(result,100).some(m=>m.evolvedEmblem==='hex'));
 // Add the current-program prerequisite; already-earned tiers stay out while
 // the next unearned tier is now an eligible recommendation.
 const unlocked=engine.evaluate(user([...sessions(legacy,1),...sessions(engine.ROTATION,1,20)]));
 assert(unlocked.emblems.includes('hex'));
 assert(engine.closestMarks(unlocked,100).some(m=>m.id==='emblem_hex_3'));
});
test('closest recommendations omit hidden, earned, ordering and low-recovery targets without deleting them',()=>{
 const result=engine.evaluate(user(sessions(engine.ROTATION,1)));
 const closest=engine.closestMarks(result,100);
 assert(closest.every(m=>!m.hidden&&!m.unlocked&&!['no_detours','listened'].includes(m.id)));
 assert(result.marks.some(m=>m.id==='no_detours'));
 assert(result.marks.some(m=>m.id==='listened'));
 assert.equal(engine.closestMarks(result).length,3);
 assert.deepEqual(engine.closestMarks(result,0),[]);
 assert.deepEqual(engine.closestMarks(result,-1),[]);
});
test('goal labels distinguish unlocks, selected routine block contributions and general progress',()=>{
 const u=user([]);let goal=engine.nextGoal(u);
 assert.equal(goal.kind,'unlock');assert.equal(goal.label,'Next unlock');assert.equal(goal.id,'first_rep');
 u.history=sessions(['push_a']);
 goal=engine.nextGoal(u);assert.equal(goal.kind,'block');assert.equal(goal.label,'Current block');assert.equal(goal.title,'Block 1 · Push A');
 u.program.currentWorkoutKey='lower_b';goal=engine.nextGoal(u);
 assert.equal(goal.title,'Block 1 · Legs B');assert.equal(goal.kind,'block');assert.equal(goal.value,1);assert.equal(goal.target,24);
 u.program.currentWorkoutKey='chest';goal=engine.nextGoal(u);
 assert.equal(goal.id,'full_six');assert.equal(goal.label,'Next unlock');
 u.history=sessions(engine.ROTATION,11);goal=engine.nextGoal(u);
 assert.equal(goal.id,'steady');assert.equal(goal.kind,'progress');assert.equal(goal.label,'Your progress');
});
test('recommendation queries never mutate evaluated unlocks, histories, or cosmetic state',()=>{
 const u=user([...sessions(legacy,2),...sessions(engine.ROTATION,2,30)]);
 u.trainerMemory={achievements:{emblem:'hex',seen:['first_rep'],customPreference:'keep'}};
 const result=engine.evaluate(u),before=JSON.stringify(result),profile=JSON.stringify(u);
 engine.closestMarks(result,100);engine.nextGoal(u,result);
 assert.equal(JSON.stringify(result),before);
 assert.equal(JSON.stringify(engine.evaluate(u)),before);
 assert.equal(JSON.stringify(u),profile);
});
