const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(saved={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.fetch=async()=>({ok:false,json:async()=>({})});w.setInterval=()=>0;w.setTimeout=()=>0;
  for(const [key,value]of Object.entries(saved))w.localStorage.setItem(key,value);
  w.addEventListener('error',event=>errors.push(event.error));
  const files=[...w.document.scripts].map(s=>s.getAttribute('src')?.split('?')[0]).filter(x=>x&&!['cloud-sync.js','cloud-history-sync.js'].includes(x));
  // Shared helper can also be injected by cloud-history-sync in production. Load it before
  // planning in this harness, and load the UI only after all existing runtime wrappers.
  if(!files.includes('workout-difficulty.js'))files.splice(files.indexOf('core.js')+1,0,'workout-difficulty.js');
  for(const file of files)vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  if(!w.IronSixDifficultyUI)vm.runInContext(fs.readFileSync('workout-difficulty-ui.js','utf8'),context,{filename:'workout-difficulty-ui.js'});
  const run=code=>vm.runInContext(code,context);
  run('window.toast=function(){};renderAll()');
  const choose=(id,value)=>{const node=w.document.getElementById(id);node.value=value;node.dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {w,run,choose,errors,json:code=>JSON.parse(run(`JSON.stringify(${code})`)),storage:()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)])),close:()=>w.close()};
}

