const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

test('Studio cannot override native Android status-bar clearance',()=>{
  const css=fs.readFileSync('studio-ui.css','utf8');
  const runtime=fs.readFileSync('native/runtime.mjs','utf8');
  const rule='.iron-six-native body.ix-studio .app';
  assert(css.includes('body.ix-studio .app{position:relative;'),
    'the current Studio theme is still installed');
  assert(css.includes(rule+'{\n  padding-top:calc(24px + var(--app-safe-top,28px))!important;'),
    'native tablet/desktop Studio padding must include actual top inset');
  assert(css.includes(rule+'{\n    padding-top:calc(16px + var(--app-safe-top,28px))!important;'),
    'native phone Studio padding must include actual top inset');
  assert(css.lastIndexOf(rule)>css.lastIndexOf('body.ix-studio .app{padding:15px'),
    'native safe-area fix must come after Studio phone padding override');
  assert.match(runtime,/--app-safe-top:max\(env\(safe-area-inset-top,0px\),var\(--safe-area-inset-top,28px\),24px\)/,
    'WebView must reserve a minimum status bar inset even when Android initially reports zero');
  const java=fs.readFileSync('android/app/src/main/java/com/ironsix/training/MainActivity.java','utf8');
  assert(java.includes('WindowInsetsCompat.Type.statusBars()'));
  assert(java.includes('ViewCompat.requestApplyInsets(decor)'));
});

test('prestart / hidden guided-navigation cannot override sc-hidden with display:grid',()=>{
  const css=fs.readFileSync('studio-ui.css','utf8');
  assert(css.includes('body.ix-studio .app #sessionCardNav{'),
    'Studio nav design exists');
  const rule='body.ix-studio .app #sessionCardNav.sc-hidden{\n  display:none!important;';
  assert(css.includes(rule),
    'hidden navigator must override the Studio grid (same specificity plus sc-hidden)');
  assert(css.lastIndexOf(rule)>css.lastIndexOf('display:grid!important'),
    'hidden override must be declared after the Studio grid');
});

test('guided workout navigator is hidden before Begin and while switching modes',()=>{
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{
    url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true
  });
  try{
    const w=dom.window,ctx=dom.getInternalVMContext(),doc=w.document;
    w.confirm=()=>true;w.scrollTo=()=>{};w.setInterval=()=>0;w.setTimeout=()=>0;
    w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.fetch=async()=>({ok:false,json:async()=>({})});
    for(const file of [...doc.scripts].map(s=>s.getAttribute('src').split('?')[0])
      .filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
      vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
    vm.runInContext('renderAll();IronSixStudio.apply()',ctx);
    let nav=doc.getElementById('sessionCardNav');
    assert(nav,'guided nav must exist even before starting for fast transition');
    assert(nav.classList.contains('sc-hidden'),
      'prestart should fully hide the navigator, never place it above the bottom dock');
    doc.getElementById('sessionBeginBtn').click();
    assert(!nav.classList.contains('sc-hidden'),'only Begin should reveal navigation');
    vm.runInContext("activeUser().trainingMode='circuit';renderAll()",ctx);
    assert(nav.classList.contains('sc-hidden'),'circuit mode must not display guided nav');
  }finally{dom.window.close()}
});
