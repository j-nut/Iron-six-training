const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('camera assistant v3 stays opt-in and contains no upload path',()=>{
  const source=fs.readFileSync('pose-spike.js','utf8');
  assert(source.indexOf("if(!readFlag())return")<source.indexOf('getUserMedia'));
  assert(source.includes('Camera + form + voice'));
  assert(source.includes('assistantVersion:3'));
  assert(source.includes('trackingVersion:5'));
  assert(source.includes('minPoseDetectionConfidence:0.45'));
  assert(source.includes('minPosePresenceConfidence:0.45'));
  assert(source.includes('minTrackingConfidence:0.5'));
  assert(source.includes('confirmedReps'));
  assert(!/fetch\(|XMLHttpRequest|supabase|\.upload\(/.test(source));
});

test('camera assistant preserves the whole displayed frame and exposes form-analysis status',()=>{
  const source=fs.readFileSync('pose-spike.js','utf8');
  assert(source.includes('object-fit:contain'));
  assert(source.includes("stage.style.setProperty('--pose-stage-ratio'"));
  assert(source.includes('form analysis was skipped'));
  assert(source.includes('analyzed: no camera-visible issue crossed the cue threshold'));
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

test('pose tracking v5 isolates one person, crops pose inference and preserves v4 motion association',()=>{
  const spike=fs.readFileSync('pose-spike.js','utf8');
  const form=fs.readFileSync('pose-form-coach.js','utf8');
  const isolation=fs.readFileSync('pose-person-isolation.js','utf8');
  const counter=fs.readFileSync('pose-rep-counter.js','utf8');
  assert(spike.includes("categoryAllowlist:['person']"));
  assert(spike.includes('PERSON_DETECT_MS=240'));
  assert(spike.includes('cropSource(roi)'));
  assert(spike.includes('remapLandmarks'));
  assert(spike.includes('subjectPresent'));
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
  assert(counter.includes('LOCKED_LOST_FRAMES=42'));
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
