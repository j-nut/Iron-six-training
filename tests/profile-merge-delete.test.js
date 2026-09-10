// Merging a backup and deleting a profile are the two places the app can lose training that
// cannot be got back. Both are asserted on the outcomes that matter: what survived, what was
// added, what was refused, and whether a delete can come back from the cloud.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app({signedIn=false,cloud=null,downloadsBlocked=false}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;
  w.setInterval=()=>0;
  w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.URL.createObjectURL=downloadsBlocked?()=>{throw Error('downloads blocked')}:()=>'blob:test';
  w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){};
  w.addEventListener('error',event=>errors.push(event.error));
  if(signedIn)w.localStorage.setItem('ironSixAccountScope','account-123');
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run('window.__toasts=[];window.toast=function(m){window.__toasts.push(m)}');
  if(signedIn){
    w.ironSixAccountScope='account-123';
    // Stand in for cloud-sync, which the harness does not load (it makes network calls).
    w.__cloudDeletes=[];
    w.IronSixCloud={client:()=>cloud||({from:table=>({delete:()=>({eq:function(){return this},then:undefined,error:null,
      catch(){return this}})})}),session:()=>({user:{id:'account-123'}})};
    run(`window.IronSixCloud={client:()=>({from:function(t){const self=this;return{delete:function(){const q={_t:t,_f:{},eq:function(k,v){this._f[k]=v;return this},then:function(res){window.__cloudDeletes.push({table:this._t,filter:this._f});return Promise.resolve({error:${cloud==='fail'?'{message:"network down"}':'null'}}).then(res)},catch:function(){return this}};return q}}}}),session:()=>({user:{id:'account-123'}})}`);
  }
  return {
    w,run,errors,
    json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    toasts:()=>JSON.parse(run('JSON.stringify(window.__toasts)')),
    close:()=>dom.window.close()
  };
}

const sess=(day,label)=>({sessionId:'s-'+day,ts:Date.UTC(2026,0,day),date:'1/'+day+'/2026',name:label,workoutKey:'chest',
  sets:12,plannedSets:15,duration:60,variant:'A',muscles:['chest'],
  details:[{name:'Barbell Bench Press',base:'Horizontal press',seedKey:'bench',sets:[{weight:'185',reps:'8',rir:'2',done:true}]}]});

const backupOf=history=>JSON.stringify({exportedAt:'x',profiles:{users:[{id:'guest-1',name:'Casey',weight:200,
  equipment:{dumbbells:true},history,program:{}}]},entries:[]});

function seed(a,history){
  a.run(`activeUser().name='Mine';activeUser().history=${JSON.stringify(history)};saveData()`);
}

// ---- merge -------------------------------------------------------------------------------

test('merge fills the gaps and keeps every date the profile already had',()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1'),sess(5,'MineJan5')]);
    const result=a.json(`IronSixBackupRestore.restore(${JSON.stringify(backupOf([sess(5,'BackupJan5'),sess(9,'BackupJan9')]))},{mode:'merge'})`);
    assert.equal(result.addedSessions,1,'only the missing session should be added');
    assert.equal(result.keptOnCollision,1,'the shared date should be reported as kept');
    const mine=a.json("data.users.find(u=>u.name==='Mine')");
    assert.equal(a.json('data.users.length'),1,'merge must not create a second profile');
    assert.deepEqual(mine.history.map(h=>h.name),['BackupJan9','MineJan5','MineJan1'],'newest first, and the existing Jan 5 survives untouched');
  }finally{a.close()}
});

test('merging the same backup twice adds nothing the second time',()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1')]);
    const file=backupOf([sess(2,'B2'),sess(3,'B3')]);
    assert.equal(a.json(`IronSixBackupRestore.restore(${JSON.stringify(file)},{mode:'merge'})`).addedSessions,2);
    assert.equal(a.json(`IronSixBackupRestore.restore(${JSON.stringify(file)},{mode:'merge'})`).addedSessions,0);
    assert.equal(a.json("data.users.find(u=>u.name==='Mine').history.length"),3);
  }finally{a.close()}
});

