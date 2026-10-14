const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const DAY = 864e5;

function engine() {
  const context = {
    window: {}, EQUIPMENT: [], ROTATION: ['lower_strength'], has: () => false, currentVariant: () => 1,
    optionsFor: () => [], exposureStats: () => ({successful: 0}), variantUnlocked: () => 1, setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('engine.js', 'utf8'), context, {filename: 'engine.js'});
  vm.runInContext(fs.readFileSync('load-progression-v2.js', 'utf8'), context, {filename: 'load-progression-v2.js'});
  const get = name => vm.runInContext(name, context);
  return {baseline: get('baselineLoadObject'), suggested: get('suggestedLoadObject'), seed: get('demographicSeed'), readiness: get('workoutReadinessAdjustment'), roundLoad: get('roundLoad')};
}

const session = (daysAgo, exercise, sets) => ({ts: Date.now() - daysAgo * DAY, details: [{name: exercise.name, base: exercise.base, prescription: exercise.prescription, sets: sets.map(([w, r, rir]) => ({weight: String(w), reps: String(r), rir: String(rir), done: true}))}]});
const lifter = (history, capacities = {}) => ({weight: 200, age: 35, trainingLevel: 'intermediate', today: {}, program: {currentWorkoutKey: 'push_a'}, capacities: {dumbbellMax: 30, barbellMax: 400, ...capacities}, history});

const dbBench = {name: 'Dumbbell Bench Press', base: 'Horizontal press', prescription: '3 × 8–12', seedKey: 'bench'};
const squat = {name: 'Barbell Back Squat', base: 'Squat', prescription: '3 × 6–8', seedKey: 'squat'};

test('the untouched 30 lb dumbbell default no longer cuts a lifter who logs heavier dumbbells', () => {
  const {baseline, roundLoad} = engine();
  const strong = lifter([session(2, dbBench, [[50, 12, 2]])]);
  assert(baseline(strong, dbBench).load >= 50, 'logged 50 lb dumbbells prove the 30 lb default wrong');
  assert.equal(roundLoad(100, dbBench, strong), 50, 'the default cap rises only as far as what was actually lifted');
  const deliberate = lifter([session(2, dbBench, [[50, 12, 2]])], {dumbbellMax: 40});
  assert.equal(roundLoad(100, dbBench, deliberate), 40, 'a capacity the user chose is always respected');
});

test('starting estimates respect the bar, bands and the good morning', () => {
  const {seed} = engine();
  const u = lifter([]);
  assert.equal(seed(u, {name: 'Band Row', requires: ['bands'], seedKey: 'row'}), null, 'band tension gets reps, not pounds');
  const goodMorning = seed(u, {name: 'Barbell Good Morning', seedKey: 'hinge'});
  const backSquat = seed(u, {name: 'Barbell Back Squat', seedKey: 'squat'});
  assert(goodMorning < backSquat / 2, `good morning (${goodMorning}) must start far below the squat (${backSquat})`);
  assert(seed({...u, weight: 130, trainingLevel: 'beginner'}, {name: 'Close-Grip Bench Press', requires: ['barbell'], seedKey: 'triceps'}) >= 45, 'never below an empty bar');
});

test('coming back after weeks off starts lighter; recent training does not', () => {
  const {baseline} = engine();
  assert.equal(baseline(lifter([session(3, squat, [[225, 8, 3]])]), squat).load, 230, 'recent strong set still progresses');
  const back = baseline(lifter([session(60, squat, [[225, 8, 3]])]), squat);
  assert(back.load <= 200 && back.load >= 180, `60 days off should start about 15–20% lighter, got ${back.load}`);
  const imported = baseline(lifter([{...session(0, squat, [[225, 8, 3]]), ts: 1}]), squat);
  assert.equal(imported.load, 230, 'undated imported history is not mistaken for a layoff');
});

test('low-energy volume cuts actually remove sets', () => {
  const {readiness} = engine();
  const plan = readiness({readiness: {energy: 2}, program: {}}, [{name: 'A', base: 'X', sets: 3}, {name: 'B', base: 'Y', sets: 1}]);
  assert.equal(plan[0].sets, 2, '3 sets × 0.75 is 2, not 3');
  assert.equal(plan[1].sets, 1, 'never below one set');
});

test('the deload and pain load factor lightens the suggested weight', () => {
  const {suggested} = engine();
  const u = lifter([session(2, squat, [[200, 7, 2]])]);
  const normal = suggested(u, squat, 0).load;
  const lighter = suggested(u, {...squat, _loadFactor: 0.85, _adaptReason: 'Recent pain'}, 0);
  assert(lighter.load < normal && lighter.load >= normal * 0.8, `${lighter.load} vs ${normal}`);
  assert.equal(lighter.detail, 'Recent pain');
});

