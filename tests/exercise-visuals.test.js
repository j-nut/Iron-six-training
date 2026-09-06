const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const media=require('../exercise-media-catalog.js');
const dom=new JSDOM('<head></head><body><section id="coach"><div class="section"><div class="section-head"></div></div></section></body>',{runScripts:'outside-only'});
const ctx=dom.getInternalVMContext();
for(const file of ['exercise-media-catalog.js','exercise-media.js','exercise-guide.js','exercise-visuals.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const {window}=dom;
for(const record of media.records){
  assert(record.source.startsWith('https://github.com/everkinetic/data/blob/446bb9'));
  assert.equal(record.license,'CC BY-SA 4.0');
  assert.equal(record.frames.length,2);
  for(const file of record.frames)assert(fs.readFileSync(file).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),file+' must be a real local PNG');
  for(const name of record.names){
    const panel=window.IronSixVisualDebug.renderPanel({name});
    assert.equal(panel.querySelectorAll('img').length,2);
    assert.equal(panel.querySelectorAll('svg').length,0);
    assert(panel.textContent.includes('Everkinetic'));
  }
}
const panel=window.IronSixVisualDebug.renderPanel({name:'Landmine Squat'});
assert.equal(panel.querySelectorAll('img,svg').length,0,'missing exact images must not use generic substitutes');
assert(panel.textContent.includes('Exact illustration not yet available'));
assert.equal(media.resolve('Landmine Squat'),null);
assert.equal(media.resolve('Dumbbell Romanian Deadlift'),null,'barbell and dumbbell mechanics are not interchangeable images');
const superset=window.IronSixMediaView.gallery({name:'Barbell Curl + Close-Grip Push-Up'});
assert(superset.includes('bicep-curls-with-barbell-1.png')&&superset.includes('close-triceps-pushup-1.png'));
assert(window.IronSixMediaView.gallery({name:'Tempo Push-Up'}).includes('prescribed pause or tempo'));
assert(!window.IronSixMediaView.gallery({name:'<img src=x onerror=alert(1)>'}).includes('<img src=x'));
const img=window.IronSixVisualDebug.renderPanel({name:'Push-Up'}).querySelector('img');
img.dispatchEvent(new window.Event('error'));
assert(window.document.querySelector('.media-load-error'));
dom.window.close();
