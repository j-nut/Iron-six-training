const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
 const window={fetch:async()=>new Response('{}',{status:503}),IronSixExerciseGuide:{teachingResponse:ex=>({reply:`Guide: ${ex.name}`,actions:[],videos:[]})}};
 vm.runInNewContext(fs.readFileSync('local-ai-fallback.js','utf8'),{window,navigator:{},Response,AbortController,setTimeout,clearTimeout});
 const workout=[{name:'Squat',sets:2,prescription:'2 × 5'},{name:'Row',sets:4,prescription:'4 × 8'},{name:'Curl',sets:1,prescription:'1 × 10'}];
 return {window,workout,ask:async(message,context={})=>(await window.fetch('/api/coach',{method:'POST',body:JSON.stringify({message,context:{workout,...context}})})).json()};
}
test('built-in demo chips resolve ordinal exercise instead of stale selected guide',async()=>{
 const a=harness();a.window.__ironSixSelectedExercise={name:'Curl'};
 assert.equal((await a.ask('Show me a demo of my first exercise')).reply,'Guide: Squat');
 assert.equal((await a.ask('Show me the second exercise')).reply,'Guide: Row');
 assert.equal((await a.ask('Show me exercise #3')).reply,'Guide: Curl');
});
test('next exercise follows actual set keys and different per-exercise counts',async()=>{
 const a=harness(),today=[{key:'0-0',done:true},{key:'0-1',done:true},{key:'1-0',done:true},{key:'1-1',done:true}];
 assert.match((await a.ask('What should I do next?',{today})).reply,/Continue with Row/);
 today.push({key:'1-2',done:true},{key:'1-3',done:true},{key:'2-0',done:true});
 assert.match((await a.ask('What should I do next?',{today})).reply,/All prescribed sets are complete/);
 today[0].done=false;
 assert.match((await a.ask('What should I do next?',{today})).reply,/Continue with Squat/);
});
test('a stale selection outside the workout is ignored and unrelated prompts never inherit a guide',async()=>{
 const a=harness();a.window.__ironSixSelectedExercise={name:'Old Bench'};
 assert(!String((await a.ask('Show me how to do this')).reply).includes('Old Bench'));
 a.window.__ironSixSelectedExercise={name:'Curl'};
 assert.equal((await a.ask('Show me how to do this')).reply,'Guide: Curl');
 assert(!String((await a.ask('Explain my suggested weights')).reply).includes('for Curl'));
});
test('duplicate completed rows do not imply that another set was done',async()=>{
 const a=harness();assert.match((await a.ask('What next?',{today:[{key:'0-0',done:true},{key:'0-0',done:true}]})).reply,/Squat/);
});
test('offline Coach respects Light effort and does not suggest progression at 2 RIR',async()=>{
 const a=harness(),out=await a.ask('Are my suggested weights right?',{profile:{workoutDifficulty:'light'}});
 assert.match(out.reply,/4 reps in reserve/);assert.match(out.reply,/do not require increasing weight/);assert(!/2\+ reps/.test(out.reply));
});
