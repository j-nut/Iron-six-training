const assert = require('node:assert/strict');
const fs = require('node:fs');

const required = [
  'exercise-guide.js?v=8',
  'exercise-visuals.js?v=9',
  'local-ai-fallback.js?v=7',
  'coach.js?v=10',
  'social-auth.js?v=1',
  'cloud-sync.js?v=14',
  'cloud-history-sync.js?v=8'
];

for (const page of ['index.html', 'live.html']) {
  const html = fs.readFileSync(page, 'utf8');
  assert(html.includes('core.js?v=13'), `${page} must load persistent trainer memory`);
  assert(html.includes('engine.js?v=13'), `${page} must load the whole-workout calibration engine`);
  assert(html.includes('ui1.js?v=13'), `${page} must show the AI trainer review`);
  assert(html.includes('ui3.js?v=13'), `${page} must run the post-workout trainer review`);
  assert(html.includes('ui2.js?v=14'), `${page} must load the real-time workout updater`);
  assert(html.indexOf('exercise-media-catalog.js?v=1') < html.indexOf('exercise-media.js?v=1'));
  assert(html.indexOf('exercise-media.js?v=1') < html.indexOf('ui2.js?v=14'));
  let previous = html.indexOf('ui3.js');
  assert.notEqual(previous, -1, `${page} must load ui3.js`);
  for (const script of required) {
    const position = html.indexOf(script);
    assert(position > previous, `${page} must load ${script} in order`);
    previous = position;
  }
}

const ui = fs.readFileSync('ui3.js', 'utf8');
assert(!ui.includes('loadIronSixScript'), 'feature scripts must not depend on the old dynamic loader');
assert(ui.includes('function chooseWorkout(key)'), 'Today must provide a manual workout chooser');
assert(ui.includes('u.program.currentWorkoutKey=key'), 'manual workout choice must update the active workout');
assert(ui.includes('u.today={}'), 'changing workouts must clear incompatible current set entries');
assert(ui.includes('Finish all sets of the first exercise'), 'Today must explain the intended exercise order');

const visuals = fs.readFileSync('exercise-visuals.js', 'utf8');
const guide = fs.readFileSync('exercise-guide.js', 'utf8');
const coach = fs.readFileSync('coach.js', 'utf8');
assert(visuals.includes('window.__ironSixGuideFocus=true'), 'exercise links must request guide-first focus');
assert(!visuals.includes("key==='hinge'||key==='row'||key==='rear_delt'||key==='lat_iso'"), 'unrelated exercises must not share the old generic stick-figure pose');
assert(guide.indexOf("b==='arms'") < guide.indexOf("b==='curl'"), 'supersets must use the combined arms diagram before generic curl matching');
assert(coach.includes("guide.scrollIntoView({behavior:'smooth',block:'start'})"), 'coach rendering must preserve guide-first focus');

for (const page of ['index.html','live.html']) { const html=fs.readFileSync(page,'utf8'); assert(html.indexOf('session-planner.js')>html.indexOf('engine.js')); assert(html.indexOf('workout-store.js')<html.indexOf('ui2.js')); assert(html.indexOf('circuit-player.js')>html.indexOf('ui3.js')); }

const runtimes=['coach-recovery.js','auth-hardening.js','adaptive-insights.js','trainer-intelligence-v2.js','progress-analytics-v2.js','music-originals.js','music.js'];
const cloudHistory = fs.readFileSync('cloud-history-sync.js','utf8');
for (const runtime of runtimes) assert(cloudHistory.includes(runtime),`runtime loader must request ${runtime}`);
assert(cloudHistory.indexOf('adaptive-insights.js')<cloudHistory.indexOf('progress-analytics-v2.js'),'base analytics must load before deeper analytics');
assert(cloudHistory.indexOf('music-originals.js')<cloudHistory.indexOf('music.js'), 'originals catalog must load before the music player');
for (const builder of ['scripts/build-web.mjs','scripts/build-android-web.mjs']) {
  const source=fs.readFileSync(builder,'utf8');
  for (const runtime of runtimes) assert(source.includes(runtime),`${builder} must package ${runtime}`);
}

for (const backend of ['api/coach.js','supabase/functions/coach/index.ts']) {
  const source=fs.readFileSync(backend,'utf8');
  assert(source.includes('trainingState'),`${backend} must receive training block state`);
  assert(source.includes('setFeedback'),`${backend} must receive set feedback`);
  assert(source.includes('analytics'),`${backend} must receive progress analytics`);
}
assert(fs.existsSync('api/music.js'),'music discovery API must ship');
assert(fs.existsSync('progress-analytics-v2.js'),'deeper progress analytics must ship');
