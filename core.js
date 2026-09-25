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
  upper_specialization:{name:'Upper specialization',short:'Upper specialization',muscles:['chest','back','shoulders','arms']}
};
function uid(){return 'u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function emptyProgram(){return {version:2,currentWorkoutKey:'push_a',exposures:{},unlocked:{},variantCursor:{},selectionCache:{},generatedExercises:[],lastAdaptation:null,lastScheduleReason:null,equipmentGeneration:null}}
function emptyTrainerMemory(){return {status:'Learning from completed workouts',summary:'Complete a workout with weight, reps, and RIR to build your AI training profile.',adjustments:{},recommendations:[],reviewedAt:null,model:null}}
function makeUser(name='My profile',weight=180,equipment=DEFAULT_EQUIPMENT){return {id:uid(),name,weight,age:null,heightIn:null,trainingLevel:'unknown',benchBest:'',equipment:{...equipment},customEquipment:[],capacities:{dumbbellMax:30,barbellMax:300},workoutMinutes:60,today:{},history:[],readiness:{energy:4,soreness:1},program:emptyProgram(),trainerMemory:emptyTrainerMemory()}}
function normalizeUser(u){return {...u,age:u.age||null,heightIn:u.heightIn||null,trainingLevel:u.trainingLevel||'unknown',workoutMinutes:Number(u.workoutMinutes)||60,equipment:{...DEFAULT_EQUIPMENT,...(u.equipment||{})},customEquipment:Array.isArray(u.customEquipment)?u.customEquipment.map(normalizeEquipmentName).filter(Boolean).slice(0,16):[],capacities:{dumbbellMax:Number(u.capacities?.dumbbellMax)||30,barbellMax:Number(u.capacities?.barbellMax)||300},today:u.today||{},history:u.history||[],readiness:u.readiness||{energy:4,soreness:1},program:{...emptyProgram(),...(u.program||{}),exposures:{...(u.program?.exposures||{})},unlocked:{...(u.program?.unlocked||{})},variantCursor:{...(u.program?.variantCursor||{})},selectionCache:{...(u.program?.selectionCache||{})},generatedExercises:Array.isArray(u.program?.generatedExercises)?u.program.generatedExercises.slice(0,80):[]},trainerMemory:{...emptyTrainerMemory(),...(u.trainerMemory||{}),adjustments:{...(u.trainerMemory?.adjustments||{})},recommendations:Array.isArray(u.trainerMemory?.recommendations)?u.trainerMemory.recommendations:[]}}}
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
function clearCurrentSelectionCache(u){const key=u.program?.currentWorkoutKey||'lower_strength',prefix=`${key}:${Number(u.program?.exposures?.[key])||0}:`;for(const cacheKey of Object.keys(u.program?.selectionCache||{}))if(cacheKey.startsWith(prefix))delete u.program.selectionCache[cacheKey]}
function choose(u,options){const original=Array.isArray(options)?options:[],pool=[...original,...generatedOptionsForSlot(u,original)].filter((o,index,all)=>o?.name&&exerciseAvailable(u,o)&&all.findIndex(x=>x.name.toLowerCase()===o.name.toLowerCase())===index);if(!pool.length)return null;const cacheKey=currentSelectionKey(u,pool[0].base),cachedName=u.program?.selectionCache?.[cacheKey],cached=pool.find(x=>x.name===cachedName);const usesEquipment=o=>!!(o.requires?.length||o.requiresCustom?.length),equipped=pool.some(usesEquipment);const ranked=cached||pool.map((o,index)=>({o,score:exerciseRecentPenalty(u,o)+index*1.5+(o.source==='groq'?2:0)+(equipped&&!usesEquipment(o)?24:0),tie:stableNumber(`${cacheKey}:${o.name}`)})).sort((a,b)=>a.score-b.score||a.tie-b.tie)[0].o;u.program.selectionCache=u.program.selectionCache||{};u.program.selectionCache[cacheKey]=ranked.name;const alternatives=pool.filter(x=>x.name!==ranked.name).map(x=>({...x}));return {...ranked,_alternatives:alternatives}}
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
function currentVariant(u,key){if(ROTATION.includes(key))return Math.floor((Number(u.program.exposures?.[key])||0)/4)%3;const unlocked=variantUnlocked(u,key);const exposure=Number(u.program.exposures?.[key])||0;return unlocked<=1?0:exposure%unlocked}
const VARIANT_NAMES=['Foundation','Momentum','Apex'];
function variantLabel(i){return ['A','B','C'][i]||'A'}
function variantName(i){return VARIANT_NAMES[i]||VARIANT_NAMES[0]}
function variantDisplay(value){if(typeof value==='number')return variantName(value);const i=['A','B','C'].indexOf(String(value||'').trim().toUpperCase());return i>=0?VARIANT_NAMES[i]:String(value||'')}

// A pending sequence preserves sessions displaced by a manual choice. Reading a
// forecast is pure: only choosing or explicitly finishing a workout changes it.
function routineQueue(u){
  const current=u.program?.currentWorkoutKey||ROTATION[0];
  const saved=u.program?.pendingWorkouts;
  if(Array.isArray(saved)&&saved.length===ROTATION.length&&new Set(saved).size===ROTATION.length&&saved.every(k=>ROTATION.includes(k)))return [...saved];
  const start=Math.max(0,ROTATION.indexOf(current));
  return ROTATION.map((_,i)=>ROTATION[(start+i)%ROTATION.length]);
}
function routineSuccessor(key){const index=ROTATION.indexOf(key);return index>=0?ROTATION[(index+1)%ROTATION.length]:({chest:'lower_a',shoulders_arms:'lower_b',lower_strength:'pull_a',back:'push_b',upper_specialization:'lower_b',lower_hypertrophy:'pull_b'})[key]||ROTATION[0]}
function routineFamily(key){if(/^push_/.test(key)||key==='chest'||key==='shoulders_arms')return 'push';if(/^pull_/.test(key)||key==='back')return 'pull';if(/^lower_/.test(key))return 'lower';return null}
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
  const current=session?.workoutKey||u.program?.currentWorkoutKey||ROTATION[0];
  let queue=routineQueue(u);
  if(!ROTATION.includes(current)){
    const next=routineSuccessor(current),start=ROTATION.indexOf(next);
    queue=ROTATION.map((_,i)=>ROTATION[(start+i)%ROTATION.length]);
  }else queue=[...queue.filter(k=>k!==current),current];
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
  u.program.pendingWorkouts=ROTATION.includes(key)?[key,...queue.filter(k=>k!==key)]:queue;
  u.program.lastScheduleReason='Your manual choice is scheduled now; displaced sessions remain in the upcoming sequence.';
  // Previewed accessories must be reconsidered after an actual schedule change.
  u.program.selectionCache=Object.fromEntries(Object.entries(u.program.selectionCache||{}).filter(([k])=>k.includes(':block')));
}
function completeRoutine(u,session){
  const token=session?.sessionId||String(session?.ts||'');
  if(token&&u.program.lastRoutineSession===token)return u.program.currentWorkoutKey;
  const queue=Array.isArray(session?.routineAfter)&&session.routineAfter.length===ROTATION.length?session.routineAfter:routineAfter(u,session);
  u.program.pendingWorkouts=[...queue];u.program.lastRoutineSession=token;u.program.interruptedWork=[];
  u.program.currentWorkoutKey=queue[0];
  invalidateRoutineReview(u);
  u.program.selectionCache=Object.fromEntries(Object.entries(u.program.selectionCache||{}).filter(([k])=>k.includes(':block')));
  return queue[0];
}
function routineForecast(u,count=6){
  const current=u.program?.currentWorkoutKey||ROTATION[0],plan=u.workoutDraft?.plan||[];
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
