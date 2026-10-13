const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function createApp(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{
    url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true
  });
  const w=dom.window,ctx=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.scrollTo=()=>{};
  w.setInterval=()=>0;w.setTimeout=()=>0;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',ev=>errors.push(ev.error));
  for(const src of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0])
     .filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(src,'utf8'),ctx,{filename:src});
  vm.runInContext('renderAll();IronSixStudio.apply()',ctx);
  return {w,ctx,errors,run:code=>vm.runInContext(code,ctx),close:()=>w.close()};
}

test('Studio design is active on the real web entrypoint and copied into the native Android bundle',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/<body class="ix-studio">/);
  assert(html.includes('href="studio-ui.css?v=3"'));
  assert(html.includes('src="studio-ui.js?v=3"'));
  const android=fs.readFileSync('scripts/build-android-web.mjs','utf8');
  assert(android.includes("'studio-ui.css'"));
  const css=fs.readFileSync('studio-ui.css','utf8');
  for(const token of ['--ix-panel','--ix-edge','--ix-type',
      '#exerciseList.awc-focus','#sessionCardNav','.ix-set-summary',
      '.pr-schedule-card','.coach-msg','.history-item',
      '.pr-profile-group','.bottom-nav','ix-editing-set',
      '@media(max-width:520px)','@media(max-width:375px)','@media(prefers-reduced-motion:reduce)'])
    assert(css.includes(token),`Missing shared design detail: ${token}`);
  assert(css.includes('var(--accent)'), 'keep all user theme accents');
});

test('the running workout receives the new hierarchy without changing input identities or values',()=>{
  const a=createApp();
  try{
    const d=a.w.document,begin=d.getElementById('sessionBeginBtn');
    assert(begin,'pre-session launch remains connected');
    begin.click();
    a.run('IronSixStudio.apply()');
    const card=d.querySelector('#exerciseList [data-exercise-index]:not(.sc-hidden)');
    assert(card,'an exercise is visible after beginning');
    const title=card.querySelector('.exercise-name-link'),kicker=card.querySelector('.ix-movement-index');
    assert(title?.textContent.trim(),'exercise title remains readable');
    assert.match(kicker.textContent,/^MOVEMENT 0[1-9] \/ 0[1-9]/);
    const headers=card.querySelectorAll('.ix-set-summary');
    assert.equal(headers.length,1);
    assert.equal(headers[0].textContent.includes('Working sets'),true);
    const input=card.querySelector('input.weight');
    assert(input,'weight input remains');
    const original=input.value;
    a.run('IronSixStudio.apply();IronSixStudio.apply()');
    assert.strictEqual(card.querySelector('input.weight'),input,'Studio must not remount inputs');
    assert.equal(input.value,original,'Studio must not alter prescribed values');
    assert.equal(card.querySelectorAll('.ix-movement-index').length,1);
    assert.equal(card.querySelectorAll('.ix-set-summary').length,1);
    input.value='37.5';
    input.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    assert.equal(a.run("activeUser().today['0-0'].weight"),'37.5');
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('Studio additions remain safe when switching across every destination',()=>{
  const a=createApp();
  try{
    const d=a.w.document;
    for(const id of ['today','coach','plan','history','profiles']){
      const button=d.querySelector('.navbtn[data-view="'+id+'"]');
      assert(button,'missing navigation: '+id);
      button.click();
      a.run('IronSixStudio.apply()');
      assert.equal(d.querySelector('.view.active').id,id);
      assert(button.getAttribute('aria-label')?.length>0);
    }
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('the standalone design preview uses sample-only interactions and five app destinations',()=>{
  const preview=fs.readFileSync('studio-preview.html','utf8');
  assert(preview.includes('Illustrative workout data only'));
  for(const v of ['today','coach','plan','history','profiles']){
    assert(preview.includes('id="'+v+'"'));
    assert(preview.includes('data-preview-view="'+v+'"'));
  }
  const dom=new JSDOM(preview,{url:'https://iron-six.test/studio-preview.html',runScripts:'dangerously'});
  try{
    dom.window.scrollTo=()=>{}; // jsdom has no real viewport scroll
    const d=dom.window.document;
    assert.equal(d.querySelector('#today').classList.contains('active'),true);
    d.querySelector('[data-preview-view="plan"]').click();
    assert.equal(d.querySelector('#plan').classList.contains('active'),true);
    d.querySelector('[data-preview-view="today"]').click();
    d.querySelector('#today .done').click();
    assert.equal(d.getElementById('doneCounter').textContent,'1/3');
    assert.equal(d.querySelector('.sc-progress-track').getAttribute('aria-valuenow'),'1');
  }finally{dom.window.close()}
});
