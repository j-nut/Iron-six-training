// The onboarding questions only matter if the app acts on them: strength references seed first-day
// loads, reported limitations make affected movements safer, and feature preferences gate features.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

const DAY = 864e5;
const ex = (name, requires, prescription, base, seedKey, extra = {}) => ({name, requires, prescription, sets: 3, base, seedKey, priority: 1, ...extra});
const plainJson = value => JSON.parse(JSON.stringify(value));

// ---- Strength references -> first-day loads ----
function progression() {
  const context = {window: {}, EQUIPMENT: [], ROTATION: ['lower_strength'], has: () => false, currentVariant: () => 1, optionsFor: () => [], exposureStats: () => ({successful: 0}), variantUnlocked: () => 1, setTimeout};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('engine.js', 'utf8'), context, {filename: 'engine.js'});
  vm.runInContext(fs.readFileSync('load-progression-v2.js', 'utf8'), context, {filename: 'load-progression-v2.js'});
  return vm.runInContext('baselineLoadObject', context);
}
const baseline = progression();
const backSquat = ex('Barbell Back Squat', ['barbell', 'rack'], '1 top set × 4–6, then 3 × 6–8', 'Primary squat', 'squat');
const pausedSquat = ex('Paused Barbell Back Squat', ['barbell', 'rack'], '4 × 4–6 • 1 sec pause', 'Primary squat', 'squat');
const landmineSquat = ex('Landmine Squat', ['barbell', 'landmine'], '4 × 8–12', 'Primary squat', 'squat');
const gobletSquat = ex('Goblet Squat', ['dumbbells'], '4 × 8–15', 'Primary squat', 'squat');
const barbellBench = ex('Barbell Bench Press', ['barbell', 'rack', 'bench'], '4 × 6–8', 'Horizontal press', 'bench');
const inclineBench = ex('Incline Barbell Bench Press', ['barbell', 'rack', 'bench'], '3 × 6–10', 'Horizontal press', 'bench');
const dbBench = ex('Dumbbell Bench Press', ['dumbbells', 'bench'], '4 × 8–12', 'Horizontal press', 'bench');
const dbIncline = ex('Incline Dumbbell Press', ['dumbbells', 'bench'], '3 × 8–12', 'Secondary press', 'chest_press');
const goodMorning = ex('Barbell Good Morning', ['barbell', 'rack'], '3 × 6–10', 'Hip hinge', 'hinge');
const barbellRdl = ex('Barbell Romanian Deadlift', ['barbell'], '3 × 6–10', 'Hip hinge', 'hinge');
const user = (extra = {}) => ({weight: 180, age: 30, trainingLevel: 'intermediate', history: [], today: {}, program: {currentWorkoutKey: 'lower_strength'}, capacities: {barbellMax: 500, dumbbellMax: 100}, ...extra});
const refs = {squat: {weight: 225, reps: 5, equipment: 'barbell'}, bench: {weight: 60, reps: 8, equipment: 'dumbbell'}};
const session = (name, base, weight, reps, daysAgo = 3, rir = 2) => ({ts: Date.now() - daysAgo * DAY, details: [{name, base, sets: [{weight: String(weight), reps: String(reps), rir: String(rir), done: true}]}]});

test('a barbell squat reference seeds the squat and a ratio-reduced paused squat, never heavier than the lift', () => {
  const u = user({strengthRefs: refs});
  const squat = baseline(u, backSquat), paused = baseline(u, pausedSquat), landmine = baseline(u, landmineSquat);
  assert.equal(squat.confidence, 'From your strength check');
  assert.equal(squat.load, 200, '225 x 5 -> e1RM 262.5 -> 5 reps at 2 RIR with a 0.95 safety factor');
  assert.equal(paused.confidence, 'From your strength check');
  assert.equal(paused.load, 180, 'paused squat carries the 0.9 variant factor');
  assert(paused.load < squat.load && squat.load < 225);
  assert(landmine.load <= Math.round(squat.load * 0.7 / 5) * 5, 'landmine counts as barbell-class at 70%');
  assert.match(squat.detail, /setup/i);
});

test('equipment class is respected: barbell refs never seed dumbbells and dumbbell refs never seed barbells', () => {
  const u = user({strengthRefs: refs});
  assert.equal(baseline(u, gobletSquat).confidence, 'Conservative starting estimate', 'barbell squat ref does not become a goblet load');
  const bench = baseline(u, dbBench);
  assert.equal(bench.confidence, 'From your strength check');
  assert(bench.load > 0 && bench.load < 60, `per-hand load stays below the 60 lb reference (${bench.load})`);
  assert.equal(baseline(u, barbellBench).confidence, 'Conservative starting estimate', 'dumbbell bench ref does not become a barbell load');
  assert(baseline(u, dbIncline).load < bench.load, 'a related press starts lighter than the bench');
});

