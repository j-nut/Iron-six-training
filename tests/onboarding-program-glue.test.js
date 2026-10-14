const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function schema(program) {
  const context = {window: {}, console};
  context.window = context;
  if (program) context.IronSixProgram = program;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('profile-schema.js', 'utf8'), context, {filename: 'profile-schema.js'});
  return context.IronSixProfileSchema;
}

test('goal and schedule answers are applied through the programming API', () => {
  const calls = [];
  const S = schema({applySettings(u, settings) { calls.push(JSON.parse(JSON.stringify(settings))); Object.assign(u, settings); u.program.currentWorkoutKey = 'upper_a'; return {changed: true}; }});
  const u = {name: 'A', weight: 180, equipment: {}, capacities: {}, program: {currentWorkoutKey: 'push_a'}, history: [], today: {}};
  const result = S.commit(u, {goal: 'strength', daysPerWeek: 4, name: 'Alex'});
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{goal: 'strength', daysPerWeek: 4}]);
  assert.equal(u.program.currentWorkoutKey, 'upper_a', 'the next session moves into the new split straight away');
  assert.equal(u.name, 'Alex');
});

test('without the programming API the answers are still stored', () => {
  const S = schema(null);
  const u = {name: 'A', weight: 180, equipment: {}, capacities: {}, program: {}, history: [], today: {}};
  assert.equal(S.commit(u, {goal: 'general', daysPerWeek: 3}).ok, true);
  assert.equal(u.goal, 'general');
  assert.equal(u.daysPerWeek, 3);
});

test('the manual workout chooser offers the workouts of the user’s own split', () => {
  const ui3 = fs.readFileSync('ui3.js', 'utf8');
  assert(ui3.includes('window.IronSixProgram?.workoutKeysFor?.(activeUser())||ROTATION'));
});
