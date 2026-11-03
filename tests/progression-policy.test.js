const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function engine(){
  const c={localStorage:{getItem:()=>null,setItem(){}},setTimeout(){},
    document:{getElementById:()=>null,addEventListener(){}}};
  c.window=c;vm.createContext(c);
  for(const f of ['core.js','workout-difficulty.js','engine.js','load-progression-v2.js'])
    vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  const run=code=>vm.runInContext(code,c);
  return {run,rec:c.IronSixLoadProgressionV2.recommendationFromSet,
    user:()=>run('makeUser("Test",180)'),baseline:run('baselineLoadObject')};
}
const exercise={name:'Barbell Bench Press',base:'Horizontal press',seedKey:'bench',prescription:'3 × 8–12'};
const set=(reps,rir,feedback)=>({weight:'100',reps:String(reps),rir:rir==null?'':String(rir),feedback,done:true});

test('on-target next sets preserve performed reps instead of resetting to the midpoint',()=>{
  const {rec,user}=engine();
  for(const reps of [8,9,10,11]){
    const result=rec(user(),exercise,set(reps,2));
    assert.equal(result.load,100);assert.equal(result.reps,reps);assert.equal(result.direction,'hold');
  }
});

test('goals and Light use their own RIR target before increasing weight',()=>{
  const {rec,user}=engine();const u=user();u.goal='general';
  const general=rec(u,exercise,set(12,2));
  assert.equal(general.load,100);assert.equal(general.reps,11);assert.equal(general.direction,'down');
  u.workoutDifficulty='light';
  const light=rec(u,exercise,set(10,4));
  assert.equal(light.load,100);assert.equal(light.reps,10);assert.equal(light.direction,'hold');
  const lower=rec(u,exercise,set(8,2));
  assert(lower.load<100,'when reducing reps cannot restore intended reserve within the range, lower weight');
});

test('extra reserve can add reps while top-of-range performance can add available weight',()=>{
  const {rec,user}=engine();const u=user();
  assert.equal(rec(u,exercise,set(10,4)).reps,12);
  const higher=rec(u,exercise,set(12,3));
  assert.equal(higher.load,105);assert(higher.reps>=8&&higher.reps<=12);
  const unknown=rec(u,exercise,set(12,null,'easy'));
  assert.equal(unknown.load,100,'subjective feedback alone at the rep ceiling cannot prove a load increase');
  assert.match(unknown.label,/add RIR/i);
});

test('next exposure builds one rep from actual performance and explicit hard feedback vetoes an increase',()=>{
  const {baseline,user}=engine();const u=user();
  const save=sets=>{u.today={};u.history=[{ts:Date.now(),details:[{...exercise,sets}]}]};
  save([set(8,2)]);assert.equal(baseline(u,exercise).target,9);
  save([set(12,3),set(10,2,'hard')]);
  const held=baseline(u,exercise);assert.equal(held.load,100);assert(held.target<=10);
  save([set(8,2),set(5,0)]);
  assert.equal(baseline(u,exercise).target,8,'a missed later set also blocks a next-session rep increase');
});

test('bodyweight work respects effort, pain, missing RIR, and Light without inventing loads',()=>{
  const {run,user}=engine();run('document=undefined');run(fs.readFileSync('bodyweight-load-fix.js','utf8'));
  const rec=run('nextSetRecommendation'),u=user(),ex={name:'Push-Up',prescription:'3 × 8–12',requires:[]};
  for(const [reps,rir,feedback,expected] of [[10,2,undefined,10],[10,null,undefined,10],[10,1,undefined,9],[10,4,undefined,12],[8,1,'hard',7]]){
    u.today={'0-0':set(reps,rir,feedback)};
    const result=rec(u,ex,0);assert.equal(result.load,null);assert.equal(result.reps,expected);
  }
  u.workoutDifficulty='light';u.today={'0-0':set(10,2)};
  assert.equal(rec(u,ex,0).reps,8);
  u.today={'0-0':set(10,5,'pain')};
  assert.match(rec(u,ex,0).text,/stop and reassess/i);assert(rec(u,ex,0).reps<=10);
});

test('hard/insufficient-reserve decisions stay conservative across goals, difficulty and training levels',()=>{
  const {rec,user}=engine();let cases=0;
  for(const goal of ['strength','muscle','general'])for(const level of ['beginner','intermediate','advanced'])
  for(const difficulty of ['light','balanced','heavy'])for(const reps of [8,9,10,11,12])
  for(const rir of [0,1,2,3,4,5])for(const feedback of [undefined,'easy','right','hard']){
    const u=user();u.goal=goal;u.trainingLevel=level;u.workoutDifficulty=difficulty;
    const result=rec(u,exercise,set(reps,rir,feedback));
    const target=difficulty==='light'?4:(level==='advanced'?1.5:2)+(goal==='general'?1:0);
    assert(result.reps>=8&&result.reps<=12);
    if(feedback==='hard'||rir<target){
      assert(result.load<=100,JSON.stringify({goal,level,difficulty,reps,rir,feedback,result}));
      if(result.load===100)assert(result.reps<=reps,'a reduced-effort recommendation cannot add reps at the same weight');
    }
    cases++;
  }
  assert.equal(cases,3240);
});
