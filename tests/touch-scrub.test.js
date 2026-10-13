const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{
    url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true
  });
  const w=dom.window,ctx=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.scrollTo=()=>{};
  w.setInterval=()=>0;w.setTimeout=()=>0;w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0])
    .filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
    vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
  }
  vm.runInContext(fs.readFileSync('active-workout-clean.js','utf8'),ctx,{filename:'active-workout-clean.js'});
  vm.runInContext('renderAll();IronSixActiveWorkoutClean.apply()',ctx);
  w.document.getElementById('sessionBeginBtn').click();
  vm.runInContext('IronSixActiveWorkoutClean.apply()',ctx);
  return {w,run:code=>vm.runInContext(code,ctx),errors,close:()=>w.close()};
}

function pointer(win,el,type,y){
  const e=new win.Event(type,{bubbles:true,cancelable:true});
  for(const [k,v] of Object.entries({pointerType:'touch',isPrimary:true,pointerId:4,clientY:y,clientX:20}))
    Object.defineProperty(e,k,{value:v});
  el.dispatchEvent(e);
  return e;
}

function field(doc,kind){
  const card=doc.querySelector('#exerciseList .exercise:not(.sc-hidden)');
  const input=card.querySelector('input.'+kind);
  const overlay=input.closest('.awc-adjust-field')?.querySelector('.awc-touch-target');
  assert(overlay,'a separate, non-editable touch surface must cover '+kind);
  assert.equal(overlay.getAttribute('aria-hidden'),'true');
  assert.equal(overlay.tagName,'SPAN','touching a real input can prematurely open Android keyboard');
  return {input,overlay,card};
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

test('long press touches a non-editable element and never focuses the keyboard input',()=>{
  const a=app();
  try{
    const w=a.w,d=w.document,{input,overlay}=field(d,'weight');
    let arm=null,events=0;
    w.setTimeout=(fn,ms)=>{if(ms===380)arm=fn;return 101};
    input.addEventListener('input',()=>events++);
    const baseline=Number(input.value||0);
    const initiallySaved=a.run("activeUser().today['0-0']?.weight ?? null");
    const down=pointer(w,overlay,'pointerdown',300);
    assert(down.defaultPrevented,'native browser focus is blocked on touch down');
    assert.notEqual(d.activeElement,input,'IME must remain closed while holding');
    assert(arm,'hold must wait before activation');
    arm();
    assert.notEqual(d.activeElement,input,'IME must remain closed once scrub activates');
    assert(d.querySelector('.awc-scrub-value'),'floating live readout');
    pointer(w,overlay,'pointermove',260);
    assert.equal(Number(input.value),baseline+5);
    assert.equal(events,0,'no save on each move');
    assert.equal(a.run("activeUser().today['0-0']?.weight ?? null"),initiallySaved);
    pointer(w,overlay,'pointerup',260);
    assert.notEqual(d.activeElement,input,'releasing a scrub must not summon the IME');
    assert.equal(d.querySelector('.awc-scrub-value'),null);
    assert.equal(events,1,'one standard input event commits the change');
    assert.equal(Number(a.run("activeUser().today['0-0'].weight")),baseline+5);
    assert.strictEqual(input.isConnected,true);
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('quick tap focuses only upon release; reps scrub saves once',()=>{
  const a=app();
  try{
    const w=a.w,d=w.document,{input,overlay}=field(d,'reps');
    let arm=null;
    w.setTimeout=(fn,ms)=>{if(ms===380)arm=fn;return 202};
    pointer(w,overlay,'pointerdown',210);
    assert.notEqual(d.activeElement,input,'keyboard cannot open on touch down');
    pointer(w,overlay,'pointerup',210);
    assert.strictEqual(d.activeElement,input,'tap release activates ordinary typing');
    assert(d.body.classList.contains('ix-editing-set'),'bottom dock retracts while keyboard editing');
    input.blur();
    const start=Number(input.value||1);
    pointer(w,overlay,'pointerdown',210);
    arm();
    pointer(w,overlay,'pointermove',170);
    assert.equal(Number(input.value),start+2);
    pointer(w,overlay,'pointerup',170);
    assert.notEqual(d.activeElement,input,'hold must not refocus or launch keyboard');
    assert.equal(Number(a.run("activeUser().today['0-0'].reps")),start+2);
    assert.match(input.getAttribute('aria-description'),/Tap to type/);
    assert(d.querySelector('.awc-scrub-tip'));
  }finally{a.close()}
});

test('a cancelled or moved-before-hold gesture neither focuses input nor changes weight',()=>{
  const a=app();
  try{
    const w=a.w,d=w.document,{input,overlay}=field(d,'weight');
    let arm=null;w.setTimeout=(fn,ms)=>{if(ms===380)arm=fn;return 303};
    const value=input.value;
    pointer(w,overlay,'pointerdown',200);
    pointer(w,overlay,'pointermove',145);
    arm();
    pointer(w,overlay,'pointerup',145);
    assert.equal(input.value,value);
    assert.notEqual(d.activeElement,input);
    pointer(w,overlay,'pointerdown',200);
    pointer(w,overlay,'pointercancel',200);
    assert.notEqual(d.activeElement,input);
    assert.equal(d.querySelector('.awc-scrub-value'),null);
  }finally{a.close()}
});

test('editing mode retracts and restores the floating dock, unlike a hold',()=>{
  const a=app();
  try{
    const w=a.w,d=w.document,{input,overlay}=field(d,'reps');
    w.setTimeout=(fn,ms)=>{if(ms===0)fn();return 404};
    pointer(w,overlay,'pointerdown',220);
    assert(!d.body.classList.contains('ix-editing-set'));
    pointer(w,overlay,'pointerup',220);
    assert(d.body.classList.contains('ix-editing-set'));
    input.blur();
    assert(!d.body.classList.contains('ix-editing-set'));
    const css=fs.readFileSync('workout-polish.css','utf8');
    assert(css.includes('body.ix-editing-set .bottom-nav'));
    assert(css.includes('pointer-events:none!important'));
  }finally{a.close()}
});
