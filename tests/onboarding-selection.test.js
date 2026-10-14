// Regression tests for exercise selection on the onboarding-driven splits (2-4 days a week): every
// full-body day keeps a loaded lower lift, a press and a pull; limitations never strip load; and a
// strength goal gives the main lifts three working sets before any accessory.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

const FILES=['core.js','workout-difficulty.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js',
  'workout-upper.js','workout-dispatch.js','engine.js','session-planner.js','exercise-registry.js','load-progression-v2.js','session-adaptation-v3.js'];
function context(){
  const RealDate=Date;let clock=RealDate.UTC(2026,8,1,12);
  class SimDate extends RealDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}}
  const c={console,Date:SimDate,JSON,__setClock:v=>{clock=v},localStorage:{getItem:()=>null,setItem(){}},
    document:{getElementById:()=>null,addEventListener(){},querySelectorAll:()=>[]},setTimeout(){}};
  c.window=c;vm.createContext(c);
  for(const f of FILES)vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  return code=>JSON.parse(vm.runInContext('JSON.stringify((()=>{'+code+'})())',c));
}
const NONE='{dumbbells:false,barbell:false,landmine:false,rack:false,bench:false,pullup:false,bands:false,abwheel:false,medball:false}';
const EQUIPMENT={barbellRack:`{...${NONE},barbell:true,rack:true}`,barbellBench:`{...${NONE},barbell:true,rack:true,bench:true}`,dumbbells:`{...${NONE},dumbbells:true}`,
  dumbbellBench:`{...${NONE},dumbbells:true,bench:true}`,home:'DEFAULT_EQUIPMENT',bodyweight:`{...${NONE},pullup:true}`};
const LOW=['Lean-Away Lateral Raise','Prone Lat Pull','Isometric Lat Press','Towel Isometric Curl','Bodyweight Curl Isometric','Hamstring Walkout'];
const PRESS=['bench','chest_press','overhead_press'],PULL=['row','pullup'],LOWER=['squat','hinge'];
// Sessions planned and completed through the real routine, one every two days.
const sessions=({equipment,goal,days,minutes,limitations=[],count})=>`
  const u=normalizeUser({...makeUser('Onboarded',160,${equipment}),trainingLevel:'beginner',workoutMinutes:${minutes},trainingMode:'traditional',
    strengthRefs:{squat:{weight:185,reps:5,equipment:'barbell'}},limitations:${JSON.stringify(limitations)}});
  applyProgramSettings(u,{goal:'${goal}',daysPerWeek:${days}});
  const loaded=e=>/barbell|dumbbell|landmine|band/.test(((e.requires||[]).join(' ')+' '+e.name).toLowerCase());
  const out=[];let t=Date.UTC(2026,8,1,12);
  for(let i=0;i<${count};i++){
    __setClock(t);
    const key=u.program.currentWorkoutKey,plan=finalWorkout(u);
    out.push({key,seconds:sessionSeconds(u,plan),plan:plan.map(e=>({name:e.name,seed:e.seedKey,sets:e.sets,priority:e.priority,loaded:loaded(e),
      altLoaded:(e._alternatives||[]).some(a=>loaded(a)&&exerciseAvailable(u,a)),load:suggestedLoadObject(u,e,0).load,loadFactor:e._loadFactor,reason:e._adaptReason||'',
      swappedFrom:/swapped to/.test(e._adaptReason||'')?{name:e._alternatives[0].name,loaded:loaded(e._alternatives[0])}:null}))});
    const details=plan.map(e=>({name:e.name,base:e.base,seedKey:e.seedKey,prescription:e.prescription,sets:Array.from({length:e.sets},()=>({done:true,reps:repTarget(e),weight:'',rir:2}))}));
    const session={ts:t+36e5,sessionId:'s'+i,workoutKey:key,details,sets:details.reduce((n,d)=>n+d.sets.length,0),plannedSets:details.reduce((n,d)=>n+d.sets.length,0)};
    session.routineAfter=routineAfter(u,session);u.history.unshift(session);u.program.exposures[key]=(Number(u.program.exposures[key])||0)+1;completeRoutine(u,session);
    t+=2*864e5;
  }
  return out;`;

