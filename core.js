const EQUIPMENT=[
  ['dumbbells','Dumbbells'],['barbell','Olympic barbell + plates'],['landmine','Landmine attachment'],['rack','Squat / bench rack'],['bench','Adjustable bench'],['pullup','Pull-up bar'],['bands','Resistance bands'],['abwheel','Ab roller'],['medball','Medicine ball']
];
const DEFAULT_EQUIPMENT={dumbbells:true,barbell:true,landmine:false,rack:true,bench:true,pullup:true,bands:true,abwheel:true,medball:true};
const STORAGE_KEY='ironSixMultiV5';
const BACKUP_STORAGE_KEY=STORAGE_KEY+'_recovery';
const PRIOR_STORAGE_KEYS=['ironSixMultiV4','ironSixMultiV3'];
const LEGACY_KEY='ironSixState';
const ROTATION=['lower_strength','shoulders_arms','chest','back','lower_hypertrophy','upper_specialization'];
const WORKOUT_META={
  lower_strength:{name:'Lower strength + core',short:'Lower strength',muscles:['quads','glutes','hamstrings','core']},
  shoulders_arms:{name:'Shoulders + arms',short:'Shoulders + arms',muscles:['shoulders','biceps','triceps']},
  chest:{name:'Chest',short:'Chest',muscles:['chest','triceps','front delts']},
  back:{name:'Back',short:'Back',muscles:['back','biceps','rear delts']},
  lower_hypertrophy:{name:'Lower hypertrophy',short:'Lower hypertrophy',muscles:['quads','glutes','hamstrings','calves']},
  upper_specialization:{name:'Upper specialization',short:'Upper specialization',muscles:['chest','back','shoulders','arms']}
};
function uid(){return 'u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function emptyProgram(){return {currentWorkoutKey:'lower_strength',exposures:{},unlocked:{},variantCursor:{},selectionCache:{},generatedExercises:[],lastAdaptation:null,lastScheduleReason:null,equipmentGeneration:null}}
function emptyTrainerMemory(){return {status:'Learning from completed workouts',summary:'Complete a workout with weight, reps, and RIR to build your AI training profile.',adjustments:{},recommendations:[],reviewedAt:null,model:null}}
function makeUser(name='Jordan',weight=213,equipment=DEFAULT_EQUIPMENT){return {id:uid(),name,weight,age:null,heightIn:null,trainingLevel:'unknown',benchBest:'155 lb × 11–12 clean reps',equipment:{...equipment},customEquipment:[],capacities:{dumbbellMax:30,barbellMax:300},workoutMinutes:60,today:{},history:[],readiness:{energy:4,soreness:1},program:emptyProgram(),trainerMemory:emptyTrainerMemory()}}
function normalizeUser(u){return {...u,age:u.age||null,heightIn:u.heightIn||null,trainingLevel:u.trainingLevel||'unknown',workoutMinutes:Number(u.workoutMinutes)||60,equipment:{...DEFAULT_EQUIPMENT,...(u.equipment||{})},customEquipment:Array.isArray(u.customEquipment)?u.customEquipment.map(normalizeEquipmentName).filter(Boolean).slice(0,16):[],capacities:{dumbbellMax:Number(u.capacities?.dumbbellMax)||30,barbellMax:Number(u.capacities?.barbellMax)||300},today:u.today||{},history:u.history||[],readiness:u.readiness||{energy:4,soreness:1},program:{...emptyProgram(),...(u.program||{}),exposures:{...(u.program?.exposures||{})},unlocked:{...(u.program?.unlocked||{})},variantCursor:{...(u.program?.variantCursor||{})},selectionCache:{...(u.program?.selectionCache||{})},generatedExercises:Array.isArray(u.program?.generatedExercises)?u.program.generatedExercises.slice(0,80):[]},trainerMemory:{...emptyTrainerMemory(),...(u.trainerMemory||{}),adjustments:{...(u.trainerMemory?.adjustments||{})},recommendations:Array.isArray(u.trainerMemory?.recommendations)?u.trainerMemory.recommendations:[]}}}
function loadData(){
  for(const key of [STORAGE_KEY,BACKUP_STORAGE_KEY,...PRIOR_STORAGE_KEYS]){const raw=localStorage.getItem(key);if(raw){try{const p=JSON.parse(raw);p.users=(p.users||[]).map(normalizeUser);if(p.users.length){if(!p.activeUserId)p.activeUserId=p.users[0].id;const current=p.users.find(u=>u.id===p.activeUserId)||p.users[0];if(current&&current.name.toLowerCase()==='jordan')current.equipment.landmine=true;return p}}catch(e){}}}
  const legacyRaw=localStorage.getItem(LEGACY_KEY);let jordan=makeUser();jordan.equipment.landmine=true;
  if(legacyRaw){try{const l=JSON.parse(legacyRaw);jordan.weight=l.profile?.bodyWeight||213;jordan.benchBest=l.profile?.benchBest||jordan.benchBest;jordan.today=l.today||{};jordan.history=l.history||[]}catch(e){}}
  return {activeUserId:jordan.id,users:[jordan]};
}
let data=loadData();
function saveData(){const snapshot=JSON.stringify(data);localStorage.setItem(STORAGE_KEY,snapshot);localStorage.setItem(BACKUP_STORAGE_KEY,snapshot)}
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
function choose(u,options){const original=Array.isArray(options)?options:[],pool=[...original,...generatedOptionsForSlot(u,original)].filter((o,index,all)=>o?.name&&exerciseAvailable(u,o)&&all.findIndex(x=>x.name.toLowerCase()===o.name.toLowerCase())===index);if(!pool.length)return original.length?{...original[original.length-1]}:null;const cacheKey=currentSelectionKey(u,pool[0].base),cachedName=u.program?.selectionCache?.[cacheKey],cached=pool.find(x=>x.name===cachedName);const ranked=cached||pool.map((o,index)=>({o,score:exerciseRecentPenalty(u,o)+index*1.5+(o.source==='groq'?2:0),tie:stableNumber(`${cacheKey}:${o.name}`)})).sort((a,b)=>a.score-b.score||a.tie-b.tie)[0].o;u.program.selectionCache=u.program.selectionCache||{};u.program.selectionCache[cacheKey]=ranked.name;const alternatives=pool.filter(x=>x.name!==ranked.name).map(x=>({...x}));return {...ranked,_alternatives:alternatives}}
function ex(name,requires,prescription,sets,tag,base,seedKey,priority=2){return {name,requires,prescription,sets,tag,base,seedKey:seedKey||base,priority}}
function slot(u,options){return choose(u,options)}
function swapOptionsForExercise(u,exercise){const options=[...(exercise?._alternatives||[]),...generatedOptionsForSlot(u,[exercise])].filter((o,index,all)=>o?.name&&o.name!==exercise?.name&&o.base===exercise?.base&&exerciseAvailable(u,o)&&all.findIndex(x=>x.name.toLowerCase()===o.name.toLowerCase())===index);return options.sort((a,b)=>exerciseRecentPenalty(u,a)-exerciseRecentPenalty(u,b)||String(a.name).localeCompare(String(b.name))).slice(0,8)}
function workoutVariantCount(key){return 3}
function successfulExposure(h){
  if(!h||!h.details?.length)return false;
  const planned=Number(h.plannedSets)||Number(h.sets)||1, completed=Number(h.sets)||0, completion=completed/Math.max(1,planned);
  const rirs=[];h.details.forEach(d=>(d.sets||[]).forEach(s=>{const r=Number(s.rir);if(Number.isFinite(r))rirs.push(r)}));
  const avgRir=rirs.length?rirs.reduce((a,b)=>a+b,0)/rirs.length:2;
  return completion>=0.72 && avgRir>=0.25 && avgRir<=3.75;
}
function exposureStats(u,key){const sessions=(u.history||[]).filter(h=>h.workoutKey===key);const successful=sessions.filter(successfulExposure);return {total:sessions.length,successful:successful.length,recent:successful.slice(0,4)}}
function variantUnlocked(u,key){const stats=exposureStats(u,key);const current=Math.max(1,Number(u.program.unlocked?.[key])||1);let unlocked=current;if(stats.successful>=4)unlocked=Math.max(unlocked,2);if(stats.successful>=8)unlocked=Math.max(unlocked,3);u.program.unlocked[key]=Math.min(workoutVariantCount(key),unlocked);return u.program.unlocked[key]}
function currentVariant(u,key){const unlocked=variantUnlocked(u,key);const exposure=Number(u.program.exposures?.[key])||0;return unlocked<=1?0:exposure%unlocked}
function variantLabel(i){return ['A','B','C'][i]||'A'}
