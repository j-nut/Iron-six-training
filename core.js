const EQUIPMENT=[
  ['dumbbells','Dumbbells'],['barbell','Olympic barbell + plates'],['landmine','Landmine attachment'],['rack','Squat / bench rack'],['bench','Adjustable bench'],['pullup','Pull-up bar'],['bands','Resistance bands'],['abwheel','Ab roller'],['medball','Medicine ball']
];
const DEFAULT_EQUIPMENT={dumbbells:true,barbell:true,landmine:false,rack:true,bench:true,pullup:true,bands:true,abwheel:true,medball:true};
const STORAGE_KEY='ironSixMultiV5';
const BACKUP_STORAGE_KEY=STORAGE_KEY+'_recovery';
const PRIOR_STORAGE_KEYS=['ironSixMultiV4','ironSixMultiV3'];
const LEGACY_KEY='ironSixState';
// A session sequence, never a calendar schedule. Preserve existing users' current key.
const LEGACY_ROTATION=['chest','shoulders_arms','lower_strength','back','upper_specialization','lower_hypertrophy'];
const ROTATION=['push_a','lower_a','pull_a','push_b','lower_b','pull_b'];
const WORKOUT_META={
  push_a:{name:'Push A · Chest emphasis',short:'Push A',muscles:['chest','shoulders','triceps','core']},
  lower_a:{name:'Legs A · Squat emphasis',short:'Legs A',muscles:['quads','glutes','hamstrings','calves']},
  pull_a:{name:'Pull A · Vertical emphasis',short:'Pull A',muscles:['back','biceps','rear delts','core']},
  push_b:{name:'Push B · Balanced pressing',short:'Push B',muscles:['chest','shoulders','triceps']},
  lower_b:{name:'Legs B · Hinge emphasis',short:'Legs B',muscles:['quads','glutes','hamstrings','calves']},
  pull_b:{name:'Pull B · Row emphasis',short:'Pull B',muscles:['back','biceps','rear delts']},
  lower_strength:{name:'Lower strength + core',short:'Lower strength',muscles:['quads','glutes','hamstrings','core']},
  shoulders_arms:{name:'Shoulders + arms',short:'Shoulders + arms',muscles:['shoulders','biceps','triceps']},
  chest:{name:'Chest',short:'Chest',muscles:['chest','triceps','front delts']},
  back:{name:'Back',short:'Back',muscles:['back','biceps','rear delts']},
  lower_hypertrophy:{name:'Lower hypertrophy',short:'Lower hypertrophy',muscles:['quads','glutes','hamstrings','calves']},
  upper_specialization:{name:'Upper specialization',short:'Upper specialization',muscles:['chest','back','shoulders','arms']},
  upper_a:{name:'Upper A · Bench + pull-up emphasis',short:'Upper A',muscles:['chest','back','shoulders','biceps','triceps']},
  upper_b:{name:'Upper B · Overhead + row emphasis',short:'Upper B',muscles:['shoulders','back','chest','rear delts','biceps','triceps']},
  full_a:{name:'Full body A · Squat, bench, row',short:'Full A',muscles:['quads','glutes','chest','back','shoulders','biceps','hamstrings']},
  full_b:{name:'Full body B · Hinge, overhead, pull-up',short:'Full B',muscles:['hamstrings','glutes','shoulders','back','chest','triceps','quads','calves']},
  full_c:{name:'Full body C · Squat, incline, pull',short:'Full C',muscles:['quads','glutes','chest','back','rear delts','core']},
  full2_a:{name:'Full body A · Squat, bench, row',short:'Full A',muscles:['quads','glutes','chest','back','shoulders','biceps','hamstrings','calves']},
  full2_b:{name:'Full body B · Hinge, overhead, pull-up',short:'Full B',muscles:['hamstrings','glutes','shoulders','back','chest','quads','triceps','rear delts','core']}
};
/* Training frequency chooses an honest split; the 5-6 day rolling push/legs/pull sequence is unchanged.
 * Keys are a session sequence, never a calendar: rest days keep the user's place. Legs A/B are shared
 * by the six-day and upper/lower splits so their exposures and history carry over a schedule change. */
