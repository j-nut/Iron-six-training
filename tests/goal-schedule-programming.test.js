const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {snapshot,context}=require('./helpers/program-snapshot.js');

// sha256 prefixes of twelve-session plan/forecast/budget snapshots, generated with
// tests/helpers/program-snapshot.js against origin/integration/training-fixes-oct (before goal and
// schedule programming). Profiles that never answered (and new profiles on the defaults) must match.
const BASE={'home:traditional:10':'a1573c0d80fcfceb','home:traditional:20':'ee682f1fdb525c39','home:traditional:45':'ed69d25112adfb8c','home:traditional:60':'7e20ba2cb49bc2f0','home:traditional:120':'d9c18fd75dc239c9',
  'home:circuit:10':'1f21d3ea3a722271','home:circuit:20':'f90886cf1eefc377','home:circuit:45':'4af0ee20b1accbfb','home:circuit:60':'46ee993c4195464b','home:circuit:120':'50c764b9bbef7576',
  'db:traditional:10':'eb15003f099cb33c','db:traditional:20':'25b78aab0879d2d9','db:traditional:45':'3c38ca71081a3fda','db:traditional:60':'50b30f22f2eacc28','db:traditional:120':'017a899a4b437397',
  'db:circuit:10':'8492c78f7f4d6195','db:circuit:20':'8c728170ea80b9e9','db:circuit:45':'7e4d467cb18ec01d','db:circuit:60':'395c3cd9040db33a','db:circuit:120':'72788491c3ec2e83',
  'bw:traditional:10':'46e793906fae0138','bw:traditional:20':'8d91609b713ada1d','bw:traditional:45':'55277f6ea7052e14','bw:traditional:60':'31045e19f9c6e3f6','bw:traditional:120':'a41b5e3fb4a62262',
  'bw:circuit:10':'496952d142d15b85','bw:circuit:20':'729e9dbdf704c131','bw:circuit:45':'7d90dc57a384a27d','bw:circuit:60':'1edee445822c7d73','bw:circuit:120':'1edee445822c7d73'};

const run=()=>context('.');
const NONE='{dumbbells:false,barbell:false,landmine:false,rack:false,bench:false,pullup:false,bands:false,abwheel:false,medball:false}';
const EQUIPMENT={home:'DEFAULT_EQUIPMENT',db:`{...${NONE},dumbbells:true,bench:true}`,bw:`{...${NONE},pullup:true}`};
// Completes `count` sessions through the real routine (plan -> history -> exposures -> completeRoutine).
const CYCLE=(setup,count)=>`
  ${setup}
  const sessions=[];let t=Date.UTC(2026,8,1,12);
  for(let i=0;i<${count};i++){
    __setClock(t+36e5);
    const key=u.program.currentWorkoutKey,plan=finalWorkout(u);
    sessions.push({key,seconds:sessionSeconds(u,plan),gaps:u.program.planGaps?.key===key?u.program.planGaps.slots:[],plan:plan.map(e=>({name:e.name,seed:e.seedKey,sets:e.sets,priority:e.priority,anchor:e._anchor,range:repRange(e),muscles:exerciseMuscles(e),available:exerciseAvailable(u,e)}))});
    const details=plan.map(e=>({name:e.name,base:e.base,seedKey:e.seedKey,prescription:e.prescription,sets:Array.from({length:e.sets},()=>({done:true,reps:repTarget(e),weight:'',rir:2}))}));
    t+=2*864e5;const session={ts:t,sessionId:'s'+i,workoutKey:key,details,sets:details.reduce((n,d)=>n+d.sets.length,0),plannedSets:details.reduce((n,d)=>n+d.sets.length,0)};
    session.routineAfter=routineAfter(u,session);u.history.unshift(session);u.program.exposures[key]=(Number(u.program.exposures[key])||0)+1;completeRoutine(u,session);
  }`;

