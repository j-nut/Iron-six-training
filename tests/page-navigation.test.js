const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

function app(){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://iron-six.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,context=dom.getInternalVMContext(),errors=[];
  w.confirm=()=>true;w.setInterval=()=>0;w.setTimeout=()=>0;w.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async()=>({ok:false,json:async()=>({})});
  w.addEventListener('error',event=>errors.push(event.error));
  const run=code=>vm.runInContext(code,context);
  for(const file of [...w.document.scripts].map(s=>s.getAttribute('src').split('?')[0]).filter(x=>!['cloud-sync.js','cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  for(const file of ['adaptive-insights.js','trainer-intelligence-v2.js','program-intelligence-v3.js','progress-analytics-v2.js'])
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  run('renderAll();IronSixUIShell.apply()');
  return {w,run,errors,close:()=>w.close()};
}

test('each labeled navigation button opens its view and announces the current destination',()=>{
  const a=app();try{
    const d=a.w.document;
    for(const id of ['today','coach','plan','history','profiles']){
      const button=d.querySelector(`.navbtn[data-view="${id}"]`);
      assert(button.querySelector('svg[aria-hidden="true"]'));
      assert(button.querySelector('span').textContent.trim());
      button.click();
      assert.equal(d.querySelector('.view.active').id,id);
      assert.equal(d.querySelectorAll('.navbtn[aria-current="page"]').length,1);
      assert.equal(button.getAttribute('aria-current'),'page');
    }
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});

test('the Plan outlook uses the scheduler after a manual routine change and summary uses the actual prescription',()=>{
  const a=app();try{
    a.run("chooseWorkout('upper_specialization');renderAll()");
    const expected=JSON.parse(a.run('JSON.stringify({today:WORKOUT_META[activeUser().program.currentWorkoutKey].name,next:WORKOUT_META[nextWorkoutKey(activeUser())].name,exercises:finalWorkout(activeUser()).length,sets:finalWorkout(activeUser()).reduce((n,e)=>n+e.sets,0)})'));
    const d=a.w.document;
    assert.deepEqual([...d.querySelectorAll('.pr-schedule-card h3')].map(x=>x.textContent),[expected.today,expected.next]);
    assert.equal(d.querySelector('[data-summary="exercises"]').textContent,String(expected.exercises));
    assert.equal(d.querySelector('[data-summary="sets"]').textContent,String(expected.sets));
    assert(d.getElementById('sessionBeginBtn').isConnected);
    assert(d.querySelector('.pr-plan-current').compareDocumentPosition(d.getElementById('planSignals')) & a.w.Node.DOCUMENT_POSITION_FOLLOWING);
  }finally{a.close()}
});

test('History puts logs before optional analytics without losing the filters or freshness content',()=>{
  const a=app();try{
    const d=a.w.document,h=d.getElementById('history');
    assert.equal(h.querySelector('.hero').nextElementSibling,d.getElementById('historyList').closest('.section'));
    for(const id of ['historySearch','historyRange','historyExercise','historyMode','historyExport'])assert(d.getElementById(id).isConnected);
    for(const id of ['progressInsights','recoveryInsights']){
      const details=d.getElementById(id+'Disclosure');
      assert.equal(details.open,false);details.open=true;
      assert.equal(d.getElementById(id).parentElement,details);
    }
    a.run('renderAll();IronSixUIShell.apply()');
    assert.equal(d.getElementById('progressInsightsDisclosure').open,true,'an update preserves disclosure choice');
    assert.equal(d.querySelectorAll('#progressInsights').length,1);
  }finally{a.close()}
});

test('profile groups keep labeled editable fields and saving still updates the active profile',()=>{
  const a=app();try{
    const d=a.w.document;
    for(const id of ['profileName','bodyWeight','age','heightIn','trainingLevel','benchBest','dumbbellMax','barbellMax']){
      const field=d.getElementById(id);
      assert(field.closest('fieldset')?.querySelector('legend'));
      assert(d.querySelector(`label[for="${id}"]`));
    }
    d.getElementById('profileName').value='Premium test';
    d.getElementById('saveProfile').click();
    assert.equal(a.run('activeUser().name'),'Premium test');
    assert.equal(d.getElementById('profileName').value,'Premium test');
    assert.deepEqual(a.errors,[]);
  }finally{a.close()}
});
