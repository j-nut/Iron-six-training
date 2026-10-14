// Deterministic snapshot of what the planner prescribes for profiles that never answered the goal
// or schedule questions. tests/goal-schedule-programming.test.js compares it with hashes taken from
// the base branch, so default users keep byte-identical plans after goal/schedule programming landed.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const FILES=['core.js','workout-difficulty.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js',
  'workout-upper.js','workout-dispatch.js','engine.js','session-planner.js','program-intelligence-v3.js','session-adaptation-v3.js'];
function context(dir){
  const RealDate=Date;let clock=RealDate.UTC(2026,8,1,12);
  class SimDate extends RealDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}}
  let seed=7;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
  const c={console,Date:SimDate,Math:Object.assign(Object.create(Math),{random}),JSON,__setClock:v=>{clock=v},
    localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:()=>null,addEventListener(){},querySelectorAll:()=>[]},setTimeout(){}};
  c.window=c;vm.createContext(c);
  for(const f of FILES)vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),c,{filename:f});
  return code=>JSON.parse(vm.runInContext('JSON.stringify((()=>{'+code+'})())',c));
}
// Twelve completed sessions per scenario, following the routine exactly as finishWorkout does.
const SCENARIO=(equipment,minutes,mode,legacy)=>`
  const NONE={dumbbells:false,barbell:false,landmine:false,rack:false,bench:false,pullup:false,bands:false,abwheel:false,medball:false};
  const base=makeUser('Snapshot',180,${equipment==='home'?'DEFAULT_EQUIPMENT':equipment==='db'?'{...NONE,dumbbells:true,bench:true}':'{...NONE,pullup:true}'});
  ${legacy?`for(const k of ['goal','daysPerWeek','strengthRefs','limitations','preferences','onboarding'])delete base[k];`:''}
  const u=normalizeUser({...base,id:'fixed',workoutMinutes:${minutes},trainingMode:${JSON.stringify(mode)}});
  let t=Date.UTC(2026,8,1,12);const out=[];
  for(let i=0;i<12;i++){
    __setClock(t+36e5);
    const key=u.program.currentWorkoutKey,plan=finalWorkout(u);
    out.push({key,forecast:routineForecast(u,6),seconds:sessionSeconds(u,plan),plan});
    const details=plan.map((e,ei)=>({name:e.name,base:e.base,seedKey:e.seedKey,prescription:e.prescription,sets:Array.from({length:e.sets},(_,si)=>({done:si<e.sets-(i%3===2&&ei===plan.length-1?1:0),reps:repTarget(e),weight:'',rir:2}))}));
    t+=2*864e5;
    const done=details.reduce((n,d)=>n+d.sets.filter(s=>s.done).length,0),session={ts:t,sessionId:'s'+i,workoutKey:key,details,sets:done,plannedSets:details.reduce((n,d)=>n+d.sets.length,0)};
    session.routineAfter=routineAfter(u,session);u.history.unshift(session);u.program.exposures[key]=(Number(u.program.exposures[key])||0)+1;completeRoutine(u,session);
  }
  return out;`;
function snapshot(dir){
  const groups={};
  for(const legacy of [false,true])for(const equipment of ['home','db','bw'])for(const mode of ['traditional','circuit'])for(const minutes of [10,20,45,60,120]){
    const run=context(dir),json=JSON.stringify(run(SCENARIO(equipment,minutes,mode,legacy)));
    groups[`${legacy?'legacy':'new'}:${equipment}:${mode}:${minutes}`]=crypto.createHash('sha256').update(json).digest('hex').slice(0,16);
  }
  return groups;
}
module.exports={snapshot,context};
if(require.main===module)console.log(JSON.stringify(snapshot(process.argv[2]||process.cwd()),null,1));
