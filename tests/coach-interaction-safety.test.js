const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function app(){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,context=dom.getInternalVMContext(),requests=[];
 w.confirm=()=>true;w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
 for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const run=code=>vm.runInContext(code,context);
 return {w,run,requests,json:code=>JSON.parse(run(`JSON.stringify(${code})`)),ask(text){w.document.getElementById('coachInput').value=text;w.document.getElementById('coachForm').dispatchEvent(new w.Event('submit',{cancelable:true}))},reply(out){requests.find(x=>x.url==='/api/coach').resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>out})},close:()=>w.close()};
}
test('Coach rejects duplicate Enter and quick-chip requests while pending',async()=>{
 const a=app();try{a.ask('first');a.ask('second');a.w.document.querySelector('#coachQuick button').click();assert.equal(a.requests.filter(x=>x.url==='/api/coach').length,1);a.reply({reply:'answer'});await turn();assert.equal(a.json('activeUser().coachMessages').length,2);assert.equal(a.w.document.querySelector('.coach-send').disabled,false)}finally{a.close()}
});
test('Coach account switch discards old response without changing current chat',async()=>{
 const a=app();try{a.ask('private');a.run("window.ironSixAccountScope='another-account';activeUser().coachMessages=[];renderAll()");a.reply({reply:'private answer',followUps:['private followup']});await turn();assert.deepEqual(a.json('activeUser().coachMessages'),[]);assert(!a.w.document.getElementById('coachQuick').textContent.includes('private'));assert.equal(a.w.document.querySelector('.coach-send').disabled,false)}finally{a.close()}
});
test('Coach actions cannot apply to a different workout and invalid durations do nothing',async()=>{
 const a=app();try{a.ask('change duration');a.reply({reply:'suggestion',actions:[{type:'set_duration',minutes:30},{type:'set_duration',minutes:'bad'}]});await turn();const before=a.run('activeUser().workoutMinutes');const buttons=a.w.document.querySelectorAll('.coach-action button');buttons[1].click();assert.equal(a.run('activeUser().workoutMinutes'),before);a.run("activeUser().program.currentWorkoutKey='pull_b'");buttons[0].click();assert.equal(a.run('activeUser().workoutMinutes'),before);assert.match(a.w.document.getElementById('toast').textContent,/earlier workout/)}finally{a.close()}
});
test('Coach response stays with its original profile and never replaces another profile followups',async()=>{
 const a=app();try{a.ask('original');a.run("var originalCoachUser=activeUser();var otherCoachUser=JSON.parse(JSON.stringify(originalCoachUser));otherCoachUser.id='other';otherCoachUser.coachMessages=[];data.users.push(otherCoachUser);data.activeUserId='other';renderAll()");
 // The actual active-profile selector is stored as activeUserId in the data model.
 assert.equal(a.run('activeUser().id'),'other');a.reply({reply:'original answer',followUps:['original followup']});await turn();assert.deepEqual(a.json('activeUser().coachMessages'),[]);assert.equal(a.run('originalCoachUser.coachMessages.at(-1).text'),'original answer');assert(!a.w.document.getElementById('coachQuick').textContent.includes('original followup'))}finally{a.close()}
});
test('manual swaps preserve completed original work and freeze replacement role in a draft',()=>{
 const a=app();try{
  a.run("var swapUser=activeUser();var originalPlan=finalWorkout(swapUser);var swapOption=swapOptionsForExercise(swapUser,originalPlan[0])[0]");
  assert(a.run('!!swapOption'),'fixture must offer an equivalent swap');
  a.run("swapUser.today={'0-0':{weight:'75',reps:'8',rir:'2',done:true},'1-0':{weight:'20',reps:'10',done:true}};window.IronSixJournal.captureSet(swapUser,originalPlan,0,0,swapUser.today['0-0']);window.IronSixJournal.captureSet(swapUser,originalPlan,1,0,swapUser.today['1-0']);applyExerciseSwap(0,swapOption)");
  assert.equal(a.run('swapUser.program.interruptedWork[0].details[0].name'),a.run('originalPlan[0].name'));
  assert.equal(a.run('swapUser.program.interruptedWork[0].details.length'),1,'only swapped work becomes interrupted dose');
  assert.equal(a.run('swapUser.today["1-0"].done'),true,'other exercise work must remain');
  assert.equal(a.run('swapUser.today["0-0"]'),undefined);
  assert.equal(a.run('swapUser.workoutDraft.plan[0].name'),a.run('swapOption.name'));
  assert.equal(a.run('swapUser.workoutDraft.plan[0].priority'),a.run('originalPlan[0].priority'));
  assert.equal(a.run('swapUser.workoutDraft.plan[0].sets'),a.run('originalPlan[0].sets'));
  assert.equal(a.run('window.IronSixJournal.all().filter(e=>e.kind==="set"&&e.exercise_name===originalPlan[0].name).length'),1,'original completed set stays in append-only journal');
  assert.equal(a.run('window.IronSixJournal.replay(swapUser.id).find(s=>s.id===swapUser.workoutDraft.id).today["0-0"]'),undefined,'replay must not attach old weight to replacement');
 }finally{a.close()}
});
test('Swap dialog cannot act on another profile after it was opened',()=>{
 const a=app();try{
  a.run('openExerciseSwap(0)');const button=a.w.document.querySelector('[data-swap-option]');assert(button);
  a.run("window.ironSixAccountScope='changed'");button.click();
  assert.equal(a.w.document.getElementById('exerciseSwapModal').classList.contains('show'),false);
  assert.match(a.w.document.getElementById('toast').textContent,/Workout changed/);
 }finally{a.close()}
});
test('a pending Coach response cannot steal focus or scroll another view',async()=>{
 const a=app();try{a.ask('test');let scrolls=0;a.w.HTMLElement.prototype.scrollIntoView=function(){scrolls++};a.w.document.getElementById('coach').classList.remove('active');a.reply({reply:'answer'});await turn();assert.equal(scrolls,0);assert.notEqual(a.w.document.activeElement,a.w.document.getElementById('coachInput'))}finally{a.close()}
});
test('Coach times out a stalled response body and re-enables sending',async()=>{
 const a=app();try{let expire;const timer=a.w.setTimeout.bind(a.w);a.w.setTimeout=(fn,ms,...args)=>ms===30000?(expire=fn,12345):timer(fn,ms,...args);a.ask('stalled');a.requests.find(x=>x.url==='/api/coach').resolve({ok:true,headers:{get:()=> 'application/json'},json:()=>new Promise(()=>{})});await turn();expire();await turn();assert.match(a.run('activeUser().coachMessages.at(-1).text'),/timed out/);assert.equal(a.w.document.querySelector('.coach-send').disabled,false)}finally{a.close()}
});
