const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function engine() {
  const context = {
    window: {}, EQUIPMENT: [], ROTATION: ['lower_strength'], has: () => false, currentVariant: () => 1,
    optionsFor: () => [], exposureStats: () => ({successful: 0}), variantUnlocked: () => 1, setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('engine.js', 'utf8'), context, {filename: 'engine.js'});
  vm.runInContext(fs.readFileSync('load-progression-v2.js', 'utf8'), context, {filename: 'load-progression-v2.js'});
  const get = name => vm.runInContext(name, context);
  return {baseline: get('baselineLoadObject'), recommend: get('nextSetRecommendation'), roundLoad: get('roundLoad')};
}

const bench = {name: 'Barbell Bench Press', base: 'Horizontal press', prescription: '3 × 6–8', seedKey: 'bench'};
const lateral = {name: 'Dumbbell Lateral Raise', base: 'Lateral delts', prescription: '3 × 12–20', seedKey: 'lateral_raise'};
const curl = {name: 'Dumbbell Curl', base: 'Elbow flexion', prescription: '3 × 8–12', seedKey: 'curl'};
const incline = {name: 'Incline Barbell Bench Press', base: 'Horizontal press', prescription: '4 × 5–8', seedKey: 'bench'};
const paused = {name: 'Paused Barbell Bench Press', base: 'Horizontal press', prescription: '4 × 4–6', seedKey: 'bench'};

function user(sessions, capacities = {}) {
  return {
    weight: 200, trainingLevel: 'intermediate', today: {}, program: {currentWorkoutKey: 'push_a'},
    capacities: {barbellMax: 400, dumbbellMax: 60, ...capacities},
    history: sessions.map(([ts, exercise, sets]) => ({ts: Date.now() - 864e5 * 2 + ts, details: [{name: exercise.name, base: exercise.base, prescription: exercise.prescription, sets: sets.map(([weight, reps, rir]) => ({weight: String(weight), reps: String(reps), rir: rir === null ? '' : String(rir), done: true}))}]})),
  };
}

test('a normal fatigue drop-off no longer lowers the next session', () => {
  const {baseline} = engine();
  const result = baseline(user([[1, bench, [[135, 8, 2], [135, 8, 1], [135, 7, 0]]]]), bench);
  assert.equal(result.load, 140, '8 @ RIR 2 on the first set earns the next step even though the last set was a grinder');
});

test('reaching the top of the range with one rep left earns more load next session', () => {
  const {baseline} = engine();
  assert.equal(baseline(user([[1, bench, [[135, 8, 1]]]]), bench).load, 140);
});

test('a hard but in-range top set is repeated next session, not cut', () => {
  const {baseline} = engine();
  assert.equal(baseline(user([[1, bench, [[135, 8, 0]]]]), bench).load, 135);
  assert.equal(baseline(user([[1, bench, [[135, 7, 0]]]]), bench).load, 135);
});

test('a set below the rep range blocks an increase even when another set was strong', () => {
  const {baseline} = engine();
  assert.equal(baseline(user([[1, bench, [[135, 8, 2], [135, 7, 1], [135, 5, 1]]]]), bench).load, 135);
});

test('genuine failure below the range still reduces the load', () => {
  const {baseline} = engine();
  assert.equal(baseline(user([[1, bench, [[135, 5, 0], [135, 4, 0]]]]), bench).load, 130);
});

test('within a session the next-set rules stay conservative', () => {
  const {recommend} = engine();
  const u = user([]);
  u.today = {'0-0': {weight: '135', reps: '8', rir: '1', done: true}};
  assert.equal(recommend(u, bench, 0).load, 135, 'no mid-session increase at RIR 1');
  u.today = {'0-0': {weight: '135', reps: '7', rir: '0', done: true}};
  assert.equal(recommend(u, bench, 0).load, 130, 'a failed set mid-session still lightens the next set');
});

