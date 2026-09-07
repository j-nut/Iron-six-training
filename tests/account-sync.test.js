const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

async function accountApp(options={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:options.url||'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),db={profiles:[],workout_entries:[]},calls=[];
  let current=null,callback=null,sequence=0,loseAck=false;
  const clone=x=>JSON.parse(JSON.stringify(x));
  class Query{
    constructor(table){this.table=table;this.filters=[];this.action='select';this.singleRow=false}
    select(){return this}order(){return this}limit(){return this}
    eq(key,value){this.filters.push(row=>row[key]===value);return this}
    gt(key,value){this.filters.push(row=>row[key]>value);return this}
    single(){this.singleRow=true;return this}
    insert(row){this.action='insert';this.row=clone(row);return this}
    upsert(row){this.action='upsert';this.row=clone(row);return this}
    update(row){this.action='update';this.row=clone(row);return this}
    then(resolve,reject){try{const rows=db[this.table];let selected=rows.filter(r=>r.user_id===current?.user.id&&this.filters.every(f=>f(r)));
      if(['insert','upsert'].includes(this.action)){
        if(this.row.user_id!==current?.user.id)return Promise.resolve({error:{message:'RLS'}}).then(resolve,reject);
        const duplicate=rows.find(r=>this.table==='profiles'?r.user_id===this.row.user_id&&r.client_id===this.row.client_id:r.event_id===this.row.event_id);
        if(duplicate&&this.action==='insert')return Promise.resolve({error:{code:'23505'}}).then(resolve,reject);
        if(!duplicate){const row={...this.row,id:this.row.id||w.crypto.randomUUID()};if(this.table==='workout_entries'){row.sequence=++sequence;row.saved_at=new Date().toISOString()}rows.push(row);selected=[row]}
        else selected=[duplicate];
        if(this.table==='workout_entries'&&loseAck){loseAck=false;return Promise.resolve({error:{message:'response lost'}}).then(resolve,reject)}
      }
      if(this.action==='update')selected.forEach(row=>Object.assign(row,this.row));
      return Promise.resolve({data:clone(this.singleRow?selected[0]:selected),error:null}).then(resolve,reject);
    }catch(e){return Promise.reject(e).then(resolve,reject)}}
  }
  const auth={
    onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){}}}}},
    async getSession(){return {data:{session:current}}},
    async signInWithPassword(args){calls.push(['login',args]);return {error:{message:'invalid credentials'}}},
    async signUp(args){calls.push(['signup',args]);return {data:{session:null}}},
    async signInWithOtp(args){calls.push(['magic',args]);return {data:{}}},
    async resetPasswordForEmail(...args){calls.push(['reset',...args]);return {data:{}}},
    async updateUser(args){calls.push(['password',args]);return {data:{}}},
    async verifyOtp(args){calls.push(['verify',args]);return {data:{session:current},error:null}},
    async signInWithOAuth(args){calls.push(['oauth',args]);return {data:{url:'https://mock.test/auth/v1/authorize'},error:options.oauthError||null}},
    async linkIdentity(args){calls.push(['link',args]);return {data:{url:'https://mock.test/auth/v1/authorize'},error:options.linkError||null}},
    async signOut(){current=null;callback('SIGNED_OUT',null);return {error:null}}
  };
  w.IRON_SIX_SUPABASE={url:'https://mock.test',publishableKey:'public-test-key'};
  w.mockSdk={createClient:()=>({auth,from:table=>new Query(table)})};
  w.fetch=async url=>{
    const value=String(url);
    if(value.endsWith('/api/auth-status'))return {ok:!options.settingsFail,json:async()=>({iron:options.iron||{},nomad:options.nomad||{}})};
    return {ok:false,json:async()=>({})};
  };w.scrollTo=()=>{};w.confirm=()=>true;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.setInterval=()=>0;w.setTimeout=(fn,ms)=>{if(ms===0)queueMicrotask(fn);return 0};
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0])){
    vm.runInContext(fs.readFileSync(file,'utf8').replace('await import(SDK)','window.mockSdk'),context,{filename:file});
  }
  for(let i=0;i<8;i++)await turn();
  return {w,db,calls,run:code=>vm.runInContext(code,context),loseNextAck:()=>{loseAck=true},
    async signIn(id){current={user:{id,email:id+'@example.test'}};callback('SIGNED_IN',current);for(let i=0;i<12;i++)await turn()},
    async recovery(){callback('PASSWORD_RECOVERY',current);for(let i=0;i<6;i++)await turn()},
    close:()=>w.close()};
}
test('accounts never auto-import guests; switching and signing out retain their own data',async()=>{
  const a=await accountApp();a.run("activeUser().name='Guest name';saveData()");
  await a.signIn('owner-a');assert.equal(a.run('activeUser().name'),'My profile');
  a.run("activeUser().name='Private A';saveData()");await a.w.IronSixCloud.syncNow();
  await a.signIn('owner-b');assert.equal(a.run('activeUser().name'),'My profile');
  assert.equal(a.db.profiles.filter(r=>r.user_id==='owner-b').some(r=>r.display_name==='Private A'),false);
  await a.signIn('owner-a');assert.equal(a.run('activeUser().name'),'Private A');
  a.w.document.getElementById('accountSignOut').click();for(let i=0;i<10;i++)await turn();
  assert.equal(a.run('activeUser().name'),'Guest name');assert.equal(a.w.IronSixCloud.session(),null);a.close();
});
test('duplicate retry confirms the original immutable entry and does not duplicate sets',async()=>{
  const a=await accountApp();await a.signIn('owner-a');
  a.run("activeUser().today['0-0']={weight:'45',reps:'11',done:false};IronSixJournal.captureSet(activeUser(),finalWorkout(activeUser()),0,0,activeUser().today['0-0'])");
  a.loseNextAck();assert.equal(await a.w.IronSixJournal.flush(),false);
  await a.w.IronSixJournal.flush();
  assert.equal(a.db.workout_entries.length,2);assert.equal(a.w.IronSixJournal.pending().length,0);a.close();
});
test('concurrent profile updates require explicit resolution instead of overwriting',async()=>{
  const a=await accountApp();await a.signIn('owner-a');
  a.run("activeUser().name='Device edit';saveData()");
  const row=a.db.profiles.find(r=>r.user_id==='owner-a');row.display_name='Other device';row.updated_at='2099-01-01T00:00:00.000Z';
  await a.w.IronSixCloud.syncNow();
  assert.equal(row.display_name,'Other device');assert.equal(a.run('activeUser().name'),'Device edit');
  assert.match(a.w.document.getElementById('profileConflicts').textContent,/Keep device settings/);
  [...a.w.document.querySelectorAll('#profileConflicts button')].find(b=>b.textContent==='Use cloud settings').click();
  for(let i=0;i<8;i++)await turn();
  assert.equal(a.run('activeUser().name'),'Other device');a.close();
});
test('password forms validate, email-link sign-in cannot create accounts, and recovery opens password form',async()=>{
  const a=await accountApp(),d=a.w.document;
  d.querySelector('[data-auth="signup"]').click();
  d.getElementById('accountEmail').value='test@example.test';d.getElementById('accountPassword').value='short';d.getElementById('accountConfirm').value='short';
  d.getElementById('accountForm').dispatchEvent(new a.w.Event('submit',{cancelable:true}));
  assert.equal(a.calls.length,0);assert.match(d.getElementById('accountStatus').textContent,/12 characters/);
  d.querySelector('[data-auth="magic"]').click();d.getElementById('accountForm').dispatchEvent(new a.w.Event('submit',{cancelable:true}));await turn();
  assert.equal(a.calls.at(-1)[1].options.shouldCreateUser,false);
  await a.signIn('owner-a');await a.recovery();
  assert.equal(d.getElementById('accountForm').hidden,false);assert.equal(d.getElementById('accountSubmit').textContent,'Save new password');a.close();
});
test('unavailable providers stay hidden and provider-status failures preserve email login',async()=>{
  for(const settingsFail of [false,true]){
    const a=await accountApp({settingsFail}),d=a.w.document;
    for(const id of ['google','apple','azure','github']){assert.equal(d.getElementById('social-'+id).disabled,true);d.getElementById('social-'+id).click()}
    assert.equal(a.calls.length,0);assert.equal(d.getElementById('accountSubmit').disabled,false);
    assert.match(d.getElementById('socialAvailability').textContent,/email/i);a.close();
  }
});
test('direct Iron providers use fixed production callbacks and minimum required scopes',async()=>{
  const ironKey={google:'google',apple:'apple',azure:'microsoft',github:'github'};
  for(const provider of ['google','apple','azure','github']){
    const a=await accountApp({iron:{[ironKey[provider]]:true},url:'https://iron-six.test/live?next=https://untrusted.test'});
    a.w.document.getElementById('social-'+provider).click();await turn();
    const [method,args]=a.calls.at(-1);assert.equal(method,'oauth');assert.equal(args.provider,provider);
    assert.equal(args.options.redirectTo,'https://iron-six-training.vercel.app/?auth=oauth');
    if(provider==='azure')assert.equal(args.options.scopes,'email');
    else assert.equal(args.options.scopes,undefined);
    assert.equal(a.w.document.getElementById('accountSubmit').disabled,true);
    assert.equal(a.w.localStorage.getItem('ironSixAccountScope'),null);a.close();
  }
});
test('signed-in users only connect direct identities without changing account or moving workouts',async()=>{
  const a=await accountApp({iron:{google:true},linkError:{code:'manual_linking_disabled'}});
  await a.signIn('owner-a');a.run("activeUser().name='Keep my profile';saveData()");
  a.w.document.getElementById('social-google').click();await turn();
  assert.equal(a.calls.at(-1)[0],'link');assert.equal(a.w.ironSixAccountScope,'owner-a');
  assert.equal(a.run('activeUser().name'),'Keep my profile');
  assert.match(a.w.document.getElementById('accountStatus').textContent,/Connecting another provider is not available/);
  assert.equal(a.w.document.getElementById('social-google').disabled,false);a.close();
});
test('failed direct redirects are recoverable and failed device saves prevent leaving the workout',async()=>{
  const a=await accountApp({iron:{google:true},oauthError:{code:'unexpected_failure',message:'private server detail'}});
  a.w.document.getElementById('social-google').click();await turn();
  assert.equal(a.w.document.getElementById('social-google').disabled,false);
  assert.doesNotMatch(a.w.document.getElementById('accountStatus').textContent,/private server detail/);
  const count=a.calls.length;a.w.Storage.prototype.setItem=()=>{throw Error('full')};
  a.w.document.getElementById('social-google').click();await turn();
  assert.equal(a.calls.length,count);assert.match(a.w.document.getElementById('accountStatus').textContent,/could not be saved/);a.close();
});
test('cancelled OAuth callbacks show a safe retry message and remove error parameters',async()=>{
  const a=await accountApp({url:'https://iron-six.test/?error=access_denied&error_description=%3Cscript%3Ebad%3C/script%3E&keep=1'});
  assert.equal(a.w.location.search,'?keep=1');
  assert.match(a.w.document.getElementById('accountStatus').textContent,/cancelled/i);
  assert.doesNotMatch(a.w.document.getElementById('accountStatus').textContent,/<script>/);
  assert.equal(a.w.document.getElementById('cloudModal').classList.contains('show'),true);a.close();
});