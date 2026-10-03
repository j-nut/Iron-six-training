const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('adaptive session reduces volume for deload and low recovery without zeroing exercises',()=>{
  const context={window:{},document:{getElementById(){return null},addEventListener(){}},Date,Number,Math,setTimeout(){},exerciseMuscles:()=>['chest'],exerciseAvailable:()=>true};context.window=context;
  context.IronSixTrainerV2={trainingState:()=>({phase:'Deload suggested',fatigue:72})};
  context.IronSixProgressV2={recovery:()=>({chest:{score:20}})};
  context.budgetSessionWorkout=(u,w)=>w.map(x=>({...x}));context.activeUser=()=>({});context.finalWorkout=()=>[];
  vm.createContext(context);vm.runInContext(fs.readFileSync('session-adaptation-v3.js','utf8'),context);
  const plan=context.IronSixAdaptiveSessionV3.adaptPlan({readiness:{energy:2,soreness:4},trainingFeedback:[]},[{name:'Bench Press',sets:4,prescription:'4 × 8'}]);
  assert.equal(plan[0].sets,3);assert.match(plan[0]._adaptReason,/adjusted volume/);assert(plan[0].sets>=1);
});

test('recent pain uses an allowed saved alternative when present',()=>{
  const now=Date.now();const context={window:{},document:{getElementById(){return null},addEventListener(){}},Date,Number,Math,setTimeout(){},exerciseMuscles:()=>['chest'],exerciseAvailable:()=>true};context.window=context;
  context.IronSixTrainerV2={trainingState:()=>({phase:'Build',fatigue:10})};context.IronSixProgressV2={recovery:()=>({chest:{score:90}})};context.budgetSessionWorkout=(u,w)=>w;context.activeUser=()=>({});context.finalWorkout=()=>[];
  vm.createContext(context);vm.runInContext(fs.readFileSync('session-adaptation-v3.js','utf8'),context);
  const u={readiness:{energy:4},trainingFeedback:[{ts:now,feedback:'pain',exercise:'Bench Press'}]};
  const plan=context.IronSixAdaptiveSessionV3.adaptPlan(u,[{name:'Bench Press',sets:3,prescription:'3 × 8',_alternatives:[{name:'Dumbbell Bench Press',sets:3,prescription:'3 × 8'}]}]);
  assert.equal(plan[0].name,'Dumbbell Bench Press');assert.match(plan[0]._adaptReason,/pain/i);
});

test('media experience exposes exact two-position motion demo and preserves missing-media fallback',()=>{
  const listeners={};const document={getElementById(){return null},head:{appendChild(){}},createElement(){return {id:'',textContent:''}},addEventListener(type,fn){listeners[type]=fn}};
  const media={resolve:name=>name==='Bench Press'?{frames:['a.png','b.png'],source:'https://example.com',author:'Author',license:'CC BY',licenseUrl:'https://creativecommons.org'}:null};
  const window={IronSixExerciseMedia:media,IronSixMediaView:{gallery:ex=>`missing:${ex.name}`}};const context={window,document,String,Array,Object};window.window=window;window.document=document;
  vm.createContext(context);vm.runInContext(fs.readFileSync('media-experience-v2.js','utf8'),context);
  const html=window.IronSixMediaView.gallery({name:'Bench Press'},{compact:true});assert(html.includes('data-motion-demo'));assert(html.includes('Start'));assert(html.includes('Finish'));assert(html.includes('a.png')&&html.includes('b.png'));
  assert.equal(window.IronSixMediaView.gallery({name:'Unknown Move'},{compact:true}),'missing:Unknown Move');
});

test('pain replacements preserve circuit restrictions and the allocated time budget',()=>{
  const context={window:{},document:{getElementById(){return null},addEventListener(){}},setTimeout(){},exerciseMuscles:()=>['chest'],exerciseAvailable:()=>true,circuitSuitable:ex=>!ex.name.includes('Barbell'),traditionalSetSeconds:ex=>ex.seconds||100};context.window=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync('session-adaptation-v3.js','utf8'),context);
  const u={trainingMode:'circuit',trainingFeedback:[{ts:Date.now(),feedback:'pain',exercise:'Dumbbell Press'}]};
  const exercise={name:'Dumbbell Press',sets:3,seconds:100,_alternatives:[{name:'Barbell Press',seconds:100},{name:'Single-arm Press',seconds:180},{name:'Band Press',seconds:90}]};
  const adapt=context.IronSixAdaptiveSessionV3.adaptPlan;
  assert.equal(adapt(u,[exercise])[0].name,'Single-arm Press','circuit must reject technical barbell replacement');
  u.trainingMode='traditional';
  exercise._alternatives.shift();
  assert.equal(adapt(u,[exercise])[0].name,'Band Press','post-budget replacement must fit already allocated time');
});

test('pain substitution retains circuit timing and displays reduced actual rounds',()=>{
  const context={document:{getElementById(){return null},addEventListener(){}},setTimeout(){},exerciseAvailable:()=>true,exerciseMuscles:()=>['chest'],circuitSuitable:()=>true,circuitPace:()=>({work:40})};context.window=context;
  context.IronSixTrainerV2={trainingState:()=>({phase:'Deload suggested'})};vm.createContext(context);vm.runInContext(fs.readFileSync('session-adaptation-v3.js','utf8'),context);
  const user={trainingMode:'circuit',trainingFeedback:[{ts:Date.now(),feedback:'pain',exercise:'Press'}]};
  const result=context.IronSixAdaptiveSessionV3.adaptPlan(user,[{name:'Press',sets:5,priority:1,_programSlot:'press',prescription:'40s controlled work · 5 rounds',_alternatives:[{name:'Band Press',sets:3,priority:3,prescription:'3 × 12'}]}]);
  assert.equal(result[0].name,'Band Press');assert.equal(result[0].sets,4);assert.equal(result[0].prescription,'40s controlled work · 4 rounds');assert.equal(result[0].priority,1);assert.equal(result[0]._programSlot,'press');
});

test('pain substitutions avoid duplicating other selected exercises and use replacement readiness',()=>{
  const context={document:{getElementById(){return null},addEventListener(){}},setTimeout(){},exerciseAvailable:()=>true,exerciseMuscles:ex=>[ex.name==='New Press'?'shoulders':'chest']};context.window=context;
  context.IronSixProgressV2={recovery:()=>({chest:{score:100},shoulders:{score:10}})};vm.createContext(context);vm.runInContext(fs.readFileSync('session-adaptation-v3.js','utf8'),context);
  const user={trainingFeedback:[{ts:Date.now(),feedback:'pain',exercise:'Press'}]};
  const result=context.IronSixAdaptiveSessionV3.adaptPlan(user,[{name:'Press',sets:5,prescription:'5 × 8',_alternatives:[{name:'Other Press',prescription:'3 × 12'},{name:'New Press',prescription:'3 × 12'}]},{name:'Other Press',sets:3,prescription:'3 × 12'}]);
  assert.equal(result[0].name,'New Press');assert.equal(result[0]._readinessScore,10);assert.equal(result[0].sets,4);assert.equal(result[0].prescription,'4 × 12');assert.equal(new Set(result.map(e=>e.name)).size,2);
});
