const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const owned=[5,10,15,20,25,30,40,50];
const exercise={name:'Dumbbell Bench Press',base:'Horizontal press',seedKey:'bench',requires:['dumbbells'],sets:3,prescription:'3 × 8–12'};
function engine(){
  const c={localStorage:{getItem:()=>null,setItem(){}},setTimeout(){},document:{getElementById:()=>null,addEventListener(){}}};c.window=c;vm.createContext(c);
  for(const file of ['core.js','workout-difficulty.js','engine.js','load-progression-v2.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  c.IronSixDifficulty.installLoadAdjustment();
  const run=code=>vm.runInContext(code,c),u=run('makeUser("Inventory",180)');u.capacities={dumbbellMax:50,dumbbellWeights:owned.slice(),barbellMax:300};
  return {c,run,u};
}
function app(saved={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,c=dom.getInternalVMContext();w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.setTimeout=()=>0;w.setInterval=()=>0;w.fetch=async()=>({ok:false,json:async()=>({})});
  for(const [k,v] of Object.entries(saved))w.localStorage.setItem(k,v);
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(f=>!['cloud-sync.js','cloud-history-sync.js'].includes(f)))vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  const run=code=>vm.runInContext(code,c);
  run(fs.readFileSync('load-progression-v2.js','utf8'));
  const choose=()=>{const select=w.document.getElementById('profileDbMode');select.value='exact';select.dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {w,run,choose,storage:()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)])),close:()=>w.close()};
}
test('exact inventory snaps estimates to owned weights while legacy increments and barbells remain unchanged',()=>{
  const {c,u}=engine();
  assert.equal(c.roundLoad(35,exercise,u),30);assert.equal(c.roundLoad(45,exercise,u),40);
  assert.equal(c.roundLoad(39,exercise,u),40);assert.equal(c.roundLoad(39,exercise,u,'down'),30);
  assert.equal(c.roundLoad(35,{...exercise,name:'Barbell Bench Press',requires:['barbell']},u),35);
  assert.equal(c.roundLoad(35,exercise,{capacities:{dumbbellMax:50}}),35);
  u.capacities.dumbbellWeights=[7.5,12,17.5,30];assert.equal(c.roundLoad(12,exercise,u),12);
});
test('missing 35/45 lb never appear in next-set, historical, Light or Heavy recommendations',()=>{
  const {c,u}=engine();let cases=0;
  for(const difficulty of ['light','balanced','heavy'])for(const goal of ['strength','muscle','general'])for(const weight of [...owned,35,45])
  for(const reps of [8,10,12])for(const rir of [0,1,2,3,4,5])for(const feedback of ['right','hard','easy']){
    u.workoutDifficulty=difficulty;u.goal=goal;u.today={'0-0':{weight:String(weight),reps:String(reps),rir:String(rir),feedback,done:true}};
    const rec=c.nextSetRecommendation(u,exercise,0);assert(owned.includes(rec.load),JSON.stringify({difficulty,goal,weight,reps,rir,feedback,rec}));cases++;
  }
  assert.equal(cases,4860);
  u.today={};u.history=[{ts:Date.now(),details:[{...exercise,sets:[{weight:'45',reps:'10',rir:'2',done:true}]}]}];
  for(const difficulty of ['light','balanced','heavy']){u.workoutDifficulty=difficulty;assert(owned.includes(c.baselineLoadObject(u,exercise).load));assert(owned.includes(c.suggestedLoadObject(u,exercise,0).load));}
});
test('30 to 40 lb gap builds reps first and reductions select a real lower weight',()=>{
  const {c,u}=engine();u.today={'0-0':{weight:'30',reps:'12',rir:'3',done:true}};
  let rec=c.nextSetRecommendation(u,exercise,0);assert.equal(rec.load,30);assert.equal(rec.reps,13);assert.match(rec.label,/40 lb is too big/i);
  u.today['0-0']={weight:'40',reps:'8',rir:'1',feedback:'hard',done:true};
  rec=c.nextSetRecommendation(u,exercise,0);assert.equal(rec.load,30);
});
test('dumbbell backoffs select an owned lower weight instead of rounding back to the top load',()=>{
  const {c,u,run}=engine();run(fs.readFileSync('ui2.js','utf8').split('async function refineWorkoutWithCloud')[0]);
  u.today={'0-0':{weight:'40',reps:'5',rir:'2',done:true}};
  const target=c.plannedSetTarget(u,{...exercise,prescription:'1 top set × 4–6, then 2 × 8–12'},{load:40,target:5},1,0);
  assert.equal(target.load,30);assert.equal(target.reps,10);
});
test('profile chooser saves 5–30 plus 40/50, survives reload and can return to regular increments',()=>{
  let a=app();try{
    const d=a.w.document;a.run('activeUser().capacities.dumbbellMax=50;renderAll()');a.choose();
    d.querySelector('[data-db-prefix="profileDb"] [data-db-range]').click();
    for(const weight of [40,50])d.querySelector(`[data-db-prefix="profileDb"] [data-db-weight="${weight}"]`).click();
    d.getElementById('saveProfile').click();
    assert.deepEqual(JSON.parse(a.run('JSON.stringify(activeUser().capacities.dumbbellWeights)')),owned);
    const saved=a.storage();a.close();a=app(saved);
    assert.equal(a.w.document.getElementById('profileDbMode').value,'exact');
    assert.equal(a.w.document.querySelector('[data-db-weight="35"]').getAttribute('aria-pressed'),'false');
    const mode=a.w.document.getElementById('profileDbMode');mode.value='regular';mode.dispatchEvent(new a.w.Event('change',{bubbles:true}));a.w.document.getElementById('saveProfile').click();
    assert.equal(a.run('activeUser().capacities.dumbbellWeights'),undefined);
  }finally{a.close()}
});
test('empty selection is rejected, custom weights are supported, and profile normalization retains inventory',()=>{
  const a=app();try{
    a.choose();const d=a.w.document,root=d.querySelector('[data-db-prefix="profileDb"]');root.querySelector('[data-db-clear]').click();d.getElementById('saveProfile').click();
    assert.equal(a.run('activeUser().capacities.dumbbellWeights'),undefined);assert.match(d.getElementById('toast').textContent,/Select at least one/);
    root.querySelector('[data-db-custom]').value='12';root.querySelector('[data-db-add]').click();d.getElementById('saveProfile').click();
    assert.deepEqual(JSON.parse(a.run('JSON.stringify(normalizeUser(activeUser()).capacities.dumbbellWeights)')),[12]);
    assert.equal(a.run('activeUser().capacities.dumbbellMax'),12);
  }finally{a.close()}
});
test('workout shortcut opens inventory and saving gaps preserves performed and manually entered sets',()=>{
  const a=app();try{
    a.run('finalWorkout=()=>['+JSON.stringify(exercise)+'];activeUser().today={"0-0":{weight:"35",reps:"10",rir:"2",done:true},"0-1":{weight:"45",reps:"9",done:false}};renderAll()');
    const before=a.run('JSON.stringify(activeUser().today)');a.w.document.querySelector('.db-weight-shortcut').click();
    assert(a.w.document.getElementById('profiles').classList.contains('active'));
    const root=a.w.document.querySelector('[data-db-prefix="profileDb"]');root.querySelector('[data-db-range]').click();for(const n of [40,50])root.querySelector(`[data-db-weight="${n}"]`).click();
    a.w.document.getElementById('saveProfile').click();assert.equal(a.run('JSON.stringify(activeUser().today)'),before);
    assert(owned.includes(Number(a.w.document.querySelectorAll('.set-row')[2].querySelector('.weight').value)));
  }finally{a.close()}
});
