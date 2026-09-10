// Restoring a backup writes a person's training history into their account. The failure modes
// that matter are silent ones: duplicating a year of sessions, overwriting a profile that was
// already there, or quietly dropping history. Each is asserted below.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app({signedIn=false}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[],toasts=[];
  w.confirm=()=>true;
  w.setInterval=()=>0;
  w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  if(signedIn)w.localStorage.setItem('ironSixAccountScope','account-123');
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run('window.__toasts=[];window.toast=function(m){window.__toasts.push(m)}');
  return {
    w,run,errors,
    json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    toasts:()=>JSON.parse(run('JSON.stringify(window.__toasts)')),
    restore:text=>run(`IronSixBackupRestore.restore(${JSON.stringify(text)})`),
    close:()=>dom.window.close()
  };
}

const backup=(users,extra={})=>JSON.stringify({exportedAt:'2026-01-01T00:00:00.000Z',profiles:{users},entries:[],...extra});

const profile=(name,sessions=2)=>({
  id:'guest-'+name.toLowerCase(), name, weight:200, age:33, heightIn:72, trainingLevel:'intermediate',
  equipment:{dumbbells:true,barbell:true,bench:true},
  customEquipment:['Kettlebells'],
  history:Array.from({length:sessions},(_,i)=>({
    ts:1700000000000+i*86400000, date:'1/'+(i+1)+'/2026', name:'Chest', workoutKey:'chest',
    sets:12, plannedSets:15, duration:60, variant:'A', muscles:['chest'],
    details:[{name:'Barbell Bench Press',base:'Horizontal press',seedKey:'bench',
      sets:[{weight:'185',reps:'8',rir:'2',done:true},{weight:'185',reps:'7',rir:'1',done:true}]}]
  })),
  program:{currentWorkoutKey:'chest',exposures:{chest:2}}
});

test('a backup file imports its profiles and their sessions',()=>{
  const a=app();
  try{
    const before=a.json('data.users.length');
    const result=a.restore(backup([profile('Casey',3)]));
    assert.equal(result.added,1);
    assert.equal(a.json('data.users.length'),before+1,'the profile should be added, not merged over an existing one');
    const imported=a.json("data.users.find(u=>u.name==='Casey')");
    assert(imported,'the imported profile should be findable by name');
    assert.equal(imported.history.length,3,'all saved sessions must survive the import');
    assert.deepEqual(imported.customEquipment,['Kettlebells'],'equipment must come across too');
    assert.equal(imported.weight,200);
  }finally{a.close()}
});

test('importing the same file twice does not duplicate the history',()=>{
  const a=app();
  try{
    const file=backup([profile('Casey',3)]);
    assert.equal(a.restore(file).added,1);
    const after=a.json('data.users.length');
    const second=a.restore(file);
    assert.equal(second.added,0,'a re-import must add nothing');
    assert.equal(second.skipped,1);
    assert.equal(a.json('data.users.length'),after,'a re-import must not grow the profile list');
    assert(a.toasts().some(t=>/already imported/i.test(t)),'the user must be told why nothing happened');
  }finally{a.close()}
});

test('an imported profile never reuses the id or cloud identity of the profile it came from',()=>{
  const a=app();
  try{
    a.restore(backup([{...profile('Casey'),cloudId:'cloud-abc',_cloudVersion:9,_cloudFingerprint:'xyz'}]));
    const imported=a.json("data.users.find(u=>u.name==='Casey')");
    assert.notEqual(imported.id,'guest-casey','a copy must get its own id');
    assert.equal(imported.cloudId,undefined,'cloud identity belongs to the original profile');
    assert.equal(imported._cloudVersion,undefined);
    assert.equal(imported._cloudFingerprint,undefined);
    assert.deepEqual(imported.today,{},'an imported profile must not arrive mid-workout');
  }finally{a.close()}
});

test('existing profiles and their history are untouched by an import',()=>{
  const a=app();
  try{
    a.run("activeUser().name='Original';activeUser().history=[{ts:1,date:'1/1/2026',name:'Back',workoutKey:'back',sets:9,details:[]}];saveData()");
    const originalId=a.json('activeUser().id');
    a.restore(backup([profile('Casey',2)]));
    const original=a.json(`data.users.find(u=>u.id===${JSON.stringify(originalId)})`);
    assert(original,'the pre-existing profile must still be there');
    assert.equal(original.name,'Original');
    assert.equal(original.history.length,1,'its history must be untouched');
  }finally{a.close()}
});

test('when signed in, imported profiles are claimed by the account so they sync',()=>{
  const a=app({signedIn:true});
  try{
    a.restore(backup([profile('Casey')]));
    const imported=a.json("data.users.find(u=>u.name==='Casey')");
    assert.equal(imported.accountOwner,'account-123','an import while signed in must belong to that account');
  }finally{a.close()}
});

test('a raw device-storage blob is accepted, not just the app’s export format',()=>{
  const a=app();
  try{
    // What someone gets by copying localStorage out by hand.
    const result=a.restore(JSON.stringify({users:[profile('Casey',2)],activeUserId:'guest-casey'}));
    assert.equal(result.added,1);
    assert.equal(a.json("data.users.find(u=>u.name==='Casey').history.length"),2);
  }finally{a.close()}
});

test('junk files are refused with a reason instead of corrupting anything',()=>{
  const a=app();
  try{
    const before=a.json('JSON.stringify(data.users)');
    for(const [bad,expected] of [
      ['not json at all',/valid JSON/i],
      ['{"nope":true}',/not an Iron Six backup/i],
      ['{"profiles":{"users":[]}}',/no training profiles/i],
      ['[]',/not an Iron Six backup/i]
    ]){
      assert.throws(()=>a.restore(bad),expected,`"${bad.slice(0,20)}" should be refused`);
    }
    assert.equal(a.json('JSON.stringify(data.users)'),before,'a refused file must leave the profile list exactly as it was');
  }finally{a.close()}
});

test('an implausibly large profile count is refused rather than imported',()=>{
  const a=app();
  try{
    const many=Array.from({length:40},(_,i)=>profile('P'+i,1));
    assert.throws(()=>a.restore(backup(many)),/more than Iron Six will import/i);
  }finally{a.close()}
});

test('the restore control is present next to the export it pairs with',()=>{
  const a=app();
  try{
    assert(a.w.document.getElementById('exportWorkoutLog'),'export must still be there');
    assert(a.w.document.getElementById('restoreWorkoutBackup'),'restore must sit beside it');
    assert.deepEqual(a.errors,[],'the page must load without script errors');
  }finally{a.close()}
});

test('a restored session is replayable from the journal, not just listed',async()=>{
  const a=app();
  try{
    a.restore(backup([profile('Casey',2)]));
    await a.w.IronSixJournal.hydrated;
    const id=a.json("data.users.find(u=>u.name==='Casey').id");
    const sessions=a.json(`IronSixJournal.replay(${JSON.stringify(id)})`);
    assert(sessions.length>=2,`imported history must be rebuilt into the journal, saw ${sessions.length}`);
  }finally{a.close()}
});
