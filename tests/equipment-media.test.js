const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const media=require('../exercise-media-catalog.js');
function api(groq){
  const ctx={media,process:{env:groq?{GROQ_API_KEY:'test'}:{}},fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({exercises:groq})}}]})})};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('api/equipment-exercises.js','utf8').replace("import media from '../exercise-media-catalog.js';",'').replace('export default async function handler','async function handler')+'\nthis.handler=handler;',ctx);
  return async equipment=>{let output;await ctx.handler({method:'POST',body:{equipment}},{status(){return this},json(body){output=body}});return output};
}
test('equipment additions all have approved images and valid movement slots',async()=>{
  const result=await api()([{custom:true,name:'Cable machine'},{custom:true,name:'Smith machine'},{custom:true,name:'EZ curl bar'}]);
  assert(result.exercises.length>=8);
  for(const exercise of result.exercises)assert(media.has(exercise.name));
});
test('Groq cannot invent media, movements, or relabel a curl as a squat',async()=>{
  const result=await api([{name:'Cable Curl',base:'Primary squat',equipmentId:'custom:cable'},{name:'Magic Cable Squat',base:'Primary squat',equipmentId:'custom:cable'},{name:'Cable Curl',base:'Elbow flexion',equipmentId:'custom:cable'}])([{custom:true,name:'Cable'}]);
  assert(!result.exercises.some(x=>x.name.includes('Magic')||x.name==='Cable Curl'&&x.base==='Primary squat'));
  assert(result.exercises.some(x=>x.name==='Cable Curl'&&x.source==='groq'));
});
test('unsupported equipment remains valid but does not add unillustrated exercises',async()=>{
  const result=await api()([{custom:true,name:'Sandbag'}]);assert.equal(result.exercises.length,0);
});
