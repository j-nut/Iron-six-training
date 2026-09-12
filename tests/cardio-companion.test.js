const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function app(){
 const dom=new JSDOM('<section id="today"></section>',{url:'https://iron-six.test',runScripts:'outside-only'}),w=dom.window;
 let user={id:'a',program:{currentWorkoutKey:'push_a'},today:{'0-0':{done:true}},history:[{id:'strength'}],draft:{name:'preserved'}};
 w.activeUser=()=>user;w.renderAll=()=>{};w.saveData=()=>true;w.nextWorkoutKey=()=> 'pull_a';
 w.eval(fs.readFileSync('cardio-companion.js','utf8'));
 return {w,api:w.IronSixCardio,get user(){return user},setUser:u=>{user=u},close:()=>dom.window.close()};
}
const now=Date.parse('2026-09-12T15:00:00Z');
const entry=(id='e',extra={})=>({id,mode:'run',minutes:25,intensity:'moderate',completed:true,completedAt:new Date(now-3600000).toISOString(),...extra});
test('cardio is off by default; baseline and approaching lower session soften suggestions',()=>{
 const a=app();assert.equal(a.api.recommend(a.user,now).enabled,false);
 a.api.updateSettings(a.user,{enabled:true,mode:'run',minutes:30,intensity:'moderate',baselineWeeklyMinutes:180});
 const ordinary=a.api.recommend(a.user,now,'pull_a');assert.equal(ordinary.mode,'run');assert.equal(ordinary.minutes,30);
 const lower=a.api.recommend(a.user,now,'legs_a');assert.equal(lower.mode,'walk');assert.equal(lower.intensity,'easy');
 a.api.updateSettings(a.user,{baselineWeeklyMinutes:0});assert.equal(a.api.recommend(a.user,now).minutes,10);a.close();
});
test('only confirmed unique past cardio counts; recent demanding legs and cardio support rest',()=>{
 const a=app();a.user.program.cardio={logs:[entry(),entry(),entry('no',{completed:false}),entry('future',{completedAt:new Date(now+1).toISOString()}),entry('old',{completedAt:new Date(now-8*86400000).toISOString()}),entry('walk',{mode:'walk',minutes:10,intensity:'easy'})]};
 const r=a.api.recentLoad(a.user,now);assert.equal(r.minutes,35);assert.equal(r.moderateMinutes,25);assert.equal(r.demandingLowerBody,true);assert.equal(a.api.recommend(a.user,now).restSuggested,true);a.close();
});
test('logs work while off, deduplicate by id, reject invalid sessions, and preserve all strength state',()=>{
 const a=app(),before=JSON.stringify(a.user);
 assert.equal(a.api.logSession(a.user,entry(),now),true);assert.equal(a.api.logSession(a.user,entry(),now),false);
 assert.equal(a.api.logSession(a.user,entry('bad',{minutes:-1}),now),false);
 assert.equal(a.api.logSession(a.user,entry('future',{completedAt:new Date(now+1).toISOString()}),now),false);
 a.api.updateSettings(a.user,{enabled:true});a.api.updateSettings(a.user,{enabled:false});
 assert.equal(a.api.settings(a.user).enabled,false);assert.equal(a.user.program.cardio.logs.length,1);
 const restored=JSON.parse(JSON.stringify(a.user));delete restored.program.cardio;assert.equal(JSON.stringify(restored),before);a.close();
});
test('UI captures profile/account ownership and repeated old button events do not duplicate',()=>{
 const a=app(),button=a.w.document.getElementById('cardioLogSave');
 button.click();button.click();assert.equal(a.user.program.cardio.logs.length,1);
 const stale=a.w.document.getElementById('cardioEnabled');const old=a.user;
 a.setUser({id:'b',program:{currentWorkoutKey:'lower_strength'}});stale.checked=true;stale.dispatchEvent(new a.w.Event('change'));
 assert.equal(old.program.cardio.enabled,undefined);assert.equal(a.user.program.cardio,undefined);
 a.w.renderAll();const scoped=a.w.document.getElementById('cardioEnabled');a.w.ironSixAccountScope='different';scoped.checked=true;scoped.dispatchEvent(new a.w.Event('change'));assert.equal(a.user.program.cardio,undefined);a.close();
});
test('DOM settings persist; recommendations render and completed log accepts non-default minutes',()=>{
 const a=app();const toggle=a.w.document.getElementById('cardioEnabled');toggle.checked=true;toggle.dispatchEvent(new a.w.Event('change'));
 assert.equal(a.user.program.cardio.enabled,true);assert.match(a.w.document.getElementById('cardioCompanion').textContent,/10 minutes/);
 a.w.document.getElementById('cardioLogMinutes').value='42';a.w.document.getElementById('cardioLogSave').click();assert.equal(a.user.program.cardio.logs[0].minutes,42);assert.match(a.w.document.getElementById('cardioLogStatus').textContent,/stays in place/);a.close();
});
