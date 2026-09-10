const assert = require('node:assert/strict');
const fs = require('node:fs');

const required = [
  'exercise-guide.js?v=8','exercise-visuals.js?v=9','equipment-catalog.js?v=1','equipment-exercise-library.js?v=1','equipment-coverage.js?v=1','local-ai-fallback.js?v=7','coach.js?v=12','equipment-manager.js?v=1','social-auth.js?v=1','cloud-sync.js?v=14','cloud-history-sync.js?v=8','ui-shell.js?v=1'
];
for (const page of ['index.html','live.html']) {
  const html=fs.readFileSync(page,'utf8');
  assert(html.includes('core.js?v=14'));assert(html.includes('engine.js?v=14'));assert(html.includes('ui1.js?v=15'));assert(html.includes('ui3.js?v=14'));assert(html.includes('ui2.js?v=15'));
  assert(html.indexOf('exercise-media-catalog.js?v=1')<html.indexOf('exercise-media.js?v=2'));
  assert(html.indexOf('exercise-media.js?v=2')<html.indexOf('ui2.js?v=15'));
  let previous=html.indexOf('ui3.js');assert.notEqual(previous,-1);
  for(const script of required){const position=html.indexOf(script);assert(position>previous,`${page} must load ${script} in order`);previous=position}
}
const ui=fs.readFileSync('ui3.js','utf8');assert(!ui.includes('loadIronSixScript'));assert(ui.includes('function chooseWorkout(key)'));assert(ui.includes('u.program.currentWorkoutKey=key'));assert(ui.includes('u.today={}'));assert(ui.includes('Finish all sets of one exercise before moving to the next'));
const visuals=fs.readFileSync('exercise-visuals.js','utf8'),guide=fs.readFileSync('exercise-guide.js','utf8'),coach=fs.readFileSync('coach.js','utf8');
assert(visuals.includes('window.__ironSixGuideFocus=true'));assert(!visuals.includes("key==='hinge'||key==='row'||key==='rear_delt'||key==='lat_iso'"));assert(guide.indexOf("b==='arms'")<guide.indexOf("b==='curl'"));assert(coach.includes("guide.scrollIntoView({behavior:'smooth',block:'start'})"));
for(const page of ['index.html','live.html']){const html=fs.readFileSync(page,'utf8');assert(html.indexOf('session-planner.js')>html.indexOf('engine.js'));assert(html.indexOf('workout-store.js')<html.indexOf('ui2.js'));assert(html.indexOf('circuit-player.js')>html.indexOf('ui3.js'))}
const runtimes=['coach-recovery.js','auth-hardening.js','adaptive-insights.js','trainer-intelligence-v2.js','progress-analytics-v2.js','session-adaptation-v3.js','media-experience-v2.js','music-originals.js','music.js','session-resume.js'];
const cloudHistory=fs.readFileSync('cloud-history-sync.js','utf8');for(const runtime of runtimes)assert(cloudHistory.includes(runtime),`runtime loader must request ${runtime}`);
assert(cloudHistory.indexOf('adaptive-insights.js')<cloudHistory.indexOf('progress-analytics-v2.js'));assert(cloudHistory.indexOf('progress-analytics-v2.js')<cloudHistory.indexOf('session-adaptation-v3.js'));assert(cloudHistory.indexOf('music-originals.js')<cloudHistory.indexOf('music.js'));
for(const builder of ['scripts/build-web.mjs','scripts/build-android-web.mjs']){const source=fs.readFileSync(builder,'utf8');for(const runtime of runtimes)assert(source.includes(runtime),`${builder} must package ${runtime}`)}
for(const backend of ['api/coach.js','supabase/functions/coach/index.ts']){const source=fs.readFileSync(backend,'utf8');assert(source.includes('trainingState'));assert(source.includes('setFeedback'));assert(source.includes('analytics'))}
for(const file of ['api/music.js','progress-analytics-v2.js','session-adaptation-v3.js','media-experience-v2.js'])assert(fs.existsSync(file),`${file} must ship`);
for(const file of ['equipment-catalog.js','equipment-exercise-library.js','equipment-coverage.js','equipment-manager.js','api/equipment-exercises.js'])assert(fs.existsSync(file),`${file} must ship`);
// The picker's promise and the generator's output come from the same two files; if the API stops
// importing them it can silently drift from what the UI told the user it would add.
const generator=fs.readFileSync('api/equipment-exercises.js','utf8');
assert(generator.includes("from '../equipment-catalog.js'"),'the generator must resolve equipment names through the shared catalogue');
assert(generator.includes("from '../equipment-exercise-library.js'"),'the generator must bound itself with the shared exercise library');
const manager=fs.readFileSync('equipment-manager.js','utf8');
assert(manager.includes('refreshEquipmentExercises'),'the picker must trigger exercise generation when equipment is added');
assert(manager.includes('Finish or reset the current workout before changing equipment'),'the picker must keep the mid-workout guard');
assert(fs.readFileSync('coach.js','utf8').includes('equipmentCoverage'),'the coach must receive measured equipment coverage');
