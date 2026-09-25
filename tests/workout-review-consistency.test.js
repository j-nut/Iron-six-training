const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
 const user={id:'u',program:{currentWorkoutKey:'push_a'},history:[],today:{},trainerMemory:{status:'pending',custom:'keep',appearance:{accent:'green'},achievements:{earned:['first-session']}}};
 const pending=[];
 const context={window:{ironSixAccountScope:'account'},data:{users:[user]},finalWorkout:()=>[{name:'Press',base:'Press',sets:3}],baselineLoadObject:()=>({load:7.5,target:8}),repRange:()=>[6,10],repTarget:()=>8,muscleCoverage:()=>[],fetch:()=>new Promise(resolve=>pending.push(resolve)),saveData:()=>{},activeUser:()=>user,renderAll:()=>{},toast:()=>{},emptyTrainerMemory:()=>({})};
 vm.createContext(context);
 const source=fs.readFileSync('ui3.js','utf8');
 vm.runInContext(source.slice(source.indexOf('const workoutReviewRequests'),source.indexOf('\nfunction finishWorkout')),context);
 const respond=(index,summary)=>pending[index]({ok:true,json:async()=>({summary,status:'done',verifiedPlan:[],adjustments:[]})});
 return {user,context,pending,respond,run:()=>context.reviewCompletedWorkout('u',{})};
}
test('review applies only to unchanged upcoming workout and preserves other trainer memory',async()=>{
 const h=harness(),p=h.run();h.respond(0,'current');await p;
 assert.equal(h.user.trainerMemory.summary,'current');assert.equal(h.user.trainerMemory.custom,'keep');assert.equal(h.user.trainerMemory.appearance.accent,'green');assert.equal(h.user.trainerMemory.achievements.earned[0],'first-session');
});
for(const [label,change] of Object.entries({
 'manual routine change':h=>h.user.program.currentWorkoutKey='lower_a',
 'a newly logged set':h=>h.user.today['0-0']={weight:10,reps:8,done:true},
 'equipment changes':h=>h.user.equipment={dumbbells:false},
 'account switch':h=>h.context.window.ironSixAccountScope='other',
 'a newly started draft':h=>h.user.workoutDraft={plan:[{name:'Press'}]},
 'profile replacement':h=>h.context.data.users=[{...h.user}]
}))test('review discards response after '+label,async()=>{
 const h=harness(),p=h.run();change(h);h.respond(0,'stale');await p;
 assert.equal(h.user.trainerMemory.summary,undefined);
});
test('out of order reviews cannot replace latest result',async()=>{
 const h=harness(),first=h.run(),second=h.run();h.respond(1,'newest');await second;h.respond(0,'old');await first;
 assert.equal(h.user.trainerMemory.summary,'newest');
});
test('cloud reviewer cannot round a light load beyond its five percent bound',async()=>{
 const context={process:{env:{GROQ_API_KEY:'test'}},fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({checks:[{index:0,load:8,reps:8,sets:3}]})}}]})})};
 vm.createContext(context);vm.runInContext(fs.readFileSync('api/review-workout.js','utf8').replace('export default async function handler','async function handler'),context);
 let result;
 await context.handler({method:'POST',body:{nextWorkout:[{name:'Light raise',base:'Lateral',load:7.5,reps:8,repMin:6,repMax:10,sets:3}]}},{status(){return this},json(x){result=x;return this}});
 assert.equal(result.verifiedPlan[0].verifiedLoad,7.875);
});
