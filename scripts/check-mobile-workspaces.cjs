/* Release acceptance against the real app, with isolated sample data and no external services. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'artifacts/mobile-qa');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json'};
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(404,{'Content-Type':'application/json'});return res.end('{}');}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'':data);});
});
let browser;
async function seed(page){
  await page.evaluate(async()=>{
    await window.IronSixJournal?.hydrated;
    const u=activeUser();
    IronSixOnboarding.snooze(u.id);IronSixOnboarding.close();
    u.name='Release QA';u.workoutMinutes=45;u.trainingMode='traditional';u.today={};u.workoutDraft=null;
    u.program.currentWorkoutKey='push_a';u.equipment={dumbbells:true,bench:true};
    u.capacities={dumbbellMax:50,barbellMax:300,dumbbellWeights:[5,10,15,20,25,30,40,50]};
    u.preferences={music:false,sounds:false,camera:false,voice:false};
    const sample=(days,weight,reps)=>({ts:Date.now()-days*864e5,name:'Push A',date:'Sample session',sets:3,plannedSets:3,duration:45,elapsedMinutes:35,trainingMode:'traditional',details:[{name:'Dumbbell Bench Press',base:'Horizontal press',prescription:'3 × 8–12',sets:Array.from({length:3},()=>({done:true,weight:String(weight),reps:String(reps),rir:'2'}))}]});
    u.history=[sample(1,40,10),sample(5,40,8),sample(8,30,10),sample(15,30,8)];
    saveData();renderAll();IronSixSessionCards.reset();
  });
}
async function metrics(page,view,selector){
  return page.evaluate(({view,selector})=>{
    const element=document.querySelector(selector),rect=element?.getBoundingClientRect(),nav=document.querySelector('.bottom-nav').getBoundingClientRect();
    return {view,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,primary:rect?{top:Math.round(rect.top),bottom:Math.round(rect.bottom),left:Math.round(rect.left),right:Math.round(rect.right)}:null,navTop:Math.round(nav.top)};
  },{view,selector});
}
async function screenshot(page,name,log=false){
  const bytes=await page.screenshot({path:path.join(output,name+'.jpg'),type:'jpeg',quality:65});
  if(log)console.log('IRON_SIX_QA_IMAGE '+name+' '+bytes.toString('base64'));
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.IronSixActiveWorkoutClean&&window.IronSixSetCoachFeedback&&window.IronSixInsights);
  for(const [width,height] of [[390,844],[360,800],[320,740]]){
    await page.setViewportSize({width,height});await seed(page);
    // Simulate the native inset contract; a physical-device check is still distinct.
    await page.evaluate(()=>{document.documentElement.classList.add('iron-six-native');document.documentElement.style.setProperty('--app-safe-top','28px');document.documentElement.style.setProperty('--app-safe-bottom','24px');});
    for(const [view,selector] of [['plan','#planOpenWorkout'],['history','.history-record'],['today','.sc-set-focus .sc-next-set']]){
      await page.evaluate(v=>showView(v),view);
      if(view==='today')await page.locator('#sessionBeginBtn').click();
      await page.waitForTimeout(120);
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      const m=await metrics(page,view,selector);console.log('IRON_SIX_QA_LAYOUT '+JSON.stringify(m));
      await screenshot(page,view+'-'+width,width===390);
      assert(!m.overflow,'Horizontal overflow: '+JSON.stringify(m));
      assert(m.primary&&m.primary.top>=0&&m.primary.bottom<=m.navTop-4,'Primary content requires scrolling or overlaps navigation: '+JSON.stringify(m));
      if(view==='today')assert.equal(await page.locator('.sc-set-focus .set-row:visible').count(),1);
    }
    const row=page.locator('.sc-set-focus .set-row:visible');
    const weight=row.locator('.weight'),reps=row.locator('.reps');
    await weight.fill('30');await reps.fill('8');await row.locator('.rir').selectOption('1');
    await row.locator('.done').click();
    await page.locator('.sc-set-focus [data-set-feedback="hard"]:visible').click();
    assert.equal(await page.evaluate(()=>activeUser().today['0-0'].done),true);
    assert.equal(await page.evaluate(()=>activeUser().today['0-0'].feedback),'hard');
    await page.locator('.sc-set-focus .sc-next-set').click();
    assert.equal(await page.locator('.sc-set-focus .set-row:visible').count(),1);
    assert.equal(await page.locator('.sc-set-focus .set-feedback:visible').count(),0,'Previous set feedback must leave the working area');
    const loads=await page.locator('.sc-set-focus .set-row .weight').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean).map(Number));
    assert(loads.every(w=>[0,5,10,15,20,25,30,40,50].includes(w)),'A missing dumbbell size was prescribed');
    await page.locator('.sc-set-focus .sc-set-choice').first().click();await page.locator('.sc-set-focus .set-row:visible .done').click();
    assert.equal(await page.evaluate(()=>activeUser().today['0-0'].done),false,'Undo must retain its save path');
    // Reduced keyboard viewport: allow scrolling, keep the focused input reachable.
    await page.setViewportSize({width,height:460});await page.locator('.sc-set-focus .set-row:visible .weight').focus();
    await page.waitForTimeout(40);
    assert(await page.evaluate(()=>document.body.classList.contains('ix-editing-set')),'Keyboard editing state missing');
    assert(!(await metrics(page,'keyboard','.sc-set-focus .set-row:not(.sc-set-hidden)')).overflow);
    await page.locator('.sc-set-focus .set-row:visible .weight').blur();
    await page.setViewportSize({width,height});
    await page.evaluate(()=>showView('history'));
    const before=await page.locator('#historyHighlights').innerText();
    await page.locator('.history-filters>summary').click();await page.locator('#historySearch').fill('no matching workout');
    assert.equal(await page.locator('#historyHighlights').innerText(),before);
    await page.locator('#historyClear').click();
    // Enlarge all computed text without compounding descendant scaling.
    await page.evaluate(()=>{const sizes=[...document.querySelectorAll('#history *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);for(const [n,size]of sizes)n.style.fontSize=(size*1.5)+'px';});
    assert(!(await metrics(page,'larger-text','.history-record')).overflow,'Enlarged history text overflows horizontally');
    await screenshot(page,'history-large-text-'+width);
    // Remove the enlargement before the next viewport.
    await page.evaluate(()=>document.querySelectorAll('#history *').forEach(n=>n.style.removeProperty('font-size')));
  }
  assert.deepEqual(errors,[],'Uncaught browser errors');
  console.log('IRON_SIX_QA_PASS mobile layouts, set feedback, logging/undo, available loads, filters, keyboard state and larger text');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
