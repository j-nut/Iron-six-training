const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const media=require('../exercise-media-catalog.js');
const registry=require('../exercise-registry.js');
const resolver=require('../exercise-media-resolver.js');
const dom=new JSDOM('<head></head><body><section id="coach"><div class="section"><div class="section-head"></div></div></section></body>',{runScripts:'outside-only'});
const ctx=dom.getInternalVMContext();
// Registry, manifest and resolver must load before exercise-media.js, which consumes them.
for(const file of ['exercise-media-catalog.js','exercise-registry.js','exercise-media-manifest.js','exercise-media-resolver.js','exercise-media.js','exercise-guide.js','exercise-visuals.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const {window}=dom;

// Every legacy record still points at two real local PNGs under the licence it claims.
for(const record of media.records){
  assert(record.source.startsWith('https://github.com/everkinetic/data/blob/446bb9'));
  assert.equal(record.license,'CC BY-SA 4.0');
  assert.equal(record.frames.length,2);
  for(const file of record.frames)assert(fs.readFileSync(file).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),file+' must be a real local PNG');
  for(const name of record.names){
    const panel=window.IronSixVisualDebug.renderPanel({name});
    assert.equal(panel.querySelectorAll('img').length,2,name+' should show start and finish');
    assert.equal(panel.querySelectorAll('svg').length,0,name+' must not fall back to a drawn shape');
    // First-party art may now outrank the legacy image for a movement; either way the panel
    // must credit whatever it actually rendered.
    const credited=panel.textContent.includes('Everkinetic')||panel.textContent.includes('Iron Six original');
    assert(credited,name+' must credit the media it displays');
  }
}

// The safety property that matters: a substitute may be shown, but never silently. Anything
// that is not an exact match for the requested movement has to say what it is showing.
const substitute=resolver.resolve('Landmine Squat');
assert(substitute.tier>=4,'Landmine Squat has no exact media and should resolve to a fallback tier');
assert(substitute.label&&substitute.label.length>0,'a fallback must carry a label');
if(substitute.media)assert(substitute.label.includes(substitute.via),'a substitute must name the movement it is actually showing');
const panel=window.IronSixVisualDebug.renderPanel({name:'Landmine Squat'});
if(panel.querySelectorAll('img').length)assert(panel.textContent.includes('reference shown')||panel.textContent.includes('variation shown'),'a rendered substitute must be labelled in the UI');

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
assert(superset.includes('bicep-curls-with-barbell-1.png')&&superset.includes('close-triceps-pushup-1.png'));

assert(window.IronSixMediaView.gallery({name:'Tempo Push-Up'}).includes('prescribed pause or tempo'));
assert(!window.IronSixMediaView.gallery({name:'<img src=x onerror=alert(1)>'}).includes('<img src=x'));
const img=window.IronSixVisualDebug.renderPanel({name:'Push-Up'}).querySelector('img');
img.dispatchEvent(new window.Event('error'));
assert(window.document.querySelector('.media-load-error'));
dom.window.close();