test('profiles without a goal or schedule keep byte-identical plans, forecasts and budgets',()=>{
  const now=snapshot('.');
  for(const [key,hash] of Object.entries(BASE)){
    assert.equal(now['legacy:'+key],hash,'legacy profile '+key);
    assert.equal(now['new:'+key],hash,'new default profile '+key);
  }
});

test('normalizeUser defaults and sanitises the shared profile contract',()=>{
  const r=run();
  const out=r(`const legacy=normalizeUser({name:'Old',history:[{workoutKey:'push_a'}],program:{currentWorkoutKey:'pull_b',exposures:{pull_b:3}}});
    const messy=normalizeUser({goal:'bulk',daysPerWeek:'9',limitations:['knee','neck','knee','shoulder'],strengthRefs:{squat:{weight:'225',reps:5.4,equipment:'machine'},bench:{weight:-5,reps:5},deadlift:{weight:300,reps:3},row:{weight:60,reps:40,equipment:'dumbbell'}},preferences:{music:false,camera:'yes'},onboarding:{version:7,completedAt:'abc',optionalSkipped:['strengthRefs',4,'strengthRefs']}});
    const low=normalizeUser({daysPerWeek:0.4}),three=normalizeUser({daysPerWeek:3.4,goal:'strength'}),fresh=makeUser('New');
    return {legacy:{goal:legacy.goal,days:legacy.daysPerWeek,refs:legacy.strengthRefs,lim:legacy.limitations,prefs:legacy.preferences,onb:legacy.onboarding,key:legacy.program.currentWorkoutKey,exp:legacy.program.exposures,history:legacy.history.length},
      messy:{goal:messy.goal,days:messy.daysPerWeek,refs:messy.strengthRefs,lim:messy.limitations,prefs:messy.preferences,onb:messy.onboarding},low:low.daysPerWeek,three:[three.daysPerWeek,three.goal],
      fresh:{goal:fresh.goal,days:fresh.daysPerWeek,lim:fresh.limitations,onb:fresh.onboarding}}`);
  // Unanswered onboarding fields stay empty in storage (readers apply the defaults), so setup can tell what was never asked.
  assert.deepEqual(out.legacy,{goal:null,days:null,refs:null,lim:null,prefs:{},onb:null,key:'pull_b',exp:{pull_b:3},history:1});
  assert.equal(out.messy.goal,null);assert.equal(out.messy.days,6);
  assert.deepEqual(out.messy.refs,{squat:{weight:225,reps:5,equipment:'barbell'},row:{weight:60,reps:30,equipment:'dumbbell'}});
  assert.deepEqual(out.messy.lim,['shoulder','knee']);
  assert.equal(out.messy.prefs.music,false);assert.equal(Object.values(out.messy.prefs).every(v=>typeof v==='boolean'),true);
  assert.deepEqual(out.messy.onb,{version:1,completedAt:null,optionalSkipped:['strengthRefs']});
  assert.equal(out.low,2);assert.deepEqual(out.three,[3,'strength']);
  assert.deepEqual(out.fresh,{goal:null,days:null,lim:null,onb:null});
});

