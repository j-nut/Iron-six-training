// First-run setup. The failures that matter: asking someone who is already set up to start over,
// letting a required answer (or the old silent 30 lb dumbbell default) slip through, writing over
// history or a workout in progress, and losing an answer on refresh.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const tick=()=>new Promise(resolve=>setTimeout(resolve,2));

function app({email=null,storage=null,media=null,pickFile=true}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;
  w.setInterval=()=>0;
  w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.URL.createObjectURL=()=>'blob:test';
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  if(storage)for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
  if(media)Object.defineProperty(w.navigator,'mediaDevices',{value:media,configurable:true});
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run('window.__toasts=[];window.toast=function(m){window.__toasts.push(m)}');
  run(email
    ? `window.IronSixCloud={session:()=>({user:{id:'acct-1',email:${JSON.stringify(email)}}}),openAccount:()=>{}}`
    : 'window.IronSixCloud={session:()=>null,openAccount:()=>{}}');
  run('IronSixOnboarding.settleMs=0');
  if(pickFile)run('window.__picked=0;IronSixBackupRestore.pickFile=function(){window.__picked++}');
  const d=w.document;
  const api={
    w,d,run,errors,dom,
    json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    check:()=>run('IronSixOnboarding.reset();IronSixOnboarding.check()'),
    shown:()=>!!d.getElementById('onboardingWizard'),
    title:()=>d.getElementById('obTitle')?.textContent||'',
    count:()=>d.getElementById('obCount')?.textContent||'',
    error:()=>d.getElementById('obError')?.textContent||'',
    text:()=>d.getElementById('onboardingWizard')?.textContent||'',
    fill:(id,value)=>{const el=d.getElementById(id);assert(el,`#${id} should exist on "${api.title()}"`);el.value=String(value)},
    tickEl:(selector,on=true)=>{const el=d.querySelector(selector);assert(el,`${selector} should exist on "${api.title()}"`);el.checked=on;el.dispatchEvent(new w.Event('change',{bubbles:true}))},
    tick:(id,on=true)=>api.tickEl('#'+id,on),
    pick:(name,value)=>api.tickEl(`#onboardingWizard input[name="${name}"][value="${value}"]`),
    next:async()=>{d.getElementById('obForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();await tick()},
    skip:async()=>{d.getElementById('obSkipStep').click();await tick()},
    storage:()=>Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>w.localStorage.key(i)).map(k=>[k,w.localStorage.getItem(k)])),
    close:()=>dom.window.close()
  };
  return api;
}

const T={name:/call you/,body:/About your body/,level:/experienced/,goal:/main goal/,days:/days a week/,session:/How long/,style:/How do you like/,equipment:/equipment do you have/,strength:/Strength check/,limits:/go easy on/,phone:/Phone features/,music:/Music during/,review:/Check your setup/};

// Answers whatever required step is showing and presses Continue. Returns the next title.
async function answerCurrent(a){
  const t=a.title();
  if(T.name.test(t))a.fill('obName','Casey');
  else if(T.body.test(t)){a.fill('obWeight',175);a.fill('obAge',31);a.fill('obFeet',5);a.fill('obInches',10)}
  else if(T.level.test(t))a.pick('obLevel','intermediate');
  else if(T.goal.test(t))a.pick('obGoal','muscle');
  else if(T.days.test(t))a.pick('obDays','4');
  else if(T.session.test(t))a.pick('obMinutes','45');
  else if(T.style.test(t)){a.pick('obMode','traditional');a.pick('obDifficulty','balanced')}
  else if(T.equipment.test(t)){a.tickEl('[data-ob-equip="dumbbells"]');a.fill('obDbMax',60);a.pick('obDbStep','2.5')}
  else throw new Error('not a required step: '+t);
  await a.next();
  return a.title();
}
// From the intro, answer required steps until the first optional one (or review).
async function runRequired(a){
  await a.next();
  for(let guard=0;guard<10;guard++){
    if(T.strength.test(a.title())||T.limits.test(a.title())||T.phone.test(a.title())||T.music.test(a.title())||T.review.test(a.title()))return a.title();
    await answerCurrent(a);
  }
  return a.title();
}