test('merged sessions become replayable journal history, not just list rows',async()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1')]);
    a.run(`IronSixBackupRestore.restore(${JSON.stringify(backupOf([sess(7,'B7'),sess(8,'B8')]))},{mode:'merge'})`);
    await a.w.IronSixJournal.hydrated;
    const id=a.json("data.users.find(u=>u.name==='Mine').id");
    assert(a.json(`IronSixJournal.replay(${JSON.stringify(id)})`).length>=3,'merged sessions must reach the journal');
  }finally{a.close()}
});

test('merge targets the profile you name, not whichever is active',()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1')]);
    a.run("data.users.push(normalizeUser({id:'other',name:'Other',weight:200,history:[]}));saveData()");
    a.run(`IronSixBackupRestore.restore(${JSON.stringify(backupOf([sess(4,'B4')]))},{mode:'merge',targetId:'other'})`);
    assert.equal(a.json("data.users.find(u=>u.name==='Other').history.length"),1,'the named profile receives the sessions');
    assert.equal(a.json("data.users.find(u=>u.name==='Mine').history.length"),1,'the active profile is untouched');
  }finally{a.close()}
});

test('add-as-new is still available and still creates a separate profile',()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1')]);
    a.run(`IronSixBackupRestore.restore(${JSON.stringify(backupOf([sess(5,'B5')]))},{mode:'new'})`);
    assert.equal(a.json('data.users.length'),2);
    assert.equal(a.json("data.users.find(u=>u.name==='Mine').history.length"),1,'the original keeps exactly its own history');
  }finally{a.close()}
});

// ---- delete ------------------------------------------------------------------------------

test('a profile with saved training can now be deleted',async()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1'),sess(2,'MineJan2')]);
    a.run("data.users.push(normalizeUser({id:'dupe',name:'Duplicate',weight:200,history:[{sessionId:'d1',ts:1,date:'1/1/2026',name:'Chest',workoutKey:'chest',sets:5,details:[]}]}));saveData()");
    assert.equal(a.json('data.users.length'),2);
    await a.w.IronSixProfileDelete.deleteProfile('dupe');
    assert.equal(a.json('data.users.length'),1,'the duplicate must actually be removed');
    assert.equal(a.json("data.users.some(u=>u.name==='Duplicate')"),false);
    assert.equal(a.json("data.users.find(u=>u.name==='Mine').history.length"),2,'the surviving profile keeps its history');
  }finally{a.close()}
});

test('deleting a profile takes its journal entries with it',async()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1')]);
    a.run(`IronSixBackupRestore.restore(${JSON.stringify(backupOf([sess(6,'B6'),sess(7,'B7')]))},{mode:'new'})`);
    await a.w.IronSixJournal.hydrated;
    const id=a.json("data.users.find(u=>u.name==='Casey').id");
    assert(a.json(`IronSixJournal.all().filter(e=>e.profile_client_id===${JSON.stringify(id)}).length`)>0,'the import should have written entries');
    await a.w.IronSixProfileDelete.deleteProfile(id);
    assert.equal(a.json(`IronSixJournal.all().filter(e=>e.profile_client_id===${JSON.stringify(id)}).length`),0,'entries must not outlive the profile');
    assert.equal(a.json(`IronSixJournal.replay(${JSON.stringify(id)}).length`),0,'and must not be replayable');
  }finally{a.close()}
});

test('a device that cannot download a backup can still delete the profile',async()=>{
  // The whole point of this feature is escaping duplicates. A blocked download must not become
  // a permanent block on deletion.
  const a=app({downloadsBlocked:true});
  try{
    seed(a,[sess(1,'MineJan1')]);
    a.run("data.users.push(normalizeUser({id:'dupe',name:'Duplicate',weight:200,history:[{sessionId:'d1',ts:1,date:'1/1/2026',name:'Chest',workoutKey:'chest',sets:5,details:[]}]}));saveData()");
    const ok=await a.w.IronSixProfileDelete.deleteProfile('dupe');
    assert.equal(ok,true,'a failed backup must not block the delete once confirmed');
    assert.equal(a.json("data.users.some(u=>u.id==='dupe')"),false);
  }finally{a.close()}
});

