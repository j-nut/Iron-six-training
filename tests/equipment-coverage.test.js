// Coverage analysis has to be trustworthy enough to tell someone what to buy, so it is checked
// against the real workout builders rather than a fixture: it walks the same option lists the
// engine walks, and must never disturb the profile it inspects.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const SOURCES=['core.js','workout-lower.js','workout-shoulders.js','workout-chest.js','workout-back.js',
  'workout-lower-hypertrophy.js','workout-upper.js','workout-dispatch.js','engine.js','session-planner.js',
  'equipment-catalog.js','equipment-exercise-library.js','equipment-coverage.js'];

function app(){
  const store={};
  const ctx={console,Date,Math,JSON,Set,Map,Array,Object,String,Number,Boolean,RegExp,isNaN,parseInt,parseFloat,
    localStorage:{getItem:key=>store[key]||null,setItem:(key,value)=>{store[key]=value},removeItem:key=>{delete store[key]}}};
  ctx.window=ctx;
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  for(const file of SOURCES)vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return {ctx,run:code=>vm.runInContext(code,ctx),json:code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,ctx))};
}

const FULL='{...DEFAULT_EQUIPMENT}';
const NONE='{dumbbells:false,barbell:false,landmine:false,rack:false,bench:false,pullup:false,bands:false,abwheel:false,medball:false}';

test('a fully equipped profile has every movement slot covered',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('full',200,${FULL})`);
  const result=a.json('IronSixEquipmentCoverage.analyze(u)');
  assert(result.total>=30,`expected the six workouts to expose 30+ slots, got ${result.total}`);
  assert.equal(result.empty,0);
  assert.equal(result.score,100);
});

test('a bodyweight-only profile reports real gaps, not a clean bill of health',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('bw',200,${NONE})`);
  const result=a.json('IronSixEquipmentCoverage.analyze(u)');
  assert(result.empty>0,'a profile with no equipment must show empty slots');
  assert(result.score<100);
  assert(result.gaps.length>0);
  for(const gap of result.gaps)assert(['empty','thin','unloaded'].includes(gap.severity));
});

test('every empty slot names equipment that would actually fill it',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('bw',200,${NONE})`);
  const {gaps}=a.json('IronSixEquipmentCoverage.analyze(u)');
  const library=require('../equipment-exercise-library.js');
  const catalog=require('../equipment-catalog.js');
  for(const gap of gaps.filter(g=>g.severity==='empty')){
    for(const suggestion of gap.suggestions){
      const item=catalog.byId.get(suggestion.id);
      assert(item,`${suggestion.id} is not in the catalogue`);
      assert(library.slotsFor(item.family).includes(gap.base),
        `${item.name} was suggested for "${gap.base}" but trains none of ${library.slotsFor(item.family)}`);
    }
  }
});

test('analysis never suggests equipment the profile already owns',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('mix',200,${NONE});u.customEquipment=['Cable machine','Kettlebells']`);
  const {gaps}=a.json('IronSixEquipmentCoverage.analyze(u)');
  const names=gaps.flatMap(gap=>gap.suggestions.map(s=>s.name));
  assert(!names.includes('Cable machine / functional trainer'));
  assert(!names.includes('Kettlebells'));
});

test('inspecting coverage does not mutate the profile or its selection cache',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('clean',200,${FULL});globalThis.before=JSON.stringify(u)`);
  a.run('IronSixEquipmentCoverage.analyze(u)');
  assert.equal(a.run('JSON.stringify(u)===before'),true,'analyze() changed the profile it was given');
  assert.equal(a.run('Object.keys(u.program.selectionCache).length'),0);
});

test('generated equipment exercises count toward coverage once they are available',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('gen',200,${NONE})`);
  const before=a.json('IronSixEquipmentCoverage.analyze(u)');
  a.run(`u.customEquipment=['Cable machine'];
    u.program.generatedExercises=[{name:'Seated Cable Row',base:'Horizontal pull',seedKey:'row',prescription:'4 × 8–12',sets:4,tag:'Priority',priority:1,workoutKeys:['back'],requires:[],requiresCustom:['Cable machine'],equipmentName:'Cable machine',equipmentId:'custom:cable machine',source:'curated'}]`);
  const after=a.json('IronSixEquipmentCoverage.analyze(u)');
  const slot=row=>row.workoutKey==='back'&&row.base==='Horizontal pull';
  assert.equal(before.rows.find(slot).min,0,'expected Horizontal pull to start empty for a bodyweight profile');
  assert(after.rows.find(slot).min>0,'the generated cable row should have filled the slot');
  assert(after.score>before.score);
});

test('a generated exercise stops counting when its equipment is removed',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('gen',200,${NONE});
    u.customEquipment=['Cable machine'];
    u.program.generatedExercises=[{name:'Seated Cable Row',base:'Horizontal pull',seedKey:'row',prescription:'4 × 8–12',sets:4,tag:'Priority',priority:1,workoutKeys:['back'],requires:[],requiresCustom:['Cable machine'],equipmentName:'Cable machine',equipmentId:'custom:cable machine',source:'curated'}]`);
  const withIt=a.json('IronSixEquipmentCoverage.analyze(u)');
  a.run("u.customEquipment=[]");
  const without=a.json('IronSixEquipmentCoverage.analyze(u)');
  const slot=row=>row.workoutKey==='back'&&row.base==='Horizontal pull';
  assert(withIt.rows.find(slot).min>0);
  assert.equal(without.rows.find(slot).min,0);
});

test('preview explains what a piece of equipment adds before it is saved',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('bw',200,${NONE})`);
  const cable=a.json("IronSixEquipmentCoverage.preview(u,'cable crossover machine')");
  assert.equal(cable.recognised,true);
  assert(cable.names.length>=10);
  assert(cable.fills.includes('Horizontal pull'));
  const rower=a.json("IronSixEquipmentCoverage.preview(u,'Concept2 rower')");
  assert.equal(rower.recognised,true);
  assert.equal(rower.conditioning,true);
  assert.equal(rower.names.length,0);
  const junk=a.json("IronSixEquipmentCoverage.preview(u,'Vibrating platform 3000')");
  assert.equal(junk.recognised,false);
});

test('active equipment flags custom items the catalogue does not recognise',()=>{
  const a=app();
  a.run(`globalThis.u=makeUser('mix',200,${FULL});u.customEquipment=['Kettlebells','Vibrating platform 3000','Concept2 rower']`);
  const rows=a.json('IronSixEquipmentCoverage.activeEquipment(u)');
  const find=name=>rows.find(row=>row.name===name);
  assert.equal(find('Kettlebells').recognised,true);
  assert(find('Kettlebells').adds>0);
  assert.equal(find('Vibrating platform 3000').recognised,false);
  assert.equal(find('Concept2 rower').conditioning,true);
  assert.equal(find('Concept2 rower').adds,0);
});
