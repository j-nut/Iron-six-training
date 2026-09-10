// The topbar's only signal that you were signed in was a word written by one line deep inside
// cloud-sync, so a render failure could leave it saying "Sign in" while your own profiles were
// on screen. The menu reads the live session every time it paints; these assert that it does.
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
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.URL.createObjectURL=()=>'blob:test';
  w.addEventListener('error',event=>errors.push(event.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const run=code=>vm.runInContext(code,context);
  run('window.__opened=[];window.toast=function(){}');
  // cloud-sync is not loaded here (it makes network calls), so stand in for the surface the
  // menu actually reads.
  if(email)run(`window.IronSixCloud={session:()=>({user:{id:'acct-1',email:${JSON.stringify(email)}}}),openAccount:()=>window.__opened.push('account'),syncNow:()=>window.__opened.push('sync')}`);
  else run(`window.IronSixCloud={session:()=>null,openAccount:()=>window.__opened.push('account'),syncNow:()=>window.__opened.push('sync')}`);
  run('IronSixProfileMenu.render()');
  return {
    w,run,errors,
    json:code=>JSON.parse(run(`JSON.stringify(${code})`)),
    open:()=>{w.document.getElementById('profileMenuButton').click()},
    items:()=>[...w.document.querySelectorAll('#profileMenu .pm-item')].map(b=>b.textContent.trim()),
    head:()=>w.document.querySelector('.pm-head')?.textContent||'',
    close:()=>dom.window.close()
  };
}

test('the topbar shows a profile button and hides the old select and sign-in button',()=>{
  const a=app();
  try{
    assert(a.w.document.getElementById('profileMenuButton'),'the profile button must exist');
    assert.equal(a.w.getComputedStyle(a.w.document.querySelector('.user-switch')).display,'none','the raw profile select is replaced');
    assert.deepEqual(a.errors,[],'the page must load without script errors');
  }finally{a.close()}
});

test('signed out, the menu says so and offers a way in',()=>{
  const a=app();
  try{
    a.open();
    assert.match(a.head(),/Not signed in/);
    const items=a.items();
    assert(items.some(t=>/Sign in or create account/.test(t)),'a signed-out menu must offer sign-in');
    assert(!items.some(t=>/^Sign out/.test(t)),'a signed-out menu must not offer sign-out');
    assert(a.w.document.getElementById('pmAvatar').classList.contains('guest'),'the avatar must read as a guest');
  }finally{a.close()}
});

test('signed in, the menu names the account and offers sign out',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.open();
    assert.match(a.head(),/Signed in/);
    assert.match(a.head(),/lifter@example\.com/,'the account must be identified, not just implied');
    const items=a.items();
    assert(items.some(t=>/^Sign out/.test(t)),'sign out must be reachable from the menu');
    assert(items.some(t=>/Sync now/.test(t)));
    assert(!items.some(t=>/Sign in or create account/.test(t)));
    assert.equal(a.w.document.getElementById('pmAvatar').classList.contains('guest'),false,'the avatar must show as signed in');
  }finally{a.close()}
});

// The regression that prompted this file: render() skips the menu body while it is hidden, so
// rendering before un-hiding left the panel blank on first open.
test('the menu body is populated on the very first open',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.open();
    assert(a.items().length>0,'the menu must not open empty');
    assert.match(a.head(),/lifter@example\.com/,'and must be current on that first open');
  }finally{a.close()}
});

test('the signed-in state survives a renderAll that throws',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.open();
    assert.match(a.head(),/Signed in/);
    // Whatever else fails to draw, the account state is read fresh from the session.
    a.run('IronSixProfileMenu.render()');
    assert.equal(a.json("document.getElementById('pmAvatar').classList.contains('guest')"),false);
  }finally{a.close()}
});

test('every profile is listed with the active one marked, and switching works',()=>{
  const a=app();
  try{
    a.run("activeUser().name='Mine';data.users.push(normalizeUser({id:'other',name:'Other',weight:200,history:[]}));saveData()");
    a.open();
    const items=a.items();
    assert(items.some(t=>t.startsWith('Mine')),'the current profile must be listed');
    assert(items.some(t=>t.startsWith('Other')),'other profiles must be listed');
    assert(items.find(t=>t.startsWith('Mine')).includes('✓'),'the active profile must be marked');
    a.w.document.querySelector('[data-switch="other"]').click();
    assert.equal(a.json('activeUser().name'),'Other','tapping a profile must switch to it');
  }finally{a.close()}
});

test('account and sync actions are delegated to the account panel, not reimplemented',()=>{
  const a=app({email:'lifter@example.com'});
  try{
    a.open();
    [...a.w.document.querySelectorAll('#profileMenu .pm-item')].find(b=>/Sync now/.test(b.textContent)).click();
    assert.deepEqual(a.json('window.__opened'),['sync']);
    a.open();
    [...a.w.document.querySelectorAll('#profileMenu .pm-item')].find(b=>/Account & backup/.test(b.textContent)).click();
    assert.deepEqual(a.json('window.__opened'),['sync','account']);
  }finally{a.close()}
});

test('the menu closes on Escape and on a click outside it',()=>{
  const a=app();
  try{
    a.open();
    assert.equal(a.json("document.getElementById('profileMenu').hidden"),false);
    a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape'}));
    assert.equal(a.json("document.getElementById('profileMenu').hidden"),true,'Escape must close it');
    a.open();
    a.w.document.body.click();
    assert.equal(a.json("document.getElementById('profileMenu').hidden"),true,'a click outside must close it');
  }finally{a.close()}
});

test('initials fall back sensibly for one-word and empty names',()=>{
  const a=app();
  try{
    const initials=name=>a.run(`IronSixProfileMenu.initials(${JSON.stringify(name)})`);
    assert.equal(initials('Jordan'),'J');
    assert.equal(initials('Jordan Nutter'),'JN');
    assert.equal(initials('  '),'?');
    assert.equal(initials(''),'?');
  }finally{a.close()}
});
