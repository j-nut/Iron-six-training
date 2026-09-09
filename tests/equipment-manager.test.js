// Drives the equipment picker through the real DOM, because the value of this feature is that
// tapping a chip changes the workout — not that a function returns the right array.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

// Same harness as tests/session-resume.test.js: load the static scripts, skip the cloud modules
// (they make network calls), and stub the generation endpoint so no request escapes.
function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[],requests=[];
  w.confirm=()=>true;
  w.setInterval=()=>0;
  w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options?.body||'{}')});return {ok:false,json:async()=>({})}};
  w.addEventListener('error',event=>errors.push(event.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  return {
    w,run,errors,requests,
    json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    open:()=>{w.document.getElementById('openEquipmentManagerBtn').click()},
    item:id=>w.document.querySelector(`[data-toggle-item="${id}"]`),
    close:()=>dom.window.close()
  };
}

const bodyweight="activeUser().equipment={dumbbells:false,barbell:false,landmine:false,rack:false,bench:false,pullup:false,bands:false,abwheel:false,medball:false};activeUser().customEquipment=[];saveData();renderAll()";

test('the app boots with the equipment manager installed and no script errors',()=>{
  const a=app();
  try{
    assert.deepEqual(a.errors,[]);
    assert(a.w.document.getElementById('openEquipmentManagerBtn'),'the profile editor must offer a Manage equipment button');
    assert.equal(a.w.document.getElementById('equipmentBadges').getAttribute('role'),'button','the Today badges must open the manager');
    assert(a.w.document.getElementById('equipmentManagerModal'),'the modal must be installed');
    assert(!a.w.document.getElementById('equipmentManagerModal').classList.contains('show'),'the modal must start closed');
  }finally{a.close()}
});

test('opening the manager renders coverage, the catalogue and the gap list',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.open();
    assert(a.w.document.getElementById('equipmentManagerModal').classList.contains('show'));
    assert.match(a.w.document.getElementById('eqmgrCoverage').textContent,/\/100/);
    const catalogued=a.w.document.querySelectorAll('[data-toggle-item]').length;
    assert(catalogued>=30,`expected the full catalogue, rendered ${catalogued}`);
    assert(a.w.document.getElementById('eqmgrGaps').textContent.includes('Gaps in your plan'));
  }finally{a.close()}
});

test('tapping a catalogue item adds it, changes the workout, and requests exercises once',async()=>{
  const a=app();
  try{
    a.run("activeUser().program.currentWorkoutKey='back';"+bodyweight);
    const before=a.json('getWorkout(activeUser()).map(e=>e.name)');
    a.open();
    a.item('lat-pulldown').click();
    assert.deepEqual(a.json('activeUser().customEquipment'),['Lat pulldown machine']);
    // The picker only stores equipment; the exercises arrive from the endpoint. Simulate the
    // response landing so the workout has something to select.
    a.run(`activeUser().program.generatedExercises=[{name:'Machine Lat Pulldown',base:'Vertical pull',seedKey:'pullup',prescription:'4 × 6–10',sets:4,tag:'Back',priority:1,workoutKeys:['back'],requires:[],requiresCustom:['Lat pulldown machine'],equipmentName:'Lat pulldown machine',equipmentId:'custom:lat pulldown machine',source:'curated'}];clearCurrentSelectionCache(activeUser())`);
    const after=a.json('getWorkout(activeUser()).map(e=>e.name)');
    assert(after.includes('Machine Lat Pulldown'),`equipment did not reach the workout: ${after.join(', ')}`);
    assert(!before.includes('Machine Lat Pulldown'));
    await new Promise(resolve=>setTimeout(resolve,700));
    const generation=a.requests.filter(r=>String(r.url).includes('/api/equipment-exercises'));
    assert.equal(generation.length,1,'adds must be batched into a single generation request');
    assert.equal(generation[0].body.equipment[0].name,'Lat pulldown machine');
  }finally{a.close()}
});

test('rapid taps are batched into one request carrying every added item',async()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.open();
    for(const id of ['kettlebells','cable','suspension'])a.item(id).click();
    await new Promise(resolve=>setTimeout(resolve,700));
    const generation=a.requests.filter(r=>String(r.url).includes('/api/equipment-exercises'));
    assert.equal(generation.length,1,`expected one batched request, saw ${generation.length}`);
    assert.equal(generation[0].body.equipment.length,3);
  }finally{a.close()}
});

