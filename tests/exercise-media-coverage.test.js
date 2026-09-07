// Build protection for exercise media.
//
// A hard "every exercise must have art" gate would fail on day one against a known backlog and
// would simply be disabled, so this is a ratchet instead. Broken references and unhandled NEW
// exercises fail outright; the existing backlog is recorded in a committed baseline and is
// only ever allowed to shrink.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const registry = require('../exercise-registry.js');
const manifest = require('../exercise-media-manifest.js');
const resolver = require('../exercise-media-resolver.js');
const BASELINE_PATH = 'reports/media-coverage-baseline.json';
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

const resolved = registry.exercises.map(e => ({ exercise: e, result: resolver.resolve(e.name) }));
const tierOf = name => resolver.resolve(name).tier;

test('every media reference points at a file that exists', () => {
  const broken = [];
  for (const record of manifest.media) {
    for (const key of ['thumbnail', 'start', 'finish']) {
      const path = record[key];
      if (path && !fs.existsSync(path)) broken.push(`${record.id}.${key} -> ${path}`);
    }
    for (const path of record.motion || []) if (path && !fs.existsSync(path)) broken.push(`${record.id}.motion -> ${path}`);
  }
  assert.deepEqual(broken, [], 'media records referencing files that are not in the repo');
});

test('every exercise resolves to a known tier', () => {
  const bad = resolved.filter(r => !(r.result.tier >= 1 && r.result.tier <= 6));
  assert.deepEqual(bad.map(r => r.exercise.name), []);
});

test('anything shown that is not an exact match is labelled', () => {
  // Tier 4 and 5 substitute a different movement. That is allowed, but never silently: the
  // label has to name what is actually on screen.
  const unlabelled = resolved
    .filter(r => r.result.tier >= 4 && r.result.media && (!r.result.label || !r.result.via || !r.result.label.includes(r.result.via)))
    .map(r => r.exercise.name);
  assert.deepEqual(unlabelled, [], 'substituted media must name the movement it shows');
});

test('a new exercise cannot ship without media handling', () => {
  // Grandfathered gaps are listed in the baseline. Anything new must reach at least an
  // approved fallback (tier 5) — landing on tier 6 means it was added with no media handling.
  const known = new Set(baseline.comingSoon);
  const offenders = resolved
    .filter(r => r.result.tier === 6 && !known.has(r.exercise.name))
    .map(r => r.exercise.name);
  assert.deepEqual(offenders, [],
    'these exercises have no exact media, no approved alias and no approved fallback. Add media, an alias, or a pose in tools/exercise-art/poses.mjs, then rerun tools/build-exercise-registry.mjs');
});

test('media coverage does not regress', () => {
  const counts = resolved.reduce((a, r) => { a[r.result.tier] = (a[r.result.tier] || 0) + 1; return a; }, {});
  const exact = (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0);
  const comingSoon = counts[6] || 0;
  assert.ok(exact >= baseline.exact,
    `exact media coverage dropped from ${baseline.exact} to ${exact}. Update ${BASELINE_PATH} only when coverage genuinely improves.`);
  assert.ok(comingSoon <= baseline.comingSoon.length,
    `exercises with no media at all rose from ${baseline.comingSoon.length} to ${comingSoon}.`);
});

test('the registry and manifest are in sync', () => {
  const ids = new Set(manifest.media.map(m => m.id));
  const dangling = registry.exercises.filter(e => e.mediaId && !ids.has(e.mediaId)).map(e => `${e.name} -> ${e.mediaId}`);
  assert.deepEqual(dangling, [], 'registry entries pointing at media ids that no longer exist');
  const firstParty = manifest.media.filter(m => m.author === 'Iron Six');
  for (const m of firstParty) {
    assert.ok(m.style, `${m.id} must declare a visual style version`);
    assert.ok(['schematic', 'approved', 'draft'].includes(m.status), `${m.id} has an unknown status ${m.status}`);
  }
});

test('exercise names shown to the user are unique per movement', () => {
  const seen = new Map();
  for (const e of registry.exercises) {
    const key = e.name.toLowerCase();
    assert.ok(!seen.has(key), `${e.name} appears as two canonical entries`);
    seen.set(key, e.id);
  }
});
