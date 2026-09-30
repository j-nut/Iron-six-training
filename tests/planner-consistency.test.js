const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){const c={console,Date,Math,localStorage:{getItem:()=>null},document:{getElementById:()=>null,addEventListener(){}},setTimeout(){}};c.window=c;vm.createContext(c);for(const f of ['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js','workout-upper.js','workout-dispatch.js','engine.js','session-planner.js','session-adaptation-v3.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);return code=>JSON.parse(vm.runInContext(`JSON.stringify((()=>{${code}})())`,c))}
test('all routine equipment mode and duration plans agree with budgets and circuit timeline',()=>{
 const run=setup();const out=run(`let count=0;for(const eq of [{},{dumbbells:true},{bands:true},DEFAULT_EQUIPMENT])for(const key of Object.keys(WORKOUT_META))for(const mode of ['traditional','circuit'])for(const minutes of [10,15,20,30,45,60,120]){const u=makeUser('Audit',180,eq);u.program.currentWorkoutKey=key;u.trainingMode=mode;u.workoutMinutes=minutes;const p=finalWorkout(u);count++;if(!p.length||new Set(p.map(e=>e.name)).size!==p.length||p.some(e=>!exerciseAvailable(u,e)||e.sets<1))throw Error('Invalid plan '+key+' '+mode+' '+minutes);if(sessionSeconds(u,p)>minutes*60)throw Error('Overbudget '+key+' '+mode+' '+minutes);if(mode==='circuit'){const timeline=circuitTimeline(u,p);if(timeline.reduce((n,s)=>n+s.seconds,0)!==sessionSeconds(u,p))throw Error('Timer drift');for(let i=0;i<p.length;i++){const rounds=timeline.filter(s=>s.kind==='work'&&s.index===i);if(rounds.length!==p[i].sets||!p[i].prescription.includes(p[i].sets+' rounds'))throw Error('Round mismatch')}}}return count;`);
 assert.equal(out,672);
});
test('circuit fallback preserves distinct stations and primary movement roles',()=>{
 const run=setup();const p=run(`const u=makeUser();u.trainingMode='circuit';const option={name:'Dumbbell Press',sets:2,priority:3,base:'Press',prescription:'2 × 8',requires:[]};return budgetSessionWorkout(u,[{name:'Barbell Press',sets:3,priority:1,base:'Press',_programSlot:'primary',_anchor:true,requires:[],_alternatives:[option]},{name:'Barbell Incline Press',sets:3,priority:2,base:'Press',requires:[],_alternatives:[option,{...option,name:'Band Press'}]}]);`);
 assert.deepEqual(p.map(e=>e.name),['Dumbbell Press','Band Press']);assert.equal(p[0].priority,1);assert.equal(p[0]._anchor,true);assert.equal(p[0]._programSlot,'primary');
});
test('stale indexed override cannot replace a newly selected movement at the same index',()=>{
 const run=setup();const p=run(`const u=makeUser();u.coachOverrides={workoutKey:'push_a',exposure:0,byIndex:{0:{name:'Band Press',_targetName:'Dumbbell Press',requires:[]}}};return workoutOverrides(u,[{name:'Incline Press',requires:[]}]);`);
 assert.equal(p[0].name,'Incline Press');
});
test('circuit pace and mode rebuilds clear stale plans and calibration while preserving archived entries',async()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,c=dom.getInternalVMContext();w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.fetch=async()=>({ok:false,json:async()=>({})});w.setInterval=()=>0;w.setTimeout=()=>0;
 try{
 for(const f of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(f=>!['cloud-sync.js','cloud-history-sync.js'].includes(f)))vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
 await w.IronSixJournal.hydrated;const run=code=>vm.runInContext(code,c);
 w.document.querySelector('[data-training-mode="circuit"]').click();
 run("activeUser().sessionCalibration={factor:1.06};activeUser().coachOverrides={workoutKey:'push_a',exposure:0,byIndex:{}};activeUser().trainerMemory.verifiedPlan=[{verifiedSets:8}]");
 const weight=w.document.querySelector('.weight');weight.value='35';weight.dispatchEvent(new w.Event('input'));
 const pace=w.document.getElementById('circuitPace');pace.value='intense';pace.dispatchEvent(new w.Event('change'));
 assert.equal(run('activeUser().sessionCalibration'),null);assert.equal(run('activeUser().coachOverrides'),null);assert.equal(run('activeUser().trainerMemory.verifiedPlan.length'),0);
 assert(run("IronSixJournal.replay(activeUser().id).some(s=>s.status==='archived'&&s.today['0-0']?.weight==='35')"));
 run("activeUser().sessionCalibration={factor:1.06};activeUser().coachOverrides={};activeUser().trainerMemory.verifiedPlan=[{verifiedSets:8}]");
 w.document.querySelector('[data-training-mode="traditional"]').click();
 assert.equal(run('activeUser().sessionCalibration'),null);assert.equal(run('activeUser().coachOverrides'),null);assert.equal(run('activeUser().trainerMemory.verifiedPlan.length'),0);
 }finally{dom.window.close()}
});

test('pain alternatives are timed using the retained priority rest interval',()=>{
 const run=setup();const out=run(`const u=makeUser();u.trainingFeedback=[{ts:Date.now(),feedback:'pain',exercise:'Dumbbell Press'}];return IronSixAdaptiveSessionV3.adaptPlan(u,[{name:'Dumbbell Press',seedKey:'bench',priority:1,sets:4,prescription:'4 × 8',_alternatives:[{name:'One-Arm Dumbbell Press',seedKey:'bench',priority:3,prescription:'3 × 8 each arm'},{name:'Band Press',seedKey:'bench',priority:3,prescription:'3 × 8'}]}]);`);
 assert.equal(out[0].name,'Band Press');assert.equal(out[0].priority,1);
});