test('an oversized jump on light dumbbells builds reps first, then moves up', () => {
  const {baseline} = engine();
  const building = baseline(user([[1, lateral, [[10, 20, 2]]]]), lateral);
  assert.equal(building.load, 10, '10 → 15 lb is +50%, so stay at 10 lb');
  assert.equal(building.target, 21, 'and add a rep past the range instead');
  const ready = baseline(user([[1, lateral, [[10, 24, 2]]]]), lateral);
  assert.equal(ready.load, 15, 'once reps are well past the range, take the jump');
  assert.equal(ready.target, 12, 'at the bottom of the range');
});

test('a 2.5 lb dumbbell setting allows smaller, direct jumps', () => {
  const {baseline, roundLoad} = engine();
  assert.equal(baseline(user([[1, curl, [[25, 12, 2]]]], {dumbbellStep: 2.5}), curl).load, 27.5);
  const coarse = baseline(user([[1, curl, [[25, 12, 2]]]]), curl);
  assert.equal(coarse.load, 25, 'with only 5 lb steps, 25 → 30 lb (+20%) builds reps first');
  assert.equal(coarse.target, 13);
  assert.equal(roundLoad(11, curl, {capacities: {dumbbellStep: 2.5}}), 10);
  assert.equal(roundLoad(11.5, curl, {capacities: {dumbbellStep: 2.5}}), 12.5);
  assert.equal(roundLoad(12, curl, {capacities: {}}), 10, 'default stays 5 lb');
  assert.equal(roundLoad(11.5, bench, {capacities: {dumbbellStep: 2.5}}), 10, 'the dumbbell setting does not change barbell rounding');
});

test('a rotated main-lift variant starts from the related lift, not a body-weight guess', () => {
  const {baseline} = engine();
  const u = user([[1, bench, [[225, 8, 2], [225, 8, 1]]]]);
  const seeded = baseline(u, incline);
  assert.equal(seeded.confidence, 'Estimated from a related lift');
  assert(seeded.load >= 170 && seeded.load <= 190, `incline should start near 80% of a 225 × 8 bench, got ${seeded.load}`);
  const fromIncline = baseline(user([[1, incline, [[180, 7, 2]]]]), paused);
  const fromBenchScale = 180 * (1 + 9 / 30) * 0.95 / (1 + (5 + 2) / 30);
  assert(fromIncline.load <= Math.ceil(fromBenchScale / 5) * 5, 'a variant never starts heavier than the lift it came from');
  const dumbbellBench = {name: 'Dumbbell Bench Press', base: 'Horizontal press', prescription: '3 × 8–12', seedKey: 'bench'};
  assert.notEqual(baseline(u, dumbbellBench).confidence, 'Estimated from a related lift', 'a barbell total never seeds a per-hand dumbbell');
});

test('the smallest-jump settings survive profile normalisation (sync, restore, reload)', () => {
  const context = {window: {}, localStorage: {getItem() { return null; }, setItem() {}}, crypto: {randomUUID: () => 'id'}, document: {getElementById() { return null; }}};
  vm.createContext(context);
  const source = fs.readFileSync('core.js', 'utf8');
  const start = source.indexOf('function normalizeUser');
  // normalizeUser also sanitises the onboarding/programming contract; those helpers are tested elsewhere.
  vm.runInContext('function normalizedWorkoutDifficultyOverride(v){return v||null}\nfunction programGoal(u){return u.goal||"muscle"}function normalizedDaysPerWeek(v){return v||6}function normalizedStrengthRefs(v){return v||{}}function normalizedLimitations(v){return v||[]}function normalizedPreferences(v){return v||{}}function normalizedOnboarding(v){return v||{}}\nconst DEFAULT_EQUIPMENT={};function normalizeEquipmentName(x){return x}function emptyProgram(){return {}}function emptyTrainerMemory(){return {}}\n' + source.slice(start, source.indexOf('\n', start)), context);
  const normalize = vm.runInContext('normalizeUser', context);
  const kept = normalize({capacities: {dumbbellMax: 50, barbellMax: 300, dumbbellStep: 2.5, barbellStep: 2.5}});
  assert.equal(kept.capacities.dumbbellStep, 2.5);
  assert.equal(kept.capacities.barbellStep, 2.5);
  assert.equal(normalize({capacities: {}}).capacities.dumbbellStep, 5);
});