test('each frequency uses an honest split and covers every major muscle each week',()=>{
  const r=run();
  const expected={2:['full2_a','full2_b'],3:['full_a','full_b','full_c'],4:['upper_a','lower_a','upper_b','lower_b'],5:['push_a','lower_a','pull_a','push_b','lower_b','pull_b'],6:['push_a','lower_a','pull_a','push_b','lower_b','pull_b']};
  for(const days of [2,3,4,5,6]){
    const sessions=r(CYCLE(`const u=normalizeUser({...makeUser('Split',180,DEFAULT_EQUIPMENT),daysPerWeek:${days},workoutMinutes:60});u.program.currentWorkoutKey=rotationFor(u)[0];`,expected[days].length*2)+'return sessions;');
    assert.deepEqual(sessions.slice(0,expected[days].length).map(s=>s.key),expected[days],`${days} days rotation`);
    const week=sessions.slice(0,expected[days].length);
    const muscles=new Set(week.flatMap(s=>s.plan.flatMap(e=>e.muscles)));
    for(const m of ['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core'])assert(muscles.has(m),`${days} days misses ${m}`);
    for(const s of sessions){
      assert(s.plan.length>0&&s.plan.every(e=>e.available),`${days} days ${s.key} plan`);
      assert(s.seconds<=3600,`${days} days ${s.key} over budget`);
      assert(s.plan.every(e=>e.sets>=2),`${days} days ${s.key} has a one-set token exercise`);
      if(/^full/.test(s.key)){
        // Every full-body day: a squat or hinge, a press and a pull, main lifts first.
        assert(s.plan.some(e=>['squat','hinge'].includes(e.seed)),s.key+' lower');
        assert(s.plan.some(e=>['bench','chest_press','overhead_press'].includes(e.seed)),s.key+' press');
        assert(s.plan.some(e=>['row','pullup'].includes(e.seed)),s.key+' pull');
        assert.equal(s.plan[0].priority,1);
      }
    }
    // Hypertrophy volume: the upper/lower split lands chest and back in a sensible weekly range at 60 minutes.
    if(days===4){const sets=seeds=>week.reduce((n,s)=>n+s.plan.filter(e=>seeds.includes(e.seed)).reduce((a,e)=>a+e.sets,0),0);
      assert(sets(['bench','chest_press','fly'])>=8&&sets(['bench','chest_press','fly'])<=20,days+' days chest '+sets(['bench','chest_press','fly']));
      assert(sets(['pullup','row','lat_iso'])>=8&&sets(['pullup','row','lat_iso'])<=22,days+' days back '+sets(['pullup','row','lat_iso']));}
  }
});

test('split days stay within every time budget, in circuit mode and with limited equipment',()=>{
  const r=run();
  const out=r(`const bad=[];for(const eq of [${Object.values(EQUIPMENT).join(',')}])for(const key of ['upper_a','upper_b','full_a','full_b','full_c','full2_a','full2_b'])for(const mode of ['traditional','circuit'])for(const minutes of [10,15,20,30,45,60,90,120]){
      const u=normalizeUser({...makeUser('Budget',180,eq),daysPerWeek:{upper_a:4,upper_b:4,full_a:3,full_b:3,full_c:3,full2_a:2,full2_b:2}[key],trainingMode:mode,workoutMinutes:minutes});u.program.currentWorkoutKey=key;
      const p=finalWorkout(u),secs=sessionSeconds(u,p),steps=mode==='circuit'?circuitTimeline(u,p):[];
      if(!p.length||new Set(p.map(e=>e.name)).size!==p.length||p.some(e=>!exerciseAvailable(u,e)||e.sets<1)||secs>Math.max(600,minutes*60))bad.push([key,mode,minutes,p.length,secs]);
      if(mode==='circuit'&&(p.some(e=>!circuitSuitable(e))||steps.reduce((n,s)=>n+s.seconds,0)!==secs))bad.push(['circuit',key,minutes]);
    }return bad`);
  assert.deepEqual(out,[]);
});