const HISTORY="[{sessionId:'s1',ts:1,date:'1/1/2026',name:'Chest',workoutKey:'chest',sets:9,details:[{name:'Bench',sets:[{weight:'135',reps:'8',done:true}]}]}]";
// Everything the program asks for except `omit`, for a profile that has trained.
const configured=(omit=[])=>`(()=>{const u=activeUser();Object.assign(u,{name:'Sam',weight:190,age:40,heightIn:70,trainingLevel:'advanced',goal:'strength',daysPerWeek:4,limitations:[],strengthRefs:{bench:{weight:225,reps:5,equipment:'barbell'}},preferences:{music:true,camera:false,voice:false,sounds:true},equipment:{...DEFAULT_EQUIPMENT,dumbbells:true},capacities:{dumbbellMax:90,barbellMax:405,dumbbellStep:5,barbellStep:5},history:${HISTORY}});for(const key of ${JSON.stringify(omit)})delete u[key];saveData()})()`;

test('the shipped default profile carries nobody else’s personal data',()=>{
  const a=app();
  try{
    const seeded=a.json('makeUser()');
    assert.notEqual(seeded.name,'Jordan');
    assert.equal(seeded.benchBest,'');
    assert.notEqual(seeded.weight,213);
    assert(seeded.weight>0);
  }finally{a.close()}
});