function adaptation(phase = 'Build') {
  const context = {window: {}, document: {getElementById() { return null; }, addEventListener() {}}, setTimeout() {}, exerciseAvailable: () => true, exerciseMuscles: () => ['chest']};
  context.window = context;
  context.IronSixTrainerV2 = {trainingState: () => ({phase, fatigue: 50})};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('session-adaptation-v3.js', 'utf8'), context);
  return context.IronSixAdaptiveSessionV3;
}

test('Manage fatigue keeps priority lifts and trims accessories', () => {
  const plan = adaptation('Manage fatigue').adaptPlan({readiness: {energy: 4}, history: [{ts: Date.now() - DAY}]}, [
    {name: 'Bench', sets: 4, priority: 1, prescription: '4 × 6'},
    {name: 'Fly', sets: 3, priority: 3, prescription: '3 × 12'},
  ]);
  assert.equal(plan[0].sets, 4);
  assert.equal(plan[1].sets, 2);
});

test('pain anywhere in a movement pattern lightens that pattern, not just the named exercise', () => {
  const u = {readiness: {energy: 4}, history: [{ts: Date.now() - DAY, details: [{name: 'Barbell Bench Press', base: 'Horizontal press'}]}], trainingFeedback: [{ts: Date.now() - 2 * DAY, feedback: 'pain', exercise: 'Barbell Bench Press'}]};
  const [press] = adaptation().adaptPlan(u, [{name: 'Dumbbell Bench Press', base: 'Horizontal press', sets: 4, prescription: '4 × 8'}]);
  assert.equal(press._loadFactor, 0.85);
  assert.equal(press.sets, 3);
  assert.match(press._adaptReason, /pain/i);
  const [row] = adaptation().adaptPlan(u, [{name: 'Dumbbell Row', base: 'Row', sets: 3, prescription: '3 × 10'}]);
  assert.equal(row._loadFactor, undefined, 'other patterns are untouched');
});

test('the first session after two weeks off trims volume and says why', () => {
  const [ex] = adaptation().adaptPlan({readiness: {energy: 4}, history: [{ts: Date.now() - 20 * DAY}]}, [{name: 'Squat', sets: 4, prescription: '4 × 6'}]);
  assert.equal(ex.sets, 3);
  assert.match(ex._adaptReason, /20 days off/);
});

function trainer() {
  const context = {window: {}, setTimeout, document: {addEventListener() {}, getElementById() { return null; }}};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('trainer-intelligence-v2.js', 'utf8'), context);
  return context.IronSixTrainerV2 || context.window.IronSixTrainerV2;
}
function weeks(count, perWeek, setsPerSession, {lastTwoWeeksSets} = {}) {
  const history = [];
  for (let w = 0; w < count; w++) for (let s = 0; s < perWeek; s++) {
    const daysAgo = w * 7 + s + 0.5, sets = daysAgo <= 14 && lastTwoWeeksSets ? lastTwoWeeksSets : setsPerSession;
    history.push({ts: Date.now() - daysAgo * DAY, readiness: {energy: 4}, details: [{name: 'Bench', sets: Array.from({length: sets}, () => ({weight: '100', reps: '8', rir: '2', done: true}))}]});
  }
  return history;
}

test('fatigue follows the lifter’s own baseline instead of fixed set counts', () => {
  const t = trainer();
  const three = t.trainingState({history: weeks(5, 3, 16)});
  const five = t.trainingState({history: weeks(5, 5, 16)});
  assert(three.fatigue < 45 && five.fatigue < 45, `steady training is not fatigue on its own (${three.fatigue}, ${five.fatigue})`);
  const spike = t.trainingState({history: weeks(5, 3, 16, {lastTwoWeeksSets: 26})});
  assert(spike.fatigue > three.fatigue + 15, `a jump to ~1.6× usual volume raises fatigue (${three.fatigue} → ${spike.fatigue})`);
});

test('six straight hard weeks or falling lifts push toward a deload', () => {
  const t = trainer();
  const long = t.trainingState({history: weeks(7, 3, 16)});
  const short = t.trainingState({history: weeks(4, 3, 16)});
  assert(long.fatigue >= short.fatigue + 15, `six-plus unbroken weeks add fatigue (${short.fatigue} → ${long.fatigue})`);
  const falling = weeks(4, 2, 10).map((h, i, all) => ({...h, details: [{name: 'Bench', sets: [{weight: String(i < 2 ? 90 : 100), reps: '8', rir: '2', done: true}]}, {name: 'Squat', sets: [{weight: String(i < 2 ? 140 : 150), reps: '8', rir: '2', done: true}]}]}));
  assert(t.trainingState({history: falling}).fatigue >= t.trainingState({history: weeks(4, 2, 10)}).fatigue + 15, 'two lifts falling 3%+ for two sessions add fatigue');
});
