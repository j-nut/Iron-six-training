const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
function app(){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,context=dom.getInternalVMContext();
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.fetch=async()=>({ok:false,json:async()=>({})});w.setInterval=()=>0;w.setTimeout=()=>0;
 for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 return {w,run:code=>vm.runInContext(code,context),close:()=>w.close()};
}
test('duration rebuild clears indexed Coach overrides, verification and calibration',()=>{
 const a=app();try{
 a.run("activeUser().coachOverrides={byIndex:{0:{name:'Stale exercise'}}};activeUser().sessionCalibration={factor:1.06};activeUser().trainerMemory.verifiedPlan=[{name:'old'}];setWorkoutMinutes(15)");
 assert.equal(a.run('activeUser().coachOverrides'),null);assert.equal(a.run('activeUser().sessionCalibration'),null);assert.equal(a.run('activeUser().trainerMemory.verifiedPlan.length'),0);assert.equal(a.run('activeUser().workoutMinutes'),15);
 }finally{a.close()}
});
test('invalid custom durations leave the current workout untouched',()=>{
 const a=app();try{for(const value of ['', 'bad', '-1', '999', 'Infinity']){a.run(`setWorkoutMinutes(${JSON.stringify(value)})`);assert.equal(a.run('activeUser().workoutMinutes'),60)}}finally{a.close()}
});
test('readiness rebuild discards stale targets without advancing the routine',()=>{
 const a=app();try{const key=a.run('activeUser().program.currentWorkoutKey');a.run("activeUser().coachOverrides={byIndex:{}};activeUser().sessionCalibration={factor:1.06};activeUser().trainerMemory.verifiedPlan=[{}]");a.w.document.getElementById('energy').value='1';a.w.document.getElementById('energy').dispatchEvent(new a.w.Event('change'));assert.equal(a.run('activeUser().coachOverrides'),null);assert.equal(a.run('activeUser().sessionCalibration'),null);assert.equal(a.run('activeUser().trainerMemory.verifiedPlan.length'),0);assert.equal(a.run('activeUser().program.currentWorkoutKey'),key)}finally{a.close()}
});
test('equipment changes rebuild an empty frozen plan instead of retaining unavailable exercises',()=>{
 const a=app();try{a.run('IronSixJournal.ensure(activeUser(),finalWorkout(activeUser()))');const id=a.run('activeUser().workoutDraft.id');for(const field of a.w.document.querySelectorAll('[data-equip]'))field.checked=false;a.w.document.getElementById('saveProfile').click();assert.equal(a.run('!!activeUser().workoutDraft'),false);assert(a.run('finalWorkout(activeUser()).every(e=>exerciseAvailable(activeUser(),e))'));assert(a.run(`IronSixJournal.replay(activeUser().id).some(s=>s.id===${JSON.stringify(id)}&&s.status==='archived')`))}finally{a.close()}
});
test('equipment change with logged work cannot silently replace the active session',()=>{
 const a=app();try{a.run("activeUser().today={'0-0':{weight:'50',reps:'8',done:true}};IronSixJournal.ensure(activeUser(),finalWorkout(activeUser()))");const id=a.run('activeUser().workoutDraft.id');for(const field of a.w.document.querySelectorAll('[data-equip]'))field.checked=false;a.w.document.getElementById('saveProfile').click();assert.equal(a.run('activeUser().workoutDraft.id'),id);assert.equal(a.run('activeUser().today["0-0"].weight'),'50');assert.equal(a.run('activeUser().equipment.barbell'),true)}finally{a.close()}
});
