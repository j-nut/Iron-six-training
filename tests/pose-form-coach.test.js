const {test}=require('node:test');
const assert=require('node:assert/strict');
const form=require('../pose-form-coach.js');

function pose({shoulder=[.45,.3],hip=[.5,.52],knee=[.5,.7],ankle=[.5,.9]}={}){
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const put=(i,[x,y])=>p[i]={x,y,visibility:.99,presence:.99};
  put(11,shoulder);put(23,hip);put(25,knee);put(27,ankle);return p;
}
function frame(phase,t,log,positions){return {landmarks:pose(positions),side:0,aspect:1,counterState:{phase,log}}}
function completedRep(ev,index,{lean=false,hipLead=false,extreme=90,fast=false,depthY=.70}={}){
  const log=[];let t=(index-1)*3000;
  for(let i=0;i<3;i++)ev.push(frame('top',t+=100,log,{}));
  for(let i=0;i<4;i++)ev.push(frame('descending',t+=fast?80:180,log,{shoulder:lean?[.61,.34]:[.45,.3],hip:[.5,.56],knee:[.5,.7],ankle:[.5,.9]}));
  for(let i=0;i<3;i++)ev.push(frame('bottom',t+=100,log,{shoulder:lean?[.62,.39]:[.45,.34],hip:[.5,depthY],knee:[.5,.7],ankle:[.5,.9]}));
  for(let i=0;i<4;i++)ev.push(frame('ascending',t+=120,log,{shoulder:hipLead?[.45,.37]:[.45,.31],hip:hipLead?[.5,.55]:[.5,.48],knee:[.5,.65],ankle:[.5,.9]}));
  log.push({index,ms:fast?1000:2200,extreme});ev.push(frame('top',t+=120,log,{}));
}

test('metrics require one fully visible working-side chain',()=>{
  assert(form.metrics(pose(),0,1));const p=pose();p[25].visibility=.2;assert.equal(form.metrics(p,0,1),null);
});

test('a stable deliberate squat does not invent a form problem',()=>{
  const evaluator=form.createEvaluator({id:'squat'}),events=[];completedRep(events,1,{});for(const e of events)evaluator.push(e);
  const state=evaluator.state();assert.equal(state.latest.index,1);assert.deepEqual(state.latest.issues,[]);assert.equal(state.repeatedCue,null);
});

test('large torso change is assessed only after a completed sampled rep',()=>{
  const evaluator=form.createEvaluator({id:'squat'}),events=[];completedRep(events,1,{lean:true});
  for(const e of events.slice(0,-1))evaluator.push(e);assert.equal(evaluator.state().latest,null);
  evaluator.push(events.at(-1));assert(evaluator.state().latest.issues.includes('torso'));
});

test('depth inconsistency needs prior completed reps and repeated evidence before promotion',()=>{
  const evaluator=form.createEvaluator({id:'squat'}),events=[];
  completedRep(events,1,{extreme:88});completedRep(events,2,{extreme:90});completedRep(events,3,{extreme:115});completedRep(events,4,{extreme:116});
  for(const e of events)evaluator.push(e);
  const history=evaluator.state().history;assert(!history[0].issues.includes('depthConsistency'));assert(!history[1].issues.includes('depthConsistency'));
  assert(history[2].issues.includes('depthConsistency'));assert(history[3].issues.includes('depthConsistency'));assert.equal(evaluator.state().repeatedCue.id,'depthConsistency');
});

test('generic movements only promote repeated unusually fast reps',()=>{
  const evaluator=form.createEvaluator({id:'curl'});
  evaluator.push({counterState:{log:[{index:1,ms:900,extreme:60}]}});assert.equal(evaluator.state().repeatedCue,null);
  evaluator.push({counterState:{log:[{index:1,ms:900,extreme:60},{index:2,ms:950,extreme:62}]}});assert.equal(evaluator.state().repeatedCue.id,'tempo');
});
