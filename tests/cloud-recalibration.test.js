const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
async function calibrate(level,proposed,providerOk=true){
  let result,request;
  const context={process:{env:{GROQ_API_KEY:'test'}},fetch:async(_,init)=>{request=JSON.parse(init.body);return{ok:providerOk,json:async()=>({choices:[{message:{content:JSON.stringify({factor:proposed})}}]})}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('api/recalculate.js','utf8').replace('export default async function handler','async function handler'),context);
  await context.handler({method:'POST',body:{deterministicFactor:1.06,profile:{workoutDifficulty:level},completed:[{weight:50,reps:10,rir:5}]}},{status(){return this},json(x){result=x;return this}});
  return{result,request};
}
test('cloud recalibration cannot raise Light loads even if provider returns a higher factor',async()=>{
  for(const ok of [true,false]){
    const {result,request}=await calibrate('light',1.06,ok);
    assert.equal(result.factor,1);
    assert.equal(JSON.parse(request.messages[1].content).deterministicFactor,1);
    assert.match(request.messages[0].content,/4 reps in reserve/);
  }
});
test('Balanced and Heavy preserve bounded performance calibration',async()=>{
  for(const level of ['balanced','heavy',undefined])assert.equal((await calibrate(level,1.4)).result.factor,1.06);
});
