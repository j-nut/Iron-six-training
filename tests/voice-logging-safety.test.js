// Voice writes into the training log that drives load recommendations, so the failures that
// matter are the silent ones: a set recorded that nobody performed, or a number recorded that
// nobody said. Every case here was a real defect found by adversarial testing.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.setInterval=()=>0;w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.URL.createObjectURL=()=>'blob:test';
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  w.localStorage.setItem('ironSixPoseSpike','1');
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run("window.toast=function(){};activeUser().trainingMode='traditional';activeUser().today={};activeUser().program.currentWorkoutKey='lower_strength';saveData();renderAll()");
  run("document.getElementById('sessionBeginBtn').click()");
  return {w,run,errors,json:code=>JSON.parse(run(`JSON.stringify(${code})`)),close:()=>dom.window.close()};
}

// Opens the assistant on the first camera-countable exercise. The camera itself never starts in
// jsdom, which is the point: voice must be safe without a rep count to lean on.
async function openAssistant(a){
  const card=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index]')].find(c=>c.querySelector('.pose-bar'));
  assert(card,'need a camera-countable exercise');
  const index=card.dataset.exerciseIndex;
  await a.run(`IronSixPoseSpike.open(document.querySelector('[data-exercise-index="${index}"]'),finalWorkout(activeUser())[${index}])`);
  return {card,index};
}

const parser=()=>{const w={};vm.runInNewContext(fs.readFileSync('workout-voice.js','utf8'),{window:w});return w.IronSixWorkoutVoice};

test('a prefilled rep target is never committed as work that was performed',async()=>{
  // renderExercises prefills the reps box with the suggested target. Speaking any OTHER field
  // used to persist the whole row first, then read that placeholder back as proof of reps.
  for(const said of ['225 pounds','bodyweight','rir 2','bodyweight set done','rir 2 set done']){
    const a=app();
    try{
      const {index}=await openAssistant(a);
      const prefilled=a.w.document.querySelector(`[data-exercise-index="${index}"] .set-row .reps`).value;
      assert(prefilled,'this test is meaningless unless the reps box starts prefilled');
      for(const phrase of said.includes('set done')?[said]:[said,'set done'])
        a.run(`IronSixPoseSpike.handleVoice(${JSON.stringify(phrase)})`);
      const saved=a.json(`activeUser().today['${index}-0']||null`);
      assert.notEqual(saved&&saved.done,true,`"${said}" must not complete a set on a prefilled rep count`);
    }finally{try{a.run('IronSixPoseSpike.close()')}catch(_){}a.close()}
  }
});

test('a spoken rep count does complete the set',async()=>{
  const a=app();
  try{
    const {index}=await openAssistant(a);
    a.run("IronSixPoseSpike.handleVoice('225 pounds 8 reps')");
    a.run("IronSixPoseSpike.handleVoice('set done')");
    const saved=a.json(`activeUser().today['${index}-0']`);
    assert.equal(saved.reps,'8','the spoken reps are what gets logged');
    assert.equal(saved.weight,'225');
    assert.equal(saved.done,true,'a set with real reps must still complete normally');
  }finally{try{a.run('IronSixPoseSpike.close()')}catch(_){}a.close()}
});

test('voice reaches the visible row after a background re-render',async()=>{
  // A cloud sync re-renders the exercise list and detaches the card captured when the assistant
  // opened. Writes through that stale card persisted to storage but never appeared on screen.
  const a=app();
  try{
    const {index}=await openAssistant(a);
    a.run('renderAll()');
    a.run("IronSixPoseSpike.handleVoice('185 pounds 8 reps')");
    const row=a.w.document.querySelector(`#exerciseList [data-exercise-index="${index}"] .set-row`);
    assert.equal(row.querySelector('.weight').value,'185','the value must land on the row the user can see');
    assert.equal(row.querySelector('.reps').value,'8');
    assert.equal(a.json(`activeUser().today['${index}-0']`).weight,'185');
  }finally{try{a.run('IronSixPoseSpike.close()')}catch(_){}a.close()}
});

test('an already-completed set is never rewritten or un-completed by voice',async()=>{
  const a=app();
  try{
    const {index,card}=await openAssistant(a);
    const first=card.querySelector('.set-row');
    first.querySelector('.reps').value='10';
    first.querySelector('.reps').dispatchEvent(new a.w.Event('input',{bubbles:true}));
    first.querySelector('.done').click();
    a.run('renderAll()');
    a.run("IronSixPoseSpike.handleVoice('185 pounds 5 reps')");
    const saved=a.json(`activeUser().today['${index}-0']`);
    assert.equal(saved.reps,'10','the finished set keeps the reps it was finished with');
    assert.equal(saved.done,true,'a finished set must not be un-completed');
  }finally{try{a.run('IronSixPoseSpike.close()')}catch(_){}a.close()}
});

test('"N reps at M rir" logs reps and RIR, not an M-pound lift',()=>{
  const V=parser();
  for(const text of ['8 reps at 2 rir','eight reps at two rir']){
    const c=V.parseCommand(text);
    assert.equal(c.reps,8,text);
    assert.equal(c.rir,2,`${text} — the RIR must survive`);
    assert.equal(c.weight,null,`${text} — 2 must not become the load`);
  }
  assert.equal(V.parseCommand('at 2 rir').weight,null);
  assert.equal(V.parseCommand('at 2 rir').rir,2);
  // Ordinary anchored loads must keep working.
  assert.equal(V.parseCommand('8 reps at 225').weight,225);
  assert.equal(V.parseCommand('at 185').weight,185);
  // Anchors that follow a non-gym word are not loads.
  assert.equal(V.parseCommand('rack it at 6').weight,null);
  assert.equal(V.parseCommand('i m at 8 reps').weight,null);
});

test('a number phrase is parsed whole or not at all',()=>{
  // Falling back to a suffix turned "two hundred and twenty five pounds" into 25 — an under-log
  // of 200 lb that reads as a successful confirmation.
  const V=parser();
  assert.equal(V.parseCommand('two hundred and twenty five pounds').weight,225);
  assert.equal(V.parseCommand('one hundred and thirty five pounds').weight,135);
  assert.equal(V.parseCommand('one thirty five point five pounds').weight,135.5);
  assert.equal(V.parseCommand('two two five pounds').weight,225,'digit-by-digit is how recognizers render loads');
  assert.equal(V.parseCommand('185 pounds').weight,185);
});

test('kilograms are converted, not logged as pounds',()=>{
  const V=parser();
  for(const text of ['weight 100 kilos','using 100 kg','at 100 kilos'])
    assert.equal(V.parseCommand(text).weight,220.5,`${text} — 100 kg is not 100 lb`);
  assert.equal(V.parseCommand('load 60 kilos').weight,132.5);
});

test('ambiguous or absurd speech still writes nothing',()=>{
  const V=parser();
  for(const text of ['for reps','fore reps','ate reps','to reps','won rep','185 four 8','one eighty five for eight']){
    const c=V.parseCommand(text);
    assert.equal(c.reps,null,`${text} should not produce reps`);
    assert.equal(c.weight,null,`${text} should not produce a load`);
  }
  assert.equal(V.parseCommand('0 reps').reps,null);
  assert.equal(V.parseCommand('101 reps').reps,null);
  assert.equal(V.parseCommand('9999 pounds').weight,null);
  assert.equal(V.parseCommand('50 rir').rir,null);
});