test('hinge references scale related lifts and good mornings are far lighter than the reference', () => {
  const u = user({strengthRefs: {hinge: {weight: 225, reps: 5, equipment: 'barbell'}}});
  const rdl = baseline(u, barbellRdl), morning = baseline(u, goodMorning);
  assert.equal(rdl.confidence, 'From your strength check');
  assert(morning.load < rdl.load * 0.5, `${morning.load} vs ${rdl.load}`);
  assert(morning.load >= 45);
});

test('real logged history outranks the strength reference', () => {
  const exact = baseline(user({strengthRefs: refs, history: [session('Barbell Back Squat', 'Primary squat', 135, 6)]}), backSquat);
  assert.notEqual(exact.confidence, 'From your strength check');
  assert(/Performance|Recent/.test(exact.confidence));
  const related = baseline(user({strengthRefs: refs, history: [session('Paused Barbell Back Squat', 'Primary squat', 135, 6)]}), backSquat);
  assert.equal(related.confidence, 'Estimated from a related lift');
  assert(related.load < 200, 'history of 135 lb beats the 225 lb reference');
});

test('legacy benchBest still works and the new bench reference takes precedence', () => {
  assert.equal(baseline(user({benchBest: '185 x 5'}), barbellBench).confidence, 'Benchmark-based');
  const both = baseline(user({benchBest: '185 x 5', strengthRefs: {bench: {weight: 135, reps: 5, equipment: 'barbell'}}}), barbellBench);
  assert.equal(both.confidence, 'From your strength check');
  assert(both.load < baseline(user({benchBest: '185 x 5'}), barbellBench).load);
  assert(baseline(user({strengthRefs: {bench: {weight: 135, reps: 5, equipment: 'barbell'}}}), inclineBench).load < both.load, 'incline starts lighter than flat');
  const dumbbellOnly = baseline(user({benchBest: '185 x 5', strengthRefs: refs}), barbellBench);
  assert.equal(dumbbellOnly.confidence, 'Benchmark-based', 'a dumbbell reference does not override a legacy barbell benchmark');
});

test('missing or malformed references are ignored and default users are unchanged', () => {
  const plain = baseline(user(), backSquat);
  assert.equal(plain.confidence, 'Conservative starting estimate');
  for (const bad of [undefined, null, 'x', {squat: {weight: -5, reps: 5, equipment: 'barbell'}}, {squat: {weight: 225, reps: 0, equipment: 'barbell'}}, {squat: {weight: 225, reps: 5, equipment: 'cable'}}, {squat: {weight: 225, reps: 5}}, {squat: 225}])
    assert.deepEqual(plainJson(baseline(user({strengthRefs: bad}), backSquat)), plainJson(plain));
});

test('the configured equipment limit still caps a seeded load', () => {
  const capped = baseline(user({strengthRefs: {squat: {weight: 405, reps: 3, equipment: 'barbell'}}, capacities: {barbellMax: 185}}), backSquat);
  assert(capped.load <= 185);
});

// ---- Limitations -> safer programming ----
function adaptation(phase = 'Build') {
  const context = {window: {}, document: {getElementById() { return null; }, addEventListener() {}}, setTimeout() {}, exerciseAvailable: () => true, exerciseMuscles: () => ['chest']};
  context.window = context;
  context.IronSixTrainerV2 = {trainingState: () => ({phase, fatigue: 50})};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('session-adaptation-v3.js', 'utf8'), context);
  return context.IronSixAdaptiveSessionV3;
}
const lifter = (extra = {}) => ({readiness: {energy: 4}, history: [{ts: Date.now() - DAY}], limitations: [], ...extra});
const slot = (chosen, alternatives = []) => ({...chosen, sets: 4, prescription: '4 × 8', _alternatives: alternatives.map(a => ({...a, sets: 3}))});
const adapt = (u, plan, phase) => adaptation(phase).adaptPlan(u, plan);
const NOTE = /Stop if it hurts and see a professional for ongoing pain\./;

