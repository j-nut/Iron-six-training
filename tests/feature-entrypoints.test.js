const assert = require('node:assert/strict');
const fs = require('node:fs');

const required = [
  'exercise-guide.js?v=7',
  'exercise-visuals.js?v=7',
  'local-ai-fallback.js?v=7',
  'coach.js?v=7',
  'cloud-sync.js?v=7',
  'cloud-history-sync.js?v=7'
];

for (const page of ['index.html', 'live.html']) {
  const html = fs.readFileSync(page, 'utf8');
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
const coach = fs.readFileSync('coach.js', 'utf8');
assert(visuals.includes('window.__ironSixGuideFocus=true'), 'exercise links must request guide-first focus');
assert(coach.includes("guide.scrollIntoView({behavior:'smooth',block:'start'})"), 'coach rendering must preserve guide-first focus');
