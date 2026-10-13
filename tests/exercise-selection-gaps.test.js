const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Same load order as index.html for everything that influences exercise selection.
const scripts=['core.js','workout-difficulty.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js','workout-upper.js','exercise-registry.js','workout-dispatch.js','engine.js','session-planner.js'];
function app(){
  const c={console,Date,Math,localStorage:{getItem:()=>null,setItem(){}},document:{addEventListener(){},getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild(){},append(){}}},setTimeout(){}};
  c.window=c;vm.createContext(c);
  for(const f of scripts)vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return code=>JSON.parse(vm.runInContext(`JSON.stringify((()=>{${code}})())`,c));
}
const PROFILES={
  full_gym:{dumbbells:true,barbell:true,rack:true,bench:true,pullup:true,bands:true,abwheel:true,medball:true},
  barbell_rack_bench:{barbell:true,rack:true,bench:true},
  barbell_rack_bench_pullup:{barbell:true,rack:true,bench:true,pullup:true},
  dumbbells_only:{dumbbells:true},
  dumbbells_bench:{dumbbells:true,bench:true},
  bands_only:{bands:true},
  bodyweight:{},
  bodyweight_pullup:{pullup:true}
};
// Building a plan for every rotation day at 60 minutes in traditional mode.
const BUILD=`const out={};for(const [name,eq] of Object.entries(${JSON.stringify(PROFILES)}))for(const level of ['balanced','light']){const u=makeUser('Sim',180,eq);u.workoutMinutes=60;u.trainingMode='traditional';u.workoutDifficulty=level;for(const key of ROTATION){u.program.currentWorkoutKey=key;const plan=finalWorkout(u);out[name+'|'+level+'|'+key]={gaps:u.program.planGaps?.slots||[],plan:plan.map(e=>({name:e.name,slot:e._programSlot,sets:e.sets,alts:(e._alternatives||[]).map(a=>a.name)}))};}}return out;`;
const plans=app()(BUILD);

test('every setup that can row gets a horizontal pull on both pull days, balanced and light',()=>{
  for(const profile of Object.keys(PROFILES).filter(p=>!p.startsWith('bodyweight')))for(const level of ['balanced','light'])for(const key of ['pull_a','pull_b']){
    const row=plans[`${profile}|${level}|${key}`];
    assert(row.plan.some(e=>e.slot==='row'),`${profile} ${level} ${key} has no row slot`);
    assert(!row.gaps.includes('row'),`${profile} ${level} ${key} reports a missing row`);
  }
  // Pull B anchors on the row, so its primary can never be missing for these setups.
  for(const profile of Object.keys(PROFILES).filter(p=>!p.startsWith('bodyweight')))assert.equal(plans[`${profile}|balanced|pull_b`].plan[0].slot,'row',profile+' pull_b lost its primary');
});

test('barbell-only and bench-less dumbbell lifters get real rows',()=>{
  for(const profile of ['barbell_rack_bench','barbell_rack_bench_pullup'])for(const key of ['pull_a','pull_b'])assert.match(plans[`${profile}|balanced|${key}`].plan.find(e=>e.slot==='row').name,/Barbell Row|Pendlay Row/);
  for(const key of ['pull_a','pull_b'])assert.equal(plans[`dumbbells_only|balanced|${key}`].plan.find(e=>e.slot==='row').name,'One-Arm Dumbbell Row');
  // Lifters who already had a supported row keep it; barbell rows are not added next to hinge work.
  for(const key of ['pull_a','pull_b'])assert.doesNotMatch(plans[`full_gym|balanced|${key}`].plan.find(e=>e.slot==='row').name,/Barbell|Pendlay/);
});

test('equipment-free setups report the missing row instead of faking one',()=>{
  // There is no illustrated bodyweight row (every canonical exercise needs approved art), so the
  // gap is surfaced through planGaps and no unrelated movement stands in for it.
  for(const profile of ['bodyweight','bodyweight_pullup'])for(const key of ['pull_a','pull_b']){
    const row=plans[`${profile}|balanced|${key}`];
    assert(row.gaps.includes('row'));assert(!row.plan.some(e=>e.slot==='row'));
  }
});

test('Light keeps the exercises the balanced session would have used',()=>{
  for(const key of Object.keys(plans).filter(k=>k.includes('|balanced|'))){
    const names=p=>p.plan.map(e=>e.name);
    assert.deepEqual(names(plans[key.replace('|balanced|','|light|')]),names(plans[key]),key);
  }
});

test('Light removes at least one set from exercises with two or more sets, never below one',()=>{
  const run=app();
  const lightSets=run('return [1,2,3,4,5,6].map(n=>IronSixDifficulty.lightSets(n))');
  assert.deepEqual(lightSets,[1,1,2,3,4,5]);
  const result=run(`const u=makeUser('Sets');u.program.currentWorkoutKey='push_a';const base=getWorkout(u).map(e=>({name:e.name,sets:e.sets}));u.workoutDifficulty='light';const light=IronSixDifficulty.transformWorkout(u,getWorkout(u)).map(e=>({name:e.name,sets:e.sets,prescription:e.prescription}));return {base,light}`);
  assert(result.base.length>0);
  result.base.forEach((b,i)=>{const l=result.light[i];assert.equal(l.name,b.name);assert(l.sets>=1);if(b.sets>=2)assert(l.sets<=b.sets-1,`${b.name} kept ${b.sets} sets`);else assert.equal(l.sets,b.sets);assert(l.prescription.startsWith(l.sets+' ×'))});
});

test('loaded options outrank the near-zero-stimulus fallbacks whenever equipment allows them',()=>{
  const fallbacks=new Set(['Lean-Away Lateral Raise','Prone Lat Pull','Isometric Lat Press','Towel Isometric Curl','Bodyweight Curl Isometric','Hamstring Walkout']);
  for(const [key,row] of Object.entries(plans))for(const e of row.plan)if(fallbacks.has(e.name))assert(e.alts.every(a=>fallbacks.has(a)),`${key}: ${e.name} chosen over ${e.alts.filter(a=>!fallbacks.has(a))}`);
  // The audit's headline case: a barbell lifter used to get the towel curl.
  for(const profile of ['barbell_rack_bench','barbell_rack_bench_pullup'])assert.equal(plans[`${profile}|balanced|pull_b`].plan.find(e=>e.slot==='hammer').name,'Barbell Curl');
});

test('a recently used loaded option still beats a fallback',()=>{
  const out=app()(`const u=makeUser('Recent',180,{dumbbells:true,bands:true});u.program.currentWorkoutKey='push_a';u.history=[0,1,2,3].map(i=>({workoutKey:'push_a',details:[{name:'Dumbbell Lateral Raise',seedKey:'lateral_raise',sets:[{done:true,reps:12}]},{name:'Band Lateral Raise',seedKey:'lateral_raise',sets:[{done:true,reps:12}]}]}));return finalWorkout(u).find(e=>e._programSlot==='lateral').name`);
  assert.notEqual(out,'Lean-Away Lateral Raise');
});

test('pattern recency penalty adds up recent sessions instead of collapsing to a constant',()=>{
  const run=app();
  const values=run(`const e={seedKey:'row'},h=i=>({details:[{seedKey:'row'}]}),none={details:[{seedKey:'squat'}]};const pen=history=>patternRecentPenalty({history},e);return [pen([]),pen([none,none]),pen([h(),none]),pen([none,none,h()]),pen([h(),h()])]`);
  assert.deepEqual(values,[0,0,8,6,15]);
});
