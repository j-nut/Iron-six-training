// The session flow hides exercises, so the risk is showing the wrong one — or hiding one you
// still need to log. Position is derived from the log rather than stored, and these assert that
// it stays correct when the workout changes underneath it.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;
  w.setInterval=()=>0;
  w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.URL.createObjectURL=()=>'blob:test';
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run("window.toast=function(){};activeUser().trainingMode='traditional';activeUser().today={};saveData();renderAll()");
  return {
    w,run,errors,
    json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    visible:()=>[...w.document.querySelectorAll('#exerciseList [data-exercise-index]')].filter(c=>!c.classList.contains('sc-hidden')).map(c=>Number(c.dataset.exerciseIndex)),
    step:()=>w.document.getElementById('scStep')?.textContent||'',
    begin:()=>w.document.getElementById('sessionBeginBtn').click(),
    hidden:id=>w.document.getElementById(id)?.classList.contains('sc-hidden'),
    logSets:(ei,n)=>run(`(function(){const u=activeUser();for(let i=0;i<${n};i++)u.today['${ei}-'+i]={weight:'85',reps:'5',rir:'2',done:true};saveData();renderExercises()})()`),
    close:()=>dom.window.close()
  };
}

test('a fresh session starts on the setup card with no exercises showing',()=>{
  const a=app();
  try{
    assert.deepEqual(a.visible(),[],'no exercise card should be shown before you begin');
    assert.equal(a.hidden('sessionStart'),false,'the begin card must be shown');
    assert.equal(a.hidden('sessionCardNav'),true);
    assert(a.w.document.getElementById('finishBtn').closest('.cta').classList.contains('sc-hidden'),'Finish must not be offered before the session starts');
    assert.deepEqual(a.errors,[],'the page must load without script errors');
  }finally{a.close()}
});

test('Begin moves to the first exercise and shows only that one',()=>{
  const a=app();
  try{
    a.begin();
    assert.deepEqual(a.visible(),[0]);
    assert.match(a.step(),/Exercise 1 of \d+/);
    assert.equal(a.w.document.getElementById('scPrev').disabled,true,'there is nothing before the first exercise');
  }finally{a.close()}
});

// Moving the screen while someone may still be correcting a number is the wrong trade.
test('completing an exercise highlights the way forward but does not jump',()=>{
  const a=app();
  try{
    a.begin();
    const sets=a.json('finalWorkout(activeUser())[0].sets');
    a.logSets(0,sets);
    assert.deepEqual(a.visible(),[0],'the screen must stay put after the last set is logged');
    assert.equal(a.w.document.getElementById('scNextBtn').classList.contains('ready'),true,'forward must be highlighted instead');
  }finally{a.close()}
});

test('returning mid-session skips Begin and lands on the first unfinished exercise',()=>{
  const a=app();
  try{
    // A session with the first exercise done, as if the app had been reopened.
    a.logSets(0,a.json('finalWorkout(activeUser())[0].sets'));
    a.run('IronSixSessionCards.reset()');
    assert.equal(a.hidden('sessionStart'),true,'Begin is for starting, not returning');
    assert.deepEqual(a.visible(),[1],'it should open on the first exercise still to do');
  }finally{a.close()}
});

test('you can skip ahead and come back to the unfinished exercise',()=>{
  const a=app();
  try{
    a.begin();
    a.run('(function(){const w=finalWorkout(activeUser());IronSixSessionCards.goTo(4,w)})()');
    assert.deepEqual(a.visible(),[4]);
    a.run('(function(){const w=finalWorkout(activeUser());IronSixSessionCards.goTo(0,w)})()');
    assert.deepEqual(a.visible(),[0]);
  }finally{a.close()}
});

