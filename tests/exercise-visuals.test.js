const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const media=require('../exercise-media-catalog.js');
const registry=require('../exercise-registry.js');
const manifest=require('../exercise-media-manifest.js');
const resolver=require('../exercise-media-resolver.js');
const dom=new JSDOM('<head></head><body><section id="coach"><div class="section"><div class="section-head"></div></div></section></body>',{runScripts:'outside-only'});
const ctx=dom.getInternalVMContext();
// Registry, manifest and resolver must load before exercise-media.js, which consumes them.
for(const file of ['exercise-media-catalog.js','exercise-registry.js','exercise-media-manifest.js','exercise-media-resolver.js','exercise-media.js','exercise-guide.js','exercise-visuals.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const {window}=dom;

const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);
const isWebp=buf=>buf.subarray(0,4).toString('latin1')==='RIFF'&&buf.subarray(8,12).toString('latin1')==='WEBP';

// Every approved illustration is a real WebP on disk, at the byte length and checksum the
// committed manifest claims. A swapped or truncated asset fails here rather than in a gym.
const approved=JSON.parse(fs.readFileSync('assets/exercise-illustrations/manifest.json','utf8'));
assert.equal(approved.length,registry.exercises.length,'every canonical exercise needs exactly one approved illustration');
const crypto=require('node:crypto');
for(const row of approved){
  const file='assets/exercise-illustrations/'+row.filename;
  const bytes=fs.readFileSync(file);
  assert(isWebp(bytes),file+' must be a real WebP');
  assert.equal(bytes.length,row.bytes,file+' byte length must match the manifest');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256,file+' checksum must match the manifest');
}

// The headline property of the approved library: every canonical exercise resolves to its own
// first-party illustration, exactly — no substitution, no "coming soon", no schematic.
const seenImages=new Set();
for(const exercise of registry.exercises){
  const r=resolver.resolveOne(exercise.name);
  assert.equal(r.tier,1,exercise.name+' should resolve to a first-party exact illustration');
  assert.equal(r.media.status,'approved',exercise.name+' media must be marked approved');
  assert.equal(r.media.tier,'professional',exercise.name+' must not be served schematic art');
  assert.equal(r.provisional,false,exercise.name+' must not render as work in progress');
  assert.equal(r.label,null,exercise.name+' is exact, so it must carry no substitution label');
  assert(fs.existsSync(r.media.start),exercise.name+' points at a missing file: '+r.media.start);
  // One illustration must never stand in for two different movements.
  assert(!seenImages.has(r.media.start),'two exercises share one illustration: '+r.media.start);
  seenImages.add(r.media.start);
}

// A composite holds start, midpoint and finish in one frame with its own labels burned in, so
// it must render as a single image and must never be cross-faded as a fake two-position demo.
for(const name of ['Barbell Bench Press','Band Face Pull','Ab Wheel Rollout']){
  const record=resolver.resolveOne(name).media;
  assert.equal(record.layout,'composite',name+' should be a composite illustration');
  assert.equal(record.finish,null,name+' must not declare a second frame it does not have');
  assert.equal(resolver.legacyShape(name).frames.length,1,name+' must expose exactly one frame');
  const panel=window.IronSixVisualDebug.renderPanel({name});
  assert.equal(panel.querySelectorAll('img').length,1,name+' should render one composite image');
  assert.equal(panel.querySelectorAll('svg').length,0,name+' must not fall back to a drawn shape');
  assert(panel.textContent.includes('Iron Six original'),name+' must credit the media it displays');
  assert(!/\bStart\b|\bFinish\b/.test(panel.textContent),name+' must not label a composite with Start/Finish captions');
}

// Every legacy record still points at two real local PNGs under the licence it claims. These
// remain reachable for coach-suggested movements that the workout builders never program.
for(const record of media.records){
  assert(record.source.startsWith('https://github.com/everkinetic/data/blob/446bb9'));
  assert.equal(record.license,'CC BY-SA 4.0');
  assert.equal(record.frames.length,2);
  for(const file of record.frames)assert(fs.readFileSync(file).subarray(0,8).equals(PNG_MAGIC),file+' must be a real local PNG');
  for(const name of record.names){
    const panel=window.IronSixVisualDebug.renderPanel({name});
    assert(panel.querySelectorAll('img').length>=1,name+' should show at least one image');
    assert.equal(panel.querySelectorAll('svg').length,0,name+' must not fall back to a drawn shape');
    const credited=panel.textContent.includes('Everkinetic')||panel.textContent.includes('Iron Six original');
    assert(credited,name+' must credit the media it displays');
  }
}

// Nothing in the manifest may still claim to be work-in-progress art now that the approved
// library is complete, and no record may reference a file that is not in the repo.
for(const record of manifest.media){
  assert.notEqual(record.status,'schematic',record.id+' is still marked schematic');
  for(const frame of [record.thumbnail,record.start,record.finish,...(record.motion||[])])
    if(frame)assert(fs.existsSync(frame),record.id+' references a missing file: '+frame);
}

// The safety property that matters: a substitute may be shown, but never silently. Full exact
// coverage means nothing substitutes today, so this is asserted over everything the app can ask
// for rather than pinned to one movement — it holds vacuously now and bites the moment an
// exercise is added without art.
const askable=[...registry.exercises.map(e=>e.name),...media.records.flatMap(r=>r.names),'Cossack Lunge','Jefferson Curl'];
for(const name of askable){
  const r=resolver.resolveOne(name);
  if(r.tier>=4&&r.media){
    assert(r.label&&r.label.length,name+' shows a substitute and must carry a label');
    assert(r.label.includes(r.via),name+' must name the movement it is actually showing');
  }
  if(r.tier===6)assert.equal(r.media,null,name+' resolved to nothing but still carried media');
}

// An exercise with nothing close at all states that plainly instead of guessing.
const none=resolver.resolve('Cossack Lunge');
if(none.tier===6){
  assert.equal(none.media,null);
  assert(window.IronSixMediaView.gallery({name:'Cossack Lunge'}).includes('Demo coming soon'));
}

// The legacy catalogue itself still refuses inexact matches; substitution is the resolver's
// job and is labelled, not the catalogue quietly widening what counts as a match.
assert.equal(media.resolve('Landmine Squat'),null);
assert.equal(media.resolve('Dumbbell Romanian Deadlift'),null,'barbell and dumbbell mechanics are not interchangeable images');

// A superset resolves each movement independently rather than showing one generic image.
const superset=window.IronSixMediaView.gallery({name:'Barbell Curl + Close-Grip Push-Up'});
const curl=resolver.resolveOne('Barbell Curl').media.start;
const pushUp=resolver.resolveOne('Close-Grip Push-Up').media.start;
assert.notEqual(curl,pushUp,'the two halves of a superset must not share an image');
assert(superset.includes(curl)&&superset.includes(pushUp),'each half of a superset must render its own illustration');

assert(window.IronSixMediaView.gallery({name:'Tempo Push-Up'}).includes('prescribed pause or tempo'));
assert(!window.IronSixMediaView.gallery({name:'<img src=x onerror=alert(1)>'}).includes('<img src=x'));
const img=window.IronSixVisualDebug.renderPanel({name:'Push-Up'}).querySelector('img');
img.dispatchEvent(new window.Event('error'));
assert(window.document.querySelector('.media-load-error'));
dom.window.close();
