const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function contextWithEngine() {
  const context = {
    window: {},
    EQUIPMENT: [],
    ROTATION: ['lower_strength'],
    has: () => false,
    currentVariant: () => 1,
    optionsFor: () => [],
    exposureStats: () => ({successful: 0}),
    variantUnlocked: () => 1,
    setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('engine.js', 'utf8'), context, {filename: 'engine.js'});
  vm.runInContext(fs.readFileSync('load-progression-v2.js', 'utf8'), context, {filename: 'load-progression-v2.js'});
  return context;
}

const context = contextWithEngine();
const recommend = vm.runInContext('nextSetRecommendation', context);
const baseline = vm.runInContext('baselineLoadObject', context);
const suggested = vm.runInContext('suggestedLoadObject', context);

const bandCurl = {name: 'Band Hamstring Curl', base: 'Knee flexion', prescription: '2 × 15–25', seedKey: 'ham_curl'};
const user = {
  weight: 220,
  trainingLevel: 'intermediate',
  today: {'0-0': {weight: '15', reps: '20', rir: '5', feedback: 'easy', done: true}},
  history: [],
  program: {currentWorkoutKey: 'lower_strength'},
  capacities: {barbellMax: 300, dumbbellMax: 50},
};

const exact = recommend(user, bandCurl, 0);
assert.equal(exact.load, 20, '15 lb must not round back to 15 when strong evidence says the load is too easy');
assert.equal(exact.reps, 15, 'a large discrete load jump should reset a wide rep range toward its lower bound');
assert.match(exact.text, /increase the load/i);

user.today['0-0'] = {weight: '15', reps: '20', rir: '4', done: true};
const moderate = recommend(user, bandCurl, 0);
assert.equal(moderate.load, 15, 'moderate reserve should not force a 33% band-load jump');
assert.equal(moderate.reps, 22, 'moderate reserve should progress reps when the next load step is disproportionately large');

user.today['0-0'] = {weight: '15', reps: '20', rir: '4', feedback: 'easy', done: true};
const corroborated = recommend(user, bandCurl, 0);
assert.equal(corroborated.load, 20, 'Too easy should corroborate high RIR and unlock the next discrete load step');
assert.equal(corroborated.reps, 15);

const squat = {name: 'Barbell Back Squat', base: 'Squat', prescription: '4 × 6–8', seedKey: 'squat'};
user.today = {'0-0': {weight: '100', reps: '8', rir: '3', done: true}};
assert.deepEqual(
  JSON.parse(JSON.stringify(recommend(user, squat, 0))),
  {load: 105, reps: 7, label: 'You beat the target — add a little weight', direction: 'up', text: 'You beat the target — add a little weight: try about 105 lb × 7 next set.'},
  'existing sensible barbell progression must remain intact'
);

user.today = {'0-0': {weight: '15', reps: '20', rir: '5', feedback: 'easy', done: true}};
const live = suggested(user, bandCurl, 0);
assert.equal(live.load, 20, 're-rendering the exercise card must preserve the corrected next-set load');
assert.equal(live.target, 15);

user.today = {};
user.history = [{
  ts: Date.now(),
  details: [{
    name: 'Band Hamstring Curl',
    base: 'Knee flexion',
    sets: [{weight: '15', reps: '20', rir: '5', feedback: 'easy', done: true}],
  }],
}];
const carried = baseline(user, bandCurl);
assert.equal(carried.load, 20, 'strong recent underload evidence must carry into the next workout instead of rounding back down');
assert.equal(carried.target, 15);
assert.equal(carried.confidence, 'Recent performance');

user.today = {'0-0': {weight: '15', reps: '20', rir: '', feedback: 'easy', done: true}};
const subjectiveOnly = recommend(user, bandCurl, 0);
assert.equal(subjectiveOnly.load, 15, 'subjective feedback alone should not force a 33% jump when reps can progress safely');
assert.equal(subjectiveOnly.reps, 22);

user.today = {'0-0': {weight: '100', reps: '5', rir: '0', done: true}};
assert.equal(recommend(user, squat, 0).load, 95, 'clear failure evidence should still reduce the load by a real discrete step');

console.log('load progression v2 regression checks passed');

// Manual performance must outrank an older heavy median even when the newest set
// earns a hold recommendation, and imported history need not arrive sorted.
user.today = {};
user.history = [
  {ts: 100, details: [{...squat, sets: Array.from({length: 5}, () => ({weight: '200', reps: '7', rir: '2', done: true}))}]},
  {ts: 200, details: [{...squat, sets: [{weight: '100', reps: '7', rir: '2', done: true}]}]},
];
assert.equal(baseline(user, squat).load, 100, 'latest on-target manual reduction must persist next session');
user.history[1].details[0].sets[0].rir = '';
assert.equal(baseline(user, squat).load, 100, 'missing RIR must not erase actual latest load');

const dumbbell = {name: 'Dumbbell Bench Press', base: 'Horizontal press', seedKey: 'bench', prescription: '3 × 8–12'};
user.benchBest = '225 x 8';
user.history = [{ts: 300, details: [{name: 'Barbell Bench Press', base: 'Horizontal press', sets: [{weight: '225', reps: '8', rir: '2', done: true}]}]}];
const prior = vm.runInContext('priorPerformance', context);
assert.equal(prior(user, dumbbell).sets.length, 0, 'barbell total must never become a per-hand dumbbell target');
assert.equal(baseline(user, dumbbell).confidence, 'Conservative starting estimate', 'bench reference is specific to barbell bench');
assert(baseline(user, dumbbell).load < 100);

const structured = {...squat, prescription: '1 top set × 4–6, then 3 × 6–8'};
user.history = [{ts: 400, details: [{...structured, sets: [
  {setIndex: 0, weight: '200', reps: '5', rir: '2', done: true},
  {setIndex: 1, weight: '180', reps: '7', rir: '2', done: true},
  {setIndex: 2, weight: '180', reps: '7', rir: '2', done: true},
]}]}];
assert.equal(baseline(user, structured).load, 200, 'a historical backoff must not replace next session top load');
user.history[0].details[0].sets.shift();
assert.equal(prior(user, structured).sets.length, 0, 'a skipped top set must not relabel a completed backoff as top');

const reps = vm.runInContext('repRange', context);
assert.deepEqual(Array.from(reps({prescription: '3 × 5'})), [5, 5], 'fixed prescriptions must not silently turn into 8–12 reps');
assert.deepEqual(Array.from(reps({prescription: '3 × 30 seconds'})), [8, 12], 'hold seconds must not become repetitions');

const applyMemory = vm.runInContext('applyTrainerMemory', context);
const fractional = {load: 7.5, target: 10, text: '7.5 lb × 10'};
user.trainerMemory = {reviewedAt: Date.now(), verifiedForWorkoutKey: user.program.currentWorkoutKey, verifiedPlan: [{name: dumbbell.name, base: dumbbell.base, verifiedLoad: 7.5, verifiedReps: 10}]};
assert.equal(applyMemory(user, dumbbell, fractional).load, 7.5, 'rounding AI verification must not increase a fractional load by 33%');
user.trainerMemory = {adjustments: {[dumbbell.base]: {factor: 1.03, updatedAt: Date.now()}}};
assert.equal(applyMemory(user, dumbbell, fractional).load, 7.5, 'rounding a 3% AI factor must stay within the actual 3% bound');
const calibrateSuggestion = vm.runInContext('calibratedSuggestion', context);
user.sessionCalibration = {factor: 1.06};
assert.equal(calibrateSuggestion(user, dumbbell, 0, fractional).load, 7.5, 'cross-session calibration must respect its 6% limit after rounding');
