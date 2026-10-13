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
    for(const s of sessions)for(const e of s.plan)assert(!/barbell|good morning|meadows|ab wheel|ab roller|superset|pendlay/i.test(e.name),`circuit included ${e.name}`);
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

// ---- time model, circuit filter, ramp sets and long sessions ----
const DAYS=(minutes,mode,extra='')=>`const out=[];for(const key of ROTATION){const u=makeUser('Day',180);u.workoutMinutes=${minutes};u.trainingMode=${JSON.stringify(mode)};u.program.currentWorkoutKey=key;${extra}
  const plan=finalWorkout(u);out.push({key,seconds:sessionSeconds(u,plan),timeline:u.trainingMode==='circuit'?circuitTimeline(u,plan).reduce((n,x)=>n+x.seconds,0):0,
  plan:plan.map(e=>({name:e.name,seed:e.seedKey,sets:e.sets,priority:e.priority,requires:e.requires,extra:!!e._extra,ramp:e._ramp||null,uni:isUnilateral(e)}))})}return out;`;
const avg=(days,f)=>days.reduce((n,d)=>n+f(d),0)/days.length;

test('rest scales to the session budget: about 6 working sets at 15 min and 8 at 20 min',()=>{
  const run=harness();
  const d15=run(DAYS(15,'traditional')),d20=run(DAYS(20,'traditional')),d10=run(DAYS(10,'traditional'));
  assert(avg(d15,d=>d.plan.reduce((n,e)=>n+e.sets,0))>=6,'15 min should plan about 6 sets');
  assert(avg(d20,d=>d.plan.reduce((n,e)=>n+e.sets,0))>=8,'20 min should plan about 8 sets');
  for(const [days,m] of [[d10,10],[d15,15],[d20,20]])for(const d of days)assert(d.seconds<=m*60,`${d.key} ${m}: ${d.seconds}s`);
  // The one-arm row used to cost 285 s of a 420 s budget and crowd out every accessory.
  assert(d10.find(d=>d.key==='pull_b').plan.length>=2);
  const t=run(`const e={seedKey:'row',priority:1,name:'Row',prescription:'3 × 8'};return [traditionalSetSeconds(e,15),traditionalSetSeconds(e,60),traditionalSetSeconds({...e,priority:3,seedKey:'curl'},15),traditionalSetSeconds({...e,priority:3,seedKey:'curl'},60)]`);
  assert(t[0]<t[1]&&t[2]<=t[3]);
});

test('circuit filter excludes barbell/rack lifts by equipment and allows dumbbell hinges',()=>{
  const run=harness();
  const r=run(`return [circuitSuitable({name:'High-Bar Back Squat',requires:['barbell','rack']}),circuitSuitable({name:'Close-Grip Bench Press',requires:['barbell','rack','bench']}),
    circuitSuitable({name:'Pendlay Row',requires:[]}),circuitSuitable({name:'Dumbbell Romanian Deadlift',requires:['dumbbells']}),circuitSuitable({name:'Ab Wheel Rollout',requires:['abwheel']}),circuitSuitable({name:'Goblet Squat',requires:['dumbbells']})]`);
  assert.deepEqual(r,[false,false,false,true,false,true]);
  for(const minutes of [15,45,60,90])for(const d of run(DAYS(minutes,'circuit')))
    for(const e of d.plan)assert(!(e.requires||[]).some(k=>['barbell','rack','landmine'].includes(k)),`${e.name} in circuit ${minutes}`);
});

test('circuit rounds are capped per station and unilateral stations get both sides',()=>{
  const run=harness();
  for(const minutes of [30,60,120])for(const d of run(DAYS(minutes,'circuit'))){
    for(const e of d.plan)assert(e.sets<=(e.priority===1?5:4),`${e.name} ${e.sets} rounds at ${minutes}`);
    assert.equal(d.timeline,d.seconds,'timer and card budget agree');
  }
  const out=run(`const u=makeUser();u.trainingMode='circuit';u.workoutMinutes=30;
    const plan=[{name:'One-Arm Dumbbell Row',seedKey:'row',sets:2,priority:2,prescription:'40s controlled work · 2 rounds',_unilateral:true},{name:'Goblet Squat',seedKey:'squat',sets:2,priority:2,prescription:'40s controlled work · 2 rounds',_unilateral:false}];
    const work=circuitTimeline(u,plan).filter(s=>s.kind==='work');return {row:work.filter(s=>s.index===0).map(s=>s.seconds),squat:work.filter(s=>s.index===1).map(s=>s.seconds)};`);
  assert.deepEqual(out.row,[80,80]);assert.deepEqual(out.squat,[40,40]);
});

