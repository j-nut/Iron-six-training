const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

test('a single shared mobile design pass reaches all five pages with safe breakpoints',()=>{
  const css=fs.readFileSync('workout-polish.css','utf8');
  for(const part of ['--ix-canvas','--ix-surface','--ix-line','--ix-ink',
    '.pr-page-hero h1','.shell-toggle','.sc-progress-track','.pr-schedule-card',
    '.history-item','.pr-profile-group','.bottom-nav','.awc-adjust-field',
    '.awc-touch-target','@media(max-width:520px)','@media(max-width:350px)',
    '@media(prefers-reduced-motion:reduce)']){
    assert(css.includes(part),'missing shared design token or view style: '+part);
  }
  assert(css.includes('var(--accent)'), 'user-selected accent color must remain theme driven');
  assert(css.includes('touch-action:none'), 'touch scrub must not trigger scroll gesture');
  assert(css.includes('pointer:fine'), 'mouse users should get the actual editable field');
});

test('live workout progress bar updates when sets are marked complete',()=>{
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{
    url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true
  });
  try{
    const w=dom.window,context=dom.getInternalVMContext();
    w.confirm=()=>true;w.setInterval=()=>0;w.setTimeout=()=>0;w.scrollTo=()=>{};
    w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.fetch=async()=>({ok:false,json:async()=>({})});
    for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0])
      .filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x))){
      vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
    }
    vm.runInContext('renderAll()',context);
    w.document.getElementById('sessionBeginBtn').click();
    const nav=w.document.getElementById('sessionCardNav');
    const track=nav.querySelector('.sc-progress-track');
    assert(track);
    assert.equal(track.getAttribute('role'),'progressbar');
    assert.equal(track.getAttribute('aria-valuenow'),'0');
    const max=Number(track.getAttribute('aria-valuemax'));
    assert(max>0);
    const first=w.document.querySelector('.exercise:not(.sc-hidden) .done');
    first.click();
    assert.equal(track.getAttribute('aria-valuenow'),'1');
    assert(Math.abs(parseFloat(track.querySelector('.sc-progress-fill').style.width)-100/max)<0.0001);
    const label=nav.querySelector('#scNext')?.textContent;
    assert(label.startsWith('Up next:'));
    assert(!/^\d+\/\d+ sets/.test(label),'set count must not be duplicated in subtitle');
  }finally{dom.window.close()}
});
