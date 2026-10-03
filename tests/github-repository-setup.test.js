const {test} = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../scripts/github/repository-setup.cjs');

test('repository onboarding preserves existing metadata and is idempotent across reruns', async () => {
  const labels = [{name:'bug',color:'custom'}];
  const milestones = [{number:9,title:'Future enhancements',state:'open'}];
  const issues = [
    {number:28,title:'Existing calibration proposal',state:'open',labels:[{name:'custom'},{name:'status:ready'}],milestone:{number:7}},
    {number:46,title:'Other session illustration PR',state:'open',pull_request:{},labels:[],milestone:null},
    {number:42,title:'Other session watch PR',state:'open',pull_request:{},labels:[],milestone:null},
    {number:90,title:'Verify signed Android updates on a physical device',state:'closed',labels:[],milestone:null}
  ];
  const calls = [];
  const api = {
    listLabelsForRepo:()=>labels, listMilestones:()=>milestones, listForRepo:()=>issues,
    createLabel:async x=>{labels.push({...x});calls.push(['label',x.name]);},
    createMilestone:async x=>{const item={...x,number:milestones.length+10};milestones.push(item);return {data:item};},
    create:async x=>{issues.push({...x,number:issues.length+100,state:'open',labels:x.labels.map(name=>({name}))});calls.push(['issue',x.title]);},
    addLabels:async x=>{const i=issues.find(i=>i.number===x.issue_number);for(const name of x.labels)if(!i.labels.some(l=>l.name===name))i.labels.push({name});},
    update:async x=>{const i=issues.find(i=>i.number===x.issue_number);i.milestone={number:x.milestone};calls.push(['update',x.issue_number]);}
  };
  const args={github:{rest:{issues:api},paginate:async fn=>fn()},context:{repo:{owner:'test',repo:'test'}},core:{summary:{addHeading(){return this;},addRaw(){return this;},async write(){}}}};
  await setup(args);
  const firstCounts=[labels.length,milestones.length,issues.length];
  await setup(args);
  assert.deepEqual([labels.length,milestones.length,issues.length],firstCounts,'reruns do not duplicate labels, milestones or backlog issues');
  assert.equal(labels.find(x=>x.name==='bug').color,'custom');
  assert.equal(issues[0].milestone.number,7,'manual milestone preserved');
  assert(issues[0].labels.some(x=>x.name==='custom'));
  assert(!issues[0].labels.some(x=>x.name==='status:triage'),'manual readiness preserved');
  assert.equal(issues[3].state,'closed','completed verification not reopened');
  assert.equal(calls.filter(x=>x[0]==='issue').length,3);
  assert.equal(issues[2].milestone.number,9);
  assert(!calls.some(x=>x[0]==='update' && x[1]===46),'other session PR content untouched');
});
