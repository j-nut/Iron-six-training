/* Shared deterministic budgets: the timer and exercise cards use the same plan. */
const CIRCUIT_PACES={steady:{work:30,rest:30,label:'Steady · 30s / 30s'},balanced:{work:40,rest:20,label:'Strong · 40s / 20s'},intense:{work:45,rest:20,label:'Intense · 45s / 20s'}};
function circuitPace(u){return (Number(u.readiness?.energy||4)<=2)?CIRCUIT_PACES.steady:(CIRCUIT_PACES[u.circuitPace]||CIRCUIT_PACES.balanced)}
function circuitSuitable(ex){return !/barbell|deadlift|good morning|meadows|ab wheel|ab roller|superset/i.test(ex.name)}
function circuitExercise(u,ex){
  const pool=[ex,...(ex._alternatives||[])].filter(x=>exerciseAvailable(u,x)&&circuitSuitable(x));
  const chosen=pool[0];return chosen?{...ex,...chosen,_alternatives:pool.filter(x=>x.name!==chosen.name)}:null;
}
function sessionWarmup(u){return Number(u.workoutMinutes)<=20?120:180}
function traditionalSetSeconds(ex){
  const both=/each (?:leg|arm|side)|each$|one-arm|single-leg|split squat|lunge/i.test(ex.prescription+' '+ex.name),superset=/superset| \+ /i.test(ex.prescription+' '+ex.name);
  const work=superset?90:both?90:45;
  const compound=['bench','chest_press','overhead_press','squat','hinge','split_squat','pullup','row'].includes(ex.seedKey);
  return work+((ex.priority||2)===1?150:compound?120:60);
}
function sessionSeconds(u,plan){
  const base=sessionWarmup(u)+60;
  if(u.trainingMode==='circuit'){
    const pace=circuitPace(u),rounds=Math.max(0,...plan.map(e=>e.sets));
    return base+plan.reduce((n,e)=>n+e.sets*(pace.work+Math.max(20,pace.rest)),0)+Math.max(0,rounds-1)*45;
  }
  return base+plan.reduce((n,e)=>n+45+e.sets*traditionalSetSeconds(e),0);
}
function budgetSessionWorkout(u,workout){
  const circuit=u.trainingMode==='circuit',minutes=Number(u.workoutMinutes||60),budget=Math.max(600,Math.min(7200,minutes*60));
  let pool=workout.filter(e=>e&&exerciseAvailable(u,e)).map(e=>circuit?circuitExercise(u,e):{...e}).filter(Boolean);
  const coverage=muscleCoverage(u),due=new Set(MUSCLE_GROUPS.filter(m=>coverage.last[m]===null||coverage.last[m]>=3));
  const traditionalCount=minutes<=10?2:minutes<=20?3:minutes<=30?4:minutes<60?Math.min(4,pool.length):pool.length;
  const count=circuit?Math.min(4,pool.length):Math.min(traditionalCount,pool.length);
  const exposure=Number(u.program?.exposures?.[u.program?.currentWorkoutKey])||0;
  const specificity=e=>e.seedKey==='calves'?['calves']:e.seedKey==='core'?['core']:e.seedKey==='ham_curl'?['hamstrings']:exerciseMuscles(e);
  const recentDose=e=>(u.history||[]).slice(0,6).reduce((n,h)=>n+(h.details||[]).reduce((v,d)=>v+(d.seedKey===e.seedKey?(d.sets||[]).filter(s=>s.done===true).length:0),0),0);
  pool=pool.map((e,i)=>({...e,_position:i}));
  const anchors=pool.filter(e=>e.priority===1),accessories=pool.filter(e=>e.priority!==1);
  // Short and 45-minute plans retain main work plus the most useful accessories.
  // At 60+ minutes the full menu is available so extra time produces a meaningfully fuller session,
  // not merely the identical exercise list with more sets.
  accessories.sort((a,b)=>recentDose(a)-recentDose(b)||Number(specificity(b).some(m=>due.has(m)))-Number(specificity(a).some(m=>due.has(m)))||((a._position+exposure)%Math.max(1,pool.length))-((b._position+exposure)%Math.max(1,pool.length)));
  let selected=[...anchors,...accessories].slice(0,count).map(e=>({...e,sets:1,_max:Math.max(1,e.sets)}));
  const covered=new Set(selected.flatMap(exerciseMuscles));
  const neglected=accessories.find(e=>!selected.some(x=>x.name===e.name)&&specificity(e).some(m=>due.has(m)&&!covered.has(m)));
  if(neglected&&selected.length>2&&selected[selected.length-1].priority!==1)selected[selected.length-1]={...neglected,sets:1,_max:Math.max(1,neglected.sets)};
  selected.sort((a,b)=>a._position-b._position);
  while(selected.length>1&&sessionSeconds(u,selected)>budget)selected.pop();
  if(circuit){
    const maxRounds=Number(u.readiness?.energy||4)<=2?4:8;
    while(selected.length&&selected[0].sets<maxRounds){const next=selected.map(e=>({...e,sets:e.sets+1}));if(sessionSeconds(u,next)>budget)break;selected=next}
    // Use the remaining short-session budget for a final partial round.
    if(minutes<=30)for(const e of selected){if(e.sets>=maxRounds)continue;e.sets++;if(sessionSeconds(u,selected)>budget)e.sets--}
  }else{
    let grew=true;
    while(grew){grew=false;for(const e of selected){if(e.sets>=e._max)continue;e.sets++;if(sessionSeconds(u,selected)>budget)e.sets--;else grew=true}}
  }
  return selected.map(({_position,_max,...e})=>({...e,prescription:circuit?circuitPace(u).work+'s controlled work · '+e.sets+' rounds':String(e.prescription).replace(/^\d+\s*×/,e.sets+' ×')}));
}
function circuitTimeline(u,plan){
  const pace=circuitPace(u),steps=[{kind:'warmup',seconds:sessionWarmup(u),title:'Warm up',cue:'Easy movement, then light practice reps of today’s exercises.'}];
  const rounds=Math.max(0,...plan.map(e=>e.sets));
  for(let round=0;round<rounds;round++){
    plan.forEach((ex,index)=>{if(round>=ex.sets)return;
      steps.push({kind:'work',seconds:pace.work,title:ex.name,cue:'Controlled reps. Leave at least 2 reps in reserve.',index,setIndex:round,round:round+1,rounds});
      steps.push({kind:'rest',seconds:Math.max(20,pace.rest),title:'Rest & change stations',cue:'Breathe, log your reps, and prepare the next exercise.',round:round+1,rounds});
    });
    if(round<rounds-1)steps.push({kind:'roundRest',seconds:45,title:'Round recovery',cue:'Recover before the next round.',round:round+1,rounds});
  }
  steps.push({kind:'cooldown',seconds:60,title:'Cool down',cue:'Slow your breathing and move gently.'});
  return steps;
}
/* Deadline-based timer state; UI repaint frequency does not change elapsed time. */
function circuitClock(steps,stored){
  let state={index:0,remaining:steps[0]?.seconds*1000||0,running:false,deadline:0,...stored};
  state.running=false;state.deadline=0;
  if(!Number.isInteger(state.index)||state.index<0||state.index>steps.length)state={index:0,remaining:(steps[0]?.seconds||0)*1000,running:false,deadline:0};
  state.remaining=Math.max(0,Math.min(Number(state.remaining)||0,(steps[state.index]?.seconds||0)*1000));
  return {
    get state(){return {...state}},
    start(now){if(state.index>=steps.length)return;state.running=true;state.deadline=now+state.remaining},
    pause(now){if(state.running)state.remaining=Math.max(0,state.deadline-now);state.running=false;state.deadline=0},
    advance(now){state.index++;state.remaining=(steps[state.index]?.seconds||0)*1000;state.running=state.running&&state.index<steps.length;state.deadline=state.running?now+state.remaining:0},
    tick(now){if(!state.running)return false;state.remaining=Math.max(0,state.deadline-now);if(state.remaining===0){this.advance(now);return true}return false
    }
  };
}