test('reported reproduction: barbell + rack, strength, 3 days, 30 min, knee', () => {
  const [knee]=context()(sessions({equipment:EQUIPMENT.barbellRack,goal:'strength',days:3,minutes:30,limitations:['knee'],count:1}));
  const [plain]=context()(sessions({equipment:EQUIPMENT.barbellRack,goal:'strength',days:3,minutes:30,count:1}));
  assert.equal(knee.key,'full_a');
  assert.deepEqual(plain.plan.map(e=>e.name),['Barbell Back Squat','Barbell Overhead Press','Barbell Row']);
  assert.deepEqual(knee.plan.map(e=>e.name),['Barbell Back Squat','Barbell Overhead Press','Barbell Row'],'the knee keeps the squat (lighter), not a bodyweight squat');
  for(const p of [knee,plain])for(const e of p.plan){assert.equal(e.priority,1);assert(e.sets>=3,`${e.name} has ${e.sets} sets`)}
  assert(knee.seconds<=1800&&plain.seconds<=1800);
  assert.equal(plain.plan[0].load,165,'squat seeded from the 185 x 5 strength check');
  const squat=knee.plan[0];
  assert.equal(squat.loadFactor,0.9);
  assert(squat.load<165&&squat.load>=135,`knee squat starts lighter (${squat.load})`);
  assert.match(squat.reason,/^You noted your knee: starting this lighter with about 2 extra reps in reserve\./);
  for(const name of ['Tempo Bodyweight Squat','Push-Up','Hamstring Walkout','Lean-Away Lateral Raise'])assert(!knee.plan.some(e=>e.name===name),name);
});

test('every full-body and upper day has a lower lift, a press and a pull, loaded when free weights allow', () => {
  for(const [eqName,equipment] of Object.entries(EQUIPMENT))for(const goal of ['strength','muscle','general'])for(const days of [2,3,4])for(const minutes of [30,45]){
    const free=eqName!=='bodyweight';
    for(const s of context()(sessions({equipment,goal,days,minutes,count:days*2}))){
      const tag=`${eqName}/${goal}/${days}d/${minutes}m/${s.key}`,p=s.plan;
      if(/^full/.test(s.key))assert(p.some(e=>LOWER.includes(e.seed)&&(!free||e.loaded)),tag+' loaded squat or hinge');
      if(/^(full|upper)/.test(s.key)){
        assert(p.some(e=>PRESS.includes(e.seed)&&(!free||e.loaded)),tag+' press '+p.map(e=>e.name));
        assert(p.some(e=>PULL.includes(e.seed)),tag+' pull '+p.map(e=>e.name));
      }
      for(const e of p){
        assert(!(LOW.includes(e.name)&&e.altLoaded),tag+' low-stimulus '+e.name+' beat a loaded option');
        if(e.name==='Hamstring Walkout')assert(!free||p.some(x=>x.seed==='hinge'&&x.loaded),tag+' walkout instead of a loaded hinge');
      }
    }
  }
});

test('without free weights the bodyweight press and pull-up stay', () => {
  const [day]=context()(sessions({equipment:EQUIPMENT.bodyweight,goal:'strength',days:3,minutes:30,count:1}));
  assert(day.plan.some(e=>/Push-Up/.test(e.name)),day.plan.map(e=>e.name).join());
  assert(day.plan.some(e=>e.seed==='pullup'));
});

