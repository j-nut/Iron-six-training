// Iron Marks reward the program as designed: finished, successful sessions, balance and honest
// logging, never streaks or partial finishes. These tests pin both the rules and the ways they
// must not be gamed (duplicates, partial finishes, marks shown twice, emblems worn after loss).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const engine=require('../iron-marks-engine.js');

const DAY=864e5,T0=new Date(2026,0,5,17,0,0).getTime(); // a Monday, local time
const ROT=engine.ROTATION,LEGACY=['chest','shoulders_arms','lower_strength','back','upper_specialization','lower_hypertrophy'];
function session(key,day,{sets=10,planned=10,rir='2',readiness={energy:4,soreness:1},sessionId}={}){
  return {ts:T0+day*DAY,sessionId,workoutKey:key,name:key,sets,plannedSets:planned,readiness,details:[{name:'Lift',sets:Array.from({length:sets},()=>({weight:'100',reps:'8',rir,done:true}))}]};
}
function cycles(n,{start=0,gap=2,keys=ROT,...opts}={}){const out=[];let d=start;for(let c=0;c<n;c++)for(const k of keys){out.push(session(k,d,opts));d+=gap}return out}
const user=history=>({id:'u1',name:'Test Lifter',history:[...history].sort((a,b)=>b.ts-a.ts),program:{}});
const mark=(r,id)=>r.marks.find(m=>m.id===id);
const earned=(history,id)=>mark(engine.evaluate(user(history)),id).unlocked;

test('a new profile has no marks, no ring and no emblems',()=>{
  const r=engine.evaluate(user([]));
  assert.equal(r.marks.filter(m=>m.unlocked).length,0);assert.equal(r.ring,null);assert.deepEqual(r.emblems,[]);
  assert.equal(r.nextRing.id,'iron');assert(r.marks.every(m=>m.value===0));
});

test('partial finishes earn nothing, a successful session earns First Rep dated to that session',()=>{
  const partial=Array.from({length:20},(_,i)=>session('push_a',i,{sets:5,planned:10}));
  assert.equal(earned(partial,'first_rep'),false,'logging half the sets and pressing Finish is not a session');
  const good=session('push_a',30),r=engine.evaluate(user([...partial,good]));
  assert.equal(mark(r,'first_rep').unlocked,true);assert.equal(mark(r,'first_rep').unlockedAt,good.ts);assert.deepEqual(r.emblems,['spark']);
});

test('Full Six and avatar rings follow completed rotations',()=>{
  assert.equal(earned(cycles(1).slice(0,5),'full_six'),false);
  assert.equal(earned(cycles(1),'full_six'),true);
  assert.equal(engine.evaluate(user(cycles(2))).ring,null);
  let r=engine.evaluate(user(cycles(3)));assert.equal(r.ring.id,'iron');assert.equal(r.nextRing.id,'bronze');assert.equal(mark(r,'rotations_3').unlocked,true);
  r=engine.evaluate(user(cycles(6)));assert.equal(r.ring.id,'bronze');
  // An unbalanced history is not a rotation: twelve Push A sessions complete nothing.
  assert.equal(engine.evaluate(user(Array.from({length:12},(_,i)=>session('push_a',i*2)))).stats.rotations,0);
});

test('rotations from the legacy program still count toward rings',()=>{
  const history=[...cycles(1,{keys:LEGACY}),...cycles(2,{start:40})];
  assert.equal(engine.evaluate(user(history)).stats.rotations,3);assert.equal(engine.evaluate(user(history)).ring.id,'iron');
});

test('duplicated sessions (replayed journal, sync echo) cannot inflate marks',()=>{
  const once=cycles(2).map((s,i)=>({...s,sessionId:'s'+i})),twice=[...once,...once.map(s=>({...s}))];
  assert.deepEqual(engine.evaluate(user(twice)).stats,engine.evaluate(user(once)).stats);
  assert.equal(engine.evaluate(user(twice)).ring,null);
});

test('the Forge follows the program ladder: 4 successful exposures is Momentum, 8 is Apex',()=>{
  let r=engine.evaluate(user(cycles(3)));assert.equal(mark(r,'momentum').unlocked,false);
  r=engine.evaluate(user(cycles(4)));
  assert.equal(mark(r,'momentum').unlocked,true);assert.equal(mark(r,'all_momentum').unlocked,true);assert.equal(mark(r,'apex').unlocked,false);assert.equal(mark(r,'benchmark_block').value,1);
  r=engine.evaluate(user(cycles(8)));
  assert.equal(mark(r,'full_apex').unlocked,true);assert(r.emblems.includes('crown'));assert(r.emblems.includes('anvil'));
});

