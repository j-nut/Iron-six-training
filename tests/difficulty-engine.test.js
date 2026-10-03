const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const scripts=['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js','workout-upper.js','workout-dispatch.js','engine.js','session-planner.js'];
function app(withDifficulty=true,withLoads=false){
  const c={console,Date,Math,localStorage:{getItem:()=>null,setItem(){}},document:{addEventListener(){},getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild(){},append(){}}},setTimeout(){}};c.window=c;vm.createContext(c);
  for(const f of scripts)vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  if(withLoads)for(const f of ['load-progression-v2.js','bodyweight-load-fix.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  if(withDifficulty){vm.runInContext(fs.readFileSync('workout-difficulty.js','utf8'),c);if(withLoads)c.IronSixDifficulty.installLoadAdjustment();}
  return code=>JSON.parse(vm.runInContext(`JSON.stringify((()=>{${code}})())`,c));
}
test('Balanced and missing preferences retain the exact existing selections, caches, and dose',()=>{
  const baseline=app(false),enabled=app();
  const code=`const u=makeUser('Compatibility');const result=[];for(const key of Object.keys(WORKOUT_META)){u.program.currentWorkoutKey=key;result.push(finalWorkout(u));}return {result,cache:u.program.selectionCache};`;
  assert.deepEqual(enabled(code),baseline(code));
});
test('session override is scoped to workout and exposure; a draft survives saved preference changes',()=>{
  const run=app();const result=run(`const u=makeUser();u.workoutDifficulty='heavy';u.sessionDifficulty={level:'light',workoutKey:'push_a',exposure:0};const values=[IronSixDifficulty.effectiveFor(u)];u.program.exposures.push_a=1;values.push(IronSixDifficulty.effectiveFor(u));u.workoutDraft={difficulty:'balanced',plan:[{name:'Pinned',sets:3}]};u.workoutDifficulty='light';values.push(IronSixDifficulty.effectiveFor(u));u.sessionDifficulty=null;const before=JSON.stringify(finalWorkout(u));u.workoutDifficulty='heavy';values.push(JSON.stringify(finalWorkout(u))===before);return values;`);
  assert.deepEqual(result,['light','heavy','balanced',true]);
});
test('Light selects unloaded patterns and Heavy prioritizes owned Olympic equipment',()=>{
  const run=app();const out=run(`const rows={};for(const level of ['light','balanced','heavy']){const u=makeUser();u.program.currentWorkoutKey='lower_a';u.workoutDifficulty=level;rows[level]=finalWorkout(u).map(e=>({name:e.name,kind:IronSixDifficulty.equipmentKind(e),seed:e.seedKey,sets:e.sets}));}return rows;`);
  assert(out.light.filter(e=>e.kind==='bodyweight').length>=3);
  assert(out.heavy.some(e=>e.seed==='squat'&&e.kind==='barbell'));
  assert(out.heavy.some(e=>e.seed==='hinge'&&e.kind==='barbell'));
  assert.deepEqual(out.light.map(e=>e.seed),out.heavy.map(e=>e.seed));
});
test('Heavy uses an available custom machine but never invents missing equipment',()=>{
  const run=app();const out=run(`const make=(owned)=>{const u=makeUser();u.workoutDifficulty='heavy';u.customEquipment=owned?['Leg press']:[];u.program.generatedExercises=[{name:'Leg Press Machine',requires:[],requiresCustom:['Leg press'],base:'Primary squat',seedKey:'squat',sets:3,prescription:'3 × 8–12',source:'curated',workoutKeys:['lower_strength']}];u.program.currentWorkoutKey='lower_a';return finalWorkout(u).map(e=>e.name)};return {owned:make(true),absent:make(false)};`);
  assert(out.owned.includes('Leg Press Machine'));assert(!out.absent.includes('Leg Press Machine'));
});
test('all difficulty equipment mode and duration combinations retain valid budgets and circuits',()=>{
  const run=app();const count=run(`let count=0;for(const level of ['light','balanced','heavy'])for(const equipment of [{},{dumbbells:true},{bands:true},DEFAULT_EQUIPMENT])for(const key of Object.keys(WORKOUT_META))for(const mode of ['traditional','circuit'])for(const minutes of [10,15,20,30,45,60,120]){const u=makeUser('Matrix',180,equipment);u.workoutDifficulty=level;u.program.currentWorkoutKey=key;u.trainingMode=mode;u.workoutMinutes=minutes;const plan=finalWorkout(u);if(!plan.length||plan.some(e=>!exerciseAvailable(u,e)||e.sets<1)||new Set(plan.map(e=>e.name)).size!==plan.length)throw Error('Invalid '+level+' '+key+' '+mode+' '+minutes);if(sessionSeconds(u,plan)>minutes*60)throw Error('Overbudget '+level+' '+key);if(mode==='circuit'){if(circuitTimeline(u,plan).reduce((n,s)=>n+s.seconds,0)!==sessionSeconds(u,plan))throw Error('Timer mismatch');for(const e of plan)if(!e.prescription.includes(e.sets+' rounds'))throw Error('Rounds mismatch');}count++;}return count;`);
  assert.equal(count,2016);
});
test('low energy and soreness remain authoritative even for Heavy and a fresh trainer review',()=>{
  const run=app();const out=run(`const u=makeUser();u.program.currentWorkoutKey='lower_strength';u.workoutDifficulty='heavy';u.readiness={energy:2,soreness:4};const plain=finalWorkout(u);u.trainerMemory={reviewedAt:Date.now(),verifiedForWorkoutKey:'lower_strength',verifiedPlan:plain.map(e=>({...e,verifiedSets:9}))};return {plain,reviewed:finalWorkout(u)};`);
  assert(!out.reviewed.some(e=>e.base==='Hip hinge'));assert.deepEqual(out.reviewed.map(e=>e.sets),out.plain.map(e=>e.sets));
});
test('explicit day changes retain entered slot identity, all saved rows and draft ID',()=>{
  const run=app();const out=run(`const u=makeUser();u.program.currentWorkoutKey='lower_a';const old=finalWorkout(u);u.workoutDraft={id:'stable',difficulty:'balanced',plan:old};u.today={'0-0':{weight:'100',reps:'8',done:true},'1-0':{weight:'55',reps:'',done:false}};const before=JSON.stringify(u.today);const next=IronSixDifficulty.replanRemaining(u,'light');return {old,next,unchanged:before===JSON.stringify(u.today),id:u.workoutDraft.id};`);
  assert(out.unchanged);assert.equal(out.id,'stable');assert.equal(out.next.length,out.old.length);
  for(const index of [0,1]){assert.equal(out.next[index].name,out.old[index].name);assert.equal(out.next[index].sets,out.old[index].sets);assert.equal(out.next[index]._difficulty,'light');}
  assert(out.next.slice(2).some((e,i)=>e.name!==out.old[i+2].name));
  assert.equal(new Set(out.next.map(e=>e.name)).size,out.next.length);
});
test('Light replan is idempotent and cannot grow a live workout or mutate the original plan',()=>{
  const run=app();const out=run(`const u=makeUser();u.program.currentWorkoutKey='lower_a';const old=finalWorkout(u),before=JSON.stringify(old);const first=IronSixDifficulty.replanRemaining(u,'light',old),second=IronSixDifficulty.replanRemaining(u,'light',first);return {old,first,second,unchanged:before===JSON.stringify(old)};`);
  assert(out.unchanged);assert.deepEqual(out.first,out.second);assert(out.first.every((e,i)=>e.sets<=out.old[i].sets));
});
test('day overrides in a circuit preserve the same stations, rounds, and timer duration',()=>{
  const run=app();const out=run(`const u=makeUser();u.trainingMode='circuit';u.program.currentWorkoutKey='lower_a';const old=finalWorkout(u);u.today={'0-0':{weight:'30',reps:'10',done:true}};const plan=IronSixDifficulty.replanRemaining(u,'light',old);return {old,plan,seconds:sessionSeconds(u,plan),timeline:circuitTimeline(u,plan).reduce((n,s)=>n+s.seconds,0)};`);
  assert.equal(out.plan.length,out.old.length);assert.equal(out.plan[0].name,out.old[0].name);assert.equal(out.seconds,out.timeline);assert(out.plan.every(ex=>ex.prescription.includes(ex.sets+' rounds')));
});
test('all live difficulty switches preserve entered slots and fit the saved time budget',()=>{
  const run=app();const count=run(`let count=0;for(const level of ['light','balanced','heavy'])for(const next of ['light','balanced','heavy'])for(const equipment of [{},{dumbbells:true},{bands:true},DEFAULT_EQUIPMENT])for(const key of ROTATION)for(const mode of ['traditional','circuit'])for(const minutes of [10,15,30,60]){const u=makeUser('Live matrix',180,equipment);u.workoutDifficulty=level;u.program.currentWorkoutKey=key;u.trainingMode=mode;u.workoutMinutes=minutes;const old=finalWorkout(u);u.today={'0-0':{weight:'10',reps:'8',done:true}};const plan=IronSixDifficulty.replanRemaining(u,next,old);if(sessionSeconds(u,plan)>minutes*60)throw Error('Overbudget '+level+' to '+next+' '+key);if(plan[0].name!==old[0].name||plan[0].sets!==old[0].sets||plan.length!==old.length||new Set(plan.map(e=>e.name)).size!==plan.length)throw Error('Invalid live plan');if(mode==='circuit'&&circuitTimeline(u,plan).reduce((n,s)=>n+s.seconds,0)!==sessionSeconds(u,plan))throw Error('Timer drift');count++;}return count;`);
  assert.equal(count,1728);
});
test('Light intent never promotes an exercise with recent pain feedback',()=>{
  const run=app();const out=run(`const u=makeUser();u.program.currentWorkoutKey='lower_a';u.workoutDifficulty='light';u.trainingFeedback=[{ts:Date.now(),feedback:'pain',exercise:'Tempo Bodyweight Squat'}];return finalWorkout(u);`);
  assert(!out.some(e=>e.name==='Tempo Bodyweight Squat'));assert(out.some(e=>e.seedKey==='squat'));
});
test('Light working loads use exact performance units and never exceed capacity',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.workoutDifficulty='light';u.capacities.dumbbellMax=100;const ex={name:'Goblet Squat',requires:['dumbbells'],seedKey:'squat',prescription:'3 × 8–12'};u.history=[{ts:1,details:[{...ex,sets:[{weight:'60',reps:'10',rir:'2',done:true}]}]}];const baseline=baselineLoadObject(u,ex),suggested=suggestedLoadObject(u,ex,0);u.capacities.dumbbellMax=20;return {baseline,suggested,capped:baselineLoadObject(u,ex)};`);
  assert.equal(out.baseline.load,50);assert.equal(out.suggested.load,50,'Light scales once through nested load wrappers');assert(out.capped.load<=20);
});
test('Light day switch caps remaining recommendations from a fixed reference, not repeated percentage drops',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();const ex={name:'Barbell Bench Press',base:'Horizontal press',seedKey:'bench',requires:['barbell'],prescription:'3 × 8–12',sets:3};u.today={'0-0':{weight:'100',reps:'10',rir:'2',done:true}};const plan=IronSixDifficulty.replanRemaining(u,'light',[ex]);const first=suggestedLoadObject(u,plan[0],0);u.today['0-1']={weight:'80',reps:'10',rir:'4',done:true};const second=suggestedLoadObject(u,plan[0],0);return {first,second,today:u.today};`);
  assert.equal(out.first.load,80);assert.equal(out.second.load,80);assert.equal(out.today['0-0'].weight,'100');
});
test('bodyweight and timed Light movements cannot acquire external-pound suggestions',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.workoutDifficulty='light';return [{name:'Single-Leg Hip Hinge',requires:[],seedKey:'hinge',prescription:'3 × 12–15'},{name:'Hard-Style Plank',requires:[],seedKey:'core',prescription:'3 × 20–45 sec'},{name:'Band Row',requires:['bands'],seedKey:'row',prescription:'40s controlled work · 3 rounds'}].map(ex=>({baseline:baselineLoadObject(u,ex),suggested:suggestedLoadObject(u,ex,0)}));`);
  for(const item of out){assert.equal(item.baseline.load,null);assert.equal(item.suggested.load,null);assert(!/\blb\b/.test(item.baseline.text));assert(!/\blb\b/.test(item.suggested.text));}
});
test('Light keeps pain warnings and does not turn completed timed work into a pound target',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.workoutDifficulty='light';u.today={'0-0':{weight:'50',reps:'10',rir:'2',done:true,feedback:'pain'}};const ex={name:'Band Row',requires:['bands'],seedKey:'row',prescription:'3 × 8–12'};const pain=nextSetRecommendation(u,ex,0);const timed=nextSetRecommendation(u,{...ex,prescription:'40s controlled work · 3 rounds'},0);return {pain,timed};`);
  assert.match(out.pain.label,/pain/i);assert(out.pain.load<=50);assert.equal(out.timed.load,null);assert(!/\blb\b/.test(out.timed.text));
});
test('Heavy preserves history-based working weights; equipment preference does not mean maximal loading',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.workoutDifficulty='heavy';const ex={name:'Barbell Bench Press',requires:['barbell'],seedKey:'bench',prescription:'3 × 8–12'};u.history=[{ts:1,details:[{...ex,sets:[{weight:'75',reps:'10',rir:'2',done:true}]}]}];return baselineLoadObject(u,ex);`);
  assert.equal(out.load,75);assert.match(out.confidence,/performance/i);
});
test('Heavy clamps carried-forward history and same-day targets to configured capacity',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.workoutDifficulty='heavy';u.capacities.dumbbellMax=20;const ex={name:'Goblet Squat',requires:['dumbbells'],seedKey:'squat',prescription:'3 × 8–12'};u.history=[{ts:1,details:[{...ex,sets:[{weight:'60',reps:'10',rir:'2',done:true}]}]}];const baseline=baselineLoadObject(u,ex);u.today={'0-0':{weight:'60',reps:'10',rir:'2',done:true}};return {baseline,suggested:suggestedLoadObject(u,ex,0),next:nextSetRecommendation(u,ex,0)};`);
  assert.equal(out.baseline.load,20);assert.equal(out.suggested.load,20);assert.equal(out.next.load,20);
});
test('local and cloud calibration cannot increase the Light working suggestion',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.workoutDifficulty='light';u.capacities.dumbbellMax=200;const ex={name:'Goblet Squat',requires:['dumbbells'],seedKey:'squat',prescription:'3 × 8–12'};u.history=[{ts:1,details:[{...ex,sets:[{weight:'125',reps:'10',rir:'2',done:true}]}]}];const initial=suggestedLoadObject(u,ex,0);u.sessionCalibration={factor:1.06};const calibrated=suggestedLoadObject(u,ex,0);u.today={'0-0':{weight:'200',reps:'12',rir:'5',done:true}};const computed=recalculateSessionCalibration(u,[ex]);return {initial,calibrated,computed};`);
  assert.equal(out.initial.load,100);assert.equal(out.calibrated.load,100);assert(out.computed.factor<=1);
});
test('Light reduces effort toward 4 RIR and a subsequent Balanced override drops the Light anchor',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.workoutDifficulty='light';const ex={name:'Barbell Bench Press',base:'Horizontal press',requires:['barbell'],seedKey:'bench',prescription:'3 × 8–12',sets:3,_difficulty:'light',_difficultyAnchorLoad:100};u.today={'0-0':{weight:'80',reps:'10',rir:'2',done:true}};const light=nextSetRecommendation(u,ex,0),plan=IronSixDifficulty.replanRemaining(u,'balanced',[ex]),balanced=nextSetRecommendation(u,plan[0],0);return {light,balanced,plan};`);
  assert(out.light.load<80);assert.equal(out.balanced.load,80);assert.equal(out.plan[0]._difficultyAnchorLoad,undefined);assert.equal(out.plan[0]._difficulty,'balanced');
});
test('fresh Light circuits keep less work than Balanced while cards and timer agree',()=>{
  const run=app();const out=run(`const rows=[];for(const key of ROTATION){const plans={};for(const level of ['light','balanced']){const u=makeUser();u.workoutDifficulty=level;u.trainingMode='circuit';u.workoutMinutes=60;u.program.currentWorkoutKey=key;const plan=finalWorkout(u);plans[level]={rounds:Math.max(...plan.map(e=>e.sets)),sets:plan.reduce((n,e)=>n+e.sets,0),seconds:sessionSeconds(u,plan),timeline:circuitTimeline(u,plan).reduce((n,s)=>n+s.seconds,0),valid:plan.every(e=>e.prescription.includes(e.sets+' rounds'))};}rows.push(plans);}return rows;`);
  for(const plans of out){assert(plans.light.rounds<=6);assert(plans.light.sets<plans.balanced.sets);assert.equal(plans.light.seconds,plans.light.timeline);assert(plans.light.valid);assert(plans.light.seconds<=3600);}
});
test('a sixty-minute Light session does not regain accessory sets through a volume bonus',()=>{
  const run=app();const out=run(`const rows=[];for(const key of ROTATION){const u=makeUser();u.workoutDifficulty='light';u.workoutMinutes=60;u.program.currentWorkoutKey=key;const intended=IronSixDifficulty.transformWorkout(u,buildWorkout(u));const plan=budgetSessionWorkout(u,intended);rows.push({intended,plan});}return rows;`);
  for(const {intended,plan} of out)for(const ex of plan){const target=intended.find(x=>x.name===ex.name);assert(target,ex.name);assert(ex.sets<=target.sets,`${ex.name} should retain the Light set ceiling`);}
});
test('Light anchors preserve decimal per-hand input units through the canonical parser',()=>{
  const run=app(true,true);const out=run(`const u=makeUser();u.today={'0-0':{weight:'22.5 lb each',reps:'10',rir:'4',done:true}};const ex={name:'Dumbbell Curl',requires:['dumbbells'],base:'Elbow flexion',seedKey:'curl',prescription:'3 × 8–12',sets:3};const plan=IronSixDifficulty.replanRemaining(u,'light',[ex]);return {plan,parsed:parseLoad(u.today['0-0'].weight),next:nextSetRecommendation(u,plan[0],0),today:u.today};`);
  assert.equal(out.parsed,22.5);assert.equal(out.plan[0]._difficultyAnchorLoad,22.5);assert(out.next.load<=22.5*.8+2.5);assert.equal(out.today['0-0'].weight,'22.5 lb each');
});
test('long imported prescriptions cannot cause numeric-range backtracking during difficulty suggestions',()=>{
  const run=app(),started=Date.now();
  const out=run(`const u=makeUser();u.workoutDifficulty='light';const digits='9'.repeat(100000),base={load:25,target:10,text:'25 lb',detail:''},ex={name:'Band Row',requires:['bands']};return {plain:IronSixDifficulty.adjustSuggestion(u,{...ex,prescription:digits+'!'},base),timed:IronSixDifficulty.adjustSuggestion(u,{...ex,prescription:digits+' seconds'},base)};`);
  const elapsed=Date.now()-started;
  assert.equal(out.plain.load,20,'non-time text still uses the lighter working load');assert.equal(out.timed.load,null,'time units still suppress invented pound targets');
  assert(elapsed<2000,`two long imported prescriptions took ${elapsed}ms; detection should scan text directly`);
});
