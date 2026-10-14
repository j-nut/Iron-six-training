const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const energy = require('../energy-estimate.js');

const squat = {name: 'Barbell Back Squat', seedKey: 'squat'};
const curl = {name: 'Dumbbell Curl', seedKey: 'curl'};
const sets = (n, weight, reps, rir) => Array.from({length: n}, () => ({weight: String(weight), reps: String(reps), rir: String(rir), done: true}));
const session = (extra = {}) => ({trainingMode: 'traditional', details: [{...squat, sets: sets(4, 185, 6, 2)}, {...curl, sets: sets(3, 25, 10, 2)}], ...extra});

test('a typical recorded session lands in a realistic range', () => {
  // 80 kg lifter, 45 recorded minutes: lab studies measure roughly 180–225 kcal for this.
  const result = energy.estimateSession(176, session({elapsedMinutes: 45}));
  assert.equal(result.timeSource, 'recorded');
  assert(result.mid >= 150 && result.mid <= 260, `mid ${result.mid}`);
  assert(result.low < result.mid && result.high > result.mid);
  assert.equal(result.low % 10, 0);
});

test('heavier lifters, harder sets and longer sessions cost more; circuits cost more per minute', () => {
  const base = energy.estimateSession(176, session({elapsedMinutes: 45})).mid;
  assert(energy.estimateSession(220, session({elapsedMinutes: 45})).mid > base);
  assert(energy.estimateSession(176, session({elapsedMinutes: 60})).mid > base);
  const harder = session({elapsedMinutes: 45, details: [{...squat, sets: sets(4, 185, 6, 0)}, {...curl, sets: sets(3, 25, 10, 0)}]});
  assert(energy.estimateSession(176, harder).mid > base);
  assert(energy.estimateSession(176, session({elapsedMinutes: 45, trainingMode: 'circuit'})).mid > base);
});

test('unknown session time gives a wider range', () => {
  const recorded = energy.estimateSession(176, session({elapsedMinutes: 30}));
  const estimated = energy.estimateSession(176, session());
  assert.equal(estimated.timeSource, 'estimated');
  assert((estimated.high - estimated.low) / estimated.mid > (recorded.high - recorded.low) / recorded.mid);
});

test('no estimate without a body weight or completed sets', () => {
  assert.equal(energy.estimateSession(null, session()), null);
  assert.equal(energy.estimateSession(176, {details: []}), null);
  assert.equal(energy.label(null), '');
});

test('elapsed time comes from set timestamps only when they describe a real session', () => {
  const t0 = Date.UTC(2026, 9, 14, 17, 0);
  const live = {'0-0': {done: true, _updatedAt: t0}, '0-1': {done: true, _updatedAt: t0 + 38 * 60000}, '1-0': {done: false, _updatedAt: t0 + 50 * 60000}};
  assert.equal(energy.elapsedFromSets(live), 43, 'first to last completed set, plus the first set and warm-up');
  const loggedAfterwards = {'0-0': {done: true, _updatedAt: t0}, '0-1': {done: true, _updatedAt: t0 + 20000}};
  assert.equal(energy.elapsedFromSets(loggedAfterwards), null);
  const acrossDays = {'0-0': {done: true, _updatedAt: t0}, '0-1': {done: true, _updatedAt: t0 + 26 * 3600000}};
  assert.equal(energy.elapsedFromSets(acrossDays), null);
});

test('the finish flow stores the estimate and History shows it with an explanation', () => {
  const ui3 = fs.readFileSync('ui3.js', 'utf8');
  assert(ui3.includes('energy?.estimateSession(u.weight,session)'));
  assert(ui3.includes('session.elapsedMinutes=elapsed'));
  const history = fs.readFileSync('history-explorer.js', 'utf8');
  assert(history.includes("energyText?' · '+energyText+' est.'"));
  assert(history.includes('treat it as a guide, not a target'));
  for (const page of ['index.html', 'live.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert(html.indexOf('energy-estimate.js') > 0 && html.indexOf('energy-estimate.js') < html.indexOf('history-explorer.js'));
  }
});
