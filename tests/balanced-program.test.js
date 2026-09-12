const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){const c={console,Date,Math,localStorage:{getItem:()=>null,setItem:()=>{}}};c.window=c;vm.createContext(c);for(const f of ['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js','workout-upper.js','workout-dispatch.js','engine.js','session-planner.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);return code=>vm.runInContext(code,c)}
test('a full cycle covers the body with complementary pressing and supported pulling',()=>{
 const run=setup();const rows=run(`(()=>{const u=makeUser('Cycle'),rows=[];for(const key of ROTATION){u.program.currentWorkoutKey=key;const p=finalWorkout(u);rows.push({key,slots:p.map(e=>e._programSlot),names:p.map(e=>e.name),muscles:[...new Set(p.flatMap(exerciseMuscles))],chest:p.filter(e=>['bench','chest_press','fly'].includes(e.seedKey)).reduce((n,e)=>n+e.sets,0)});u.history.unshift({workoutKey:key,details:p.map(e=>({...e,sets:[{done:true,reps:10}]}))})}return rows})()`);
 assert(rows[0].chest>=6);assert(rows[3].chest>=6);
 for(const row of rows){assert.equal(new Set(row.names).size,row.names.length);if(row.key.startsWith('pull'))assert(!row.names.some(n=>/Barbell Row|Meadows/.test(n)));}
 assert.equal(new Set(rows.flatMap(r=>r.muscles)).size,10);
 for(let i=0;i<6;i++)assert.notEqual(rows[i].key.split('_')[0],rows[(i+1)%6].key.split('_')[0]);
});
test('benchmark selections stay for four exposures while accessory sessions vary',()=>{
 const run=setup();const rows=run(`(()=>{const u=makeUser('Progress'),out=[];for(let i=0;i<4;i++){const cycle=[];for(const key of ROTATION){u.program.currentWorkoutKey=key;u.program.exposures[key]=i;const p=buildWorkout(u);cycle.push({key,anchors:p.filter(e=>e._anchor).map(e=>e.name),extras:p.filter(e=>!e._anchor).map(e=>e.name)});u.history.unshift({workoutKey:key,details:p.map(e=>({...e,sets:[{done:true,reps:10}]}))});}out.push(cycle)}return out})()`);
 for(let k=0;k<6;k++)for(let i=1;i<4;i++)assert.deepEqual(rows[i][k].anchors,rows[0][k].anchors);
 assert.notDeepEqual(rows[0].map(r=>r.extras),rows[1].map(r=>r.extras));
});
test('restricted equipment never produces unavailable movements or hides pulling gaps',()=>{
 const run=setup();run(`for(const equipment of [{},{dumbbells:true},{bands:true},DEFAULT_EQUIPMENT])for(const key of ROTATION){const u=makeUser('Equipment',180,equipment);u.program.currentWorkoutKey=key;for(const e of buildWorkout(u))if(!exerciseAvailable(u,e))throw Error('Unavailable '+e.name);if(!Object.keys(equipment).length&&key==='pull_a'&&!u.program.planGaps.slots.includes('row'))throw Error('Missing pulling gap')}`);
});
test('draft plans stay fixed despite exposure, equipment and calendar changes',()=>{
 const run=setup();assert.equal(run(`(()=>{const u=makeUser('Draft');u.workoutDraft={plan:finalWorkout(u)};const before=JSON.stringify(finalWorkout(u));u.program.exposures.push_a=100;u.equipment={};u.workoutMinutes=10;return JSON.stringify(finalWorkout(u))===before})()`),true);
});
