const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
  EQUIPMENT: [],
  ROTATION: ['lower_strength'],
  has: () => false,
  currentVariant: () => 1,
  optionsFor: () => [],
  exposureStats: () => ({ successful: 0 }),
  variantUnlocked: () => 1,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('engine.js', 'utf8'), context);
const recommend = vm.runInContext('nextSetRecommendation', context);

const exercise = { name: 'Barbell Back Squat', prescription: '4 × 6–8', seedKey: 'squat' };
const user = {
  today: { '0-0': { weight: '100', reps: '8', rir: '3', done: true } },
  history: [],
  capacities: { barbellMax: 300 },
};

assert.deepEqual(
  JSON.parse(JSON.stringify(recommend(user, exercise, 0))),
  { load: 105, reps: 7, label: 'You beat the target — add a little weight', text: 'You beat the target — add a little weight: try about 105 lb × 7 next set.' }
);

user.today['0-0'] = { weight: '100', reps: '5', rir: '0', done: true };
assert.equal(recommend(user, exercise, 0).load, 95);

user.today['0-0'] = { weight: '100', reps: '7', rir: '', done: true };
assert.equal(recommend(user, exercise, 0).load, 100, 'blank RIR must not be treated as failure');
