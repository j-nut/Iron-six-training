const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

// Real timers are kept (only the 15 s interval is stubbed) so the timeout path is exercised for real.
function app(scope='account-a'){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.fetch=async()=>({ok:false,json:async()=>({})});w.setInterval=()=>0;
  w.addEventListener('error',e=>errors.push(e.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  vm.runInContext(fs.readFileSync('adaptive-insights.js','utf8'),context,{filename:'adaptive-insights.js'});
  w.ironSixAccountScope=scope;
  return {w,run:code=>vm.runInContext(code,context),errors,close:()=>dom.window.close()};
}
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
function okTransport(log){let sequence=0;return async event=>{log.push(event);return {sequence:++sequence,saved_at:new Date().toISOString()}}}
function type(w,input,text){for(let i=1;i<=text.length;i++){input.value=text.slice(0,i);input.dispatchEvent(new w.Event('input'))}}
const setEvents=j=>j.all().filter(e=>e.kind==='set');
const capture=(a,key,set)=>{const [ei,si]=key.split('-');a.run(`activeUser().today['${key}']=${JSON.stringify(set)};IronSixJournal.captureSet(activeUser(),finalWorkout(activeUser()),${ei},${si},activeUser().today['${key}'])`)};

test('an edit appended while a flush is in flight uploads in the same drain, not on the next interval',async()=>{
  const a=app(),j=a.w.IronSixJournal;await j.hydrated;
  const sent=[];let release;const gate=new Promise(r=>{release=r});let first=true;
  j.setTransport(async event=>{
    sent.push(event);
    if(first){first=false;await gate}
    return {sequence:sent.length,saved_at:new Date().toISOString()};
  });
  capture(a,'0-0',{weight:'100',reps:'5',done:true});
  const flushing=j.flush();
  await tick(5);
  // The first request is still hanging; the user logs another set meanwhile.
  capture(a,'0-1',{weight:'105',reps:'5',done:true});
  release();
  assert.equal(await flushing,true);
  assert.equal(j.pending().length,0,'late edit must be uploaded by the same flush');
  assert(sent.some(e=>e.row_key==='0-1'));
  a.close();
});

test('typing a multi-digit weight journals one event per committed value; local storage has every keystroke',async()=>{
  const a=app(),j=a.w.IronSixJournal;await j.hydrated;
  const sent=[];j.setTransport(okTransport(sent));
  const weight=a.w.document.querySelector('.weight');
  type(a.w,weight,'102.5');
  assert.equal(setEvents(j).length,1,'five keystrokes must not create five journal events');
  assert.equal(a.run("activeUser().today['0-0'].weight"),'102.5');
  const stored=Object.keys(a.w.localStorage).filter(k=>k.startsWith('ironSixEntry:')).map(k=>JSON.parse(a.w.localStorage.getItem(k))).filter(e=>e.kind==='set');
  assert.equal(stored.length,1);assert.equal(stored[0].weight_text,'102.5','latest keystroke is on disk immediately');
  assert.equal(await j.flush(),true);
  assert.equal(sent.filter(e=>e.kind==='set').length,1);
  assert.equal(sent.find(e=>e.kind==='set').weight_text,'102.5');
  // Anything already sent stays immutable: a later edit is a new append-only revision.
  type(a.w,weight,'105');
  assert.equal(setEvents(j).length,2);
  assert.equal(setEvents(j).filter(e=>e.sequence).length,1);
  assert.equal(setEvents(j).find(e=>e.sequence).weight_text,'102.5');
  // Marking done is a distinct state change and is never folded into a typing revision.
  a.w.document.querySelector('.reps').value='8';a.w.document.querySelector('.reps').dispatchEvent(new a.w.Event('input'));
  a.w.document.querySelector('.done').click();
  assert.equal(setEvents(j).at(-1).completed,true);
  assert(setEvents(j).some(e=>!e.completed&&e.reps_text==='8'));
  assert.deepEqual(a.errors,[]);a.close();
});

test('a hung transport times out, releases the queue, and later flushes upload everything',async()=>{
  const a=app(),j=a.w.IronSixJournal;await j.hydrated;
  j.setSendTimeout(40);
  capture(a,'0-0',{weight:'50',reps:'5',done:false});
  j.setTransport(()=>new Promise(()=>{}));
  const started=Date.now();
  assert.equal(await j.flush(),false);
  assert(Date.now()-started<2000,'flush must return after the timeout');
  assert.match(j.status().error,/did not respond/);
  const sent=[];j.setTransport(okTransport(sent));
  assert.equal(await j.flush(),true);
  assert.equal(j.pending().length,0);
  a.close();
});

test('a database-refused entry is quarantined locally and does not block later entries',async()=>{
  const a=app(),j=a.w.IronSixJournal;await j.hydrated;
  capture(a,'0-0',{weight:'1',reps:'5',done:false});
  capture(a,'0-1',{weight:'2',reps:'6',done:true});
  const calls=[];let sequence=0,refuse=true;
  j.setTransport(async event=>{
    calls.push(event.row_key);
    if(refuse&&event.row_key==='0-0'&&event.kind==='set')throw Object.assign(new Error('violates check constraint'),{code:'23514'});
    return {sequence:++sequence,saved_at:new Date().toISOString()};
  });
  assert.equal(await j.flush(),false);
  const pending=j.pending();
  assert.equal(pending.length,1,'only the refused entry remains');
  assert.equal(pending[0].row_key,'0-0');
  assert(calls.includes('0-1'),'later entries still uploaded');
  const status=j.status();assert.equal(status.failed,1);assert.match(status.message,/refused by the database/);
  assert.equal(setEvents(j).length,2,'the refused entry stays in the local journal');
  const before=calls.length;await j.flush();assert.equal(calls.length,before,'a refused entry is not retried automatically');
  refuse=false;assert.equal(await j.flush({retryFailed:true}),true);assert.equal(j.pending().length,0);
  a.close();
});

test('network-style errors still stop the flush and retry the same entry later',async()=>{
  const a=app(),j=a.w.IronSixJournal;await j.hydrated;
  capture(a,'0-0',{weight:'1',reps:'5',done:false});
  j.setTransport(async()=>{throw new TypeError('Failed to fetch')});
  assert.equal(await j.flush(),false);assert.equal(j.status().failed,0);assert(j.pending().length>=2);
  const sent=[];j.setTransport(okTransport(sent));
  assert.equal(await j.flush(),true);assert.equal(j.pending().length,0);
  a.close();
});

test('only the most recently completed set shows the feedback prompt; answers collapse to a chip',async()=>{
  const a=app();await a.w.IronSixJournal.hydrated;
  const doc=a.w.document,rows=()=>[...doc.querySelectorAll('.set-row')];
  async function complete(i){const row=rows()[i];row.querySelector('.weight').value='100';row.querySelector('.reps').value='8';row.querySelector('.done').click();await tick(10)}
  for(let i=0;i<3;i++)await complete(i);
  assert.equal(doc.querySelectorAll('.set-feedback').length,1,'one prompt after three completed sets');
  assert.equal(rows()[2].nextElementSibling.classList.contains('set-feedback'),true,'prompt sits under the newest set');
  rows()[2].nextElementSibling.querySelector('[data-set-feedback="easy"]').click();await tick(10);
  assert.equal(doc.querySelectorAll('.set-feedback').length,0);
  const chips=doc.querySelectorAll('.set-feedback-chip');assert.equal(chips.length,1);assert.match(chips[0].textContent,/Too easy/);
  assert.equal(a.run("activeUser().trainingFeedback.length"),1,'recorded feedback is kept');
  assert.equal(a.run("Object.values(activeUser().today).filter(s=>s.feedback==='easy').length"),1);
  await complete(3);
  assert.equal(doc.querySelectorAll('.set-feedback').length,1);assert.equal(doc.querySelectorAll('.set-feedback-chip').length,1);
  assert.equal(rows()[3].nextElementSibling.classList.contains('set-feedback'),true);
  assert.deepEqual(a.errors,[]);a.close();
});