test('heavy barbell/dumbbell lifts get display-only ramp sets that cost time but never become working sets',()=>{
  const run=harness();
  const days=run(DAYS(60,'traditional'));
  for(const d of days){
    const ramped=d.plan.filter(e=>e.ramp);
    assert(ramped.length>=1||d.key==='pull_a',`${d.key} has no ramp`);
    for(const e of ramped){assert.equal(e.priority,1);assert(e.ramp.length>=2&&e.ramp.length<=3);assert(e.ramp.every(r=>r.pct<100&&r.reps>=1))}
    assert(!d.plan.some(e=>e.ramp&&!/barbell|dumbbell/i.test((e.requires||[]).join(' ')+e.name)));
  }
  assert(days.find(d=>d.key==='push_a').plan[0].ramp.length===3);
  assert(run(DAYS(60,'circuit')).every(d=>d.plan.every(e=>!e.ramp)),'circuit has no ramp sets');
  const t=run(`const u=makeUser();u.workoutMinutes=60;u.program.currentWorkoutKey='lower_a';const plan=finalWorkout(u);
    const ramps=rampSpec(u,plan).reduce((n,r)=>n+(r?r.length:0),0),prof=restProfile(60);
    const noRampSeconds=sessionWarmup(u)+60+plan.reduce((n,e)=>n+prof.setup+e.sets*traditionalSetSeconds(e,60),0);
    return {total:sessionSeconds(u,plan),ramps,noRampSeconds,warm:sessionWarmup(u),sets:plan.map(e=>e.sets),text:plan[0]._rampText,prescription:plan[0].prescription}`);
  assert(t.ramps>=4);assert(t.total>t.noRampSeconds||t.warm>=60+t.ramps*35,'ramp time is counted in the budget');
  assert.equal(t.total,Math.max(t.warm,60+t.ramps*35)+60+(t.noRampSeconds-t.warm-60));
  assert.match(t.text,/not logged/);assert(t.sets.every(n=>Number.isInteger(n)&&n>=1));assert(!/%/.test(t.prescription),'ramp text must not enter the loggable prescription');
});

test('longer durations use the time: 45/60 fill their clock and 75-120 add exercises and volume',()=>{
  const run=harness();
  const stats={};
  for(const m of [30,45,60,75,90,120]){
    const days=run(DAYS(m,'traditional'));
    stats[m]={min:avg(days,d=>d.seconds)/60,sets:avg(days,d=>d.plan.reduce((n,e)=>n+e.sets,0)),exs:avg(days,d=>d.plan.length)};
    for(const d of days){assert(d.seconds<=m*60,`${m}/${d.key} over budget`);assert.equal(new Set(d.plan.map(e=>e.name)).size,d.plan.length)}
  }
  assert(stats[45].min>=40,JSON.stringify(stats[45]));assert(stats[60].min>=54,JSON.stringify(stats[60]));
  assert(stats[45].sets>stats[30].sets&&stats[60].sets>stats[45].sets&&stats[75].sets>stats[60].sets);
  assert(stats[90].sets>stats[75].sets&&stats[120].sets>stats[90].sets);
  assert(stats[75].exs>stats[60].exs&&stats[120].exs>stats[90].exs);
  assert(stats[120].min>stats[60].min+20,'120 minutes must not be the same plan as 60');
  // No movement category gets more than 10 sets in a session, however long it is.
  for(const d of run(DAYS(120,'traditional'))){
    const byCat={};for(const e of d.plan){byCat[e.seed]=(byCat[e.seed]||0)+e.sets}
    for(const [k,n] of Object.entries(byCat))assert(n<=10,`${d.key} ${k} ${n}`);
  }
  for(const m of [60,90])for(const d of run(DAYS(m,'circuit')))assert(d.seconds<=m*60);
});