test('difficulty is visible on Today and profile preference has readable, connected labels',()=>{
  const a=app();try{
    const d=a.w.document;
    assert.equal(d.getElementById('todayDifficulty').value,'balanced');
    assert.equal(d.querySelector('label[for="todayDifficulty"]').textContent,'Today’s difficulty');
    assert.equal(d.getElementById('todayDifficulty').closest('.hero').parentElement.id,'today');
    assert.equal(d.getElementById('profileWorkoutDifficulty').value,'balanced');
    assert.equal(d.getElementById('profileDifficultySetting').previousElementSibling.querySelector('select').id,'trainingLevel');
    assert.match(d.getElementById('profileDifficultyHelp').textContent,/Saves automatically/);
    assert.equal(d.getElementById('difficultyStatus').getAttribute('role'),'status');
    d.getElementById('sessionBeginBtn').click();
    assert(!d.getElementById('todayDifficulty').closest('.sc-hidden'),'active workout must keep a reachable difficulty control');
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('Today changes just this session; making it default is an explicit separate action',()=>{
  const a=app();try{
    a.choose('todayDifficulty','light');
    assert.equal(a.run('activeUser().workoutDifficulty'),'balanced');
    assert.equal(a.run('IronSixDifficulty.effectiveFor(activeUser())'),'light');
    assert.equal(a.w.document.getElementById('difficultySaveDefault').hidden,false);
    assert.match(a.w.document.getElementById('difficultyDescription').textContent,/Bodyweight and lighter loads/);
    a.w.document.getElementById('difficultySaveDefault').click();
    assert.equal(a.run('activeUser().workoutDifficulty'),'light');
    assert.equal(a.run('activeUser().sessionDifficulty'),null);
    assert.equal(a.w.document.getElementById('difficultyUseDefault').hidden,true);
    assert.match(a.w.document.getElementById('difficultyStatus').textContent,/saved as your default/);
  }finally{a.close()}
});

test('mid-session difficulty preserves completed and partial rows, names, indices and session identity',()=>{
  const a=app();try{
    a.w.document.getElementById('sessionBeginBtn').click();
    const d=a.w.document;
    const weight=d.querySelector('[data-exercise-index="0"] .weight'),reps=d.querySelector('[data-exercise-index="0"] .reps');
    weight.value='75';weight.dispatchEvent(new a.w.Event('input'));
    reps.value='8';reps.dispatchEvent(new a.w.Event('input'));
    d.querySelector('[data-exercise-index="0"] .done').click();
    const partial=d.querySelector('[data-exercise-index="1"] .weight');partial.value='';partial.dispatchEvent(new a.w.Event('input'));
    const before=a.json('({id:activeUser().workoutDraft.id,today:activeUser().today,plan:finalWorkout(activeUser())})');
    const setEvents=a.w.IronSixJournal.all().filter(x=>x.kind==='set').length;
    a.choose('todayDifficulty','light');
    const after=a.json('({id:activeUser().workoutDraft.id,today:activeUser().today,plan:finalWorkout(activeUser())})');
    assert.equal(after.id,before.id);
    assert.deepEqual(after.today,before.today);
    assert.equal(after.plan.length,before.plan.length);
    for(const index of [0,1]){
      assert.equal(after.plan[index].name,before.plan[index].name);
      assert.equal(after.plan[index].sets,before.plan[index].sets);
    }
    assert.equal(d.querySelector('[data-exercise-index="0"] .weight').value,'75');
    assert.equal(d.querySelector('[data-exercise-index="1"] .weight').value,'','deliberate blank remains a blank');
    const nextWeight=Number(d.querySelectorAll('[data-exercise-index="0"] .weight')[1].value);
    assert(nextWeight>0&&nextWeight<=60,'unentered later sets in the same movement should receive lighter recommendations');
    assert.equal(a.w.IronSixJournal.all().filter(x=>x.kind==='set').length,setEvents,'changing level must not invent set records');
    assert.equal(a.w.IronSixJournal.all().filter(x=>x.kind==='archive').length,0);
    const replay=a.w.IronSixJournal.replay(a.run('activeUser().id')).find(x=>x.id===before.id);
    assert.equal(replay.today['0-0'].weight,'75');
    assert.equal(replay.plan[0].name,before.plan[0].name);
    assert.match(d.getElementById('difficultyStatus').textContent,/Entered sets are kept/);
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('changing the saved default keeps a pinned session level through reload and journal restore',async()=>{
  const a=app();await a.w.IronSixJournal.hydrated;
  a.choose('todayDifficulty','light');
  a.run('IronSixJournal.ensure(activeUser(),finalWorkout(activeUser()))');
  const id=a.run('activeUser().workoutDraft.id');
  a.choose('profileWorkoutDifficulty','heavy');
  assert.equal(a.run('activeUser().workoutDifficulty'),'heavy');
  assert.equal(a.run('IronSixDifficulty.effectiveFor(activeUser())'),'light');
  const storage=a.storage();a.close();
  const b=app(storage);try{
    await b.w.IronSixJournal.hydrated;b.run('IronSixJournal.restore(activeUser());renderAll()');
    assert.equal(b.run('activeUser().workoutDraft.id'),id);
    assert.equal(b.run('activeUser().workoutDifficulty'),'heavy');
    assert.equal(b.w.document.getElementById('profileWorkoutDifficulty').value,'heavy');
    assert.equal(b.w.document.getElementById('todayDifficulty').value,'light');
    b.w.document.getElementById('difficultyUseDefault').click();
    assert.equal(b.run('IronSixDifficulty.effectiveFor(activeUser())'),'heavy');
    assert.equal(b.run('activeUser().workoutDraft.id'),id);
    assert.equal(b.run('activeUser().sessionDifficulty'),null);
  }finally{b.close()}
});

test('difficulty defaults and session overrides stay with their own profile',()=>{
  const a=app();try{
    const first=a.run('activeUser().id');
    a.choose('todayDifficulty','light');a.w.document.getElementById('difficultySaveDefault').click();
    a.run("const difficultyOther=makeUser('Other');data.users.push(difficultyOther);switchUser(difficultyOther.id)");
    assert.equal(a.w.document.getElementById('todayDifficulty').value,'balanced');
    assert.equal(a.w.document.getElementById('profileWorkoutDifficulty').value,'balanced');
    a.choose('profileWorkoutDifficulty','heavy');
    a.run(`switchUser(${JSON.stringify(first)})`);
    assert.equal(a.w.document.getElementById('todayDifficulty').value,'light');
    assert.equal(a.w.document.getElementById('profileWorkoutDifficulty').value,'light');
    assert.equal(a.w.document.getElementById('difficultyStatus').textContent,'','announcements must not leak from another profile');
  }finally{a.close()}
});

test('a failed durable plan update keeps the old workout and preferences',()=>{
  const a=app();try{
    a.choose('todayDifficulty','light');
    a.run('IronSixJournal.ensure(activeUser(),finalWorkout(activeUser()))');
    const before=a.json('({draft:activeUser().workoutDraft,today:activeUser().today,pref:activeUser().workoutDifficulty,override:activeUser().sessionDifficulty})');
    a.w.Storage.prototype.setItem=()=>{throw Error('quota')};
    a.choose('todayDifficulty','heavy');
    const after=a.json('({draft:activeUser().workoutDraft,today:activeUser().today,pref:activeUser().workoutDifficulty,override:activeUser().sessionDifficulty})');
    assert.deepEqual(after,before);
    assert.equal(a.w.document.getElementById('todayDifficulty').value,'light');
    assert.match(a.w.document.getElementById('difficultyStatus').textContent,/not changed/);
  }finally{a.close()}
});

test('a session-only level expires with the workout exposure and does not become tomorrow’s default',()=>{
  const a=app();try{
    a.choose('todayDifficulty','light');
    a.run('activeUser().workoutDraft=null;activeUser().today={};activeUser().program.exposures[activeUser().program.currentWorkoutKey]=1;renderAll()');
    assert.equal(a.w.document.getElementById('todayDifficulty').value,'balanced');
    assert.equal(a.w.document.getElementById('difficultyUseDefault').hidden,true);
    assert.match(a.w.document.getElementById('difficultyDefault').textContent,/saved default/);
    assert.equal(a.w.document.getElementById('difficultyStatus').textContent,'','last session’s announcement must not label the new workout');
  }finally{a.close()}
});


test('prestart storage failure does not change the saved default or start an unsaved workout',()=>{
  const a=app();try{
    const before=a.json('({difficulty:activeUser().workoutDifficulty,override:activeUser().sessionDifficulty,plan:finalWorkout(activeUser())})');
    a.w.Storage.prototype.setItem=()=>{throw Error('quota')};
    a.choose('todayDifficulty','light');
    const after=a.json('({difficulty:activeUser().workoutDifficulty,override:activeUser().sessionDifficulty,plan:finalWorkout(activeUser())})');
    assert.deepEqual(after,before);
    assert.equal(a.run('!!activeUser().workoutDraft'),false);
    assert.equal(a.w.document.getElementById('todayDifficulty').value,'balanced');
    assert.match(a.w.document.getElementById('difficultyStatus').textContent,/not changed/);
  }finally{a.close()}
});


test('live circuit difficulty keeps its session and rebuilds a paused timer for the current plan',async()=>{
  const a=app();try{
    const d=a.w.document;
    d.querySelector('[data-training-mode="circuit"]').click();
    d.getElementById('circuitStart').click();
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    d.getElementById('circuitSkip').click();
    const id=a.run('activeUser().workoutDraft.id');
    a.choose('todayDifficulty','light');
    assert.equal(a.run('activeUser().workoutDraft.id'),id);
    assert.match(d.getElementById('circuitStatus').textContent,/paused|updated/i);
    assert.equal(d.getElementById('circuitTitle').textContent,a.run('finalWorkout(activeUser())[0].name'));
    assert.equal(d.getElementById('circuitStart').textContent,'Resume');
    assert.equal(a.w.IronSixJournal.all().filter(x=>x.kind==='archive').length,0);
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});


test('Light effort instructions match the selected level and retain equipment limitations',()=>{
  const a=app();try{
    a.choose('todayDifficulty','light');
    assert.match(a.w.document.getElementById('readinessNote').textContent,/about 4 reps still in reserve/);
    assert.doesNotMatch(a.w.document.getElementById('readinessNote').textContent,/closer to failure|1–2 reps/);
    const note=a.w.document.getElementById('readinessNote');
    note.innerHTML='<strong>Normal session.</strong> Generic effort advice.<br><strong>Equipment limits:</strong> horizontal pulling work has no distinct available option.';
    a.w.IronSixDifficultyUI.render();
    assert.match(note.textContent,/about 4 reps/);
    assert.match(note.textContent,/Equipment limits: horizontal pulling/);
    a.choose('todayDifficulty','balanced');
    assert.doesNotMatch(a.w.document.getElementById('readinessNote').textContent,/Light effort/);
  }finally{a.close()}
});

test('later circuit stations retain logical position after Light removes preceding intervals, including reload and cooldown',async()=>{
  const a=app();await a.w.IronSixJournal.hydrated;
  const d=a.w.document;
  d.querySelector('[data-training-mode="circuit"]').click();
  a.run(`(function(){const u=activeUser(),plan=finalWorkout(u).map(e=>({...e,sets:4,prescription:'4 × 40s controlled work'}));IronSixJournal.ensure(u,plan);u.today['1-0']={weight:'12',reps:'',done:false};IronSixJournal.captureSet(u,plan,1,0,u.today['1-0']);saveData();renderAll()})()`);
  d.getElementById('circuitStart').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const target=a.run('circuitTimeline(activeUser(),finalWorkout(activeUser())).findIndex(s=>s.kind==="work"&&s.index===1&&s.setIndex===3)');
  for(let i=0;i<target;i++)d.getElementById('circuitSkip').click();
  assert.match(d.getElementById('circuitPhase').textContent,/Round 4/);
  const id=a.run('activeUser().workoutDraft.id');
  a.choose('todayDifficulty','light');
  assert.equal(a.run('activeUser().workoutDraft.id'),id);
  assert.equal(a.run('finalWorkout(activeUser())[0].sets'),3,'prior untouched station loses its fourth interval');
  assert.equal(a.run('finalWorkout(activeUser())[1].sets'),4,'partially entered station keeps its sets');
  assert.equal(d.getElementById('circuitTitle').textContent,a.run('finalWorkout(activeUser())[1].name'));
  assert.match(d.getElementById('circuitPhase').textContent,/Round 4/);
  assert.match(d.getElementById('circuitStatus').textContent,/paused|updated/i);
  const snapshot=a.storage();a.close();
  const b=app(snapshot);try{
    await b.w.IronSixJournal.hydrated;b.run('IronSixJournal.restore(activeUser());renderAll()');
    const bd=b.w.document;
    assert.equal(bd.getElementById('circuitTitle').textContent,b.run('finalWorkout(activeUser())[1].name'));
    assert.match(bd.getElementById('circuitPhase').textContent,/Round 4/);
    const timeline=b.json('circuitTimeline(activeUser(),finalWorkout(activeUser()))'),start=Number(bd.getElementById('circuitProgress').value);
    for(let i=start;i<timeline.length-1;i++)bd.getElementById('circuitSkip').click();
    assert.equal(bd.getElementById('circuitTitle').textContent,'Cool down');
    b.choose('todayDifficulty','balanced');
    assert.equal(bd.getElementById('circuitTitle').textContent,'Cool down');
    assert.equal(bd.getElementById('circuitClock').textContent,'1:00');
    assert.equal(b.w.IronSixJournal.all().filter(x=>x.kind==='archive').length,0);
    assert.deepEqual(b.errors,[]);
  }finally{b.close()}
});


test('a durable session change cannot falsely claim an unsaved global default',()=>{
  const a=app();try{
    a.choose('todayDifficulty','light');
    a.run('IronSixJournal.ensure(activeUser(),finalWorkout(activeUser()));window.saveData=function(){return false};renderAll()');
    const id=a.run('activeUser().workoutDraft.id');
    a.w.document.getElementById('difficultySaveDefault').click();
    assert.equal(a.run('activeUser().workoutDifficulty'),'balanced');
    assert.equal(a.run('IronSixDifficulty.effectiveFor(activeUser())'),'light');
    assert.equal(a.run('activeUser().workoutDraft.id'),id);
    assert.match(a.w.document.getElementById('difficultyStatus').textContent,/default could not be saved/);
    a.choose('profileWorkoutDifficulty','heavy');
    assert.equal(a.run('activeUser().workoutDifficulty'),'balanced');
    assert.equal(a.w.document.getElementById('profileWorkoutDifficulty').value,'balanced');
    assert.equal(a.run('IronSixDifficulty.effectiveFor(activeUser())'),'light');
    assert.match(a.w.document.getElementById('difficultyStatus').textContent,/default could not be saved/);
    assert.equal(a.w.IronSixJournal.all().filter(x=>x.kind==='archive').length,0);
  }finally{a.close()}
});
