const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function cloudApp(rows){
  const forgotten=[],user={id:'removed',cloudId:'cloud-removed',accountOwner:'acct',history:[],today:{}};
  const ctx={console,Date,Math,Map,Set,Promise,JSON,Error,Number,String,Object,Array,setTimeout:()=>0,clearTimeout(){},setInterval(){},document:{getElementById:()=>null},data:{users:[user,{id:'new',accountOwner:'acct',history:[],today:{}}],activeUserId:'removed'},saveData:()=>true,renderAll(){},makeUser:()=>({id:'replacement',history:[],today:{}}),normalizeUser:u=>u};
  ctx.window=ctx;ctx.ironSixAccountScope='acct';ctx.addEventListener=()=>{};
  ctx.IronSixJournal={forget:id=>forgotten.push(id),flush:async()=>true};
  vm.createContext(ctx);
  let source=fs.readFileSync('cloud-sync.js','utf8')
    .replace('window.IronSixCloud={','window.IronSixCloud={__test:{pullProfiles,set:(c,s)=>{client=c;session=s}},')
    .replace('setInterval(()=>syncNow(false),30000);init();','');
  vm.runInContext(source,ctx);
  const client={from:()=>({select:()=>({eq:()=>({order:async()=>({data:rows,error:null})})})})};
  ctx.IronSixCloud.__test.set(client,{user:{id:'acct'}});
  return {ctx,forgotten};
}
test('cloud pull removes a deleted synced profile and keeps a new unsynced profile',async()=>{
  const {ctx,forgotten}=cloudApp([]);
  await ctx.IronSixCloud.__test.pullProfiles(0);
  assert.deepEqual(Array.from(ctx.data.users,u=>u.id),['new']);
  assert.equal(ctx.data.activeUserId,'new');
  assert.deepEqual(forgotten,['removed']);
});
test('deletion lock excludes overlapping deletion and resumes after failure',async()=>{
  const {ctx}=cloudApp([]);
  let release;const wait=new Promise(resolve=>release=resolve);
  const first=ctx.IronSixCloud.withProfileDeletion(()=>wait);
  await assert.rejects(ctx.IronSixCloud.withProfileDeletion(()=>true),/already in progress/);
  assert.equal(await ctx.IronSixCloud.syncNow(),false);
  release(true);assert.equal(await first,true);
  await assert.rejects(ctx.IronSixCloud.withProfileDeletion(()=>{throw Error('offline')}),/offline/);
  assert.equal(await ctx.IronSixCloud.withProfileDeletion(()=>true),true);
});