test('the last profile cannot be deleted',async()=>{
  const a=app();
  try{
    const id=a.json('activeUser().id');
    assert.equal(a.json('data.users.length'),1);
    const ok=await a.w.IronSixProfileDelete.deleteProfile(id);
    assert.equal(ok,false);
    assert.equal(a.json('data.users.length'),1);
    assert(a.toasts().some(t=>/only profile/i.test(t)),'the refusal must be explained');
  }finally{a.close()}
});

test('deleting the active profile moves you to a remaining one',async()=>{
  const a=app();
  try{
    seed(a,[sess(1,'MineJan1')]);
    a.run("data.users.push(normalizeUser({id:'other',name:'Other',weight:200,history:[]}));saveData()");
    const activeId=a.json('activeUser().id');
    await a.w.IronSixProfileDelete.deleteProfile(activeId);
    assert.notEqual(a.json('data.activeUserId'),activeId);
    assert(a.json('activeUser()'),'there must still be an active profile');
  }finally{a.close()}
});

test('when signed in, the cloud row is deleted so sync cannot resurrect the profile',async()=>{
  const a=app({signedIn:true});
  try{
    a.run("data.users.push(normalizeUser({id:'dupe',name:'Duplicate',weight:200,history:[]}));saveData()");
    await a.w.IronSixProfileDelete.deleteProfile('dupe');
    const deletes=a.json('window.__cloudDeletes');
    const profileDelete=deletes.find(d=>d.table==='profiles');
    assert(profileDelete,'a profiles row delete must be issued, or pullProfiles will re-add it');
    assert.equal(profileDelete.filter.client_id,'dupe');
    assert.equal(profileDelete.filter.user_id,'account-123','the delete must be scoped to this account');
    assert.equal(a.json("data.users.some(u=>u.id==='dupe')"),false);
  }finally{a.close()}
});

test('a Postgrest builder with no .catch() does not break deletion',async()=>{
  // PostgrestBuilder implements PromiseLike: it has then() and no catch(). Calling .catch() on
  // it threw a TypeError that surfaced to the user as "could not remove this profile".
  const a=app({signedIn:true});
  try{
    a.run(`window.__deleted=[];window.IronSixCloud={session:()=>({user:{id:'acct-1'}}),client:()=>({from:function(table){return{delete:function(){const q={_f:{},eq:function(k,v){this._f[k]=v;return this},
      then:function(res){window.__deleted.push(table);return Promise.resolve({error:null}).then(res)}};return q}}}})}`);
    a.run("data.users.push(normalizeUser({id:'dupe',name:'Duplicate',weight:200,history:[]}));saveData()");
    const ok=await a.w.IronSixProfileDelete.deleteProfile('dupe');
    assert.equal(ok,true,'a builder without catch() must not fail the delete');
    assert.equal(a.json("data.users.some(u=>u.id==='dupe')"),false,'the profile must actually be gone');
    assert(a.json('window.__deleted').includes('profiles'),'the cloud profile row must still be deleted');
  }finally{a.close()}
});

test('a failed cloud delete keeps the profile rather than half-deleting it',async()=>{
  const a=app({signedIn:true,cloud:'fail'});
  try{
    a.run("data.users.push(normalizeUser({id:'dupe',name:'Duplicate',weight:200,history:[]}));saveData()");
    const ok=await a.w.IronSixProfileDelete.deleteProfile('dupe');
    assert.equal(ok,false,'the delete must report failure');
    assert.equal(a.json("data.users.some(u=>u.id==='dupe')"),true,'the profile must survive a failed cloud delete');
    assert(a.toasts().some(t=>/could not remove/i.test(t)),'the user must be told it was kept');
  }finally{a.close()}
});
