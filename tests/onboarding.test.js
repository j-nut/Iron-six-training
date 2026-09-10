// The dangerous failure here is not missing the prompt — it is showing it to someone who already
// has training in the account, or letting the app keep shipping one person's body weight as
// everybody's starting point.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app({email=null}={}){
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
  run('window.toast=function(){}');
  run(email
    ? `window.IronSixCloud={session:()=>({user:{id:'acct-1',email:${JSON.stringify(email)}}}),openAccount:()=>{}}`
    : 'window.IronSixCloud={session:()=>null,openAccount:()=>{}}');
  return {
    w,run,errors,
    json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    check:()=>run('IronSixOnboarding.reset();IronSixOnboarding.check()'),
    shown:()=>!!w.document.getElementById('onboardingModal'),
    close:()=>dom.window.close()
  };
}

test('the shipped default profile carries nobody else’s personal data',()=>{
  const a=app();
  try{
    const seeded=a.json('makeUser()');
    assert.notEqual(seeded.name,'Jordan','the app must not ship one person’s name as everybody’s profile');
    assert.equal(seeded.benchBest,'','a bench reference belongs to whoever lifted it');
    assert.notEqual(seeded.weight,213,'body weight must not be inherited from the developer');
    assert(seeded.weight>0,'there must still be a usable starting weight');
  }finally{a.close()}
});

test('a new signed-in account is asked how to start',()=>{
  const a=app({email:'new@example.com'});
  try{
    a.check();
    assert(a.shown(),'an empty account should be offered a choice');
    const text=a.w.document.getElementById('onboardingModal').textContent;
    assert.match(text,/Set up my profile/);
    assert.match(text,/Restore a backup/,'someone holding a backup must be told they can use it');
    assert.match(text,/Skip for now/,'it must be possible to decline');
    assert.match(text,/new@example\.com/,'it should say which account this is');
  }finally{a.close()}
});

test('a guest is never interrupted — there is no account to set up',()=>{
  const a=app();
  try{
    a.check();
    assert.equal(a.shown(),false);
  }finally{a.close()}
});

test('an account with training in it is never interrupted',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.run("activeUser().history=[{sessionId:'s1',ts:1,date:'1/1/2026',name:'Chest',workoutKey:'chest',sets:9,details:[]}];saveData()");
    a.check();
    assert.equal(a.shown(),false,'a real account must not be asked to start over');
  }finally{a.close()}
});

test('an account mid-workout is never interrupted',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.run("activeUser().today['0-0']={weight:'95',reps:'8',rir:'2',done:true};saveData()");
    a.check();
    assert.equal(a.shown(),false);
  }finally{a.close()}
});

test('a profile already synced from the cloud is never interrupted',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.run("activeUser().cloudId='cloud-1';saveData()");
    a.check();
    assert.equal(a.shown(),false,'a profile that exists in the cloud is not an empty account');
  }finally{a.close()}
});

test('a profile that came from a restored backup is never interrupted',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.run("activeUser().importedBackupId='abc:1';saveData()");
    a.check();
    assert.equal(a.shown(),false);
  }finally{a.close()}
});

test('more than one profile means the account is in use',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.run("data.users.push(normalizeUser({id:'other',name:'Other',weight:200,history:[]}));saveData()");
    a.check();
    assert.equal(a.shown(),false);
  }finally{a.close()}
});

test('it asks once and does not nag',()=>{
  const a=app({email:'new@example.com'});
  try{
    a.check();
    assert(a.shown());
    a.w.document.getElementById('obSkip').click();
    assert.equal(a.shown(),false,'skipping must dismiss it');
    a.run('IronSixOnboarding.check()');
    assert.equal(a.shown(),false,'and it must not come straight back');
  }finally{a.close()}
});

test('choosing restore opens the backup picker rather than a dead end',()=>{
  const a=app({email:'new@example.com'});
  try{
    a.run('window.__picked=false;IronSixBackupRestore.pickFile=function(){window.__picked=true}');
    a.check();
    a.w.document.getElementById('obRestore').click();
    assert.equal(a.json('window.__picked'),true,'the restore choice must actually open the picker');
    assert.equal(a.shown(),false,'and close the prompt');
  }finally{a.close()}
});

test('choosing set-up sends them to the profile editor',()=>{
  const a=app({email:'new@example.com'});
  try{
    a.check();
    a.w.document.getElementById('obSetUp').click();
    assert.equal(a.shown(),false);
    assert(a.w.document.getElementById('profiles').classList.contains('active'),'it must land on the profile screen');
  }finally{a.close()}
});