test('the chosen exercise survives leaving and returning to the tab',()=>{
  const a=app();
  try{
    a.begin();
    a.run('(function(){const w=finalWorkout(activeUser());IronSixSessionCards.goTo(2,w)})()');
    a.run("showView('coach');showView('today');renderAll()");
    assert.deepEqual(a.visible(),[2],'switching tabs must not lose your place');
  }finally{a.close()}
});

// The reason position is derived rather than stored: the workout is not a fixed list.
test('a pointer to an exercise that no longer exists falls back to the log',()=>{
  const a=app();
  try{
    a.begin();
    a.run('(function(){const w=finalWorkout(activeUser());IronSixSessionCards.goTo(4,w)})()');
    assert.deepEqual(a.visible(),[4]);
    // Rebuild the workout to a shorter one, as changing duration does.
    a.run("activeUser().workoutMinutes=15;activeUser().program.selectionCache={};saveData();renderAll()");
    const shown=a.visible();
    const length=a.json('finalWorkout(activeUser()).length');
    assert.equal(shown.length,1,'exactly one exercise must still be shown');
    assert(shown[0]<length,`the shown card (${shown[0]}) must exist in a workout of ${length}`);
  }finally{a.close()}
});

test('the overview shows every exercise and restores the normal controls',()=>{
  const a=app();
  try{
    a.begin();
    const total=a.json('finalWorkout(activeUser()).length');
    a.w.document.getElementById('scOverview').click();
    assert.equal(a.visible().length,total,'every exercise must be visible in the overview');
    assert.equal(a.w.document.getElementById('finishBtn').closest('.cta').classList.contains('sc-hidden'),false,'the normal Finish button returns with the list');
    a.w.document.getElementById('scOverview').click();
    assert.equal(a.visible().length,1,'and focus mode comes back');
  }finally{a.close()}
});

test('past the last exercise is a review of what was logged',()=>{
  const a=app();
  try{
    a.begin();
    const sets=a.json('finalWorkout(activeUser())[0].sets');
    a.logSets(0,sets);
    a.run('(function(){const w=finalWorkout(activeUser());IronSixSessionCards.goTo(w.length,w)})()');
    assert.equal(a.hidden('sessionReview'),false,'the review card must be shown');
    assert.deepEqual(a.visible(),[],'no exercise card competes with the review');
    const rows=[...a.w.document.querySelectorAll('#scReviewRows .sc-row')];
    assert.equal(rows.length,a.json('finalWorkout(activeUser()).length'),'every exercise is accounted for');
    assert.match(rows[0].textContent,new RegExp(`${sets} / ${sets} sets`),'a completed exercise reports as complete');
    assert(a.w.document.getElementById('scFinish'),'finishing must be reachable from the review');
  }finally{a.close()}
});

// Circuit mode's timer panel is already the guide; a second guide would argue with it.
test('circuit mode is left completely alone',()=>{
  const a=app();
  try{
    a.begin();
    a.run("activeUser().trainingMode='circuit';saveData();renderAll()");
    const total=a.json('finalWorkout(activeUser()).length');
    assert.equal(a.visible().length,total,'circuit mode keeps the full list');
    assert.equal(a.hidden('sessionCardNav'),true,'and gets no card navigation');
    assert.equal(a.w.document.getElementById('finishBtn').closest('.cta').classList.contains('sc-hidden'),false,'and keeps its normal controls');
  }finally{a.close()}
});

test('hiding a card never hides logged data — the inputs are the same elements',()=>{
  const a=app();
  try{
    a.begin();
    a.logSets(1,2);
    a.run('(function(){const w=finalWorkout(activeUser());IronSixSessionCards.goTo(1,w)})()');
    const inputs=[...a.w.document.querySelectorAll('#exerciseList [data-exercise-index="1"] .field')].filter(f=>f.value==='85');
    assert(inputs.length>0,'the logged weights must still be in the card that was hidden and re-shown');
    assert.equal(a.json("Object.keys(activeUser().today).filter(k=>k.startsWith('1-')).length"),2,'and still in the saved log');
  }finally{a.close()}
});
