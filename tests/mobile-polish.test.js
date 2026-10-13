const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{
    url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true
  });
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.scrollTo=()=>{};
  w.setInterval=()=>0;w.setTimeout=()=>0;w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0])
    .filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  // Native and web use the same dynamically loaded focused-workout presentation.
  vm.runInContext(fs.readFileSync('active-workout-clean.js','utf8'),context,{filename:'active-workout-clean.js'});
  vm.runInContext('renderAll();IronSixActiveWorkoutClean.apply()',context);
  return {w,run:code=>vm.runInContext(code,context),errors,close:()=>dom.window.close()};
}

test('focused workout uses a full-width accessible exercise title and a collapsed form guide',()=>{
  const a=app();
  try{
    const d=a.w.document;
    d.getElementById('sessionBeginBtn').click();
    a.run('IronSixActiveWorkoutClean.apply()');
    const list=d.getElementById('exerciseList'),card=d.querySelector('.exercise:not(.sc-hidden)');
    assert(list.classList.contains('awc-focus'));
    const title=card.querySelector('.exercise-name-link');
    assert(title?.textContent.trim(),'card must retain a readable full exercise title');
    assert.equal(title.closest('.exercise-head').parentElement,card);
    assert(card.querySelector('.suggestion strong')?.textContent.trim());
    const guide=[...card.children].find(node=>node.classList.contains('awc-form-guide'));
    assert(guide,'form guide needs a dedicated disclosure');
    assert.equal(guide.tagName,'DETAILS');
    assert.equal(guide.open,false,'large image must not dominate first viewport');
    assert(guide.querySelector('summary')?.textContent.includes('Exercise form guide'));
    assert(guide.querySelector('.exercise-media, .exercise-media-missing'),
      'existing exercise art remains accessible');
    assert(guide.querySelector('.exercise-media')?.getAttribute('data-exercise-name')!==undefined||
      guide.querySelector('.exercise-media-missing'),'form-art mapping should not be lost');
    const weight=card.querySelector('.weight');weight.value='42.5';
    weight.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    a.run('IronSixActiveWorkoutClean.apply()');
    assert.strictEqual(card.querySelector('.weight'),weight,
      'styling must never replace the set-logging input during progress changes');
    guide.open=true;
    a.run('IronSixActiveWorkoutClean.apply()');
    assert.equal(guide.open,true,'opening the guide must survive focus UI updates');
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('layout stylesheet and Android native bundle carry mobile polish and safe-area support',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert(html.includes('workout-polish.css?v=1'));
  const build=fs.readFileSync('scripts/build-android-web.mjs','utf8');
  assert(build.includes("'workout-polish.css'"));
  const css=fs.readFileSync('workout-polish.css','utf8');
  assert(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'));
  assert(css.includes('.awc-form-guide'));
  assert(css.includes('var(--app-safe-top,0px)'));
  assert(css.includes('@media(max-width:380px)'));
  const java=fs.readFileSync('android/app/src/main/java/com/ironsix/training/MainActivity.java','utf8');
  for(const keyword of ['WindowInsetsCompat.Type.statusBars()','WindowInsetsCompat.Type.navigationBars()',
    '--safe-area-inset-top','--safe-area-inset-bottom','ViewCompat.requestApplyInsets'])assert(java.includes(keyword));
  const runtime=fs.readFileSync('native/runtime.mjs','utf8');
  assert(runtime.includes('var(--safe-area-inset-top,28px)'));
});
