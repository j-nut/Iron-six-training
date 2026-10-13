const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(){
  const c={console,Date,Math,localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:()=>null,addEventListener(){}},setTimeout(){}};
  c.window=c;vm.createContext(c);
  for(const f of ['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js',
    'workout-upper.js','workout-dispatch.js','engine.js','session-planner.js','program-intelligence-v3.js','session-adaptation-v3.js'])
    vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return code=>JSON.parse(vm.runInContext('JSON.stringify((()=>{'+code+'})())',c));
}

// Eighteen completed sessions (three rotation cycles) with the real planner. Only sets logged as done
// enter history, exactly like finishWorkout().
const SIMULATE=(minutes,mode,equipment='DEFAULT_EQUIPMENT')=>`
  const u=makeUser('Coverage',180,${equipment});u.workoutMinutes=${minutes};u.trainingMode=${JSON.stringify(mode)};
  const sessions=[];
  for(let i=0;i<18;i++){
    const key=ROTATION[i%6];u.program.currentWorkoutKey=key;
    const plan=finalWorkout(u);
    sessions.push({key,seconds:sessionSeconds(u,plan),plan:plan.map(e=>({name:e.name,seed:e.seedKey,sets:e.sets,priority:e.priority,available:exerciseAvailable(u,e)}))});
    u.history.unshift({workoutKey:key,ts:Date.now()-(18-i)*864e5,details:plan.map(e=>({name:e.name,base:e.base,seedKey:e.seedKey,sets:Array.from({length:e.sets},()=>({done:true,reps:10}))}))});
    u.program.exposures[key]=(u.program.exposures[key]||0)+1;
  }
  return sessions;`;
const totals=sessions=>{
  const t={};for(const s of sessions)for(const e of s.plan)t[e.seed]=(t[e.seed]||0)+e.sets;return t;
};
const DIRECT_WORK={calves:['calves'],rearDelts:['rear_delt'],latIsolation:['lat_iso'],sideDelts:['lateral_raise'],core:['core'],
  hamstringCurls:['ham_curl'],biceps:['curl','hammer_curl'],triceps:['triceps'],quads:['squat','split_squat'],
  hinge:['hinge','hip_thrust'],chest:['bench','chest_press','fly'],overheadPress:['overhead_press'],verticalPull:['pullup'],rows:['row']};
const MICRO=['calves','rear_delt','lat_iso','lateral_raise','core','ham_curl','curl','hammer_curl','triceps'];

test('15 and 20 minute sessions give every targeted muscle direct work over 18 completed sessions',()=>{
  const run=harness();
  for(const minutes of [15,20])for(const mode of ['traditional','circuit']){
    const t=totals(run(SIMULATE(minutes,mode)));
    for(const [group,seeds] of Object.entries(DIRECT_WORK)){
      const sets=seeds.reduce((n,s)=>n+(t[s]||0),0);
      assert(sets>=1,`${group} got no direct work at ${minutes} min (${mode}): ${JSON.stringify(t)}`);
    }
  }
});

test('small muscle groups get a meaningful dose at 15 and 20 minutes without catch-up cramming',()=>{
  const run=harness();
  for(const minutes of [15,20]){
    const sessions=run(SIMULATE(minutes,'traditional')),t=totals(sessions);
    for(const seed of ['calves','rear_delt','lat_iso','lateral_raise','core','ham_curl'])assert(t[seed]>=2,`${seed} ${t[seed]} sets at ${minutes}`);
    assert(t.calves+t.ham_curl>=5,`lower-body small groups ${JSON.stringify(t)}`);
    // Micro-dose accessories stay at 1-2 sets; missed volume is never crammed into one day.
    for(const s of sessions)for(const e of s.plan)
      if(MICRO.includes(e.seed))assert(e.sets<=2,`${e.name} crammed to ${e.sets} sets in one ${minutes}-minute session`);
  }
});

