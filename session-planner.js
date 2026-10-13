/* Shared deterministic budgets: the timer and exercise cards use the same plan. */
const CIRCUIT_PACES={steady:{work:30,rest:30,label:'Steady · 30s / 30s'},balanced:{work:40,rest:20,label:'Strong · 40s / 20s'},intense:{work:45,rest:20,label:'Intense · 45s / 20s'}};
function circuitPace(u){return (Number(u.readiness?.energy||4)<=2)?CIRCUIT_PACES.steady:(CIRCUIT_PACES[u.circuitPace]||CIRCUIT_PACES.balanced)}
function circuitSuitable(ex){
  // Exclude by equipment first (loaded barbell/rack/landmine work is not a safe 40 s station), then by technical movement.
  const gear=(ex.requires||[]).map(String);
  if(gear.includes('barbell')||gear.includes('rack')||gear.includes('landmine'))return false;
  return !/barbell|landmine|pendlay|good morning|meadows|ab wheel|ab roller|superset|^(?:conventional |sumo )?deadlift$/i.test(ex.name);
}
const UNILATERAL_PATTERN=/each (?:leg|arm|side)|each$|one-arm|single-leg|split squat|lunge/i;
function unilateralByName(ex){return UNILATERAL_PATTERN.test(String(ex.prescription||'')+' '+String(ex.name||''))}
// Circuit prescriptions are rewritten ("40s controlled work · 3 rounds"), so the flag is stored at planning time.
function isUnilateral(ex){return typeof ex._unilateral==='boolean'?ex._unilateral:unilateralByName(ex)}
function circuitExercise(u,ex,used=new Set()){
  const pool=[ex,...(ex._alternatives||[])].filter(x=>exerciseAvailable(u,x)&&circuitSuitable(x)&&!used.has(String(x.name).toLowerCase()));
  const chosen=pool[0];return chosen?{...ex,...chosen,sets:ex.sets,priority:ex.priority,_programSlot:ex._programSlot,_anchor:ex._anchor,_unilateral:unilateralByName(chosen),_alternatives:pool.filter(x=>x.name!==chosen.name)}:null;
}
function sessionWarmup(u){return Number(u.workoutMinutes)<=20?120:180}
/* Rest scales with the time the user has: a 15-minute session cannot afford 2.5 minutes between sets. */
function restProfile(minutes){
  if(minutes<=20)return {main:70,compound:45,accessory:40,setup:20,work:40};
  if(minutes<=30)return {main:100,compound:70,accessory:50,setup:35,work:45};
  if(minutes<60)return {main:135,compound:90,accessory:60,setup:45,work:45};
  return {main:150,compound:120,accessory:60,setup:45,work:45};
}
/* Goal changes rest, not the user's time budget: heavy strength sets need longer recovery between
 * main-lift sets; general fitness trains a little further from failure and can rest less. */
const GOAL_REST={strength:{main:1.25,compound:1.15,accessory:1},general:{main:.85,compound:.9,accessory:1}};
function goalRestProfile(minutes,goal){
  const prof=restProfile(minutes),f=GOAL_REST[goal];
  return f?{...prof,main:Math.round(prof.main*f.main),compound:Math.round(prof.compound*f.compound),accessory:Math.round(prof.accessory*f.accessory)}:prof;
}
function traditionalSetSeconds(ex,minutes=60,goal='muscle'){
  const prof=goalRestProfile(minutes,goal),superset=/superset| + /i.test(ex.prescription+' '+ex.name);
  // Unilateral and superset sets work both sides/movements before the rest.
  const work=(superset||isUnilateral(ex))?prof.work*2:prof.work;
  const compound=['bench','chest_press','overhead_press','squat','hinge','split_squat','pullup','row'].includes(ex.seedKey);
  return work+((ex.priority||2)===1?prof.main:compound?prof.compound:prof.accessory);
}
/* Display-only ramp-up sets before heavy barbell/dumbbell main lifts (traditional mode). They are never
 * logged as working sets; the UI shows them as a warm-up line. Their time overlaps the general warm-up. */
