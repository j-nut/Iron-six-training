const {test}=require('node:test');
const assert=require('node:assert/strict');
const isolation=require('../pose-person-isolation.js');

function detection(x,y,w,h,score=0.9,name='person'){
  return {boundingBox:{originX:x,originY:y,width:w,height:h},categories:[{categoryName:name,score}]};
}
function box(x,y,w,h){return {x,y,w,h,cx:x+w/2,cy:y+h/2,score:0.9}}
function poseForBox(b,confidence=0.8){
  const p=Array.from({length:33},()=>({x:b.cx,y:b.cy,visibility:0.01,presence:0.01}));
  const pts={0:[b.cx,b.y+.05*b.h],11:[b.x+.42*b.w,b.y+.22*b.h],12:[b.x+.58*b.w,b.y+.22*b.h],23:[b.x+.45*b.w,b.y+.48*b.h],24:[b.x+.55*b.w,b.y+.48*b.h],25:[b.x+.44*b.w,b.y+.68*b.h],26:[b.x+.56*b.w,b.y+.68*b.h],27:[b.x+.43*b.w,b.y+.92*b.h],28:[b.x+.57*b.w,b.y+.92*b.h]};
  for(const [i,[x,y]] of Object.entries(pts))p[i]={x,y,visibility:confidence,presence:confidence};return p;
}
function acquire(tracker,b,start=0){let r;for(let t=start;t<=start+330;t+=55)r=tracker.push([b],t);return {r,t:start+385}}

test('MediaPipe pixel detections normalize to frame coordinates and ignore non-person classes',()=>{
  const result={detections:[detection(100,50,300,600,0.91),detection(10,20,80,90,0.8,'chair')]};
  const out=isolation.normalizeDetections(result,1000,1000);
  assert.equal(out.length,1);assert.equal(out[0].x,0.1);assert.equal(out[0].y,0.05);assert.equal(out[0].w,0.3);assert.equal(out[0].h,0.6);
});

test('one centered person acquires a persistent lock',()=>{
  const tracker=isolation.createPersonTracker(),b=box(0.32,0.12,0.30,0.76),{r}=acquire(tracker,b);
  assert.equal(r.locked,true);assert.equal(r.needsRelock,false);assert(r.roi);assert(r.roi.w>=b.w);assert(r.roi.h>=b.h);
});

test('a distant bystander cannot replace the locked lifter',()=>{
  const tracker=isolation.createPersonTracker(),user=box(0.18,0.12,0.28,0.76),{t}=acquire(tracker,user);
  for(let i=0;i<10;i++){
    const moving=box(0.18+i*.003,0.12,0.28,0.76),bystander=box(0.68,0.10,0.26,0.78);
    const r=tracker.push(i%2?[bystander,moving]:[moving,bystander],t+i*55);
    assert.equal(r.locked,true);assert(Math.abs(r.box.cx-moving.cx)<0.09,'lock should stay on the trajectory of the original user');
  }
});

test('brief detector misses coast the person box instead of dropping identity',()=>{
  const tracker=isolation.createPersonTracker(),user=box(0.32,0.12,0.30,0.76),{t}=acquire(tracker,user);
  let r;for(let i=0;i<12;i++)r=tracker.push([],t+i*100);
  assert.equal(r.locked,true);assert.equal(r.needsRelock,false);assert.equal(r.coasting,true);assert(r.roi,'ROI should remain available during a short detector dropout');
  r=tracker.push([box(0.33,0.12,0.30,0.76)],t+1250);assert.equal(r.visible,true);assert.equal(r.needsRelock,false);
});

test('pose geometry refreshes an existing isolation lock between detector frames',()=>{
  const tracker=isolation.createPersonTracker(),user=box(0.30,0.10,0.32,0.80),{t}=acquire(tracker,user);
  const moved=box(0.34,0.10,0.32,0.80),r=tracker.observePose(poseForBox(moved),t+120);
  assert.equal(r.locked,true);assert.equal(r.needsRelock,false);assert.equal(r.source,'pose');assert(tracker.diagnostics().poseRefreshes>=1);
});

test('sustained detector and pose loss requires explicit re-lock',()=>{
  const tracker=isolation.createPersonTracker(),user=box(0.32,0.12,0.30,0.76),{t}=acquire(tracker,user);
  const r=tracker.sample(t+3400);assert.equal(r.locked,true);assert.equal(r.needsRelock,true);assert.equal(tracker.push([user],t+3500).needsRelock,true,'a new detection must not silently acquire after sustained loss');
});

test('ROI expands and clamps at frame boundaries',()=>{
  const roi=isolation.roiFromBox(box(0.01,0.02,0.22,0.60));assert(roi.x>=0);assert(roi.y>=0);assert(roi.x+roi.w<=1.000001);assert(roi.y+roi.h<=1.000001);assert(roi.w>=0.34);assert(roi.h>=0.72);
});

test('landmarks from the crop remap back to full-frame coordinates',()=>{
  const roi={x:0.2,y:0.1,w:0.5,h:0.8},poses=[[{x:0.5,y:0.25,z:0.1,visibility:0.8,presence:0.8}]],out=isolation.remapLandmarks(poses,roi);
  assert(Math.abs(out[0][0].x-0.45)<1e-9);assert(Math.abs(out[0][0].y-0.30)<1e-9);assert.equal(out[0][0].visibility,0.8);
});
