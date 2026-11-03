const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
function app(history=[]){
  const dom=new JSDOM('<h2 id="historyTitle"></h2><div id="historyList"></div>',{url:'https://iron-six.test',runScripts:'outside-only'});
  const w=dom.window,user={id:'one',name:'Alex',history};
  w.activeUser=()=>user;w.renderHistory=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  vm.runInContext(fs.readFileSync('history-explorer.js','utf8'),dom.getInternalVMContext());
  return {w,user,api:w.IronSixHistory,close:()=>w.close()};
}
const set=(weight,reps,done=true)=>({weight,reps,rir:'',done});
const session=(ts,name='Bench',items=[set('100','8')])=>({ts,name:'Push',date:'9/14/2026',duration:60,sets:items.length,details:[{name,sets:items}]});
test('history filters exercise, date, text and mode without mutating stored history',()=>{
  const now=Date.now(),list=[session(now-1),session(now-100*864e5,'Row'),{...session(now-2),trainingMode:'circuit'}],snapshot=JSON.stringify(list),a=app(list);
  try {
    assert.equal(a.api.filter(a.user,{days:30},now).length,2);
    assert.equal(a.api.filter(a.user,{query:'row'},now).length,1);
    assert.equal(a.api.filter(a.user,{exercise:'Bench',mode:'circuit'},now).length,1);
    assert.equal(JSON.stringify(list),snapshot);
  }finally{a.close()}
});
test('unfinished sets do not count and best load/reps always belong to the same set',()=>{
  const a=app([session(Date.now(),'Bench',[set('100','5'),set('50','20'),set('500','30',false)])]);
  try{
    assert.equal(a.api.summarize(a.user.history).sets,2);
    assert.equal(a.api.summarize(a.user.history).volume,1500);
    const best=a.api.bestSet(a.api.exerciseSessions(a.user,'Bench')[0].sets);
    assert.equal(best.weight,'100');assert.equal(best.reps,'5');
    assert.equal(a.api.csv(a.user.history).includes('"500"'),false);
  }finally{a.close()}
});
test('search survives redraws; switching profile clears filters and prior content',()=>{
  const a=app([session(Date.now())]);
  try{
    let input=a.w.document.getElementById('historySearch');input.focus();input.value='bench';input.dispatchEvent(new a.w.Event('input'));
    assert.equal(a.w.document.activeElement.id,'historySearch');
    assert.equal(a.w.document.getElementById('historySearch').value,'bench');
    a.w.renderHistory();assert.equal(a.w.document.getElementById('historySearch').value,'bench');
    a.user.id='two';a.user.name='Taylor';a.user.history=[];
    a.w.renderHistory();assert.equal(a.w.document.getElementById('historySearch').value,'');
    assert(!a.w.document.getElementById('historyList').textContent.includes('Bench'));
  }finally{a.close()}
});
test('raw zero, blank and timed values stay distinct and planned time is labeled',()=>{
  const a=app([session(Date.now(),'Plank',[{done:true,weight:'0',reps:'',rir:'0',seconds:30}])]);
  try {
    const text=a.w.document.getElementById('historyList').textContent;
    assert.match(text,/60 min planned/);assert.match(text,/30/);
    assert.equal(a.api.summarize(a.user.history).volume,0);
    assert(a.api.csv(a.user.history).includes('"0","","0","30"'));
  }finally{a.close()}
});
test('CSV neutralizes imported formula text and UI escapes markup',()=>{
  const a=app([session(Date.now(),'=HYPERLINK("bad")'),session(Date.now()-1,'<img src=x onerror=alert(1)>')]);
  try{
    assert.match(a.api.csv(a.user.history),/'=HYPERLINK/);
    assert.equal(a.w.document.querySelectorAll('img').length,0);
  }finally{a.close()}
});
test('legacy summaries remain visible and filters show an honest empty state',()=>{
  const a=app([{ts:Date.now(),name:'Old workout',sets:4}]);
  try{
    assert.match(a.w.document.body.textContent,/summary only/);assert.equal(a.api.summarize(a.user.history).sets,4);
    const search=a.w.document.getElementById('historySearch');search.value='missing';search.dispatchEvent(new a.w.Event('input'));
    assert.match(a.w.document.body.textContent,/No sessions match/);
  }finally{a.close()}
});
test('exercise progress button shows previous dated session and one real heaviest set',()=>{
  const now=Date.now(),a=app([session(now,'Bench',[set('100','5'),set('50','20')]),session(now-864e5,'Bench',[set('90','6')])]);
  try{
    a.w.document.querySelector('[data-history-exercise]').click();
    const text=a.w.document.getElementById('historyExerciseTrend').textContent;
    assert.match(text,/100 lb × 5 reps/);assert.match(text,/90 lb × 6 reps/);
    assert(!text.includes('100 lb × 20'));
  }finally{a.close()}
});
test('accomplishments use completed work, exclude future logs and never substitute planned minutes',()=>{
  const now=Date.now(),old=session(now-2*864e5,'Bench',[set('30','10'),set('500','50',false)]);
  old.elapsedMinutes=22;
  const recent=session(now-864e5,'Bench',[set('40','8'),{done:true,weight:'',reps:'12'}]);
  const legacy={name:'Old summary',sets:5,duration:60};
  const a=app([recent,old,legacy,session(now+864e5,'Bench',[set('1000','10')])]);
  try{
    const snapshot=JSON.stringify(a.user.history),h=a.api.highlights(a.user,now);
    assert.equal(h.sessions,3);assert.equal(h.sets,8);assert.equal(h.reps,30);
    assert.equal(h.volume,620);assert.equal(h.elapsedMinutes,22);assert.equal(h.timedSessions,1);
    assert.equal(h.records.length,1);assert.equal(h.records[0].set.weight,'40');
    assert.equal(h.sessions7,2);assert.equal(JSON.stringify(a.user.history),snapshot);
  }finally{a.close()}
});
test('records require an earlier workout and compare actual reps at the same known load',()=>{
  const now=Date.now();
  const a=app([session(now-4*864e5,'Bench',[set('30','8'),set('40','8')]),
    session(now-3*864e5,'Bench',[set('40','10'),set('30','20')]),
    session(now-2*864e5,'Bench',[set('50','5')]),
    session(now-864e5,'Bench',[set('50','5'),set('100','10',false)]),
    session(now,'Curl',[{done:true,weight:'',reps:100}])]);
  try{
    const h=a.api.highlights(a.user,now);
    assert.equal(h.records.length,2,'one record per exercise per workout, no first-entry or tied records');
    assert.equal(h.records[0].type,'Heaviest load');assert.equal(h.records[0].set.reps,'5');
    assert.equal(h.records[1].type,'More reps at this weight');assert.equal(h.records[1].set.weight,'40');assert.equal(h.records[1].set.reps,'10');
    assert.equal(a.api.highlights({history:[a.user.history[0]]},now).records.length,0);
  }finally{a.close()}
});
test('weekly consistency allows rest days, deduplicates weeks and breaks after a missed week',()=>{
  const now=new Date(2026,10,2,12).getTime();
  const at=(day)=>new Date(2026,9,day,12).getTime();
  const a=app();
  try{
    const history=[session(at(28)),session(at(27)),session(at(21)),session(at(14))];
    assert.equal(a.api.highlights({history},now).weeklyStreak,3);
    assert.equal(a.api.highlights({history:[history[0],history[3]]},now).weeklyStreak,1);
    assert.equal(a.api.highlights({history:[history[3]]},now).weeklyStreak,0);
  }finally{a.close()}
});
test('highlights stay above filters and do not change when browsing a subset; switching profiles clears them',()=>{
  const now=Date.now(),a=app([session(now-864e5,'Bench'),session(now,'Row')]);
  try{
    const d=a.w.document,first=d.getElementById('historyHighlights').textContent;
    assert.equal(d.querySelector('.history-filters').open,false);
    const input=d.getElementById('historySearch');input.value='missing';input.dispatchEvent(new a.w.Event('input'));
    assert.equal(d.getElementById('historyHighlights').textContent,first);
    assert.equal(d.querySelector('.history-filters').open,true);
    a.user.id='another';a.user.history=[];a.w.renderHistory();
    assert.match(d.getElementById('historyHighlights').textContent,/Your first workout/);
    assert.equal(d.querySelector('.history-highlight-grid'),null);
  }finally{a.close()}
});
test('timed holds saved in the reps field never become repetition or load records',()=>{
  const now=Date.now(),a=app([session(now-864e5,'Weighted plank',[set('10','30')]),session(now,'Weighted plank',[set('20','40')])]);
  try{
    a.user.history.forEach(h=>h.details[0].prescription='3 × 20–40 sec');
    const h=a.api.highlights(a.user,now);
    assert.equal(h.sets,2);assert.equal(h.reps,0);assert.equal(h.volume,0);assert.equal(h.records.length,0);
    assert.match(a.api.csv(a.user.history),/"20","40"/,'raw logged values remain exportable');
  }finally{a.close()}
});