const barbellRow = ex('Barbell Row', ['barbell'], '4 × 8', 'Horizontal pull', 'row');
const chestRow = ex('Chest-Supported Dumbbell Row', ['dumbbells', 'bench'], '4 × 8', 'Horizontal pull', 'row');
const oneArmRow = ex('One-Arm Dumbbell Row', ['dumbbells'], '4 × 8', 'Horizontal pull', 'row');
const ohp = ex('Barbell Overhead Press', ['barbell', 'rack'], '4 × 8', 'Vertical press', 'overhead_press');
const dbPress = ex('Dumbbell Shoulder Press', ['dumbbells'], '4 × 8', 'Vertical press', 'overhead_press');
const landminePress = ex('Half-Kneeling Landmine Press', ['barbell', 'landmine'], '4 × 8', 'Vertical press', 'overhead_press');
const barbellCurl = ex('Barbell Curl', ['barbell'], '3 × 10', 'Elbow flexion', 'curl');
const dbCurl = ex('Dumbbell Curl', ['dumbbells'], '3 × 10', 'Elbow flexion', 'curl');
const bandCurl = ex('Band Curl', ['bands'], '3 × 15', 'Elbow flexion', 'curl');
const boxSquat = ex('Barbell Box Squat', ['barbell', 'rack', 'bench'], '4 × 6', 'Primary squat', 'squat');
const dbRdl = ex('Dumbbell Romanian Deadlift', ['dumbbells'], '3 × 10', 'Hip hinge', 'hinge');
const singleLegHinge = ex('Single-Leg Hip Hinge', [], '3 × 12', 'Hip hinge', 'hinge');
const hipThrust = ex('Barbell Hip Thrust', ['barbell', 'bench'], '3 × 10', 'Hip extension', 'hip_thrust');
const bandedThrust = ex('Banded Hip Thrust', ['bands'], '3 × 20', 'Hip extension', 'hip_thrust');
const pushUp = ex('Push-Up', [], '3 × 10', 'Horizontal press', 'bench');
const bulgarian = ex('Dumbbell Bulgarian Split Squat', ['dumbbells', 'bench'], '3 × 10', 'Single-leg work', 'split_squat');

test('shoulder: overhead pressing swaps to the landmine press; pressing without an option starts lighter', () => {
  const [press] = adapt(lifter({limitations: ['shoulder']}), [slot(ohp, [dbPress, landminePress])]);
  assert.equal(press.name, 'Half-Kneeling Landmine Press');
  assert.equal(press.base, 'Vertical press');
  assert.equal(press.sets, 4);
  assert(press._alternatives.some(a => a.name === 'Barbell Overhead Press'), 'the original stays swappable');
  assert.match(press._adaptReason, /shoulder/);
  assert.match(press._adaptReason, NOTE);
  const [bench] = adapt(lifter({limitations: ['shoulder']}), [slot(barbellBench)]);
  assert.equal(bench.name, 'Barbell Bench Press');
  assert.equal(bench._loadFactor, 0.9);
  assert.equal(bench._extraRir, 2);
  assert.match(bench._adaptReason, /You noted your shoulder: starting this lighter/);
  assert.match(bench._adaptReason, /2 extra reps in reserve/);
});

test('elbow: barbell curls swap to band or dumbbell work; triceps extensions start lighter', () => {
  const [curl] = adapt(lifter({limitations: ['elbow']}), [slot(barbellCurl, [dbCurl, bandCurl])]);
  assert.equal(curl.name, 'Band Curl');
  const [crusher] = adapt(lifter({limitations: ['elbow']}), [slot(ex('Dumbbell Skull Crusher', ['dumbbells', 'bench'], '3 × 10', 'Triceps press', 'triceps'))]);
  assert.equal(crusher._loadFactor, 0.9);
  assert.match(crusher._adaptReason, /elbow/);
});

test('wrist: a gentler option with no wrist load swaps in without a load cut', () => {
  const [curl] = adapt(lifter({limitations: ['wrist']}), [slot(barbellCurl, [dbCurl])]);
  assert.equal(curl.name, 'Dumbbell Curl', 'dumbbell curl is lighter on the wrist than a barbell curl');
  assert.equal(curl._loadFactor, undefined);
  const [push] = adapt(lifter({limitations: ['wrist']}), [slot(pushUp)]);
  assert.equal(push._loadFactor, 0.9);
  const [front] = adapt(lifter({limitations: ['wrist']}), [slot(ex('Dumbbell Front Squat', ['dumbbells'], '4 × 8', 'Primary squat', 'squat'))]);
  assert.equal(front._loadFactor, 0.9);
});

test('lower back: bent-over rows swap to supported rows; hinges and back squats start lighter', () => {
  const [row] = adapt(lifter({limitations: ['lower_back']}), [slot(barbellRow, [oneArmRow, chestRow])]);
  assert.equal(row.name, 'Chest-Supported Dumbbell Row');
  assert.match(row._adaptReason, /lower back/);
  for (const e of [barbellRdl, goodMorning, backSquat]) {
    const [lighter] = adapt(lifter({limitations: ['lower_back']}), [slot(e)]);
    assert.equal(lighter.name, e.name);
    assert.equal(lighter._loadFactor, 0.9, e.name);
  }
});

