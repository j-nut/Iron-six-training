const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={EQUIPMENT:[],ROTATION:['lower_strength'],has:()=>false,currentVariant:()=>0,optionsFor:()=>[],exposureStats:()=>({successful:0}),variantUnlocked:()=>1};
vm.createContext(context);vm.runInContext(fs.readFileSync('engine.js','utf8'),context);
const suggest=vm.runInContext('baselineLoadObject',context);
const user={weight:200,trainingLevel:'intermediate',today:{},history:[],program:{currentWorkoutKey:'lower_strength'},capacities:{barbellMax:300},trainerMemory:{reviewedAt:Date.now(),verifiedForWorkoutKey:'lower_strength',summary:'Groq checked the next workout.',verifiedPlan:[{name:'Barbell Back Squat',base:'Knee dominant',verifiedLoad:110,verifiedReps:8}],adjustments:{}}};
const exercise={name:'Barbell Back Squat',base:'Knee dominant',prescription:'4 × 6–8',seedKey:'squat'};
const result=suggest(user,exercise);
assert.equal(result.load,110,'fresh Groq-verified load should be used');
assert.equal(result.target,8,'verified reps must remain in the prescribed range');
assert.equal(result.confidence,'AI Trainer verified');

const api=fs.readFileSync('api/review-workout.js','utf8');
assert(api.includes("clamp(Number(x.factor)||1,.97,1.03)"),'long-term AI factors must be capped at ±3%');
assert(api.includes("maxDelta=x.load*.05"),'Groq load checks must be capped at ±5%');
assert(api.includes("x.repMin,x.repMax"),'verified reps must stay inside the programmed range');
assert(api.includes("Math.max(1,x.sets-1)"),'verified set counts must change by no more than one');

const ui=fs.readFileSync('ui3.js','utf8');
assert(ui.includes("fetch('/api/review-workout'"),'finishing a workout must trigger the persistent trainer review');
assert(ui.includes('verifiedForWorkoutKey'),'verified numbers must be attached to the intended next workout');
const profileSave=ui.slice(ui.indexOf('function saveProfile'),ui.indexOf('async function reviewCompletedWorkout'));
assert(!profileSave.includes('u.today={}'),'saving a profile must never erase the current workout draft');
const cloud=fs.readFileSync('cloud-sync.js','utf8');
assert(cloud.includes('trainerMemory:u.trainerMemory'),'trainer memory must sync across devices');
assert(cloud.includes('mergeSetDrafts'),'cloud sync must merge individual in-progress sets instead of replacing the workout');
assert(cloud.includes('draftWorkoutKey'),'cloud drafts must be tied to the correct workout');
const workoutUi=fs.readFileSync('ui2.js','utf8');
assert(workoutUi.includes("w.addEventListener('input',persist)"),'weights must save on every entry');
assert(workoutUi.includes("r.addEventListener('input',persist)"),'reps must save on every entry');
assert(workoutUi.includes('_updatedAt:now'),'each set must carry its own conflict-resolution timestamp');
