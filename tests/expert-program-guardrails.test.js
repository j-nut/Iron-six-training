const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(){
  const c={console,Date,Math,localStorage:{getItem:()=>null,setItem(){}}};
  c.window=c;vm.createContext(c);
  for(const f of ['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js',
    'workout-back.js','workout-lower-hypertrophy.js','workout-upper.js',
    'workout-dispatch.js','engine.js','session-planner.js','program-intelligence-v3.js']){
    // Program intelligence is UI-aware; the routine tests do not need a DOM.
    if(f==='program-intelligence-v3.js')continue;
    vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  }
  return code=>JSON.parse(vm.runInContext('JSON.stringify((()=>{'+code+'})())',c));
}

test('Pull A and Pull B retain distinct curl stimuli across 15–60 minute workouts',()=>{
  const run=harness();
  for(const mode of ['traditional','circuit'])for(const minutes of [15,20,30,45,60]){
    const result=run(`const u=makeUser('Pull balance');u.trainingMode=${JSON.stringify(mode)};u.workoutMinutes=${minutes};
      const plans={};for(const key of ['pull_a','pull_b']){u.program.currentWorkoutKey=key;plans[key]=finalWorkout(u);}
      return {a:plans.pull_a.map(e=>({name:e.name,seed:e.seedKey,slot:e._programSlot})),
        b:plans.pull_b.map(e=>({name:e.name,seed:e.seedKey,slot:e._programSlot}))};`);
    assert(result.a.some(e=>e.slot==='curl_long'&&e.seed==='curl'),
      `Pull A lost supinated curl at ${minutes} minutes (${mode}): ${JSON.stringify(result.a)}`);
    assert(result.b.some(e=>e.slot==='hammer'&&e.seed==='hammer_curl'),
      `Pull B lost neutral-grip curl at ${minutes} minutes (${mode}): ${JSON.stringify(result.b)}`);
    assert(result.a.some(e=>e.slot==='row'),'Pull A needs a horizontal pull');
    assert(result.b.some(e=>e.slot==='vertical'),'Pull B needs a vertical pull');
    for(const plan of [result.a,result.b]){
      assert.equal(new Set(plan.map(e=>e.name)).size,plan.length,'Duplicate exercises waste slots');
    }
  }
});

test('ten-minute micro workouts prioritize pulling patterns without promising complete arm training',()=>{
  const run=harness();
  const data=run(`const u=makeUser();u.workoutMinutes=10;const out={};
    for(const key of ['pull_a','pull_b']){u.program.currentWorkoutKey=key;
      out[key]=finalWorkout(u).map(e=>e._programSlot)}return out;`);
  assert(data.pull_a.includes('vertical'));
  assert(data.pull_b.includes('row'));
});

test('complete rolling cycles train all major patterns without unsafe equipment substitutions',()=>{
  const run=harness();
  const data=run(`const outputs={};for(const [label,eq] of [['home',DEFAULT_EQUIPMENT],['db',{dumbbells:true}],
    ['band',{bands:true}],['none',{}]]){
      const u=makeUser(label,180,eq),sessions=[];
      for(let cycle=0;cycle<3;cycle++)for(const key of ROTATION){
        u.program.currentWorkoutKey=key;u.program.exposures[key]=cycle;u.workoutMinutes=60;
        const plan=finalWorkout(u);
        sessions.push({key,cycle,names:plan.map(e=>e.name),slots:plan.map(e=>e._programSlot),
          unsafe:plan.filter(e=>!exerciseAvailable(u,e)).map(e=>e.name)});
        u.history.unshift({workoutKey:key,details:plan.map(e=>({...e,sets:Array.from({length:e.sets},()=>({done:true,reps:10,rir:2}))}))});
      }
      outputs[label]=sessions;
    }return outputs;`);
  for(const [equipment,sessions] of Object.entries(data)){
    assert.equal(sessions.length,18);
    for(const s of sessions){
      assert.deepEqual(s.unsafe,[],`${equipment} got unavailable equipment in ${s.key}`);
      assert.equal(s.names.length,new Set(s.names).size,`${equipment} repeated an exact exercise`);
      if(equipment==='home'&&s.key.startsWith('pull'))assert(!s.names.some(n=>/^(?:Barbell Row|Meadows Row|Pendlay Row)$/.test(n)),
        'Loaded unsupported rows add spinal fatigue after lower days');
    }
    if(equipment==='home'){
      for(const cycle of [0,1,2]){
        const a=sessions.find(s=>s.key==='pull_a'&&s.cycle===cycle);
        const b=sessions.find(s=>s.key==='pull_b'&&s.cycle===cycle);
        assert(a.slots.includes('curl_long')&&b.slots.includes('hammer'));
        const legA=sessions.find(s=>s.key==='lower_a'&&s.cycle===cycle);
        const legB=sessions.find(s=>s.key==='lower_b'&&s.cycle===cycle);
        assert(legA.slots.includes('calves')&&legB.slots.includes('calves'),'Full workouts require calf work');
        assert(legA.slots.includes('ham')&&legB.slots.includes('ham'),'Full workouts require knee-flexion work');
      }
    }
  }
});