test('hip: hinges swap to lower-stress options, thrusts and lunges start lighter', () => {
  const [hinge] = adapt(lifter({limitations: ['hip']}), [slot(barbellRdl, [dbRdl, singleLegHinge])]);
  assert.equal(hinge.name, 'Dumbbell Romanian Deadlift');
  const [thrust] = adapt(lifter({limitations: ['hip']}), [slot(hipThrust, [bandedThrust])]);
  assert.equal(thrust.name, 'Banded Hip Thrust');
  const [lunge] = adapt(lifter({limitations: ['hip']}), [slot(bulgarian)]);
  assert.equal(lunge._loadFactor, 0.9);
});

test('knee: back squat prefers goblet or box squat; with no option it starts lighter with the exact guidance', () => {
  const [swap] = adapt(lifter({limitations: ['knee']}), [slot(backSquat, [boxSquat, gobletSquat])]);
  assert.equal(swap.name, 'Goblet Squat', 'lowest knee stress wins');
  assert.match(swap._adaptReason, /You noted your knee: swapped to Goblet Squat/);
  const [box] = adapt(lifter({limitations: ['knee']}), [slot(backSquat, [boxSquat])]);
  assert.equal(box.name, 'Barbell Box Squat');
  const [stay] = adapt(lifter({limitations: ['knee']}), [slot(backSquat)]);
  assert.equal(stay.name, 'Barbell Back Squat');
  assert.equal(stay._loadFactor, 0.9);
  assert.match(stay._adaptReason, /^You noted your knee: starting this lighter with about 2 extra reps in reserve\. Stop if it hurts and see a professional for ongoing pain\./);
});

test('limitations never drop work, diagnose, or touch unaffected movements and users without limitations', () => {
  const plan = [slot(backSquat, [gobletSquat]), slot(barbellRow, [chestRow]), slot(dbCurl)];
  const adapted = adapt(lifter({limitations: ['knee', 'lower_back', 'shoulder']}), plan);
  assert.equal(adapted.length, plan.length);
  assert.deepEqual(adapted.map(e => e.base), plan.map(e => e.base), 'every slot keeps its movement pattern');
  assert.deepEqual(adapted.map(e => e.sets), plan.map(e => e.sets));
  assert.equal(adapted[2]._adaptReason, undefined, 'an unaffected movement is untouched');
  assert.doesNotMatch(adapted.map(e => e._adaptReason || '').join(' '), /diagnos|injur|tear|arthritis/i);
  const base = adapt(lifter(), plan), none = adapt(lifter({limitations: undefined}), plan), junk = adapt(lifter({limitations: ['nonsense', 7, null]}), plan);
  assert.deepEqual(plainJson(none), plainJson(base));
  assert.deepEqual(plainJson(junk), plainJson(base));
});

test('several areas combine in one message and stress adds up when picking a swap', () => {
  const [stay] = adapt(lifter({limitations: ['knee', 'hip']}), [slot(bulgarian)]);
  assert.match(stay._adaptReason, /hip and knee/);
  const [pick] = adapt(lifter({limitations: ['knee', 'lower_back']}), [slot(backSquat, [boxSquat, gobletSquat])]);
  assert.equal(pick.name, 'Goblet Squat');
});

test('limitations compose with pain, deload and returning: most conservative load, joined reasons', () => {
  const pain = [{ts: Date.now() - 2 * DAY, feedback: 'pain', exercise: 'Barbell Back Squat'}];
  const [both] = adapt(lifter({limitations: ['knee'], trainingFeedback: pain}), [slot(backSquat)]);
  assert.equal(both._loadFactor, 0.85, 'recent pain (0.85) is more conservative than the limitation (0.9)');
  assert.match(both._adaptReason, /Recent pain/);
  assert.match(both._adaptReason, /You noted your knee/);
  const [deload] = adapt(lifter({limitations: ['knee']}), [slot(backSquat)], 'Deload suggested');
  assert.equal(deload._loadFactor, 0.9);
  assert.match(deload._adaptReason, /Deload/);
  assert.match(deload._adaptReason, /knee/);
  const returning = lifter({limitations: ['knee'], history: [{ts: Date.now() - 20 * DAY}]});
  const [back] = adapt(returning, [slot(backSquat)]);
  assert.equal(back.sets, 3, 'returning cut still applies');
  assert.equal(back._loadFactor, 0.9);
  assert.match(back._adaptReason, /20 days off/);
  assert.match(back._adaptReason, /knee/);
});
