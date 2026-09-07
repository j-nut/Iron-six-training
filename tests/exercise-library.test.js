// Locks the invariants that make the exercise library usable on every equipment profile.
// The library is only as good as its worst-equipped user: choose() keeps the options a user
// actually owns and hands the rest to swap and to pain-aware substitution, so a slot with one
// available option silently disables both features, and a slot with none prescribes equipment
// the user does not have.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const WORKOUT_KEYS=['lower_strength','shoulders_arms','chest','back','lower_hypertrophy','upper_specialization'];
const EQUIPMENT_KEYS=['dumbbells','barbell','landmine','rack','bench','pullup','bands','abwheel','medball'];
const VARIANTS=[0,1,2];
// Mirrors circuitSuitable() in session-planner.js.
const CIRCUIT_BLOCKED=/barbell|deadlift|good morning|meadows|ab wheel|ab roller|superset/i;

function load(){
  const storage={};
  const context={console,Date,Math,localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v}}};
  context.window=context;
  vm.createContext(context);
  for(const file of ['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js','workout-upper.js','workout-dispatch.js','engine.js','session-planner.js'])
    vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return context;
}

// Capture the raw option list handed to every slot(), before equipment filtering.
function slots(context){
  return JSON.parse(vm.runInContext(`(()=>{
    const captured=[],realSlot=slot;
    globalThis.slot=(u,options)=>{captured.push(options.map(o=>({name:o.name,requires:o.requires||[],base:o.base,seedKey:o.seedKey,tag:o.tag,sets:o.sets,priority:o.priority,prescription:o.prescription})));return realSlot(u,options)};
    const u=makeUser('library',200,DEFAULT_EQUIPMENT),out=[];
    for(const key of ${JSON.stringify(WORKOUT_KEYS)})for(const v of ${JSON.stringify(VARIANTS)}){
      captured.length=0;optionsFor(key,v,u);
      captured.forEach((options,index)=>out.push({key,variant:v,index,options}));
    }
    globalThis.slot=realSlot;
    return JSON.stringify(out);
  })()`,context));
}

const context=load();
const allSlots=slots(context);
const where=s=>`${s.key} variant ${s.variant} slot ${s.index} (${s.options[0]&&s.options[0].base})`;

test('every slot is internally consistent', () => {
  assert.ok(allSlots.length>0,'no slots captured');
  for(const s of allSlots){
    const o=s.options;
    assert.ok(o.length>=2,`${where(s)} has only ${o.length} option(s)`);
    // `base` is user-visible as "Pattern" and may legitimately differ inside one slot (a
    // rotation movement really is a rotational pattern). `seedKey` is the slot identity that
    // swap, the selection cache and generated-exercise matching all key on, so it must be one.
    const seeds=new Set(o.map(x=>x.seedKey));
    assert.equal(seeds.size,1,`${where(s)} mixes seedKeys: ${[...seeds].join(', ')}`);
    for(const x of o)assert.ok(x.base,`${x.name} has no base`);
    const names=o.map(x=>x.name.toLowerCase());
    assert.equal(new Set(names).size,names.length,`${where(s)} has duplicate names`);
    for(const x of o){
      assert.ok(x.name&&x.name.trim()===x.name,`${where(s)} has a blank or padded name`);
      assert.ok(Array.isArray(x.requires),`${x.name} requires must be an array`);
      for(const key of x.requires)
        assert.ok(EQUIPMENT_KEYS.includes(key),`${x.name} requires unknown equipment "${key}"`);
      assert.equal(new Set(x.requires).size,x.requires.length,`${x.name} repeats an equipment key`);
      assert.ok(Number.isFinite(x.sets)&&x.sets>=1&&x.sets<=6,`${x.name} has odd set count ${x.sets}`);
      assert.ok(x.prescription&&x.prescription.length<=80,`${x.name} has a missing or overlong prescription`);
      assert.ok(!/\d\s-\s?\d|\d-\d/.test(x.prescription),`${x.name} uses a hyphen range; use an en dash: ${x.prescription}`);
    }
  }
});

test('every slot ends with a bodyweight fallback', () => {
  // choose() returns the LAST option when nothing matches the user's equipment, so the last
  // entry is what an unequipped user is actually prescribed.
  const broken=allSlots.filter(s=>(s.options[s.options.length-1].requires||[]).length>0);
  assert.deepEqual(broken.map(where),[],'these slots would prescribe equipment the user lacks');
});