test('Forge marks never run ahead of the app, while blank-RIR loggers still earn consistency marks',()=>{
  // core.js reads a blank RIR as 0, so these sessions never advance a workout's level in the app.
  const r=engine.evaluate(user(cycles(8,{rir:''})));
  assert.equal(mark(r,'momentum').unlocked,false,'the mark must not claim Momentum the program has not granted');
  assert.equal(mark(r,'first_rep').unlocked,true);assert.equal(mark(r,'full_six').unlocked,true);assert.equal(r.ring.id,'bronze');
});

test('the Forge success rule is exactly core.js successfulExposure',()=>{
  const source=fs.readFileSync('core.js','utf8'),start=source.indexOf('function successfulExposure('),end=source.indexOf('\n}',start)+2;
  const core=vm.runInNewContext(`(${source.slice(start,end)})`);
  const fixtures=[session('push_a',0),session('push_a',0,{rir:''}),session('push_a',0,{rir:'5'}),session('push_a',0,{rir:'0'}),session('push_a',0,{sets:7,planned:10}),session('push_a',0,{sets:8,planned:10}),{ts:1,details:[]},null,{ts:1,sets:3,details:[{sets:[{rir:'1'},{rir:''},{rir:'4'}]}]}];
  for(const h of fixtures)assert.equal(engine.successful(h),core(h),JSON.stringify(h)?.slice(0,80));
});

test('Never Skip Leg Day counts leg sessions across both programs',()=>{
  assert.equal(earned(cycles(5),'leg_day'),false);
  assert.equal(earned(cycles(6),'leg_day'),true);
  assert.equal(mark(engine.evaluate(user([...cycles(1,{keys:LEGACY}),...cycles(5,{start:30})])),'leg_day').value,12);
});

test('No Detours needs one whole rotation in order without changing workouts',()=>{
  assert.equal(earned(cycles(1),'no_detours'),true);
  const shuffled=['push_a','pull_a','lower_a','push_b','pull_b','lower_b'].map((k,i)=>session(k,i*2));
  assert.equal(earned([...shuffled,...shuffled.map(s=>({...s,ts:s.ts+20*DAY}))],'no_detours'),false);
  const detour=[...cycles(1).slice(0,3),session('push_a',7),...cycles(1).slice(3).map(s=>({...s,ts:s.ts+4*DAY}))];
  assert.equal(earned(detour,'no_detours'),false,'a changed workout mid-rotation breaks the run');
});

test('Honest Effort requires RIR on every set; Nothing Left Out requires every planned set',()=>{
  const honest=Array.from({length:10},(_,i)=>session('push_a',i*2));
  assert.equal(earned(honest,'honest_effort'),true);
  const oneBlank=honest.map((s,i)=>i?s:{...s,details:[{name:'Lift',sets:[...s.details[0].sets.slice(1),{weight:'100',reps:'8',rir:'',done:true}]}]});
  assert.equal(earned(oneBlank,'honest_effort'),false);
  assert.equal(earned(honest,'complete_sessions'),true);
  assert.equal(earned(Array.from({length:10},(_,i)=>session('push_a',i*2,{sets:9,planned:10})),'complete_sessions'),false);
});

test('Back at It celebrates returning after two weeks away',()=>{
  assert.equal(earned([session('push_a',0),session('lower_a',13)],'back_at_it'),false);
  assert.equal(earned([session('push_a',0),session('lower_a',15)],'back_at_it'),true);
});

test('Active Weeks count weeks with two sessions and never need to be consecutive',()=>{
  const spaced=[0,3,5].flatMap(w=>[session('push_a',w*7),session('lower_a',w*7+2)]).concat([session('pull_a',70),session('push_b',72)]);
  assert.equal(earned(spaced,'active_weeks_4'),true);
  assert.equal(earned(Array.from({length:8},(_,w)=>session('push_a',w*7)),'active_weeks_4'),false);
});

test('Listened to Your Body counts finished low-recovery sessions',()=>{
  const low=[0,2,4].map(d=>session('push_a',d,{readiness:{energy:2,soreness:1}}));
  assert.equal(earned(low,'listened'),true);assert.equal(earned(low.slice(0,2),'listened'),false);
});

test('an emblem can only be worn while it is earned, and Sixty-Six stays hidden until earned',()=>{
  const u=user(cycles(1));u.trainerMemory={achievements:{emblem:'crown'}};
  assert.equal(engine.avatarFor(u).emblem,null);
  u.trainerMemory.achievements.emblem='hex';assert.equal(engine.avatarFor(u).emblem,'hex');
  assert.equal(mark(engine.evaluate(u),'six_six').hidden,true);
  assert.equal(mark(engine.evaluate(user(cycles(11))),'six_six').hidden,false);
});