const PROGRAM_SPLITS={6:ROTATION,5:ROTATION,4:['upper_a','lower_a','upper_b','lower_b'],3:['full_a','full_b','full_c'],2:['full2_a','full2_b']};
const PROGRAM_KEYS=[...ROTATION,'upper_a','upper_b','full_a','full_b','full_c','full2_a','full2_b'];
const PROGRAM_GOALS=['strength','muscle','general'];
const PROGRAM_LIMITATIONS=['shoulder','elbow','wrist','lower_back','hip','knee'];
const STRENGTH_REF_LIFTS=['squat','bench','hinge','overhead_press','row'];
const PREFERENCE_KEYS=['music','camera','voice','sounds'];
function normalizedDaysPerWeek(value){if(typeof value!=='number'&&!(typeof value==='string'&&value.trim()))return 6;const n=Math.round(Number(value));return Number.isFinite(n)?Math.max(2,Math.min(6,n)):6}
function programGoal(u){return PROGRAM_GOALS.includes(u?.goal)?u.goal:'muscle'}
function rotationFor(u){return PROGRAM_SPLITS[normalizedDaysPerWeek(u?.daysPerWeek)]}
function sameSequence(a,b){return Array.isArray(a)&&a.length===b.length&&new Set(a).size===b.length&&a.every(k=>b.includes(k))}
function uid(){return 'u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function normalizedWorkoutDifficultyOverride(value){
  const level=value?.level==='light'?'light':value?.level==='balanced'?'balanced':value?.level==='heavy'?'heavy':null;
  const workoutKey=Object.keys(WORKOUT_META).find(key=>key===value?.workoutKey),exposure=Number(value?.exposure);
  return level&&workoutKey&&Number.isSafeInteger(exposure)&&exposure>=0?{level,workoutKey,exposure}:null;
}
function emptyProgram(){return {version:2,currentWorkoutKey:'push_a',exposures:{},unlocked:{},variantCursor:{},selectionCache:{},generatedExercises:[],lastAdaptation:null,lastScheduleReason:null,equipmentGeneration:null}}
function emptyTrainerMemory(){return {status:'Learning from completed workouts',summary:'Complete a workout with weight, reps, and RIR to build your AI training profile.',adjustments:{},recommendations:[],reviewedAt:null,model:null}}
/* Profile contract shared with onboarding/profile UI. Unknown values fall back to today's behaviour
 * (muscle goal, six-day rotation), so an existing program never changes until the user answers. */