test('goal sets rep ranges, reps in reserve, rest and stable benchmark lifts',()=>{
  const r=run();
  const out=r(`const plans={};for(const goal of ['strength','muscle','general']){const u=normalizeUser({...makeUser('Goal',180,DEFAULT_EQUIPMENT),goal,workoutMinutes:60});u.program.currentWorkoutKey='push_a';
      plans[goal]=finalWorkout(u).map(e=>({name:e.name,priority:e.priority,range:repRange(e),target:repTarget(e),requires:e.requires,seed:e.seedKey}));plans[goal+'Rir']=goalTargetRir(u);
      plans[goal+'Rest']=traditionalSetSeconds({priority:1,seedKey:'bench',prescription:'3 × 3–6',name:'Barbell Bench Press'},60,goal)}
    const adv=normalizeUser({goal:'general',trainingLevel:'advanced'});plans.advancedGeneralRir=goalTargetRir(adv);
    // Benchmark: strength keeps the same main lift across three four-exposure blocks.
    const anchors={};for(const goal of ['strength','muscle']){const u=normalizeUser({...makeUser('Bench',180,DEFAULT_EQUIPMENT),goal});u.program.currentWorkoutKey='lower_a';const seen=[];
      for(let e=0;e<12;e++){u.program.exposures.lower_a=e;const p=buildWorkout(u);seen.push(p.filter(x=>x._anchor).map(x=>x.name).join('+'));u.history.unshift({workoutKey:'lower_a',details:p.map(x=>({name:x.name,seedKey:x.seedKey,sets:[{done:true}]}))})}anchors[goal]=[...new Set(seen)]}
    plans.anchors=anchors;return plans`);
  const main=goal=>out[goal].find(e=>e.priority===1&&e.requires.includes('barbell'));
  assert.deepEqual(main('strength').range,[3,6]);assert.equal(main('strength').target,5);
  assert.deepEqual(main('general').range,[8,12]);
  const iso=out.strength.find(e=>e.seed==='lateral_raise');if(iso&&iso.requires.includes('dumbbells'))assert.deepEqual(iso.range,[8,12]);
  // Muscle is today's programming: nothing rewritten.
  assert(out.muscle.some(e=>e.priority===1&&e.range[0]>=4&&e.range[1]>=8));
  assert.equal(out.strengthRir,2);assert.equal(out.muscleRir,2);assert.equal(out.generalRir,3);assert.equal(out.advancedGeneralRir,2.5);
  assert(out.strengthRest>out.muscleRest&&out.generalRest<out.muscleRest);
  assert.equal(out.anchors.strength.length,1,'strength benchmark changed: '+out.anchors.strength.join(' / '));
  assert(out.anchors.muscle.length>1,'muscle still rotates its block anchors');
});

