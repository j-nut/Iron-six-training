const EQUIPMENT=[
  ['dumbbells','Dumbbells'],['barbell','Olympic barbell + plates'],['landmine','Landmine attachment'],['rack','Squat / bench rack'],['bench','Adjustable bench'],['pullup','Pull-up bar'],['bands','Resistance bands'],['abwheel','Ab roller'],['medball','Medicine ball']
];
const DEFAULT_EQUIPMENT={dumbbells:true,barbell:true,landmine:false,rack:true,bench:true,pullup:true,bands:true,abwheel:true,medball:true};
const STORAGE_KEY='ironSixMultiV5';
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
function emptyProgram(){return {currentWorkoutKey:'lower_strength',exposures:{},unlocked:{},variantCursor:{},lastAdaptation:null}}
function makeUser(name='Jordan',weight=213,equipment=DEFAULT_EQUIPMENT){return {id:uid(),name,weight,age:null,heightIn:null,trainingLevel:'unknown',benchBest:'155 lb × 11–12 clean reps',equipment:{...equipment},capacities:{dumbbellMax:30,barbellMax:300},workoutMinutes:60,today:{},history:[],readiness:{energy:4,soreness:1},program:emptyProgram()}}
function normalizeUser(u){return {...u,age:u.age||null,heightIn:u.heightIn||null,trainingLevel:u.trainingLevel||'unknown',workoutMinutes:Number(u.workoutMinutes)||60,equipment:{...DEFAULT_EQUIPMENT,...(u.equipment||{})},capacities:{dumbbellMax:Number(u.capacities?.dumbbellMax)||30,barbellMax:Number(u.capacities?.barbellMax)||300},today:u.today||{},history:u.history||[],readiness:u.readiness||{energy:4,soreness:1},program:{...emptyProgram(),...(u.program||{}),exposures:{...(u.program?.exposures||{})},unlocked:{...(u.program?.unlocked||{})},variantCursor:{...(u.program?.variantCursor||{})}}}}
function loadData(){
  for(const key of [STORAGE_KEY,...PRIOR_STORAGE_KEYS]){const raw=localStorage.getItem(key);if(raw){try{const p=JSON.parse(raw);p.users=(p.users||[]).map(normalizeUser);if(p.users.length){if(!p.activeUserId)p.activeUserId=p.users[0].id;const current=p.users.find(u=>u.id===p.activeUserId)||p.users[0];if(current&&current.name.toLowerCase()==='jordan')current.equipment.landmine=true;return p}}catch(e){}}}
  const legacyRaw=localStorage.getItem(LEGACY_KEY);let jordan=makeUser();jordan.equipment.landmine=true;
  if(legacyRaw){try{const l=JSON.parse(legacyRaw);jordan.weight=l.profile?.bodyWeight||213;jordan.benchBest=l.profile?.benchBest||jordan.benchBest;jordan.today=l.today||{};jordan.history=l.history||[]}catch(e){}}
  return {activeUserId:jordan.id,users:[jordan]};
}
let data=loadData();
function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
function activeUser(){return data.users.find(u=>u.id===data.activeUserId)||data.users[0]}
function has(u,key){return !!u.equipment?.[key]}
function choose(u,options){for(const o of options){if(!o.requires||o.requires.every(k=>has(u,k)))return {...o}}return {...options[options.length-1]}}
function ex(name,requires,prescription,sets,tag,base,seedKey,priority=2){return {name,requires,prescription,sets,tag,base,seedKey:seedKey||base,priority}}
function slot(u,options){return choose(u,options)}
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