const RAMP_SET_SECONDS=35;
function rampSpec(u,plan){
  if(u.trainingMode==='circuit')return plan.map(()=>null);
  const short=(Number(u.workoutMinutes)||60)<=20;let first=true;
  return plan.map(e=>{
    if(e.priority!==1||!/barbell|dumbbell/i.test((e.requires||[]).join(' ')+' '+e.name))return null;
    const sets=first
      ?(short?[{pct:60,reps:5},{pct:80,reps:3}]:[{pct:50,reps:8},{pct:70,reps:5},{pct:85,reps:3}])
      :(short?[{pct:75,reps:3}]:[{pct:60,reps:5},{pct:80,reps:3}]);
    first=false;return sets;
  });
}
function rampText(ramp){return ramp.map(r=>r.reps+' × '+r.pct+'%').join(' · ')+' of working weight (warm-up, not logged)'}
function sessionSeconds(u,plan){
  const minutes=Number(u.workoutMinutes)||60;
  if(u.trainingMode==='circuit'){
    const pace=circuitPace(u),rounds=Math.max(0,...plan.map(e=>e.sets)),base=sessionWarmup(u)+60;
    return base+plan.reduce((n,e)=>n+e.sets*((isUnilateral(e)?2:1)*pace.work+Math.max(20,pace.rest)),0)+Math.max(0,rounds-1)*45;
  }
  const prof=restProfile(minutes),rampSec=rampSpec(u,plan).reduce((n,r)=>n+(r?r.length*RAMP_SET_SECONDS:0),0);
  // Ramp sets double as warm-up: a minimum general block (60 s) plus the ramps, never less than the standard warm-up.
  const pre=Math.max(sessionWarmup(u),60+rampSec);
  const goal=typeof programGoal==='function'?programGoal(u):'muscle';
  return pre+60+plan.reduce((n,e)=>n+prof.setup+e.sets*traditionalSetSeconds(e,minutes,goal),0);
}
/* Rolling completed-work coverage for short sessions.
 * Floors are direct completed sets expected over COVERAGE_WINDOW completed sessions (1.5 rotation
 * cycles). They only rank which optional movement earns a scarce slot; they never add catch-up sets.
 * Doses count sets with done===true, never planned sets. */