test('limitation swaps never trade a loaded lift for an unloaded one', () => {
  for(const [eqName,equipment] of Object.entries(EQUIPMENT))for(const limitation of ['knee','shoulder','lower_back'])for(const goal of ['strength','muscle']){
    for(const s of context()(sessions({equipment,goal,days:3,minutes:45,limitations:[limitation],count:3})))for(const e of s.plan)
      if(e.swappedFrom?.loaded)assert(e.loaded,`${eqName}/${limitation}/${goal}: ${e.swappedFrom.name} -> ${e.name}`);
  }
  // A strength lifter's main squat keeps its barbell (Box Squat); a muscle-goal lifter may take a goblet squat.
  const [strength]=context()(sessions({equipment:'DEFAULT_EQUIPMENT',goal:'strength',days:3,minutes:45,limitations:['knee'],count:1}));
  assert.equal(strength.plan[0].name,'Barbell Box Squat');
  const [muscle]=context()(sessions({equipment:'DEFAULT_EQUIPMENT',goal:'muscle',days:3,minutes:45,limitations:['knee'],count:1}));
  assert.equal(muscle.plan[0].name,'Goblet Squat');
});

test('adaptation rule: loaded originals only swap to loaded options; unloaded originals may swap freely', () => {
  const c={document:{getElementById(){return null},addEventListener(){}},setTimeout(){},exerciseAvailable:()=>true,exerciseMuscles:()=>['quads']};
  c.window=c;c.IronSixTrainerV2={trainingState:()=>({phase:'Build',fatigue:0})};vm.createContext(c);
  vm.runInContext(fs.readFileSync('session-adaptation-v3.js','utf8'),c);
  const adapt=(u,plan)=>c.IronSixAdaptiveSessionV3.adaptPlan({readiness:{energy:4},history:[{ts:Date.now()-864e5}],...u},plan);
  const ex=(name,requires,extra={})=>({name,requires,base:'Primary squat',seedKey:'squat',prescription:'3 × 8',sets:3,priority:1,...extra});
  const back=ex('Barbell Back Squat',['barbell','rack']),tempo=ex('Tempo Bodyweight Squat',[]),box=ex('Barbell Box Squat',['barbell','rack','bench']),goblet=ex('Goblet Squat',['dumbbells']);
  const slot=(e,alts)=>({...e,_alternatives:alts});
  const [kept]=adapt({limitations:['knee']},[slot(back,[tempo])]);
  assert.equal(kept.name,'Barbell Back Squat');assert.equal(kept._loadFactor,0.9);
  const [strength]=adapt({limitations:['knee'],goal:'strength'},[slot(back,[goblet,box,tempo])]);
  assert.equal(strength.name,'Barbell Box Squat','strength main lift keeps its barbell');
  const [onlyGoblet]=adapt({limitations:['knee'],goal:'strength'},[slot(back,[goblet,tempo])]);
  assert.equal(onlyGoblet.name,'Barbell Back Squat','no barbell variant: keep the lift, lighter');
  const [accessory]=adapt({limitations:['knee'],goal:'strength'},[slot({...back,priority:2},[goblet,tempo])]);
  assert.equal(accessory.name,'Goblet Squat','accessories may change equipment, still loaded');
  const [bodyweight]=adapt({limitations:['knee']},[slot(ex('1½-Rep Bodyweight Squat',[]),[tempo])]);
  assert.equal(bodyweight.name,'Tempo Bodyweight Squat','bodyweight originals may use a bodyweight swap');
});

test('strength: main lifts reach three sets before any accessory at 20, 30 and 45 minutes', () => {
  for(const [eqName,equipment] of Object.entries(EQUIPMENT))for(const days of [2,3,4])for(const minutes of [20,30,45]){
    for(const s of context()(sessions({equipment,goal:'strength',days,minutes,count:days*2}))){
      const tag=`${eqName}/${days}d/${minutes}m/${s.key}`,mains=s.plan.filter(e=>e.priority===1);
      assert(s.seconds<=minutes*60,tag+' over budget');
      assert(mains.length&&mains[0].sets>=3,tag+' first main lift '+mains[0]?.sets);
      // One-arm dumbbell rows work each side in turn, so a dumbbell-only 30-minute day may hold the pull at two sets.
      if(minutes>=30&&eqName!=='dumbbells')assert(mains.every(e=>e.sets>=3),tag+' '+mains.map(e=>e.name+' '+e.sets));
      if(mains.some(e=>e.sets<3))assert(s.plan.every(e=>e.priority===1),tag+' accessory added while a main lift is short');
    }
  }
});