// ---- In the app ----
function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.URL.createObjectURL=()=>'blob:test';w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run("window.__toasts=[];window.toast=function(m){window.__toasts.push(m)};window.IronSixCloud={session:()=>null,syncNow:()=>{}}");
  for(const file of ['iron-marks-engine.js','iron-marks.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  return {w,run,errors,json:code=>JSON.parse(run(`JSON.stringify(${code})`)),setHistory:h=>run(`activeUser().history=${JSON.stringify([...h].sort((a,b)=>b.ts-a.ts))};activeUser().today={};saveData()`),close:()=>dom.window.close()};
}

test('the profile menu offers Iron Marks and the trophy case lists every group',()=>{
  const a=app();
  try{
    a.run('IronSixProfileMenu.render()');a.w.document.getElementById('profileMenuButton').click();
    const item=[...a.w.document.querySelectorAll('#profileMenu .pm-item')].find(b=>/Iron Marks/.test(b.textContent));
    assert(item,'menu item present');assert.match(item.textContent,/0 \/ \d+/);
    item.click();
    const modal=a.w.document.getElementById('ironMarksModal');
    assert.equal(modal.hidden,false);
    for(const g of engine.GROUPS)assert.match(modal.textContent,new RegExp(g.title));
    assert.match(modal.textContent,/Hidden mark/);assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('existing history is recorded quietly on first run instead of a pile of celebrations',()=>{
  const a=app();
  try{
    a.setHistory(cycles(3).map(s=>({...s,ts:s.ts-400*DAY})));
    const out=a.json('IronSixMarks.check()');
    assert(out.introduced>0);assert.equal(a.w.document.getElementById('ironMarksEarned'),null,'no celebration modal');
    assert.match(a.json('window.__toasts').join(' '),/already earned/);
    assert.equal(a.json('IronSixMarks.check()'),null,'nothing new afterwards');
  }finally{a.close()}
});

test('finishing a session that earns a mark celebrates it once and lets you wear the emblem',()=>{
  const a=app();
  try{
    a.setHistory([]);a.run('IronSixMarks.check()');
    const now=a.json('Date.now()');a.setHistory([{...session('push_a',0),ts:now-60000}]);
    const out=a.json('IronSixMarks.check()');assert.deepEqual(out.celebrated,['first_rep']);
    const modal=a.w.document.getElementById('ironMarksEarned');assert.equal(modal.hidden,false);assert.match(modal.textContent,/First Rep/);
    modal.querySelector('[data-wear="spark"]').click();
    assert.equal(a.json('activeUser().trainerMemory.achievements.emblem'),'spark');
    a.run('IronSixProfileMenu.render()');
    assert(a.w.document.querySelector('#pmAvatar svg'),'the avatar shows the emblem');
    modal.querySelector('[data-done]').click();
    assert.equal(a.json('IronSixMarks.check()'),null,'a mark is never celebrated twice');
  }finally{a.close()}
});

test('marks are not celebrated mid-workout, and old unlocks arriving by sync are recorded quietly',()=>{
  const a=app();
  try{
    a.setHistory([]);a.run('IronSixMarks.check()');
    const now=a.json('Date.now()');a.setHistory([{...session('push_a',0),ts:now-60000}]);
    a.run("activeUser().today={'0-0':{weight:'100',reps:'8',done:true}}");
    assert.equal(a.json('IronSixMarks.check()'),null,'no modal over an active workout');
    a.run('activeUser().today={}');
    a.setHistory(cycles(1).map(s=>({...s,ts:s.ts-300*DAY})));
    const out=a.json('IronSixMarks.check()');assert.deepEqual(out.celebrated,[]);assert(out.quiet>0);
  }finally{a.close()}
});

test('the post-workout trainer review keeps the synced accent theme and Iron Marks state',()=>{
  const source=fs.readFileSync('ui3.js','utf8');
  assert(source.includes('target.trainerMemory={appearance:target.trainerMemory?.appearance,achievements:target.trainerMemory?.achievements,'));
  for(const f of ['cloud-history-sync.js','scripts/build-web.mjs','scripts/build-android-web.mjs']){const s=fs.readFileSync(f,'utf8');assert(s.includes('iron-marks-engine.js')&&s.includes('iron-marks.js'),f)}
  const loader=fs.readFileSync('cloud-history-sync.js','utf8');assert(loader.indexOf('iron-marks-engine.js')<loader.indexOf("'iron-marks.js"));
});