const COVERAGE_WINDOW=9;
const SMALL_GROUP_FLOORS={lateral_delts:4,triceps:4,lat_iso:4,rear_delts:3,biceps:5,hamstrings:4,calves:4,core:3,hip_extension:3};
const COMPOUND_GROUP_FLOORS={chest_press:12,overhead_press:4,vertical_pull:6,row:6,squat:8,hinge:6,unilateral:4};
function programCategoryOf(seedKey){
  const s=seedKey;
  if(['bench','chest_press','fly'].includes(s))return 'chest_press';
  if(s==='overhead_press')return 'overhead_press';if(s==='lateral_raise')return 'lateral_delts';if(s==='triceps')return 'triceps';
  if(s==='pullup')return 'vertical_pull';if(s==='row')return 'row';if(s==='lat_iso')return 'lat_iso';if(s==='rear_delt')return 'rear_delts';if(['curl','hammer_curl'].includes(s))return 'biceps';
  if(s==='squat')return 'squat';if(s==='hinge')return 'hinge';if(s==='split_squat')return 'unilateral';if(s==='hip_thrust')return 'hip_extension';if(s==='ham_curl')return 'hamstrings';if(s==='calves')return 'calves';if(s==='core')return 'core';
  return null;
}
function rollingCoverage(u,windowSize=COVERAGE_WINDOW){
  const sessions=(u?.history||[]).filter(h=>(h.details||[]).some(d=>(d.sets||[]).some(x=>x?.done===true))).slice(0,windowSize),dose={};
  for(const h of sessions)for(const d of h.details||[]){const k=programCategoryOf(d.seedKey);if(k)dose[k]=(dose[k]||0)+(d.sets||[]).filter(x=>x?.done===true).length}
  const scale=Math.max(.35,Math.min(1,sessions.length/windowSize));
  // need: 0 = adequately dosed in the window, 1 = no completed direct work. New users start at 1 everywhere.
  const need=key=>{const floor=SMALL_GROUP_FLOORS[key]||COMPOUND_GROUP_FLOORS[key];return floor?Math.max(0,1-(dose[key]||0)/(floor*scale)):0};
  return {sessions:sessions.length,dose,need};
}
function budgetSessionWorkout(u,workout){
  const circuit=u.trainingMode==='circuit',light=window.IronSixDifficulty?.effectiveFor(u)==='light',minutes=Number(u.workoutMinutes||60),budget=Math.max(600,Math.min(7200,minutes*60));
  const used=new Set();
  let pool=workout.filter(e=>e&&exerciseAvailable(u,e)).map(e=>{const selected=circuit?circuitExercise(u,e,used):{...e,_unilateral:unilateralByName(e)};if(selected)used.add(String(selected.name).toLowerCase());return selected}).filter(Boolean);
  const coverage=muscleCoverage(u),due=new Set(MUSCLE_GROUPS.filter(m=>coverage.last[m]===null||coverage.last[m]>=3));
  const exposure=Number(u.program?.exposures?.[u.program?.currentWorkoutKey])||0;
  const specificity=e=>e.seedKey==='calves'?['calves']:e.seedKey==='core'?['core']:e.seedKey==='ham_curl'?['hamstrings']:exerciseMuscles(e);
  const recentDose=e=>(u.history||[]).slice(0,6).reduce((n,h)=>n+(h.details||[]).reduce((v,d)=>v+(d.seedKey===e.seedKey?(d.sets||[]).filter(s=>s.done===true).length:0),0),0);
  const programCategory=e=>programCategoryOf(e.seedKey);
  const deficitRows=window.IronSixProgramV3?.deficits?.(u)||[],deficitMap=new Map(deficitRows.map(x=>[x.key,x]));
  const programNeed=e=>{const row=deficitMap.get(programCategory(e));return row?Math.max(0,Math.min(2,row.deficit/Math.max(1,row.expected))):0};
  pool=pool.map((e,i)=>({...e,_position:i}));
  // Long sessions add real work instead of repeating the same plan: a second variation of the most
  // under-dosed accessory slots (capped at 3 sets each), plus extra sets via setsBonus below.
  const extraN=circuit?(minutes>=90?2:minutes>=60?1:0):(minutes>=105?3:minutes>=90?2:minutes>=75?1:0);
  if(extraN){
    const names=new Set(pool.map(e=>String(e.name).toLowerCase())),extras=[],covEarly=rollingCoverage(u);
    for(const e of pool){
      if(e.priority===1)continue;
      const alt=(e._alternatives||[]).find(a=>exerciseAvailable(u,a)&&(!circuit||circuitSuitable(a))&&!names.has(String(a.name).toLowerCase()));
      if(alt){names.add(String(alt.name).toLowerCase());extras.push({...alt,sets:Math.min(3,Math.max(1,e.sets)),priority:3,_programSlot:(e._programSlot||'x')+'_extra',_extra:true,_anchor:false,_unilateral:unilateralByName(alt),_alternatives:[],_position:e._position+.5})}
    }
    extras.sort((x,y)=>covEarly.need(programCategoryOf(y.seedKey))-covEarly.need(programCategoryOf(x.seedKey))||x._position-y._position);
    // No other slot may swap into an extra's movement (a pain swap or difficulty replan would duplicate it).
    const chosenExtras=extras.slice(0,extraN),taken=new Set(chosenExtras.map(x=>x.name));
    pool=[...pool.map(e=>({...e,_alternatives:(e._alternatives||[]).filter(a=>!taken.has(a.name))})),...chosenExtras];
  }
  const traditionalCount=minutes<=10?2:minutes<=20?3:minutes<=30?4:pool.length;
  const circuitCount=minutes<=30?4:minutes<60?5:pool.length;
  const count=Math.min(circuit?circuitCount:traditionalCount,pool.length);
  // Goal shifts where long-session volume goes: strength adds main-lift sets and trims accessory
  // sets; general fitness keeps slightly lower volume overall. Muscle is unchanged.
  const goal=typeof programGoal==='function'?programGoal(u):'muscle';
  const baseBonus=e=>circuit||light||e._extra?0:e.priority===1?(minutes>=90?2:minutes>=45?1:0):(minutes>=105?3:minutes>=60?2:minutes>=45?1:0);
  const setsBonus=goal==='muscle'?baseBonus:e=>{const b=baseBonus(e);if(!b)return 0;return goal==='strength'?(e.priority===1?b+1:b-1):b-1};
  const anchors=pool.filter(e=>e.priority===1),accessories=pool.filter(e=>e.priority!==1);
  // Short and 45-minute plans retain main work plus the most useful accessories. Completed
  // rolling-program history is a priority signal: recurring omissions rise, but we do not add
  // catch-up volume or displace stable benchmark lifts just to satisfy a quota.
  accessories.sort((a,b)=>programNeed(b)-programNeed(a)||recentDose(a)-recentDose(b)||Number(specificity(b).some(m=>due.has(m)))-Number(specificity(a).some(m=>due.has(m)))||((a._position+exposure)%Math.max(1,pool.length))-((b._position+exposure)%Math.max(1,pool.length)));
  // On short pull days protect the complementary vertical/horizontal patterns and
  // the planned curl angle. Without this guard, an under-dosed lat or rear-delt
  // accessory can repeatedly displace direct biceps work, leaving users with
  // hammer-only (or supinated-only) exposures despite the A/B program.
  // Ten-minute micro sessions remain free to prioritize just two pulling patterns.
  const pullKey=u.program?.currentWorkoutKey;
  const protectedPullSlots=minutes>=15&&pullKey==='pull_a'
    ? new Set(['row','curl_long'])
    : minutes>=15&&pullKey==='pull_b'
      ? new Set(['vertical','hammer'])
      : new Set();
  const protectedAccessories=accessories.filter(e=>protectedPullSlots.has(e._programSlot));
  const otherAccessories=accessories.filter(e=>!protectedPullSlots.has(e._programSlot));
  // Slot allocation. Anchors keep the highest-value lifts (at 10 minutes only the first anchor is
  // guaranteed). One open slot is reserved for the most under-dosed small muscle group, judged on
  // completed sets in a rolling window, and it is ranked against the strongest second compound
  // (protected pull pattern, displaced anchor, or secondary lift) instead of always losing to it.
  // Protected curl angles win ties but yield once biceps are adequately dosed and another group is not.
  const cov=rollingCoverage(u),isSmall=e=>Boolean(SMALL_GROUP_FLOORS[programCategory(e)]);
  // Full-body days keep their lower, press and pull main lifts together whenever the slot count allows.
  const fullBody=/^full/.test(String(u.program?.currentWorkoutKey||''));
  const keep=anchors.slice(0,Math.max(1,Math.min(anchors.length,fullBody?count:count-(minutes<=10&&!circuit?1:0)-(anchors.length>=count?1:0))));
  const dropped=anchors.filter(e=>!keep.includes(e));
  const leftover=[...dropped,...protectedAccessories,...otherAccessories];
  const tie=(a,b)=>Number(protectedPullSlots.has(b._programSlot))-Number(protectedPullSlots.has(a._programSlot))||Number(specificity(b).some(m=>due.has(m)))-Number(specificity(a).some(m=>due.has(m)))||recentDose(a)-recentDose(b)||((a._position+exposure)%Math.max(1,pool.length))-((b._position+exposure)%Math.max(1,pool.length));
  // A muscle absent from (or last trained 4+ sessions ago in) the eight-session muscle log is urgent, so
  // exclusive muscles such as calves and core cannot be starved by redundant hamstring/glute accessories.
  const urgent=e=>specificity(e).some(m=>coverage.last[m]===null||coverage.last[m]>=4);
  const needOf=e=>Math.min(1.6,cov.need(programCategory(e))+(urgent(e)?.6:0));
  const smalls=leftover.filter(e=>isSmall(e)&&needOf(e)>=.2).sort((a,b)=>needOf(b)-needOf(a)||tie(a,b));
  const compounds=leftover.filter(e=>!isSmall(e));
  const reserved=smalls[0],secondCompound=compounds[0];
  const order=[...keep];
  const openSlots=count-keep.length;
  if(reserved&&secondCompound){
    if(openSlots>=2)order.push(reserved,secondCompound);
    else{
      // Protected pull patterns and displaced anchors get a modest edge; ordinary secondary lifts do not.
      const edge=protectedPullSlots.has(secondCompound._programSlot)||dropped.includes(secondCompound)?.15:0;
      order.push(needOf(reserved)>=needOf(secondCompound)+edge?reserved:secondCompound);
    }
  }else if(reserved||secondCompound)order.push(reserved||secondCompound);
  // Fill in priority order; a candidate that cannot fit even at one set is skipped so a cheaper
  // under-dosed accessory can use the time instead of leaving it unused.
  const candidates=[...new Set([...order,...smalls,...leftover])];
  // Above 20 minutes, split days (and any non-default goal) only add a movement that fits at a real
  // dose: two working sets, three for strength main lifts. Default six-day muscle plans are unchanged.
  const floorSets=!circuit&&minutes>20&&((typeof rotationFor==='function'&&rotationFor(u)!==ROTATION)||goal!=='muscle')?2:1;
  const floorOf=x=>Math.min(x._max,goal==='strength'&&x.priority===1&&floorSets>1?3:floorSets);
  let selected=[];
  for(const e of candidates){
    if(selected.length>=count)break;
    // Short-session small accessories are micro-doses (max 2 sets); missed volume is not crammed into one day.
    const baseMax=Math.max(1,e.sets),microCap=!circuit&&minutes<=30&&isSmall(e)?2:Infinity;
    const next=[...selected,{...e,sets:1,_max:Math.min(6,microCap,baseMax+setsBonus(e)),_rank:selected.length}];
    // Upper/lower and full-body days list more movements; above 20 minutes each one must fit at two
    // working sets, otherwise it waits for a later session instead of becoming a one-set token.
    const fit=floorSets>1?next.map(x=>({...x,sets:floorOf(x)})):next;
    if(!selected.length||sessionSeconds(u,fit)<=budget)selected=next;
  }
  selected.sort((a,b)=>a._position-b._position);
  // Micro-dose: if time remains after the compounds' two-set floor, add one more under-dosed small
  // accessory at 1 set (max 2) rather than spending that time on a third set of an already-dosed lift.
  if(!circuit&&count<pool.length){
    const extras=leftover.filter(e=>isSmall(e)&&needOf(e)>=.2&&!selected.some(x=>x.name===e.name)).sort((a,b)=>needOf(b)-needOf(a)||tie(a,b));
    for(const e of extras){
      if(selected.length>=count+1)break;
      const next=[...selected,{...e,sets:1,_max:Math.min(2,Math.max(1,e.sets)),_rank:selected.length}].sort((a,b)=>a._position-b._position);
      // The extra may not cost the compound lifts their normal two sets.
      if(sessionSeconds(u,next.map(x=>({...x,sets:isSmall(x)?x.sets:Math.min(2,x._max)})))<=budget)selected=next;
    }
  }
  if(circuit){
    // Rounds are capped per station (main 5, accessory 4, core 3): eight rounds of every station piled
    // 16 sets onto one pattern. Unused time is reported honestly rather than filled with junk volume.
    const maxRounds=Number(u.readiness?.energy||4)<=2?4:light?6:8,capOf=e=>Math.min(maxRounds,(e.priority===1?5:e.seedKey==='core'?3:4)-(light?1:0));
    for(;;){
      const next=selected.map(e=>e.sets<capOf(e)?{...e,sets:e.sets+1}:e);
      if(next.every((e,i)=>e.sets===selected[i].sets)||sessionSeconds(u,next)>budget)break;
      selected=next;
    }
    // Use the remaining budget for a final partial round.
    for(const e of selected){if(e.sets>=capOf(e))continue;e.sets++;if(sessionSeconds(u,selected)>budget)e.sets--}
  }else{
    // Per-session cap of 10 direct sets per movement category keeps long sessions sensible.
    const catSets=cat=>cat?selected.filter(x=>programCategory(x)===cat).reduce((n,x)=>n+x.sets,0):0;
    let grew=true;
    while(grew){grew=false;for(const e of selected){if(e.sets>=e._max||(programCategory(e)&&catSets(programCategory(e))>=10))continue;e.sets++;if(sessionSeconds(u,selected)>budget)e.sets--;else grew=true}}
  }
  const result=selected.map(({_position,_max,_rank,...e})=>({...e,prescription:circuit?circuitPace(u).work+'s controlled work · '+e.sets+' rounds':String(e.prescription).replace(/^\d+\s*×/,e.sets+' ×')}));
  const ramps=rampSpec(u,result);
  return result.map((e,i)=>ramps[i]?{...e,_ramp:ramps[i],_rampText:rampText(ramps[i])}:e);
}
function circuitTimeline(u,plan){
  const pace=circuitPace(u),steps=[{kind:'warmup',seconds:sessionWarmup(u),title:'Warm up',cue:'Easy movement, then light practice reps of today’s exercises.'}];
  const rounds=Math.max(0,...plan.map(e=>e.sets));
  for(let round=0;round<rounds;round++){
    plan.forEach((ex,index)=>{if(round>=ex.sets)return;
      const light=window.IronSixDifficulty?.effectiveFor(u)==='light';
      const both=isUnilateral(ex),reserve=light?'Controlled reps. Leave about 4 reps in reserve.':'Controlled reps. Leave at least 2 reps in reserve.';
      steps.push({kind:'work',seconds:pace.work*(both?2:1),title:ex.name,cue:both?'Work one side for the first half, then switch sides. '+reserve:reserve,index,setIndex:round,round:round+1,rounds});
      steps.push({kind:'rest',seconds:Math.max(20,pace.rest),title:'Rest & change stations',cue:'Breathe, log your reps, and prepare the next exercise.',index,setIndex:round,round:round+1,rounds});
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
    tick(now){if(!state.running)return false;state.remaining=Math.max(0,state.deadline-now);if(state.remaining===0){this.advance(now);return true}return false}
  };
}