function normalizedStrengthRefs(value){
  const out={};if(!value||typeof value!=='object'||Array.isArray(value))return out;
  for(const lift of STRENGTH_REF_LIFTS){
    const ref=value[lift],weight=Number(ref?.weight),reps=Math.round(Number(ref?.reps));
    if(!ref||typeof ref!=='object'||!Number.isFinite(weight)||weight<=0||!Number.isFinite(reps)||reps<1)continue;
    out[lift]={weight:Math.min(2000,Math.round(weight*4)/4),reps:Math.min(30,reps),equipment:ref.equipment==='dumbbell'?'dumbbell':'barbell'};
  }
  return out;
}
function normalizedLimitations(value){return Array.isArray(value)?PROGRAM_LIMITATIONS.filter(x=>value.includes(x)):[]}
function normalizedPreferences(value){const v=value&&typeof value==='object'?value:{};return Object.fromEntries(PREFERENCE_KEYS.map(k=>[k,typeof v[k]==='boolean'?v[k]:true]))}
function normalizedOnboarding(value){
  const v=value&&typeof value==='object'?value:{},at=Number(v.completedAt);
  return {version:1,completedAt:v.completedAt!=null&&Number.isFinite(at)&&at>0?at:null,optionalSkipped:Array.isArray(v.optionalSkipped)?[...new Set(v.optionalSkipped.filter(x=>typeof x==='string'&&x).map(x=>x.slice(0,40)))].slice(0,20):[]};
}
function makeUser(name='My profile',weight=180,equipment=DEFAULT_EQUIPMENT){return {id:uid(),name,weight,age:null,heightIn:null,trainingLevel:'unknown',benchBest:'',equipment:{...equipment},customEquipment:[],capacities:{dumbbellMax:30,barbellMax:300},workoutMinutes:60,workoutDifficulty:'balanced',sessionDifficulty:null,goal:'muscle',daysPerWeek:6,strengthRefs:{},limitations:[],preferences:normalizedPreferences(),onboarding:normalizedOnboarding(),today:{},history:[],readiness:{energy:4,soreness:1},program:emptyProgram(),trainerMemory:emptyTrainerMemory()}}
function normalizeUser(u){return {...u,goal:programGoal(u),daysPerWeek:normalizedDaysPerWeek(u.daysPerWeek),strengthRefs:normalizedStrengthRefs(u.strengthRefs),limitations:normalizedLimitations(u.limitations),preferences:normalizedPreferences(u.preferences),onboarding:normalizedOnboarding(u.onboarding),age:u.age||null,heightIn:u.heightIn||null,trainingLevel:u.trainingLevel||'unknown',workoutDifficulty:['light','balanced','heavy'].includes(u.workoutDifficulty)?u.workoutDifficulty:'balanced',sessionDifficulty:normalizedWorkoutDifficultyOverride(u.sessionDifficulty),workoutMinutes:Number(u.workoutMinutes)||60,equipment:{...DEFAULT_EQUIPMENT,...(u.equipment||{})},customEquipment:Array.isArray(u.customEquipment)?u.customEquipment.map(normalizeEquipmentName).filter(Boolean).slice(0,16):[],capacities:{dumbbellMax:Number(u.capacities?.dumbbellMax)||30,barbellMax:Number(u.capacities?.barbellMax)||300,dumbbellStep:Number(u.capacities?.dumbbellStep)===2.5?2.5:5,barbellStep:Number(u.capacities?.barbellStep)===2.5?2.5:5},today:u.today||{},history:u.history||[],readiness:u.readiness||{energy:4,soreness:1},program:{...emptyProgram(),...(u.program||{}),exposures:{...(u.program?.exposures||{})},unlocked:{...(u.program?.unlocked||{})},variantCursor:{...(u.program?.variantCursor||{})},selectionCache:{...(u.program?.selectionCache||{})},generatedExercises:Array.isArray(u.program?.generatedExercises)?u.program.generatedExercises.slice(0,80):[]},trainerMemory:{...emptyTrainerMemory(),...(u.trainerMemory||{}),adjustments:{...(u.trainerMemory?.adjustments||{})},recommendations:Array.isArray(u.trainerMemory?.recommendations)?u.trainerMemory.recommendations:[]}}}
function readLocal(key){try{return localStorage.getItem(key)}catch(_){return null}}
function localScopeKey(){return STORAGE_KEY+(window.ironSixAccountScope?'_account_'+window.ironSixAccountScope:'')}
function loadData(){
  for(const key of (window.ironSixAccountScope?[localScopeKey(),localScopeKey()+'_recovery']:[STORAGE_KEY,BACKUP_STORAGE_KEY,...PRIOR_STORAGE_KEYS])){const raw=readLocal(key);if(raw){try{const p=JSON.parse(raw);p.users=(p.users||[]).map(normalizeUser);if(p.users.length){if(!p.activeUserId)p.activeUserId=p.users[0].id;const current=p.users.find(u=>u.id===p.activeUserId)||p.users[0];return p}}catch(e){}}}
  const legacyRaw=window.ironSixAccountScope?null:readLocal(LEGACY_KEY);let jordan=makeUser('My profile');
  if(legacyRaw){try{const l=JSON.parse(legacyRaw);jordan.weight=l.profile?.bodyWeight||213;jordan.benchBest=l.profile?.benchBest||jordan.benchBest;jordan.today=l.today||{};jordan.history=l.history||[]}catch(e){}}
  return {activeUserId:jordan.id,users:[jordan],fresh:true};
}
window.ironSixAccountScope=readLocal('ironSixAccountScope')||null;
let data=loadData();
function saveData(){const snapshot=JSON.stringify(data),key=localScopeKey();try{localStorage.setItem(key,snapshot);localStorage.setItem(key+'_recovery',snapshot);return true}catch(_){if(typeof toast==='function')toast('Device storage could not save the profile. Keep this page open.');return false}}
function activeUser(){return data.users.find(u=>u.id===data.activeUserId)||data.users[0]}
function has(u,key){return !!u.equipment?.[key]}
function normalizeEquipmentName(value){return String(value||'').replace(/[^a-zA-Z0-9 &'()+./-]/g,' ').replace(/\s+/g,' ').trim().slice(0,48)}
function hasCustomEquipment(u,name){const wanted=normalizeEquipmentName(name).toLowerCase();return !!wanted&&(u.customEquipment||[]).some(x=>normalizeEquipmentName(x).toLowerCase()===wanted)}
function exerciseAvailable(u,o){return (!o.requires||o.requires.every(k=>has(u,k)))&&(!o.requiresCustom||o.requiresCustom.every(name=>hasCustomEquipment(u,name)))}
function stableNumber(value){let h=2166136261;for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function generatedOptionsForSlot(u,options){const sample=options?.[0],key=u.program?.currentWorkoutKey||'lower_strength';if(!sample)return [];return (u.program?.generatedExercises||[]).filter(x=>x&&x.base===sample.base&&x.seedKey===sample.seedKey&&(!x.workoutKeys?.length||x.workoutKeys.includes(key))).map(x=>({name:String(x.name||'').slice(0,80),requires:Array.isArray(x.requires)?x.requires.slice(0,4):[],requiresCustom:Array.isArray(x.requiresCustom)?x.requiresCustom.map(normalizeEquipmentName).filter(Boolean).slice(0,2):[],prescription:String(x.prescription||sample.prescription).slice(0,80),sets:Math.max(1,Math.min(6,Math.round(Number(x.sets)||sample.sets||3))),tag:String(x.tag||sample.tag||'Accessory').slice(0,30),base:sample.base,seedKey:sample.seedKey,priority:Math.max(1,Math.min(3,Math.round(Number(x.priority)||sample.priority||2))),equipmentName:normalizeEquipmentName(x.equipmentName),equipmentId:String(x.equipmentId||''),source:x.source==='curated'?'curated':'groq'})).filter(x=>x.name&&exerciseAvailable(u,x))}
function exerciseRecentPenalty(u,o){let penalty=0;(u.history||[]).slice(0,12).forEach((h,sessionIndex)=>{(h.details||[]).forEach(d=>{if(String(d.name).toLowerCase()===o.name.toLowerCase())penalty+=Math.max(8,120-sessionIndex*13);else if(d.base===o.base)penalty+=Math.max(0,12-sessionIndex)})});return penalty}
function currentSelectionKey(u,base){const key=u.program?.currentWorkoutKey||'lower_strength',exposure=Number(u.program?.exposures?.[key])||0;return `${key}:${exposure}:${base}`}
function clearCurrentSelectionCache(u){
  const key=u.program?.currentWorkoutKey||'lower_strength';
  const prefix=`${key}:${Number(u.program?.exposures?.[key])||0}:`;
  // The balanced-program selector stores accessory picks as v5:<key>:<slot>:<exposure>.
  // Clear those as well when preferences or coach recommendations change. Keep
  // four-exposure :block anchors stable for meaningful overload comparisons.
  const programPrefix=`v5:${key}:`;
  for(const cacheKey of Object.keys(u.program?.selectionCache||{})){
    if(cacheKey.startsWith(prefix)||(cacheKey.startsWith(programPrefix)&&!cacheKey.includes(':block')))
      delete u.program.selectionCache[cacheKey];
  }
}
function choose(u,options){const original=Array.isArray(options)?options:[],pool=[...original,...generatedOptionsForSlot(u,original)].filter((o,index,all)=>o?.name&&exerciseAvailable(u,o)&&all.findIndex(x=>x.name.toLowerCase()===o.name.toLowerCase())===index);if(!pool.length)return null;const difficulty=window.IronSixDifficulty?.effectiveFor(u)||'balanced',cacheKey=currentSelectionKey(u,pool[0].base)+(difficulty==='balanced'?'':':difficulty:'+difficulty),cachedName=u.program?.selectionCache?.[cacheKey],cached=pool.find(x=>x.name===cachedName);const usesEquipment=o=>!!(o.requires?.length||o.requiresCustom?.length),equipped=pool.some(usesEquipment);const ranked=cached||pool.map((o,index)=>({o,score:exerciseRecentPenalty(u,o)+index*1.5+(o.source==='groq'?2:0)+(equipped&&!usesEquipment(o)?24:0)+(window.IronSixDifficulty?.selectionPenalty(u,o)||0),tie:stableNumber(`${cacheKey}:${o.name}`)})).sort((a,b)=>a.score-b.score||a.tie-b.tie)[0].o;u.program.selectionCache=u.program.selectionCache||{};u.program.selectionCache[cacheKey]=ranked.name;const alternatives=pool.filter(x=>x.name!==ranked.name).map(x=>({...x}));return {...ranked,_alternatives:alternatives}}
function ex(name,requires,prescription,sets,tag,base,seedKey,priority=2){return {name,requires,prescription,sets,tag,base,seedKey:seedKey||base,priority}}
function slot(u,options){return choose(u,options)}
function swapOptionsForExercise(u,exercise){const options=[...(exercise?._alternatives||[]),...generatedOptionsForSlot(u,[exercise])].filter((o,index,all)=>o?.name&&o.name!==exercise?.name&&o.base===exercise?.base&&exerciseAvailable(u,o)&&(u.trainingMode!=='circuit'||typeof circuitSuitable!=='function'||circuitSuitable(o))&&all.findIndex(x=>x.name.toLowerCase()===o.name.toLowerCase())===index);return options.sort((a,b)=>exerciseRecentPenalty(u,a)-exerciseRecentPenalty(u,b)||String(a.name).localeCompare(String(b.name))).slice(0,8)}
function workoutVariantCount(key){return 3}
function successfulExposure(h){
  if(!h||!h.details?.length)return false;
  const planned=Number(h.plannedSets)||Number(h.sets)||1, completed=Number(h.sets)||0, completion=completed/Math.max(1,planned);
  // A blank RIR means not logged. Number('') is 0, which used to read every unlogged set as a set to failure.
  const rirs=[];h.details.forEach(d=>(d.sets||[]).forEach(s=>{if(s.rir===''||s.rir==null)return;const r=Number(s.rir);if(Number.isFinite(r))rirs.push(r)}));
  const avgRir=rirs.length?rirs.reduce((a,b)=>a+b,0)/rirs.length:2;
  return completion>=0.72 && avgRir>=0.25 && avgRir<=3.75;
}
function exposureStats(u,key){const sessions=(u.history||[]).filter(h=>h.workoutKey===key);const successful=sessions.filter(successfulExposure);return {total:sessions.length,successful:successful.length,recent:successful.slice(0,4)}}
function variantUnlocked(u,key){const stats=exposureStats(u,key);const current=Math.max(1,Number(u.program.unlocked?.[key])||1);let unlocked=current;if(stats.successful>=4)unlocked=Math.max(unlocked,2);if(stats.successful>=8)unlocked=Math.max(unlocked,3);u.program.unlocked[key]=Math.min(workoutVariantCount(key),unlocked);return u.program.unlocked[key]}
function currentVariant(u,key){if(PROGRAM_KEYS.includes(key))return Math.floor((Number(u.program.exposures?.[key])||0)/4)%3;const unlocked=variantUnlocked(u,key);const exposure=Number(u.program.exposures?.[key])||0;return unlocked<=1?0:exposure%unlocked}
const VARIANT_NAMES=['Foundation','Momentum','Apex'];
function variantLabel(i){return ['A','B','C'][i]||'A'}
function variantName(i){return VARIANT_NAMES[i]||VARIANT_NAMES[0]}
function variantDisplay(value){if(typeof value==='number')return variantName(value);const i=['A','B','C'].indexOf(String(value||'').trim().toUpperCase());return i>=0?VARIANT_NAMES[i]:String(value||'')}

// A pending sequence preserves sessions displaced by a manual choice. Reading a
// forecast is pure: only choosing or explicitly finishing a workout changes it.
function routineQueue(u){
  const rotation=rotationFor(u),current=u.program?.currentWorkoutKey||rotation[0];
  const saved=u.program?.pendingWorkouts;
  if(sameSequence(saved,rotation))return [...saved];
  // A key from another split (the schedule changed) resumes at its natural successor.
  const start=!rotation.includes(current)&&PROGRAM_KEYS.includes(current)?rotation.indexOf(routineSuccessor(current,u)):Math.max(0,rotation.indexOf(current));
  return rotation.map((_,i)=>rotation[(start+i)%rotation.length]);
}
function routineFamily(key){if(/^push_/.test(key)||key==='chest'||key==='shoulders_arms')return 'push';if(/^pull_/.test(key)||key==='back')return 'pull';if(/^lower_/.test(key))return 'lower';return null}
function splitFamily(key){if(/^upper_/.test(key)||key==='upper_specialization')return 'upper';if(/^full/.test(key))return 'full';return routineFamily(key)}
function familiesOverlap(a,b){if(!a||!b)return false;if(a===b||a==='full'||b==='full')return true;return (a==='upper'&&(b==='push'||b==='pull'))||(b==='upper'&&(a==='push'||a==='pull'))}
// After a session from outside the user's current split, continue with the split day that trains
// different muscles and was trained least recently (never-trained first, then rotation order).
function crossSplitSuccessor(u,key,rotation){
  const family=splitFamily(key),fresh=rotation.filter(k=>!familiesOverlap(splitFamily(k),family)),pool=fresh.length?fresh:rotation;
  const last=k=>{const i=(u?.history||[]).findIndex(h=>h?.workoutKey===k);return i<0?Infinity:i};
  return [...pool].sort((a,b)=>last(b)-last(a)||rotation.indexOf(a)-rotation.indexOf(b))[0];
}
function routineSuccessor(key,u){
  const rotation=u?rotationFor(u):ROTATION,index=rotation.indexOf(key);
  if(index>=0)return rotation[(index+1)%rotation.length];
  if(rotation===ROTATION){const legacy=({chest:'lower_a',shoulders_arms:'lower_b',lower_strength:'pull_a',back:'push_b',upper_specialization:'lower_b',lower_hypertrophy:'pull_b'})[key];if(legacy)return legacy}
  return PROGRAM_KEYS.includes(key)||rotation!==ROTATION?crossSplitSuccessor(u,key,rotation):ROTATION[0];
}
function routineDose(session){
  const dose={push:0,pull:0,lower:0};
  for(const d of session?.details||[]){
    const sets=(d.sets||[]).filter(s=>s.done===true).length;if(!sets)continue;
    const seed=String(d.seedKey||'').toLowerCase(),name=String(d.name||'').toLowerCase();
    const families={push:['bench','chest_press','fly','overhead_press','lateral_raise','triceps'],pull:['pullup','row','lat_iso','rear_delt','curl','hammer_curl'],lower:['squat','hinge','split_squat','hip_thrust','ham_curl','calves']};
    const exact=Object.keys(families).find(f=>families[f].includes(seed));
    if(exact)dose[exact]+=sets;
    else if(/squat|deadlift|lunge|calf|calves|hip thrust|hamstring|leg press|leg curl|leg extension/.test(name))dose.lower+=sets;
    else if(/press|push.up|fly|tricep/.test(name))dose.push+=sets;
    else if(/pull.up|chin.up|row|pulldown|bicep|curl/.test(name))dose.pull+=sets;
  }
  return dose;
}
function routineAfter(u,session){
  const rotation=rotationFor(u),current=session?.workoutKey||u.program?.currentWorkoutKey||rotation[0];
  let queue=routineQueue(u);
  if(!rotation.includes(current)){
    const next=routineSuccessor(current,u),start=rotation.indexOf(next);
    queue=rotation.map((_,i)=>rotation[(start+i)%rotation.length]);
  }else queue=[...queue.filter(k=>k!==current),current];
  // Upper/lower and full-body splits alternate by design; family reordering would repeat a day.
  if(rotation!==ROTATION)return queue;
  const dose=routineDose(session);
  for(const interrupted of u.program?.interruptedWork||[]){if(Date.now()-Number(interrupted.ts)>48*60*60*1000)continue;const extra=routineDose(interrupted);for(const family of Object.keys(dose))dose[family]+=extra[family]}
  const trained=Object.keys(dose).filter(k=>dose[k]>=2);
  // Avoid loading a family again immediately when the actual logged exercises
  // differ from the nominal routine. Keep every displaced session pending.
  if(trained.includes(routineFamily(queue[0]))){const i=queue.findIndex(k=>!trained.includes(routineFamily(k)));if(i>0)queue=[queue[i],...queue.filter((_,j)=>j!==i)]}
  return queue;
}
function invalidateRoutineReview(u){if(u.trainerMemory){u.trainerMemory.verifiedPlan=[];u.trainerMemory.verifiedForWorkoutKey=null;u.trainerMemory.recommendations=[];u.trainerMemory.status='Plan updated';u.trainerMemory.summary='Recommendations will use your updated routine and completed work.'}}
function prepareManualWorkout(u,key){
  invalidateRoutineReview(u);
  const queue=routineQueue(u);
  u.program.pendingWorkouts=rotationFor(u).includes(key)?[key,...queue.filter(k=>k!==key)]:queue;
  u.program.lastScheduleReason='Your manual choice is scheduled now; displaced sessions remain in the upcoming sequence.';
  // Previewed accessories must be reconsidered after an actual schedule change.
  u.program.selectionCache=Object.fromEntries(Object.entries(u.program.selectionCache||{}).filter(([k])=>k.includes(':block')));
}
function completeRoutine(u,session){
  const token=session?.sessionId||String(session?.ts||'');
  if(token&&u.program.lastRoutineSession===token)return u.program.currentWorkoutKey;
  const queue=sameSequence(session?.routineAfter,rotationFor(u))?session.routineAfter:routineAfter(u,session);
  u.program.pendingWorkouts=[...queue];u.program.lastRoutineSession=token;u.program.interruptedWork=[];
  u.program.currentWorkoutKey=queue[0];
  invalidateRoutineReview(u);
  u.program.selectionCache=Object.fromEntries(Object.entries(u.program.selectionCache||{}).filter(([k])=>k.includes(':block')));
  return queue[0];
}
function routineForecast(u,count=6){
  const current=u.program?.currentWorkoutKey||rotationFor(u)[0],plan=u.workoutDraft?.plan||[];
  const details=plan.map((d,ei)=>({...d,sets:Array.from({length:d.sets},(_,i)=>u.today?.[`${ei}-${i}`]).filter(Boolean)}));
  // Before any sets are logged, forecast the selected focus. Once work exists,
  // use that work instead; completion always uses the actual session details.
  if(!details.some(d=>d.sets.some(s=>s.done===true))){const seed=({push:'bench',pull:'row',lower:'squat'})[routineFamily(current)];if(seed)details.push({seedKey:seed,sets:[{done:true},{done:true}]})}
  const queue=routineAfter(u,{workoutKey:current,details});
  return [current,...queue.filter(k=>k!==current)].slice(0,count);
}

function recordInterruptedRoutine(u,plan,sessionId){
  const details=(plan||[]).map((d,ei)=>({...d,sets:Array.from({length:d.sets},(_,i)=>u.today?.[`${ei}-${i}`]).filter(s=>s?.done===true)})).filter(d=>d.sets.length);
  if(!details.length)return;
  const pending=(u.program.interruptedWork||[]).filter(s=>s.sessionId!==sessionId);
  u.program.interruptedWork=[...pending,{ts:Date.now(),sessionId,details}].slice(-6);
}

function clearSessionRecommendations(u){u.coachOverrides=null;u.sessionCalibration=null;invalidateRoutineReview(u);clearCurrentSelectionCache(u)}

/* Goal-aware prescriptions. 'muscle' keeps today's ranges exactly; the others rewrite only the
 * first rep range of a loaded exercise's prescription, so repRange/repTarget, the planner, history and
 * load progression all read the same numbers. Bodyweight and band ranges stay as written. */
const GOAL_ISOLATION_SEEDS=['lateral_raise','rear_delt','fly','lat_iso','curl','hammer_curl','triceps','calves','core','ham_curl'];
function goalRepRange(goal,ex,main=ex?.priority===1){
  if(goal!=='strength'&&goal!=='general')return null;
  const m=String(ex?.prescription||'').match(/(\d+)\s*[–-]\s*(\d+)/);if(!m)return null;
  const lo=Number(m[1]),hi=Number(m[2]),req=ex?.requires||[],name=String(ex?.name||'');
  const free=req.includes('barbell')||req.includes('landmine')?'barbell':req.includes('dumbbells')||/dumbbell|goblet/i.test(name)?'dumbbell':null;
  const isolation=GOAL_ISOLATION_SEEDS.includes(ex?.seedKey);
  if(goal==='strength'){
    if(!free)return main&&lo<=6?[Math.max(3,lo-1),Math.min(hi,8)]:null;
    if(main)return free==='barbell'?[3,6]:[5,8];
    return isolation?[8,12]:[6,10];
  }
  return main&&free?[8,12]:null;
}
function goalPrescription(goal,ex,main){
  const range=goalRepRange(goal,ex,main);
  return range?String(ex.prescription).replace(/(\d+)\s*[–-]\s*(\d+)/,range[0]+'–'+range[1]):ex?.prescription;
}
// Reps in reserve for working sets: strength and muscle keep about 2 (1.5 advanced); general fitness about 3.
function goalTargetRir(u){const base=u?.trainingLevel==='advanced'?1.5:2;return programGoal(u)==='general'?base+1:base}

const SPLIT_TEXT={
  6:{label:'6 days: Push / Legs / Pull ×2',detail:'Each muscle is trained twice in a six-session rolling sequence. Rest days keep your place.'},
  5:{label:'5 days: Push / Legs / Pull rolling',detail:'The six-session push/legs/pull sequence rolls over five days a week, so each muscle is trained about twice every eight days.'},
  4:{label:'4 days: Upper / Lower ×2',detail:'Two upper-body and two lower-body sessions: every muscle twice a week, main lifts first.'},
  3:{label:'3 days: Full body A / B / C',detail:'Every session has a squat or hinge, a press and a pull, plus rotating accessories so every muscle is covered across the week.'},
  2:{label:'2 days: Full body A / B',detail:'Two whole-body sessions cover every major pattern each week. Weekly volume per muscle is moderate, enough to build strength and maintain or slowly build muscle.'}
};
const GOAL_TEXT={
  strength:{label:'Strength',detail:'Main lifts 3–6 reps about 2 reps from failure with longer rest; accessories 6–12 reps. Benchmark lifts stay the same so progress is measurable.'},
  muscle:{label:'Muscle growth',detail:'Moderate rep ranges (about 6–15 on main lifts, up to 20 on small muscles) 1–2 reps from failure, with enough weekly sets for each muscle to grow.'},
  general:{label:'General fitness',detail:'Main lifts 8–12 reps about 3 reps from failure, slightly less volume and shorter rest. Builds strength and muscle with less fatigue.'}
};
function splitFor(u){
  const days=normalizedDaysPerWeek(u?.daysPerWeek),keys=[...PROGRAM_SPLITS[days]];
  return {daysPerWeek:days,keys,label:SPLIT_TEXT[days].label,detail:SPLIT_TEXT[days].detail,sessions:keys.map(key=>({key,name:WORKOUT_META[key].name,short:WORKOUT_META[key].short,muscles:[...WORKOUT_META[key].muscles]}))};
}
function describeSplit(u){const s=splitFor(u);return s.label}
function describeGoal(goal){const g=GOAL_TEXT[PROGRAM_GOALS.includes(goal)?goal:'muscle'];return g.label+': '+g.detail}
/* Changing goal or frequency never touches history, exposures, selection anchors or a draft. With no
 * workout in progress the next session moves into the new split straight away; otherwise the current
 * session finishes as planned and the new split starts from its natural successor. */
function applyProgramSettings(u,settings={}){
  const beforeGoal=programGoal(u),beforeRotation=rotationFor(u);
  if(Object.prototype.hasOwnProperty.call(settings,'goal'))u.goal=PROGRAM_GOALS.includes(settings.goal)?settings.goal:beforeGoal;
  if(Object.prototype.hasOwnProperty.call(settings,'daysPerWeek'))u.daysPerWeek=normalizedDaysPerWeek(settings.daysPerWeek);
  const rotation=rotationFor(u),splitChanged=rotation!==beforeRotation,goalChanged=programGoal(u)!==beforeGoal;
  if(!splitChanged&&!goalChanged)return {changed:false,deferred:false};
  u.program=u.program||emptyProgram();
  const inProgress=!!u.workoutDraft?.plan?.length||Object.values(u.today||{}).some(s=>s&&typeof s==='object'&&Object.values(s).some(v=>v!==''&&v!==false&&v!=null));
  if(splitChanged){
    delete u.program.pendingWorkouts;
    const current=u.program.currentWorkoutKey;
    if(!inProgress&&!rotation.includes(current)){
      const last=(u.history||[]).find(h=>h?.workoutKey)?.workoutKey;
      u.program.currentWorkoutKey=last?routineSuccessor(last,u):rotation[0];
      if(!rotation.includes(u.program.currentWorkoutKey))u.program.currentWorkoutKey=rotation[0];
    }
    u.program.lastScheduleReason=inProgress?'Your new schedule starts after you finish this workout.':'Your schedule changed; the next session follows your new split.';
  }
  invalidateRoutineReview(u);
  return {changed:true,deferred:inProgress,split:describeSplit(u),goal:describeGoal(programGoal(u))};
}
if(typeof window!=='undefined')window.IronSixProgram={splitFor,workoutKeysFor:u=>[...rotationFor(u)],describeSplit,describeGoal,applySettings:applyProgramSettings,goals:[...PROGRAM_GOALS],keys:[...PROGRAM_KEYS]};