test('short sessions respect the time budget and equipment, and keep an anchor lift from 15 minutes',()=>{
  const run=harness();
  for(const equipment of ['DEFAULT_EQUIPMENT','{dumbbells:true}','{bands:true}','{}'])
    for(const mode of ['traditional','circuit'])for(const minutes of [10,15,20,30]){
      const sessions=run(SIMULATE(minutes,mode,equipment));
      for(const s of sessions){
        assert(s.seconds<=minutes*60,`${s.key} ${minutes} ${mode} ${equipment}: ${s.seconds}s over budget`);
        assert(s.plan.length>=1);
        assert.equal(new Set(s.plan.map(e=>e.name)).size,s.plan.length,'duplicate exercise');
        assert(s.plan.every(e=>e.available&&e.sets>=1),`unavailable or empty exercise in ${s.key}`);
        if(equipment==='DEFAULT_EQUIPMENT'&&mode==='traditional'&&minutes>=15)assert(s.plan.some(e=>e.priority===1),`${s.key} lost its anchor at ${minutes}`);
      }
    }
});

test('circuit short sessions keep their exclusions while still rotating small muscle groups',()=>{
  const run=harness();
  for(const minutes of [15,20]){
    const sessions=run(SIMULATE(minutes,'circuit')),t=totals(sessions);
    for(const s of sessions)for(const e of s.plan)assert(!/barbell|deadlift|good morning|meadows|ab wheel|ab roller|superset/i.test(e.name),`circuit included ${e.name}`);
    for(const seed of ['calves','rear_delt','lat_iso','lateral_raise','core','ham_curl'])assert(t[seed]>=1,`${seed} missing from circuit ${minutes}`);
  }
});

test('longer sessions do not regress: 30/45/60 minutes keep compound volume and every group',()=>{
  const run=harness();
  const floors={30:{quads:15,hinge:15,chest:20,verticalPull:11,rows:10},45:{quads:20,hinge:18,chest:30,verticalPull:12,rows:12},60:{quads:24,hinge:24,chest:36,verticalPull:15,rows:15}};
  for(const minutes of [30,45,60]){
    const t=totals(run(SIMULATE(minutes,'traditional')));
    for(const [group,seeds] of Object.entries(DIRECT_WORK)){
      const sets=seeds.reduce((n,s)=>n+(t[s]||0),0);
      assert(sets>=3,`${group} only ${sets} sets at ${minutes} min`);
      if(floors[minutes][group])assert(sets>=floors[minutes][group],`${group} ${sets} < ${floors[minutes][group]} at ${minutes}`);
    }
  }
});

test('deficit tracking counts completed sets only, not planned or skipped ones',()=>{
  const run=harness();
  const out=run(`
    const mk=done=>({workoutKey:'lower_a',details:[{name:'Calf Raise',seedKey:'calves',sets:[{done},{done},{done}]}]});
    const skipped=makeUser('Skipped');skipped.history=[mk(false),mk(undefined)];
    const finished=makeUser('Finished');finished.history=[mk(true)];
    return {sessions:rollingCoverage(skipped).sessions,skippedNeed:rollingCoverage(skipped).need('calves'),
      dose:rollingCoverage(finished).dose.calves,finishedNeed:rollingCoverage(finished).need('calves')};`);
  assert.equal(out.sessions,0);
  assert.equal(out.skippedNeed,1);
  assert.equal(out.dose,3);
  assert(out.finishedNeed<1);
});

test('protected curl angles win a fresh tie but yield once biceps are dosed and rear delts are missing',()=>{
  const run=harness();
  const out=run(`
    const u=makeUser('Yield');u.workoutMinutes=15;u.program.currentWorkoutKey='pull_b';
    const fresh=finalWorkout(u).map(e=>e._programSlot);
    u.history=Array.from({length:8},(_,i)=>({workoutKey:i%2?'pull_b':'pull_a',details:[
      {name:'Curl',seedKey:'curl',sets:[{done:true},{done:true},{done:true}]},
      {name:'Hammer',seedKey:'hammer_curl',sets:[{done:true},{done:true}]},
      {name:'Row',seedKey:'row',sets:[{done:true}]},{name:'Squat',seedKey:'squat',sets:[{done:true}]}]}));
    return {fresh,dosed:finalWorkout(u).map(e=>e._programSlot)};`);
  assert(out.fresh.includes('hammer'));
  assert(out.dosed.includes('rear'),`rear delts should take the reserved slot: ${out.dosed}`);
});
