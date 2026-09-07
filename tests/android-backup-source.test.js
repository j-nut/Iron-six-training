const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Android workout backup stages payload before launching document picker',()=>{
  const source=fs.readFileSync('android/app/src/main/java/com/ironsix/training/WorkoutBackupPlugin.java','utf8');
  assert(source.includes('openFileOutput(PENDING_BACKUP'));
  assert(source.includes('new FileInputStream(staged)'));
  assert(!source.includes('call.getString("json", "{}")'));
  assert(source.includes('response.put("bytes", total)'));
});