test('a guest’s first launch opens the setup wizard with restore offered, and it cannot be dismissed',()=>{
  const a=app();
  try{
    a.check();
    assert(a.shown());
    assert.equal(a.title(),'Welcome to Iron Six');
    assert.match(a.text(),/Get started/);
    assert.match(a.text(),/Restore a backup/);
    const dialog=a.d.getElementById('onboardingWizard');
    assert.equal(dialog.getAttribute('role'),'dialog');
    assert.equal(dialog.getAttribute('aria-modal'),'true');
    assert.equal(dialog.getAttribute('aria-labelledby'),'obTitle');
    assert.equal(a.d.getElementById('obNotNow'),null,'a brand-new profile has no way out');
    assert.equal(a.json('activeUser().onboardingDraft===undefined'),true,'merely opening writes nothing to the profile');
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('a signed-in new account is told which account this is',()=>{
  const a=app({email:'new@example.com'});
  try{a.check();assert.match(a.text(),/new@example\.com/)}finally{a.close()}
});

test('required steps block, and neither the default kit nor the 30 lb dumbbell default is silently accepted',async()=>{
  const a=app();
  try{
    a.check();
    await a.next();
    assert.match(a.title(),T.name);
    assert.equal(a.d.getElementById('obSkipStep'),null,'a required step has no skip');
    await a.next();
    assert.match(a.error(),/Enter a name/);
    assert.match(a.title(),T.name,'it stays on the step');
    a.fill('obName','Casey');await a.next();
    assert.match(a.title(),T.body);
    assert.equal(a.d.getElementById('obWeight').value,'','the placeholder 180 lb is not offered as an answer');
    await a.next();assert.match(a.error(),/body weight/);
    a.fill('obWeight',175);a.fill('obAge',31);a.fill('obFeet',5);a.fill('obInches',10);await a.next();
    for(const [pattern,message,answer] of [[T.level,/training level/,()=>a.pick('obLevel','beginner')],[T.goal,/goal/,()=>a.pick('obGoal','strength')],[T.days,/days a week/,()=>a.pick('obDays','3')],[T.session,/session length/,()=>a.pick('obMinutes','30')]]){
      assert.match(a.title(),pattern);await a.next();assert.match(a.error(),message);
      answer();await a.next();
    }
    assert.match(a.title(),T.style);
    assert.equal(a.d.querySelector('input[name="obDifficulty"]:checked'),null,'difficulty is not preselected on a new profile');
    await a.next();assert.match(a.error(),/training style/);
    a.pick('obMode','circuit');await a.next();assert.match(a.error(),/difficulty/);
    a.pick('obDifficulty','heavy');await a.next();
    assert.match(a.title(),T.equipment);
    assert.equal(a.d.querySelectorAll('[data-ob-equip]:checked').length,0,'the default kit is not pre-ticked');
    await a.next();assert.match(a.error(),/Tick what you have/);
    a.tickEl('[data-ob-equip="dumbbells"]');
    assert.equal(a.d.getElementById('obDbSub').hidden,false);
    assert.equal(a.d.getElementById('obDbMax').value,'','no silent 30 lb');
    await a.next();assert.match(a.error(),/heaviest single dumbbell/);
    a.fill('obDbMax',45);await a.next();assert.match(a.error(),/smallest dumbbell jump/);
    a.pick('obDbStep','2.5');
    a.tickEl('[data-ob-equip="barbell"]');
    a.fill('obBbMax',225);await a.next();assert.match(a.error(),/smallest barbell jump/);
    a.pick('obBbStep','5');await a.next();
    assert.match(a.title(),T.strength,'past the required steps');
    const u=a.json('activeUser()');
    assert.equal(u.name,'Casey');assert.equal(u.weight,175);assert.equal(u.age,31);assert.equal(u.heightIn,70);
    assert.equal(u.trainingLevel,'beginner');assert.equal(u.goal,'strength');assert.equal(u.daysPerWeek,3);
    assert.equal(u.workoutMinutes,30);assert.equal(u.trainingMode,'circuit');assert.equal(u.workoutDifficulty,'heavy');
    assert.equal(u.equipment.dumbbells,true);assert.equal(u.equipment.landmine,false);
    assert.equal(u.equipment.pullup,false,'an unticked item is off rather than defaulted on');
    assert.deepEqual(u.capacities,{dumbbellMax:45,barbellMax:225,dumbbellStep:2.5,barbellStep:5});
    assert.equal(a.json('IronSixProfileSchema.isComplete(activeUser())'),true);
    assert.equal(u.onboarding.completedAt,null,'not complete until the review is finished');
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('someone with no equipment can say so explicitly',async()=>{
  const a=app();
  try{
    a.check();await a.next();
    while(!T.equipment.test(a.title())){
      const t=a.title();
      if(T.level.test(t)){a.pick('obLevel','beginner');await a.next();continue}
      await answerCurrent(a);
    }
    a.tick('obNoEquip');await a.next();
    assert.match(a.title(),T.strength);
    assert(Object.values(a.json('activeUser().equipment')).every(v=>v===false));
  }finally{a.close()}
});

test('optional steps can be skipped and are recorded; review shows a first-workout preview; finishing completes setup',async()=>{
  const a=app();
  try{
    a.check();
    assert.match(await runRequired(a),T.strength);
    assert(a.d.getElementById('obSkipStep'),'optional steps offer a skip');
    await a.skip();
    assert.match(a.title(),T.limits);
    a.tickEl('[data-ob-limit="shoulder"]');a.tickEl('[data-ob-limit="knee"]');
    assert.match(a.text(),/not medical advice/i);
    await a.next();
    assert.match(a.title(),T.phone);
    a.tick('obSounds');await a.next();
    assert.match(a.title(),T.music);
    await a.skip();
    assert.match(a.title(),T.review);
    assert.match(a.text(),/Your first workout: .+ · ~45 min/);
    assert.match(a.text(),/Shoulders, Knees/);
    let u=a.json('activeUser()');
    assert.deepEqual(u.onboarding.optionalSkipped.sort(),['music','strength']);
    assert.deepEqual(u.limitations,['shoulder','knee']);
    assert.deepEqual(u.preferences,{camera:false,voice:false,sounds:true});
    a.d.getElementById('obNext').click();await tick();
    assert.equal(a.shown(),false,'finishing closes the wizard');
    u=a.json('activeUser()');
    assert(u.onboarding.completedAt>0);
    assert.equal(u.onboarding.version,1);
    assert.equal(u.onboardingDraft,undefined,'wizard bookkeeping is removed');
    assert.equal(a.json('IronSixOnboarding.check()'),false,'and it never comes back');
    assert.equal(a.shown(),false);
  }finally{a.close()}
});

test('the review can send you back to edit one answer and returns to the review',async()=>{
  const a=app();
  try{
    a.check();
    await runRequired(a);
    await a.skip();await a.skip();await a.skip();await a.skip();
    assert.match(a.title(),T.review);
    a.d.querySelector('[data-ob-edit="goal"]').click();
    assert.match(a.title(),T.goal);
    a.pick('obGoal','general');await a.next();
    assert.match(a.title(),T.review);
    assert.equal(a.json('activeUser().goal'),'general');
    assert.match(a.text(),/General fitness/);
  }finally{a.close()}
});

test('a refresh mid-wizard resumes on the same step with the answers already given',async()=>{
  const first=app();
  let saved;
  try{
    first.check();
    await first.next();                      // intro
    await answerCurrent(first);              // name
    await answerCurrent(first);              // body
    await answerCurrent(first);              // level
    assert.match(first.title(),T.goal);
    saved=first.storage();
  }finally{first.close()}
  const second=app({storage:saved});
  try{
    assert.equal(second.json('activeUser().name'),'Casey','answers persisted per step');
    second.check();
    assert(second.shown());
    assert.match(second.title(),T.goal,'resumes where it left off, not at the start');
    assert.equal(second.json('activeUser().trainingLevel'),'intermediate');
    // it picks up with the earlier answers intact and no re-asking
    await answerCurrent(second);
    assert.match(second.title(),T.days);
  }finally{second.close()}
});

test('an existing user is asked only for what they are missing, and history is never touched',async()=>{
  const a=app();
  try{
    a.run(configured(['goal','daysPerWeek','limitations','strengthRefs','preferences']));
    a.run("activeUser().benchBest=''");
    const before=a.json('activeUser().history');
    a.check();
    assert(a.shown());
    assert.equal(a.title(),'Finish setting up');
    assert.match(a.text(),/nothing changes in it/);
    await a.next();
    const seen=[];
    for(let guard=0;guard<12&&!T.review.test(a.title());guard++){
      const t=a.title();
      for(const [id,pattern] of Object.entries(T))if(pattern.test(t))seen.push(id);
      if(T.goal.test(t))a.pick('obGoal','strength');
      else if(T.days.test(t))a.pick('obDays','5');
      else if(T.strength.test(t)){a.fill('obRef_squat_w',225);a.fill('obRef_squat_r',5);a.tick('obRef_row_n')}
      else if(T.limits.test(t)){}
      else if(T.phone.test(t)){a.tick('obSounds')}
      else if(T.music.test(t))a.pick('obMusic','on');
      else throw new Error('unexpected step '+t);
      await a.next();
    }
    assert.deepEqual(seen,['goal','days','strength','limits','phone','music'],'name, body, level, session and style are never re-asked');
    assert.match(a.title(),T.review);
    assert.deepEqual(a.json('activeUser().history'),before);
    assert.equal(a.json('activeUser().name'),'Sam');
    assert.equal(a.json('activeUser().strengthRefs.squat.weight'),225);
    a.d.getElementById('obForm').dispatchEvent(new a.w.Event('submit',{cancelable:true,bubbles:true}));await tick();
    assert.equal(a.shown(),false);
    assert(a.json('activeUser().onboarding.completedAt')>0);
  }finally{a.close()}
});

test('an existing user with the default kit is asked to confirm equipment; one with their own kit is not',()=>{
  const defaults=app();
  try{
    defaults.run(configured());
    defaults.run("activeUser().equipment={...DEFAULT_EQUIPMENT};activeUser().capacities={dumbbellMax:30,barbellMax:300,dumbbellStep:5,barbellStep:5};saveData()");
    assert.deepEqual(defaults.json('IronSixProfileSchema.missingRequired(activeUser())'),['equipment'],'the old silent 30 lb default must be confirmed once');
  }finally{defaults.close()}
  const custom=app();
  try{
    custom.run(configured());
    assert.deepEqual(custom.json('IronSixProfileSchema.missingRequired(activeUser())'),[]);
  }finally{custom.close()}
});

test('a bench reference already typed into the old free-text field counts as the strength check',()=>{
  const a=app();
  try{
    a.run(configured(['strengthRefs']));
    a.run("activeUser().benchBest='225 x 5';saveData()");
    assert(!a.json('IronSixProfileSchema.missingOptional(activeUser())').includes('strength'));
    assert.deepEqual(a.json('IronSixProfileSchema.benchRef(activeUser())'),{weight:225,reps:5,equipment:'barbell'});
  }finally{a.close()}
});

test('a completed user never sees it',()=>{
  const a=app();
  try{
    a.run(configured());
    a.run("activeUser().onboarding={version:1,completedAt:Date.now(),optionalSkipped:[]};saveData()");
    a.check();
    assert.equal(a.shown(),false);
  }finally{a.close()}
  const b=app();
  try{
    b.run(configured());
    b.run("activeUser().strengthRefs={bench:{weight:200,reps:5,equipment:'barbell'}};activeUser().preferences={music:true,camera:false,voice:false,sounds:true};activeUser().limitations=['knee'];saveData()");
    b.check();
    assert.equal(b.shown(),false,'everything answered counts as complete even without a completion stamp');
  }finally{b.close()}
});

test('a skipped optional step is not asked again after a reload',async()=>{
  const a=app();
  let saved;
  try{
    a.run(configured(['limitations']));
    a.check();
    await a.next();
    assert.match(a.title(),T.limits);
    await a.skip();
    assert.match(a.title(),T.review);
    saved=a.storage();
  }finally{a.close()}
  const b=app({storage:saved});
  try{
    assert.deepEqual(b.json('IronSixProfileSchema.missingOptional(activeUser())'),[]);
    assert.deepEqual(b.json('activeUser().onboarding.optionalSkipped'),['limits']);
  }finally{b.close()}
});

test('a workout in progress is never disturbed: equipment/session/style are deferred and logged sets stay',async()=>{
  const a=app();
  try{
    a.run(configured(['goal']));
    a.run("activeUser().equipment={...DEFAULT_EQUIPMENT};activeUser().capacities={dumbbellMax:30,barbellMax:300,dumbbellStep:5,barbellStep:5};activeUser().today={'0-0':{weight:'95',reps:'8',rir:'2',done:true}};saveData()");
    const before=a.json('({today:activeUser().today,history:activeUser().history,draft:activeUser().workoutDraft||null,equipment:activeUser().equipment})');
    a.check();
    assert(a.shown());
    await a.next();
    assert.match(a.title(),T.goal);
    a.pick('obGoal','muscle');await a.next();
    assert.doesNotMatch(a.text(),/equipment do you have/);
    while(!T.review.test(a.title())){
      if(T.strength.test(a.title())||T.limits.test(a.title())||T.phone.test(a.title())||T.music.test(a.title()))await a.skip();
      else throw new Error('unexpected '+a.title());
    }
    assert.match(a.text(),/Change after your current workout/);
    a.d.getElementById('obForm').dispatchEvent(new a.w.Event('submit',{cancelable:true,bubbles:true}));await tick();
    const after=a.json('({today:activeUser().today,history:activeUser().history,draft:activeUser().workoutDraft||null,equipment:activeUser().equipment})');
    assert.deepEqual(after,before);
    assert.equal(a.json('activeUser().onboarding.completedAt'),null,'setup is not stamped complete while equipment is still unconfirmed');
    assert.equal(a.json('activeUser().goal'),'muscle');
  }finally{a.close()}
});

test('a user can postpone finishing setup, but only an existing profile can',async()=>{
  const a=app();
  try{
    a.run(configured(['goal']));
    a.check();
    a.d.getElementById('obNotNow').click();
    assert.equal(a.shown(),false);
    a.run('IronSixOnboarding.check()');
    assert.equal(a.shown(),false,'not asked again this session');
    assert.equal(a.json('activeUser().onboarding===undefined'),true,'postponing writes nothing');
  }finally{a.close()}
});

test('turning on camera or voice asks for permission, and a denial leaves it off without breaking',async()=>{
  const requested=[];
  const media={getUserMedia:async constraints=>{requested.push(Object.keys(constraints)[0]);if(constraints.video){const error=new Error('no');error.name='NotAllowedError';throw error}return {getTracks:()=>[{stop(){requested.push('stopped')}}]}}};
  const a=app({media});
  try{
    a.run(configured(['preferences']));
    a.check();
    await a.next();
    while(!T.phone.test(a.title())){
      if(T.strength.test(a.title())||T.limits.test(a.title()))await a.skip();else throw new Error('unexpected '+a.title());
    }
    a.tick('obCamera');a.tick('obVoice');a.tick('obSounds');
    await a.next();
    assert.match(a.title(),T.phone,'a denial is shown before moving on');
    assert.match(a.d.getElementById('obPermNote').textContent,/Camera permission was denied/);
    assert.equal(a.d.getElementById('obCamera').checked,false);
    assert.equal(a.d.getElementById('obVoice').checked,true);
    await a.next();
    assert.match(a.title(),T.music);
    assert.deepEqual(a.json('activeUser().preferences'),{camera:false,voice:true,sounds:true});
    assert(requested.includes('video')&&requested.includes('audio'));
    assert(requested.includes('stopped'),'the microphone is released straight after the check');
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('without camera hardware the feature stays off rather than throwing',async()=>{
  const a=app();
  try{
    assert.equal(await a.run('IronSixOnboarding.requestPermission("camera")'),'unavailable');
    assert.equal(await a.run('IronSixOnboarding.requestPermission("voice")'),'unavailable');
  }finally{a.close()}
});

test('choosing restore opens the backup picker and leaves the wizard intact if cancelled',()=>{
  const a=app();
  try{
    a.check();
    a.d.getElementById('obRestore').click();
    assert.equal(a.json('window.__picked'),1);
    assert.equal(a.shown(),true,'cancelling the picker returns to the wizard, not a dead end');
  }finally{a.close()}
});

const backupText=users=>JSON.stringify({exportedAt:'2026-01-01T00:00:00.000Z',profiles:{users},entries:[]});
const completeProfile={id:'p1',name:'Restored',weight:200,age:33,heightIn:72,trainingLevel:'advanced',goal:'strength',daysPerWeek:4,workoutMinutes:60,workoutDifficulty:'balanced',trainingMode:'traditional',
  equipment:{dumbbells:true,barbell:true,bench:true,rack:true},capacities:{dumbbellMax:100,barbellMax:500,dumbbellStep:5,barbellStep:5},
  limitations:[],preferences:{music:true,camera:false,voice:false,sounds:true},strengthRefs:{squat:{weight:315,reps:5,equipment:'barbell'}},
  onboarding:{version:1,completedAt:1700000000000,optionalSkipped:[]},history:[{sessionId:'s1',ts:1,date:'1/1/2026',name:'Chest',workoutKey:'chest',sets:9,details:[]}]};

test('restoring a complete backup from the wizard skips the wizard and replaces the empty placeholder',async()=>{
  const a=app();
  try{
    a.check();
    a.d.getElementById('obRestore').click();
    a.run(`IronSixBackupRestore.restore(${JSON.stringify(backupText([completeProfile]))},{mode:'new'})`);
    await tick();
    assert.equal(a.shown(),false,'a complete restored profile needs no setup');
    assert.equal(a.json('data.users.length'),1,'the untouched placeholder is gone');
    assert.equal(a.json('activeUser().name'),'Restored');
    assert.equal(a.json('activeUser().history.length'),1);
    assert.equal(a.json('IronSixProfileSchema.isComplete(activeUser())'),true);
  }finally{a.close()}
});

test('restoring an older backup opens "Finish setting up" for only what it lacks',async()=>{
  const a=app();
  try{
    const older={...completeProfile,onboarding:undefined,goal:undefined,daysPerWeek:undefined,limitations:undefined,preferences:undefined,strengthRefs:undefined};
    a.check();
    a.d.getElementById('obRestore').click();
    a.run(`IronSixBackupRestore.restore(${JSON.stringify(backupText([older]))},{mode:'new'})`);
    await tick();
    assert(a.shown());
    assert.equal(a.title(),'Finish setting up');
    assert.match(a.text(),/Goal/);
    assert.match(a.text(),/Days per week/);
    assert.doesNotMatch(a.text(),/Training level/);
    assert.equal(a.json('activeUser().name'),'Restored');
  }finally{a.close()}
});

test('a restore that did not start from the wizard never deletes a profile',()=>{
  const a=app();
  try{
    a.run(`IronSixBackupRestore.restore(${JSON.stringify(backupText([completeProfile]))},{mode:'new'})`);
    assert.equal(a.json('data.users.length'),2);
  }finally{a.close()}
});

test('a profile added later goes through the wizard, leaving the existing profile alone',async()=>{
  const a=app();
  try{
    a.run(configured());
    a.run("activeUser().onboarding={version:1,completedAt:1,optionalSkipped:[]};saveData()");
    const original=a.json('activeUser()');
    a.run("openNewUser()");
    a.fill('newUserName','Taylor');a.fill('newUserWeight',140);
    a.d.getElementById('createNewUser').click();
    assert(a.shown(),'the new profile is taken through setup');
    assert.equal(a.json('activeUser().name'),'Taylor');
    assert.equal(a.title(),'Welcome to Iron Six');
    await a.next();
    assert.match(a.title(),T.body,'the name given in the modal is not asked again');
    assert.deepEqual(a.json('data.users[0]'),original,'the first profile is untouched');
  }finally{a.close()}
});

test('profile editor round-trips every onboarding field and never touches history, today or the workout draft',()=>{
  const a=app();
  try{
    a.run(configured());
    a.run("activeUser().workoutDraft=null;saveData();renderProfileEditor()");
    const before=a.json('({history:activeUser().history,today:activeUser().today,draft:activeUser().workoutDraft||null})');
    const d=a.d,set=(id,value)=>{const el=d.getElementById(id);assert(el,id);el.value=String(value)};
    const tickBox=(selector,on)=>{const el=d.querySelector(selector);assert(el,selector);el.checked=on;el.dispatchEvent(new a.w.Event('change',{bubbles:true}))};
    set('profileGoal','muscle');set('profileDays','5');set('profileMinutes','50');set('profileMode','circuit');set('profileDifficulty','heavy');
    set('ref_squat_weight','275');set('ref_squat_reps','5');set('ref_squat_equipment','barbell');
    set('ref_row_weight','70');set('ref_row_reps','10');set('ref_row_equipment','dumbbell');
    set('ref_bench_weight','60');set('ref_bench_reps','8');set('ref_bench_equipment','dumbbell');
    tickBox('[data-limit="shoulder"]',true);tickBox('[data-limit="lower_back"]',true);
    tickBox('#prefMusic',false);tickBox('#prefSounds',true);
    d.getElementById('saveProfile').click();
    const u=a.json('activeUser()');
    assert.equal(u.goal,'muscle');assert.equal(u.daysPerWeek,5);assert.equal(u.workoutMinutes,50);
    assert.equal(u.trainingMode,'circuit');assert.equal(u.workoutDifficulty,'heavy');
    assert.deepEqual(u.strengthRefs.squat,{weight:275,reps:5,equipment:'barbell'});
    assert.deepEqual(u.strengthRefs.row,{weight:70,reps:10,equipment:'dumbbell'});
    assert.deepEqual(u.limitations.sort(),['lower_back','shoulder']);
    assert.equal(u.preferences.music,false);assert.equal(u.preferences.sounds,true);
    assert.equal(u.benchBest,'120 lb × 8 reps','the legacy bench text keeps working (a dumbbell pair totals both hands)');
    assert.deepEqual(a.json('({history:activeUser().history,today:activeUser().today,draft:activeUser().workoutDraft||null})'),before);
    // and the editor shows what was saved
    a.run('renderProfileEditor()');
    assert.equal(d.getElementById('profileGoal').value,'muscle');
    assert.equal(d.getElementById('profileDays').value,'5');
    assert.equal(d.getElementById('profileMode').value,'circuit');
    assert.equal(d.getElementById('ref_row_equipment').value,'dumbbell');
    assert.equal(d.getElementById('ref_row_weight').value,'70');
    assert.equal(d.querySelector('[data-limit="shoulder"]').checked,true);
    assert.equal(d.querySelector('[data-limit="knee"]').checked,false);
    assert.equal(d.getElementById('prefMusic').checked,false);
    // clearing a lift removes it
    set('ref_row_weight','');set('ref_row_reps','');
    d.getElementById('saveProfile').click();
    assert.equal(a.json('activeUser().strengthRefs.row===undefined'),true);
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('the editor refuses plan-changing settings while a workout has logged sets, but still saves the rest',()=>{
  const a=app();
  try{
    a.run(configured());
    a.run("activeUser().today={'0-0':{weight:'95',reps:'8',rir:'2',done:true}};saveData();renderProfileEditor()");
    const d=a.d;
    assert.equal(d.getElementById('profileMinutes').disabled,true);
    assert.equal(d.getElementById('profileSessionLock').hidden,false);
    const minutes=a.json('activeUser().workoutMinutes');
    d.getElementById('profileGoal').value='general';
    d.getElementById('saveProfile').click();
    assert.equal(a.json('activeUser().goal'),'general');
    assert.equal(a.json('activeUser().workoutMinutes'),minutes);
    assert.deepEqual(a.json("activeUser().today['0-0']"),{weight:'95',reps:'8',rir:'2',done:true});
  }finally{a.close()}
});

test('the editor does not mark optional questions answered when the person never touched them',()=>{
  const a=app();
  try{
    a.run(configured(['limitations','preferences','strengthRefs']));
    a.run("activeUser().benchBest='';saveData();renderProfileEditor()");
    a.d.getElementById('saveProfile').click();
    assert.equal(a.json('activeUser().limitations===undefined'),true);
    assert.equal(a.json('activeUser().preferences===undefined'),true);
    assert.equal(a.json('activeUser().strengthRefs===undefined'),true);
  }finally{a.close()}
});

test('the editor rejects half-entered strength references with a message instead of saving them',()=>{
  const a=app();
  try{
    a.run(configured());
    a.run('renderProfileEditor()');
    a.d.getElementById('ref_squat_weight').value='225';
    a.d.getElementById('ref_squat_reps').value='';
    a.d.getElementById('saveProfile').click();
    assert.match(a.json('window.__toasts').at(-1),/both a weight and 1–50 reps/);
    assert.equal(a.json('activeUser().strengthRefs.squat===undefined'),true);
  }finally{a.close()}
});

test('schema: unknown level counts as missing, contract values are validated, and onboarding is shaped as agreed',()=>{
  const a=app();
  try{
    a.run(configured());
    assert.deepEqual(a.json('IronSixProfileSchema.missingRequired(activeUser())'),[]);
    a.run("activeUser().trainingLevel='unknown'");
    assert.deepEqual(a.json('IronSixProfileSchema.missingRequired(activeUser())'),['level']);
    for(const bad of [{goal:'speed'},{daysPerWeek:7},{daysPerWeek:1},{daysPerWeek:2.5},{workoutMinutes:5},{trainingMode:'zumba'}]){
      assert.equal(a.json(`IronSixProfileSchema.commit(activeUser(),${JSON.stringify(bad)}).ok`),false,JSON.stringify(bad));
    }
    const out=a.json("IronSixProfileSchema.commit(activeUser(),{limitations:['knee','tooth','knee'],strengthRefs:{squat:{weight:200,reps:5,equipment:'cable'},bench:{weight:0,reps:5},hinge:{weight:300,reps:3,equipment:'barbell'}},preferences:{music:true,camera:'yes'}}).ok");
    assert.equal(out,true);
    const u=a.json('activeUser()');
    assert.deepEqual(u.limitations,['knee']);
    assert.deepEqual(Object.keys(u.strengthRefs).sort(),['hinge','squat']);
    assert.equal(u.strengthRefs.squat.equipment,'barbell','unknown equipment falls back to barbell');
    assert.equal(u.preferences.camera,false,'a non-boolean is dropped, leaving the earlier value');
    assert.deepEqual(a.json('IronSixProfileSchema.ensureOnboarding(activeUser())'),{version:1,completedAt:null,optionalSkipped:[]});
  }finally{a.close()}
});