test('tapping an owned item removes it and drops its generated exercises',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.run(`activeUser().customEquipment=['Kettlebells'];
      activeUser().program.generatedExercises=[{name:'Kettlebell Swing',base:'Hip hinge',seedKey:'hinge',prescription:'3 × 6–10',sets:3,tag:'Hamstrings',priority:2,workoutKeys:['lower_strength'],requires:[],requiresCustom:['Kettlebells'],equipmentName:'Kettlebells',equipmentId:'custom:kettlebells',source:'curated'}];saveData();renderAll()`);
    a.open();
    assert(a.item('kettlebells').classList.contains('active'),'an owned item must render as selected');
    a.item('kettlebells').click();
    assert.deepEqual(a.json('activeUser().customEquipment'),[]);
    assert.deepEqual(a.json('activeUser().program.generatedExercises'),[],'exercises must not outlive their equipment');
  }finally{a.close()}
});

test('an item stored under an alias shows as owned and is removed by its stored name',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    // What the user typed, not the catalogue's canonical "Cable machine / functional trainer".
    a.run("activeUser().customEquipment=['Cable machine'];saveData();renderAll()");
    a.open();
    assert(a.item('cable').classList.contains('active'),'an aliased entry must resolve to the catalogue item');
    a.item('cable').click();
    assert.deepEqual(a.json('activeUser().customEquipment'),[],'removal must target the name actually stored');
  }finally{a.close()}
});

test('an alias cannot be added as a second copy of equipment already owned',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.run("activeUser().customEquipment=['Kettlebells'];saveData();renderAll()");
    a.open();
    const search=a.w.document.getElementById('eqmgrSearchInput');
    search.value='Bowflex adjustable kettlebells';
    search.dispatchEvent(new a.w.Event('input'));
    const add=a.w.document.getElementById('eqmgrAddCustomBtn');
    if(add)add.click();
    assert.deepEqual(a.json('activeUser().customEquipment'),['Kettlebells']);
  }finally{a.close()}
});

test('unrecognised free text is still accepted as custom equipment',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.open();
    const search=a.w.document.getElementById('eqmgrSearchInput');
    search.value='Vibrating platform 3000';
    search.dispatchEvent(new a.w.Event('input'));
    const add=a.w.document.getElementById('eqmgrAddCustomBtn');
    assert(add,'unmatched search text must offer a custom add');
    add.click();
    assert.deepEqual(a.json('activeUser().customEquipment'),['Vibrating platform 3000']);
  }finally{a.close()}
});

test('equipment cannot be changed while a workout is part-logged',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.run("activeUser().today['0-0']={weight:'95',reps:'8',rir:'2',done:true};saveData();renderAll()");
    a.open();
    a.item('kettlebells').click();
    assert.deepEqual(a.json('activeUser().customEquipment'),[],'a logged set must block equipment changes');
    assert.match(a.w.document.getElementById('toast').textContent,/Finish or reset the current workout/);
  }finally{a.close()}
});

test('a builtin toggles the original equipment flag rather than adding a custom entry',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.open();
    a.item('barbell').click();
    assert.equal(a.json('activeUser().equipment.barbell'),true);
    assert.deepEqual(a.json('activeUser().customEquipment'),[],'builtins must not leak into customEquipment');
    a.item('barbell').click();
    assert.equal(a.json('activeUser().equipment.barbell'),false);
  }finally{a.close()}
});

test('gap suggestions add the equipment they recommend',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.open();
    const suggestion=a.w.document.querySelector('[data-add-suggestion]');
    assert(suggestion,'a bodyweight profile must be offered something to fix its gaps');
    const id=suggestion.dataset.addSuggestion;
    suggestion.click();
    const owned=a.json('activeUser().customEquipment').concat(a.json("Object.keys(activeUser().equipment).filter(k=>activeUser().equipment[k])"));
    assert(owned.length>0,`tapping the ${id} suggestion added nothing`);
  }finally{a.close()}
});

test('equipment names are escaped, not injected, when rendered',()=>{
  const a=app();
  try{
    a.run(bodyweight);
    a.run("activeUser().customEquipment=[normalizeEquipmentName('<img src=x onerror=alert(1)>')];saveData();renderAll()");
    a.open();
    assert.equal(a.w.document.querySelectorAll('#eqmgrOwned img').length,0,'a crafted equipment name must not become markup');
    assert(a.w.document.getElementById('eqmgrOwned').textContent.includes('img src'));
  }finally{a.close()}
});
