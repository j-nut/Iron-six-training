const {test}=require('node:test');
const assert=require('node:assert/strict');
const form=require('../pose-form-coach.js');

function points({shoulderX=.50,shoulderY=.30,hipX=.50,hipY=.52,kneeX=.56,kneeY=.70,ankleX=.58,ankleY=.90}={}){
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const seen=(x,y)=>({x,y,visibility:1,presence:1});
  p[11]=seen(shoulderX,shoulderY);p[23]=seen(hipX,hipY);p[25]=seen(kneeX,kneeY);p[27]=seen(ankleX,ankleY);return p;
}
function runRep(evaluator,{top=points(),down=points({shoulderY:.38,hipY:.60,kneeY:.66}),bottom=points({shoulderY:.50,hipY:.72,kneeY:.70}),up=points({shoulderY:.38,hipY:.60,kneeY:.66}),extreme=92,step=180}={}){
  let t=0,log=evaluator.state().history.map(x=>({index:x.index,ms:x.ms,extreme:x.extreme}));
  const send=(phase,p)=>{t+=step;return evaluator.push({landmarks:p,side:0,aspect:1,t,counterState:{phase,log}})};
  for(let i=0;i<6;i++)send('top',top);
  for(let i=0;i<5;i++)send('descending',down);
  for(let i=0;i<3;i++)send('bottom',bottom);
  for(let i=0;i<5;i++)send('ascending',up);
  log=[...log,{index:log.length+1,ms:step*13,extreme}];
  return send('top',top);
}

test('squat metrics are derived only from a visible confidence-gated working side',()=>{
  const m=form.metrics(points(),0,1);assert(m);assert(Number.isFinite(m.kneeAngle));assert(Number.isFinite(m.torsoLean));
  const hidden=points();hidden[25].visibility=.2;assert.equal(form.metrics(hidden,0,1),null);
});

test('a stable deliberate squat does not invent a form fault',()=>{
  const e=form.createEvaluator({id:'squat'});const state=runRep(e);
  assert.equal(state.history.length,1);assert.deepEqual(state.latest.issues,[]);assert.equal(state.repeatedCue,null);
});

test('a large torso change is reported only after a completed, sufficiently sampled rep',()=>{
  const e=form.createEvaluator({id:'squat'});
  const state=runRep(e,{down:points({shoulderX:.64,shoulderY:.38,hipY:.60,kneeY:.66}),bottom:points({shoulderX:.67,shoulderY:.50,hipY:.72,kneeY:.70}),up:points({shoulderX:.64,shoulderY:.38,hipY:.60,kneeY:.66})});
  assert(state.latest.issues.includes('torso'));assert.match(state.latest.cues.find(x=>x.id==='torso').text,/chest and hips/i);
});

test('depth inconsistency requires prior reps and repeated issues are promoted conservatively',()=>{
  const e=form.createEvaluator({id:'squat'});
  runRep(e,{extreme:88});runRep(e,{extreme:89});
  const third=runRep(e,{extreme:108});assert(third.latest.issues.includes('depthConsistency'));
  const fourth=runRep(e,{extreme:109});assert(fourth.repeatedCue);assert.equal(fourth.repeatedCue.id,'depthConsistency');
});

test('generic tracked movements can flag repeated very fast reps without pretending to diagnose form',()=>{
  const e=form.createEvaluator({id:'curl'});
  let s=e.push({counterState:{log:[{index:1,ms:900,extreme:60}]}});assert(s.latest.issues.includes('tempo'));
  s=e.push({counterState:{log:[{index:1,ms:900,extreme:60},{index:2,ms:950,extreme:62}]}});assert.equal(s.repeatedCue.id,'tempo');
});