test('every slot keeps a circuit-suitable option', () => {
  const broken=allSlots.filter(s=>!s.options.some(o=>!CIRCUIT_BLOCKED.test(o.name)));
  assert.deepEqual(broken.map(where),[],'circuit mode would have nothing to select here');
});

test('minimal equipment profiles get a real choice in every slot', () => {
  // Two available options is the floor: one to perform, one for swap and for the pain-aware
  // substitution in session-adaptation-v3.js. One option disables both silently.
  const profiles={
    'bodyweight only':[],
    'dumbbells only':['dumbbells'],
    'bands only':['bands'],
    'dumbbells + bench':['dumbbells','bench'],
    'barbell + bench, no rack':['barbell','bench']
  };
  const failures=[];
  for(const [label,owned] of Object.entries(profiles)){
    for(const s of allSlots){
      const available=s.options.filter(o=>(o.requires||[]).every(k=>owned.includes(k)));
      if(available.length<2)failures.push(`${label}: ${where(s)} -> ${available.length} option(s)`);
    }
  }
  assert.deepEqual(failures,[],'slots without a real alternative');
});

test('a name always means the same movement', () => {
  const byName=new Map();
  for(const s of allSlots)for(const o of s.options){
    const key=o.name.toLowerCase(),signature=[...(o.requires||[])].sort().join('+');
    if(!byName.has(key))byName.set(key,{name:o.name,signature,at:where(s)});
    else assert.equal(byName.get(key).signature,signature,
      `"${o.name}" needs "${signature}" at ${where(s)} but "${byName.get(key).signature}" at ${byName.get(key).at}`);
  }
});

test('every exercise gets form cues that match its movement', () => {
  // classify() in exercise-guide.js falls through to abdominal cues when no rule matches, so an
  // unrecognised name does not fail loudly — it teaches the user the wrong movement. Anything
  // whose slot is not a core slot must therefore classify to something other than 'core'.
  const guideContext={window:{},document:{getElementById:()=>null,createElement:()=>({style:{},classList:{add(){}},append(){}}),addEventListener(){}},console};
  guideContext.window=guideContext;
  vm.createContext(guideContext);
  vm.runInContext(fs.readFileSync('exercise-guide.js','utf8'),guideContext);
  const classify=guideContext.window.IronSixExerciseGuide.classify;

  const misrouted=[];
  const seen=new Set();
  for(const s of allSlots)for(const o of s.options){
    // classify() reads both name and base, so the same name under a different base is a
    // different question and has to be checked separately.
    const key=`${o.name}|${o.base}`;
    if(seen.has(key))continue;
    seen.add(key);
    if(/core/i.test(o.base||''))continue;
    if(classify(o)==='core')misrouted.push(`${o.name} (${o.base}) -> abdominal cues`);
  }
  assert.deepEqual(misrouted.sort(),[],'these exercises would be taught as core movements');
});

test('no session prescribes the same exercise twice', () => {
  // Slots are resolved independently, so two slots whose fallback chains end on the same
  // movement will both select it — which an unequipped user sees as the same exercise listed
  // twice in one workout.
  const profiles={
    'full kit':['dumbbells','barbell','landmine','rack','bench','pullup','bands','abwheel','medball'],
    'bodyweight only':[],
    'dumbbells only':['dumbbells'],
    'bands only':['bands'],
    'dumbbells + bench':['dumbbells','bench'],
    'home gym':['dumbbells','bands','pullup','bench'],
    'barbell + bench, no rack':['barbell','bench']
  };
  const duplicates=JSON.parse(vm.runInContext(`(()=>{
    const profiles=${JSON.stringify(profiles)},found=[];
    for(const [label,owned] of Object.entries(profiles)){
      const bare={dumbbells:false,barbell:false,landmine:false,rack:false,bench:false,pullup:false,bands:false,abwheel:false,medball:false};
      const u=makeUser('duplicate check',180,bare);
      owned.forEach(k=>u.equipment[k]=true);
      for(const key of ${JSON.stringify(WORKOUT_KEYS)}){
        u.program.currentWorkoutKey=key;clearCurrentSelectionCache(u);
        const counts={};
        buildWorkout(u).forEach(e=>{counts[e.name]=(counts[e.name]||0)+1});
        Object.entries(counts).filter(([,n])=>n>1).forEach(([name,n])=>found.push(label+': '+key+' prescribes '+name+' '+n+' times'));
      }
    }
    return JSON.stringify(found);
  })()`,context));
  assert.deepEqual(duplicates,[]);
});
