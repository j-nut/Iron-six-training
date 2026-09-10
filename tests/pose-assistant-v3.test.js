const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('camera assistant v3 stays opt-in and contains no upload path',()=>{
  const source=fs.readFileSync('pose-spike.js','utf8');
  assert(source.indexOf("if(!readFlag())return")<source.indexOf('getUserMedia'));
  assert(source.includes('Camera + form + voice'));
  assert(source.includes('assistantVersion:3'));
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

test('pose tracking tuning supports side-on acquisition and brief confidence flicker',()=>{
  const source=fs.readFileSync('pose-form-coach.js','utf8');
  assert(source.includes('confidence:0.58'));
  assert(source.includes('acquireMs:650'));
  assert(source.includes('lossMs:900'));
  assert(source.includes('softInterrupts>=15'));
  assert(source.includes('__ironSixForceInterrupt'));
  assert(source.includes('squat:500'));
  assert(source.includes('__ironSixTrackingTuned'));
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

test('Android web packaging carries dynamically loaded form and voice helpers',()=>{
  const source=fs.readFileSync('scripts/build-android-web.mjs','utf8');
  assert(source.includes("'pose-form-coach.js'"));
  assert(source.includes("'workout-voice.js'"));
});
