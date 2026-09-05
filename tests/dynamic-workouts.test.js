const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const storage={};
const context={console,Date,Math,localStorage:{getItem:key=>storage[key]||null,setItem:(key,value)=>{storage[key]=value}}};
vm.createContext(context);
for(const file of ['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js','workout-upper.js','workout-dispatch.js','engine.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);

const result=vm.runInContext(`(()=>{
  const none={dumbbells:false,barbell:false,landmine:false,rack:false,bench:false,pullup:false,bands:false,abwheel:false,medball:false};
  const user=makeUser('Dynamic tester',180,none);
  user.customEquipment=['Kettlebell'];
  user.program.generatedExercises=[{name:'Kettlebell Goblet Squat',base:'Primary squat',seedKey:'squat',tag:'Priority',prescription:'4 × 6–10',sets:4,priority:1,workoutKeys:['lower_strength'],requires:[],requiresCustom:['Kettlebell'],equipmentName:'Kettlebell',equipmentId:'custom:kettlebell',source:'groq'}];
  user.history=[{workoutKey:'lower_strength',details:[{name:'Tempo Bodyweight Squat',base:'Primary squat',sets:[]}]}];
  const workout=buildWorkout(user),selected=workout[0],swaps=swapOptionsForExercise(user,selected).map(x=>x.name);
  user.customEquipment=[];clearCurrentSelectionCache(user);
  const withoutEquipment=buildWorkout(user)[0].name;

  const scheduleUser=makeUser('Schedule tester',180,DEFAULT_EQUIPMENT),sequence=[];
  for(let i=0;i<8;i++){
    const key=scheduleUser.program.currentWorkoutKey;sequence.push(key);
    scheduleUser.history.unshift({workoutKey:key,muscles:workoutMuscles(key),details:[]});
    scheduleUser.program.currentWorkoutKey=nextWorkoutKey(scheduleUser);
  }
  const shortUser=makeUser('Short workout tester',180,DEFAULT_EQUIPMENT);
  shortUser.workoutMinutes=15;shortUser.program.currentWorkoutKey='lower_hypertrophy';
  shortUser.history=[{workoutKey:'upper_specialization',muscles:['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','core'],details:[]}];
  const shortMuscles=[...new Set(getWorkout(shortUser).flatMap(exerciseMuscles))];
  return {selected:selected.name,swaps,withoutEquipment,sequence,coverage:muscleCoverage(scheduleUser),shortMuscles};
})()`,context);

assert.equal(result.selected,'Kettlebell Goblet Squat','new equipment exercises should enter the matching workout slot after a recent alternative was used');
assert(result.swaps.includes('Tempo Bodyweight Squat'),'same-pattern swapping should retain an equipment-safe alternative');
assert.notEqual(result.withoutEquipment,'Kettlebell Goblet Squat','generated exercises must disappear when their required equipment is unavailable');
assert.equal(new Set(result.sequence).size,6,'the scheduler should rotate through every workout family');
assert.equal(result.coverage.missing.length,0,'all major muscle groups must be covered within an eight-session window');
assert(result.shortMuscles.includes('calves'),'short workouts should reserve a set for an overdue muscle when the selected workout can train it');
for(let i=1;i<result.sequence.length;i++)assert.notEqual(result.sequence[i],result.sequence[i-1],'the scheduler must not repeat a workout immediately');

const api=fs.readFileSync('api/equipment-exercises.js','utf8');
assert(api.includes('process.env.GROQ_API_KEY'),'the Groq key must stay server-side');
assert(api.includes('const SLOTS='),'Groq output must be constrained to deterministic workout slots');
assert(api.includes('validatedExercises'),'generated exercises must be validated before reaching the client');
assert(api.includes("validatedExercises(equipment.flatMap(curatedRows),equipment,'curated')"),'equipment generation must degrade safely if Groq is unavailable');

const coach=fs.readFileSync('coach.js','utf8');
assert(coach.includes('customEquipmentPanel'),'profiles must support arbitrary equipment');
assert(coach.includes("fetch('/api/equipment-exercises'"),'new equipment must request Groq exercise expansion');
assert(coach.includes('openExerciseSwap'),'workout cards must expose direct same-pattern swapping');
assert(!coach.includes('u.today={};saveData();renderExercises()'),'swapping one exercise must not erase the whole workout draft');

const cloud=fs.readFileSync('cloud-sync.js','utf8');
assert(cloud.includes('customEquipment:u.customEquipment'),'custom equipment must sync across devices');