test('strength and general goals keep load progression working on the goal range',()=>{
  const c={console,Date,Math,localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:()=>null,addEventListener(){}},setTimeout(){}};c.window=c;vm.createContext(c);
  for(const f of ['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js','workout-lower-hypertrophy.js','workout-upper.js','workout-dispatch.js','engine.js','session-planner.js','load-progression-v2.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
  const out=JSON.parse(vm.runInContext(`JSON.stringify((()=>{const rec={};for(const goal of ['strength','muscle']){const u=normalizeUser({...makeUser('Prog'),goal});u.program.currentWorkoutKey='lower_a';
    const plan=finalWorkout(u),i=plan.findIndex(e=>e.name==='Barbell Back Squat'),squat=plan[i];u.today={[i+'-0']:{weight:'225',reps:'6',rir:'2',done:true}};
    rec[goal]={range:repRange(squat),prescription:squat.prescription,next:nextSetRecommendation(u,squat,i)}}return rec})())`,c));
  // Six reps at 2 RIR tops the strength range (add load, stay at 3-6 reps); in the muscle range it is the bottom.
  assert.deepEqual(out.strength.range,[3,6]);assert.match(out.strength.prescription,/^\d+ × 3–6/);
  assert(out.strength.next.load>225&&out.strength.next.reps<=6,JSON.stringify(out.strength.next));
  assert(out.muscle.next.load<=225,JSON.stringify(out.muscle.next));
});

test('switching days mid-program keeps history, exposures and an in-progress draft',()=>{
  const r=run();
  const out=r(CYCLE(`const u=normalizeUser({...makeUser('Switch',180,DEFAULT_EQUIPMENT),workoutMinutes:45});`,7)+`
    const history=u.history.length,exposures=JSON.stringify(u.program.exposures),current=u.program.currentWorkoutKey;
    u.workoutDraft={id:'draft',plan:finalWorkout(u),key:current};u.today={'0-0':{weight:'100',reps:'8',done:true}};const draft=JSON.stringify(u.workoutDraft.plan);
    const result=applyProgramSettings(u,{daysPerWeek:3,goal:'strength'});
    const during={result,key:u.program.currentWorkoutKey,draft:JSON.stringify(finalWorkout(u))===draft,history:u.history.length===history,exposures:JSON.stringify(u.program.exposures)===exposures};
    // Finish the drafted session: the next session comes from the new split.
    const details=u.workoutDraft.plan.map(e=>({name:e.name,seedKey:e.seedKey,sets:[{done:true,reps:8}]})),session={ts:Date.now(),sessionId:'draft',workoutKey:current,details};
    u.history.unshift(session);u.program.exposures[current]++;u.workoutDraft=null;u.today={};completeRoutine(u,session);
    const after=[u.program.currentWorkoutKey,...routineForecast(u,3).slice(1)];
    // With nothing in progress a change applies straight away, and lower_a keeps its six-day exposures.
    const back=applyProgramSettings(u,{daysPerWeek:4});const four={key:u.program.currentWorkoutKey,queue:routineQueue(u),lowerA:u.program.exposures.lower_a,history:u.history.length};
    applyProgramSettings(u,{daysPerWeek:6});const six={key:u.program.currentWorkoutKey,queue:routineQueue(u)};
    return {current,during,after,back,four,six,noop:applyProgramSettings(u,{daysPerWeek:6}).changed}`);
  assert.equal(out.during.result.changed,true);assert.equal(out.during.result.deferred,true);
  assert.equal(out.during.key,out.current,'in-progress key was rewritten');
  assert(out.during.draft&&out.during.history&&out.during.exposures);
  assert(out.after.every(k=>['full_a','full_b','full_c'].includes(k)),'after: '+out.after);
  assert.equal(out.back.deferred,false);
  assert(['upper_a','lower_a','upper_b','lower_b'].includes(out.four.key));assert.equal(out.four.queue.length,4);assert(out.four.lowerA>=1);assert.equal(out.four.history,8);
  assert(['push_a','lower_a','pull_a','push_b','lower_b','pull_b'].includes(out.six.key));assert.equal(out.six.queue.length,6);
  assert.equal(out.noop,false);
});

test('split keys work with manual choice, coverage, variants and the routine queue',()=>{
  const r=run();
  const out=r(`const u=normalizeUser({...makeUser('Manual',180,DEFAULT_EQUIPMENT),daysPerWeek:4});u.program.currentWorkoutKey='upper_a';
    prepareManualWorkout(u,'lower_b');u.program.currentWorkoutKey='lower_b';const pending=[...u.program.pendingWorkouts];
    const p=finalWorkout(u),session={ts:Date.now(),sessionId:'m1',workoutKey:'lower_b',details:p.map(e=>({name:e.name,seedKey:e.seedKey,sets:[{done:true},{done:true}]}))};
    u.history.unshift(session);completeRoutine(u,session);const next=u.program.currentWorkoutKey;
    // A six-day user picking a split day (e.g. from an older chooser) returns to their rotation afterwards.
    const six=normalizeUser({...makeUser('Six',180,DEFAULT_EQUIPMENT)});prepareManualWorkout(six,'full_a');six.program.currentWorkoutKey='full_a';
    const sp=finalWorkout(six),ss={ts:Date.now(),sessionId:'m2',workoutKey:'full_a',details:sp.map(e=>({name:e.name,seedKey:e.seedKey,sets:[{done:true}]}))};six.history.unshift(ss);completeRoutine(six,ss);
    const meta=['upper_a','upper_b','full_a','full_b','full_c','full2_a','full2_b'].map(k=>[k,WORKOUT_META[k].short,workoutMuscles(k).length,currentVariant({program:{exposures:{[k]:5}}},k),typeof WORKOUT_BUILDERS[k]]);
    const coverage=muscleCoverage({history:[{workoutKey:'full_b'}]}).missing;
    return {pending,next,sixNext:six.program.currentWorkoutKey,sixQueue:routineQueue(six),meta,coverage,status:adaptationStatus(u,'upper_a'),api:[window.IronSixProgram.describeSplit({daysPerWeek:4}),window.IronSixProgram.describeSplit({}),window.IronSixProgram.workoutKeysFor({daysPerWeek:3}),window.IronSixProgram.describeGoal('strength'),window.IronSixProgram.splitFor({daysPerWeek:2}).sessions.map(s=>s.short)]}`);
  assert.deepEqual(out.pending,['lower_b','upper_a','lower_a','upper_b']);
  assert.equal(out.next,'upper_a');
  // Full body overlaps every day, so the least recently trained six-day session (here the first) follows.
  assert.equal(out.sixNext,'push_a');assert.equal(out.sixQueue.length,6);
  for(const [key,short,muscles,variant,builder] of out.meta){assert(short&&muscles>=4,key);assert.equal(variant,1,key);assert.equal(builder,'function',key)}
  assert(!out.coverage.includes('hamstrings')&&!out.coverage.includes('shoulders'));
  assert.match(out.status,/^Benchmark block/);
  assert.equal(out.api[0],'4 days: Upper / Lower ×2');assert.equal(out.api[1],'6 days: Push / Legs / Pull ×2');
  assert.deepEqual(out.api[2],['full_a','full_b','full_c']);assert.match(out.api[3],/^Strength: Main lifts 3–6 reps/);assert.deepEqual(out.api[4],['Full A','Full B']);
});

test('program intelligence and Iron Marks follow the user’s split without losing six-day marks',()=>{
  const r=run();
  const upcoming=r(`return window.IronSixProgramV3.upcoming(normalizeUser({...makeUser('Two'),daysPerWeek:2,program:{...emptyProgram(),currentWorkoutKey:'full2_b'}}),6)`);
  assert.deepEqual(upcoming.map(x=>x.key),['full2_b','full2_a']);assert(upcoming.every(x=>x.name&&x.purpose));
  const engine=require('../iron-marks-engine.js');
  const session=(key,i)=>({ts:Date.UTC(2026,0,1)+i*864e5,sessionId:key+i,workoutKey:key,sets:4,plannedSets:4,details:[{name:'Barbell Back Squat',sets:[{done:true,reps:5,weight:'200',rir:2}]}]});
  const three={daysPerWeek:3,program:{currentWorkoutKey:'full_a'},history:Array.from({length:12},(_,i)=>session(['full_a','full_b','full_c'][i%3],i)).reverse()};
  const r3=engine.evaluate(three),mark=(res,id)=>res.marks.find(m=>m.id===id);
  assert.equal(mark(r3,'full_six').unlocked,true);assert.equal(r3.stats.rotations,4);assert.equal(r3.depth.blocks.completed.length,1);assert.equal(mark(r3,'no_detours').unlocked,true);
  assert.equal(engine.nextGoal(three,r3).target,12);
  // A six-day history keeps its marks after the profile switches to three days.
  const six={program:{currentWorkoutKey:'push_a'},history:Array.from({length:6},(_,i)=>session(['push_a','lower_a','pull_a','push_b','lower_b','pull_b'][i],i)).reverse()};
  const before=engine.evaluate(six),after=engine.evaluate({...six,daysPerWeek:3});
  assert.deepEqual(after.marks.filter(m=>m.unlocked).map(m=>m.id),before.marks.filter(m=>m.unlocked).map(m=>m.id));
  assert.equal(engine.evaluate({...six,history:six.history.slice(-2)}).stats.keysDone,2,'shared legs days do not inflate the four-day split');
});
