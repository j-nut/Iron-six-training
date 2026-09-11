const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('camera assistant stays opt-in, pose-only and contains no upload path',()=>{
  const source=fs.readFileSync('pose-spike.js','utf8');
  assert(source.indexOf("if(!readFlag())return")<source.indexOf('getUserMedia'));
  assert(source.includes('Camera + form + voice'));
  assert(!/fetch\(|XMLHttpRequest|supabase|\.upload\(/.test(source));
  // Physical-phone lesson: running a second synchronous detector beside PoseLandmarker on the main
  // thread froze the camera and the UI. The recovery runtime is one multi-person pose model.
  assert(!/ObjectDetector|categoryAllowlist|PERSON_DETECT_MS/.test(source));
  assert(source.includes('const MAX_POSES=3'));
  assert(source.includes('numPoses:MAX_POSES'));
  assert(source.includes('personDetector:false'));
  assert(source.includes('poseOnly:true'));
});

test('camera assistant preserves the whole displayed frame and exposes form-analysis status',()=>{
  const source=fs.readFileSync('pose-spike.js','utf8');
  assert(source.includes('object-fit:contain'));
  assert(source.includes("stage.style.setProperty('--pose-stage-ratio'"));
  assert(source.includes('form analysis was skipped'));
  assert(source.includes('analyzed: no camera-visible issue crossed the cue threshold'));
  assert(source.includes('are not validated yet'));
  assert(source.includes('video?.videoWidth&&video?.videoHeight'));
});

test('pose camera compatibility shim restores known-good wide capture for portrait-crop requests',()=>{
  const source=fs.readFileSync('pose-form-coach.js','utf8');
  assert(source.includes('isPosePortraitRequest'));
  assert(source.includes("width:{ideal:960},height:{ideal:720}"));
  assert(source.includes("resizeMode:{ideal:'none'}"));
  assert(source.includes('getCapabilities'));
  assert(source.includes('zoom:caps.zoom.min'));
  assert(source.includes('__ironSixPoseCameraCompat'));
});

test('pose tracking associates the lifter inside the pose tracker and preserves v4/v5 motion association',()=>{
  const spike=fs.readFileSync('pose-spike.js','utf8');
  const form=fs.readFileSync('pose-form-coach.js','utf8');
  const isolation=fs.readFileSync('pose-person-isolation.js','utf8');
  const counter=fs.readFileSync('pose-rep-counter.js','utf8');
  assert(spike.includes('subjectPresent'));
  assert(spike.includes('createSubjectTracker'));
  assert(isolation.includes('createPersonTracker'));
  assert(isolation.includes('roiFromBox'));
  assert(isolation.includes('remapLandmarks'));
  assert(form.includes('lowConfidence:0.18'));
  assert(form.includes('highConfidence:0.48'));
  assert(form.includes('acquireMs:420'));
  assert(form.includes('maxCoastMs:950'));
  assert(form.includes('subjectAssociation'));
  assert(form.includes('presenceCoasts'));
  assert(form.includes('__ironSixSubjectTrackerV5'));
  assert(counter.includes('const MIN_VISIBILITY=0.42'));
  // Behaviour, not spelling: a locked subject must ride out a longer pose dropout than an
  // unlocked one. Asserting the constant's NAME pinned an implementation detail and broke the
  // moment those deadlines moved from frame counts to milliseconds, which they had to.
  {
    const api=require('../pose-rep-counter.js'),rule=api.RULES.find(r=>r.id==='squat');
    const gapSurvives=(ms,subjectPresent)=>{
      const c=api.createCounter(rule),lm=[];
      for(let i=0;i<33;i++)lm[i]={x:0.5,y:0.5,visibility:0.05};
      for(const [i,p] of [[23,{x:.5,y:.5}],[25,{x:.5,y:.7}],[27,{x:.5,y:.9}]])lm[i]={x:p.x,y:p.y,visibility:.95,presence:.95};
      let t=0;
      for(let i=0;i<20;i++){c.push({landmarks:lm,t,aspect:1,framed:true,subjectPresent});t+=33}
      for(let i=0;i*33<ms;i++){c.push({landmarks:null,t,aspect:1,framed:true,subjectPresent});t+=33}
      return c.state().phase!=='lost';
    };
    assert(gapSurvives(400,false),'a brief dropout must not drop the track');
    assert(!gapSurvives(1000,false),'an unlocked track must give up inside a second');
    assert(gapSurvives(1000,true),'a locked subject must ride out the same gap');
    assert(!gapSurvives(2000,true),'but not indefinitely');
  }
});

test('Android voice bridge is permission-gated, one-shot and destroyed after use',()=>{
  const source=fs.readFileSync('android/app/src/main/java/com/ironsix/training/VoiceCommandPlugin.java','utf8');
  assert(source.includes('@Permission(alias = "microphone"'));
  assert(source.includes('requestPermissionForAlias("microphone"'));
  assert(source.includes('createOnDeviceSpeechRecognizer'));
  assert(source.includes('EXTRA_PARTIAL_RESULTS, false'));
  assert(source.includes('recognizer.destroy()'));
  assert(!/FileOutputStream|AudioRecord|MediaRecorder/.test(source));
});

test('Android manifest grants only the media permissions this assistant needs',()=>{
  const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
  assert(manifest.includes('android.permission.CAMERA'));
  assert(manifest.includes('android.permission.RECORD_AUDIO'));
  assert(manifest.includes('android.speech.RecognitionService'));
  assert(!manifest.includes('READ_EXTERNAL_STORAGE'));
  assert(!manifest.includes('WRITE_EXTERNAL_STORAGE'));
});

test('Android web packaging carries dynamically loaded camera helpers',()=>{
  const source=fs.readFileSync('scripts/build-android-web.mjs','utf8');
  assert(source.includes("'pose-person-isolation.js'"));
  assert(source.includes("'pose-form-coach.js'"));
  assert(source.includes("'workout-voice.js'"));
});
