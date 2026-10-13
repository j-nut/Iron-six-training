const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{
    url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true
  });
  const w=dom.window,ctx=dom.getInternalVMContext();
  w.confirm=()=>true;w.scrollTo=()=>{};
  w.setInterval=()=>0;w.setTimeout=()=>0;w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.fetch=async()=>({ok:false,json:async()=>({})});
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0])
    .filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
    vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
  }
  vm.runInContext(fs.readFileSync('active-workout-clean.js','utf8'),ctx,{filename:'active-workout-clean.js'});
  vm.runInContext('renderAll();IronSixActiveWorkoutClean.apply()',ctx);
  w.document.getElementById('sessionBeginBtn').click();
  vm.runInContext('IronSixActiveWorkoutClean.apply()',ctx);
  return {w,run:code=>vm.runInContext(code,ctx),close:()=>w.close()};
}

function pointer(win,el,type,y){
  const e=new win.Event(type,{bubbles:true,cancelable:true});
  for(const [k,v] of Object.entries({pointerType:'touch',isPrimary:true,pointerId:4,clientY:y,clientX:20}))
    Object.defineProperty(e,k,{value:v});
  el.dispatchEvent(e);
  return e;
}

test('scrub helper applies natural increments and clamps safe ranges',()=>{
  const a=app();
  try{
    const fn=a.w.IronSixActiveWorkoutClean.scrubValue;
    assert.equal(fn('30',2,'weight'),35);
    assert.equal(fn('32.5',-3,'weight'),25);
    assert.equal(fn('13',2,'reps'),15);
    assert.equal(fn('2',-99,'reps'),1);
    assert.equal(fn('0',-10,'weight'),0);
    assert.equal(fn('200',40,'reps'),200);
    assert.equal(fn('2000',4,'weight'),2000);
  }finally{a.close()}
});

test('long-press vertical drag updates weight without syncing until touch release',()=>{
  const a=app();
  try{
    const w=a.w,d=w.document;
    const card=d.querySelector('#exerciseList .exercise:not(.sc-hidden)');
    const weight=card.querySelector('input.weight');
    assert(weight);
    let timerFn=null,events=0;
    w.setTimeout=(fn,ms)=>{if(ms===380)timerFn=fn;return 101};
    weight.addEventListener('input',()=>events++);
    const baseline=Number(weight.value||0);
    const initialSaved=a.run("activeUser().today['0-0']?.weight ?? null");
    const down=pointer(w,weight,'pointerdown',300);
    assert.equal(down.defaultPrevented,true,'avoid opening keyboard while waiting to scrub');
    assert(timerFn,'long-press must arm after a deliberate delay');
    timerFn();
    assert(d.querySelector('.awc-scrub-value'),'visible live readout');
    pointer(w,weight,'pointermove',260);
    assert.equal(Number(weight.value),baseline+5,'40px upwards increases by 5 lb');
    assert.equal(events,0,'do not generate an input event on each drag frame');
    assert.equal(a.run("activeUser().today['0-0']?.weight ?? null"),initialSaved,
      'draft is unchanged until release');
    pointer(w,weight,'pointerup',260);
    assert.equal(d.querySelector('.awc-scrub-value'),null,'release hides indicator');
    assert.equal(events,1,'single standard input event persists the adjustment');
    assert.equal(Number(a.run("activeUser().today['0-0'].weight")),baseline+5);
    assert.equal(weight.isConnected,true,'logging must not remount a card');
  }finally{a.close()}
});

test('quick tap retains typing and rep scrubs advance by one rep per stop',()=>{
  const a=app();
  try{
    const w=a.w,d=w.document,rep=d.querySelector('#exerciseList .exercise:not(.sc-hidden) input.reps');
    w.setTimeout=()=>202;
    pointer(w,rep,'pointerdown',210);
    pointer(w,rep,'pointerup',210);
    assert.strictEqual(d.activeElement,rep,'ordinary tap should focus the input');
    rep.blur();
    let arm;
    w.setTimeout=(fn,ms)=>{if(ms===380)arm=fn;return 203};
    const start=Number(rep.value||1);
    pointer(w,rep,'pointerdown',210);arm();pointer(w,rep,'pointermove',170);
    assert.equal(Number(rep.value),start+2);
    pointer(w,rep,'pointerup',170);
    assert.equal(Number(a.run("activeUser().today['0-0'].reps")),start+2);
    assert.match(rep.getAttribute('aria-description'),/Tap to type/);
    assert(d.querySelector('.awc-scrub-tip'));
  }finally{a.close()}
});
