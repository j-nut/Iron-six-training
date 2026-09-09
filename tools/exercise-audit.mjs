#!/usr/bin/env node
/*
 * Exercise + media audit tool for Iron Six.
 *
 * Enumerates every exercise reachable from the workout builders (all six
 * workout keys x all three variants), including equipment-swap
 * `_alternatives`, superset components (split on ' + '), and the curated
 * coach candidate list in api/equipment-exercises.js. Resolves each name
 * against exercise-media-catalog.js and classifies coverage as
 * exact / alias / missing, plus detects broken frame references, orphan
 * asset files, and likely-duplicate movement names.
 *
 * Usage: node tools/exercise-audit.mjs
 * Writes reports/exercise-media-audit.json and reports/exercise-media-audit.md.
 * This is a report, not a gate: it always exits 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const rel = (...p) => path.join(ROOT, ...p);

function main() {
  // ---------------------------------------------------------------------
  // 1. Load the workout builders into a vm context, the same way
  //    tests/dynamic-workouts.test.js does, then monkeypatch `slot` so we
  //    can see the FULL option pool per slot rather than just the one
  //    exercise `choose()` picks.
  // ---------------------------------------------------------------------
  const storage = {};
  const context = {
    console,
    Date,
    Math,
    localStorage: {
      getItem: (key) => storage[key] || null,
      setItem: (key, value) => { storage[key] = value; },
    },
  };
  context.window = context;
  vm.createContext(context);

  const BUILDER_FILES = [
    'core.js',
    'workout-lower.js',
    'workout-shoulders.js',
    'workout-chest.js',
    'workout-back.js',
    'workout-lower-hypertrophy.js',
    'workout-upper.js',
    'workout-dispatch.js',
    'session-planner.js',
  ];
  for (const file of BUILDER_FILES) {
    vm.runInContext(fs.readFileSync(rel(file), 'utf8'), context, { filename: file });
  }

  // Monkeypatch slot(u,options) to capture the raw options array passed to
  // every slot call, before choose() collapses it to one exercise.
  vm.runInContext(
    `
    globalThis.__captured = [];
    globalThis.__realSlot = slot;
    globalThis.slot = function(u, options) {
      globalThis.__captured.push({
        workoutKey: globalThis.__ctxWorkoutKey,
        variant: globalThis.__ctxVariant,
        options,
      });
      return globalThis.__realSlot(u, options);
    };
  `,
    context
  );

  const WORKOUT_KEYS = [
    'lower_strength',
    'shoulders_arms',
    'chest',
    'back',
    'lower_hypertrophy',
    'upper_specialization',
  ];
  const VARIANTS = [0, 1, 2];
  // Every piece of equipment enabled, so exerciseAvailable() filtering never
  // hides an exercise from a slot's _alternatives list.
  const FULL_EQUIPMENT = {
    dumbbells: true, barbell: true, landmine: true, rack: true,
    bench: true, pullup: true, bands: true, abwheel: true, medball: true,
  };
  const WORKOUT_FILE_FOR_KEY = {
    lower_strength: 'workout-lower.js',
    shoulders_arms: 'workout-shoulders.js',
    chest: 'workout-chest.js',
    back: 'workout-back.js',
    lower_hypertrophy: 'workout-lower-hypertrophy.js',
    upper_specialization: 'workout-upper.js',
  };

  const chosenByCombo = [];
  for (const workoutKey of WORKOUT_KEYS) {
    for (const variant of VARIANTS) {
      context.__ctxWorkoutKey = workoutKey;
      context.__ctxVariant = variant;
      context.__equipment = FULL_EQUIPMENT;
      const json = vm.runInContext(
        `
        (function(){
          const user = makeUser('Audit user', 180, __equipment);
          const result = optionsFor(__ctxWorkoutKey, __ctxVariant, user);
          return JSON.stringify(result);
        })()
      `,
        context,
        { filename: `optionsFor(${workoutKey}, ${variant})` }
      );
      chosenByCombo.push({ workoutKey, variant, chosen: JSON.parse(json) });
    }
  }

  const captured = JSON.parse(vm.runInContext('JSON.stringify(globalThis.__captured)', context));
  vm.runInContext('globalThis.slot = globalThis.__realSlot;', context); // restore, for hygiene

  // ---------------------------------------------------------------------
  // 2. Pull the curated coach candidate list out of
  //    api/equipment-exercises.js (SLOTS + CURATED). It's an ES module
  //    with un-exported const bindings, so we lift the object literals
  //    out of the source text with a brace-matching extractor rather than
  //    executing the module.
  // ---------------------------------------------------------------------
  const apiSource = fs.readFileSync(rel('api', 'equipment-exercises.js'), 'utf8');
  const SLOTS = extractObjectLiteral(apiSource, 'SLOTS') || {};
  const CURATED = extractObjectLiteral(apiSource, 'CURATED') || {};

  // ---------------------------------------------------------------------
  // 3. Build the canonical exercise map. Every name we see -- from raw
  //    slot pools, from _alternatives, and from the curated list -- goes
  //    through addExercise(), which also splits superset names on ' + '
  //    and audits each half independently (matching how exercise-media.js
  //    actually resolves them).
  // ---------------------------------------------------------------------
  const exercises = new Map(); // normalizedMediaName -> entry
  const supersets = new Map(); // combo name -> { name, components, workoutKeys:Set, sources:Set }

  function recordSuperset(comboName, parts, meta) {
    let s = supersets.get(comboName);
    if (!s) {
      s = { name: comboName, components: parts, workoutKeys: new Set(), sources: new Set() };
      supersets.set(comboName, s);
    }
    for (const wk of meta.workoutKeys || []) s.workoutKeys.add(wk);
    for (const src of meta.sources || []) s.sources.add(src);
  }

  function addSingleExercise(name, meta) {
    const key = normalizeMediaName(name);
    if (!key) return;
    let entry = exercises.get(key);
    if (!entry) {
      entry = {
        name,
        normalized: key,
        base: null,
        seedKey: null,
        priority: null,
        workoutKeys: new Set(),
        equipment: new Set(),
        sources: new Set(),
        isSupersetComponent: false,
      };
      exercises.set(key, entry);
    }
    if (meta.base && !entry.base) entry.base = meta.base;
    if (meta.seedKey && !entry.seedKey) entry.seedKey = meta.seedKey;
    if (meta.priority != null && entry.priority == null) entry.priority = meta.priority;
    for (const wk of meta.workoutKeys || []) entry.workoutKeys.add(wk);
    for (const eqp of meta.equipment || []) entry.equipment.add(eqp);
    for (const src of meta.sources || []) entry.sources.add(src);
    if (meta.isSupersetComponent) entry.isSupersetComponent = true;
  }

  function addExercise(rawName, meta) {
    const name = String(rawName || '').trim();
    if (!name) return;
    if (name.includes(' + ')) {
      const parts = name.split(' + ').map((s) => s.trim()).filter(Boolean);
      recordSuperset(name, parts, meta);
      for (const part of parts) {
        addSingleExercise(part, {
          ...meta,
          sources: [...(meta.sources || []), `superset_component:${name}`],
          isSupersetComponent: true,
        });
      }
      return;
    }
    addSingleExercise(name, meta);
  }

  // 3a. Raw slot option pools (the full library per slot, pre-choose()).
  for (const capture of captured) {
    const file = WORKOUT_FILE_FOR_KEY[capture.workoutKey] || 'unknown';
    for (const opt of capture.options || []) {
      if (!opt || !opt.name) continue;
      addExercise(opt.name, {
        base: opt.base,
        seedKey: opt.seedKey,
        priority: opt.priority,
        workoutKeys: [capture.workoutKey],
        equipment: [...(opt.requires || []), ...(opt.requiresCustom || [])],
        sources: [`${file}:slot_option:v${capture.variant}`],
      });
    }
  }

  // 3b. Chosen exercise + its _alternatives (equipment-aware substitutions).
  for (const { workoutKey, variant, chosen } of chosenByCombo) {
    const file = WORKOUT_FILE_FOR_KEY[workoutKey] || 'unknown';
    for (const item of chosen) {
      if (!item || !item.name) continue;
      addExercise(item.name, {
        base: item.base,
        seedKey: item.seedKey,
        priority: item.priority,
        workoutKeys: [workoutKey],
        equipment: [...(item.requires || []), ...(item.requiresCustom || [])],
        sources: [`${file}:chosen:v${variant}`],
      });
      for (const alt of item._alternatives || []) {
        if (!alt || !alt.name) continue;
        addExercise(alt.name, {
          base: alt.base,
          seedKey: alt.seedKey,
          priority: alt.priority,
          workoutKeys: [workoutKey],
          equipment: [...(alt.requires || []), ...(alt.requiresCustom || [])],
          sources: [`${file}:alternative:v${variant}`],
        });
      }
    }
  }

  // 3c. Curated coach candidate list (api/equipment-exercises.js CURATED).
  for (const [equipmentKey, rows] of Object.entries(CURATED)) {
    for (const [name, base] of rows) {
      const slotMeta = SLOTS[base] || {};
      addExercise(name, {
        base,
        seedKey: slotMeta.seedKey || null,
        priority: slotMeta.priority ?? null,
        workoutKeys: slotMeta.workoutKeys || [],
        equipment: [],
        sources: [`api/equipment-exercises.js:CURATED:${equipmentKey}`],
      });
    }
  }

  // Flag exercises reachable ONLY via _alternatives (never seen as a raw
  // slot_option / chosen / curated entry). Expected to be empty under
  // full equipment + no generated exercises, since _alternatives is a
  // filtered subset of the raw pool -- but we check for real rather than
  // assuming it.
  for (const entry of exercises.values()) {
    const sourceList = [...entry.sources];
    entry.alternativeOnly =
      sourceList.length > 0 && sourceList.every((s) => /:alternative:/.test(s));
  }

  // ---------------------------------------------------------------------
  // 4. Resolve media coverage against exercise-media-catalog.js.
  // ---------------------------------------------------------------------
  const mediaCatalog = require(rel('exercise-media-catalog.js'));
  const mediaManifest = require(rel('exercise-media-manifest.js'));
  // Resolve the way the app resolves. This audit originally read the legacy catalogue directly,
  // which predates the six-tier resolver: once first-party art landed it reported every approved
  // illustration as "missing" because the catalogue had never heard of it.
  const resolver = require(rel('exercise-media-resolver.js'));

  function classifyCoverage(name) {
    const r = resolver.resolveOne(name);
    if (!r.media) return { coverage: 'missing', mediaId: null, mediaTier: null, via: null };
    const mediaTier = r.media.tier === 'professional' ? 'professional' : r.media.tier === 'schematic' ? 'schematic' : 'legacy';
    // Tiers 4 and 5 show a different movement; that is a substitution, not coverage.
    const coverage = r.tier <= 2 ? 'exact' : r.tier === 3 ? 'alias' : 'substituted';
    return { coverage, mediaId: r.media.id, mediaTier, via: r.via || null };
  }

  for (const entry of exercises.values()) {
    const { coverage, mediaId, mediaTier, via } = classifyCoverage(entry.name);
    entry.coverage = coverage;
    entry.mediaId = mediaId;
    entry.mediaTier = mediaTier;
    entry.substitutedBy = via;
  }

  // fallbackOnly: a superset combo where exactly one of the two (or more)
  // components resolves. exercise-media.js resolves each half separately,
  // so a combo like this renders partial ("fallback") media rather than
  // nothing (missing) or full coverage. This is a derived, combo-level
  // bucket -- it does not double count against the per-component
  // exact/alias/missing totals below.
  const supersetReport = [];
  let fallbackOnly = 0;
  for (const s of supersets.values()) {
    const componentCoverages = s.components.map((c) => {
      const key = normalizeMediaName(c);
      const entry = exercises.get(key);
      return entry ? entry.coverage : 'missing';
    });
    const coveredCount = componentCoverages.filter((c) => c !== 'missing').length;
    let status;
    if (coveredCount === 0) status = 'missing';
    else if (coveredCount === componentCoverages.length) status = 'full';
    else {
      status = 'fallbackOnly';
      fallbackOnly++;
    }
    supersetReport.push({
      name: s.name,
      components: s.components,
      workoutKeys: [...s.workoutKeys].sort(),
      sources: [...s.sources].sort(),
      status,
    });
  }
  supersetReport.sort((a, b) => a.name.localeCompare(b.name));

  // ---------------------------------------------------------------------
  // 5. Broken frame references + orphan asset files.
  // ---------------------------------------------------------------------
  const brokenReferences = [];
  for (const rec of mediaCatalog.records) {
    for (const frame of rec.frames || []) {
      if (!fs.existsSync(rel(frame))) brokenReferences.push({ recordId: rec.id, frame });
    }
  }
  for (const rec of mediaManifest.media) {
    for (const frame of [rec.thumbnail, rec.start, rec.finish, ...(rec.motion || [])]) {
      if (frame && !fs.existsSync(rel(frame))) brokenReferences.push({ recordId: rec.id, frame });
    }
  }
  brokenReferences.sort((a, b) => a.recordId.localeCompare(b.recordId) || a.frame.localeCompare(b.frame));

  const referencedBasenames = new Set();
  for (const rec of mediaCatalog.records) {
    for (const frame of rec.frames || []) referencedBasenames.add(path.basename(frame));
  }
  for (const rec of mediaManifest.media) {
    for (const frame of [rec.thumbnail, rec.start, rec.finish, ...(rec.motion || [])]) {
      if (frame) referencedBasenames.add(path.basename(frame));
    }
  }
  const orphanAssets = [];
  for (const dir of ['exercises', 'exercise-illustrations']) {
    const full = rel('assets', dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (!fs.statSync(path.join(full, f)).isFile() || f === 'manifest.json') continue;
      if (!referencedBasenames.has(f)) orphanAssets.push(dir + '/' + f);
    }
  }
  orphanAssets.sort();

  // ---------------------------------------------------------------------
  // 6. Duplicate movement detection: same token set, different string.
  // ---------------------------------------------------------------------
  function tokenSet(name) {
    return new Set(
      String(name || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );
  }
  function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  const exerciseList = [...exercises.values()];
  const duplicates = [];
  for (let i = 0; i < exerciseList.length; i++) {
    const a = exerciseList[i];
    const ta = tokenSet(a.name);
    if (!ta.size) continue;
    for (let j = i + 1; j < exerciseList.length; j++) {
      const b = exerciseList[j];
      if (a.normalized === b.normalized) continue;
      const tb = tokenSet(b.name);
      if (setsEqual(ta, tb)) {
        duplicates.push([a.name, b.name, `same tokens: {${[...ta].sort().join(', ')}}`]);
      }
    }
  }
  duplicates.sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));

  // ---------------------------------------------------------------------
  // 7. Totals + deterministic sort of the exercises array.
  // ---------------------------------------------------------------------
  const sortedExercises = exerciseList
    .slice()
    .sort((a, b) => a.normalized.localeCompare(b.normalized))
    .map((e) => ({
      name: e.name,
      normalized: e.normalized,
      coverage: e.coverage,
      mediaId: e.mediaId,
      mediaTier: e.mediaTier,
      sources: [...e.sources].sort(),
      equipment: [...e.equipment].sort(),
      base: e.base,
      seedKey: e.seedKey,
      priority: e.priority,
      workoutKeys: [...e.workoutKeys].sort(),
      isSupersetComponent: e.isSupersetComponent,
      alternativeOnly: e.alternativeOnly,
      substitutedBy: e.substitutedBy || null,
    }));

  let professionalExact = 0;
  let legacyExact = 0;
  let aliasCovered = 0;
  let substituted = 0;
  let missing = 0;
  for (const e of sortedExercises) {
    if (e.coverage === 'exact') {
      if (e.mediaTier === 'professional') professionalExact++;
      else legacyExact++;
    } else if (e.coverage === 'alias') aliasCovered++;
    else if (e.coverage === 'substituted') substituted++;
    else missing++;
  }

  const totals = {
    canonicalExercises: require(rel('exercise-registry.js')).exercises.length,
    mediaRecords: mediaManifest.media.length,
    uniqueNames: sortedExercises.length,
    professionalExact,
    legacyExact,
    aliasCovered,
    substituted,
    fallbackOnly,
    missing,
    broken: brokenReferences.length,
    orphanAssets: orphanAssets.length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    totals,
    exercises: sortedExercises,
    duplicates,
    brokenReferences,
    orphanAssets,
    supersets: supersetReport,
  };

  // ---------------------------------------------------------------------
  // 8. Write JSON + Markdown, print summary to stdout.
  // ---------------------------------------------------------------------
  const reportsDir = rel('reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, 'exercise-media-audit.json');
  const mdPath = path.join(reportsDir, 'exercise-media-audit.md');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');

  printSummaryTable(totals);
  console.log(`\nWrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function normalizeMediaName(name) {
  // Mirrors exercise-media-catalog.js's internal normalize() exactly, so
  // "exact" vs "alias" classification lines up with what resolve() does.
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lifts `const <varName> = { ... };` out of source text without executing
// the surrounding ES module (which has top-level import/export syntax and
// would need bundling). Balances braces while skipping string contents so
// nested objects/arrays with punctuation inside strings don't confuse it.
function extractObjectLiteral(source, varName) {
  const marker = `const ${varName}=`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  let i = start + marker.length;
  while (i < source.length && source[i] !== '{') i++;
  const begin = i;
  let depth = 0;
  let inString = null;
  let escaped = false;
  for (; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inString = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const literal = source.slice(begin, i);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${literal});`)();
}

function printSummaryTable(totals) {
  const rows = [
    ['Canonical exercises (registry)', totals.canonicalExercises],
    ['Media records (manifest)', totals.mediaRecords],
    ['Unique exercise names found in app', totals.uniqueNames],
    ['Professional exact', totals.professionalExact],
    ['Legacy exact', totals.legacyExact],
    ['Alias covered', totals.aliasCovered],
    ['Substituted (different movement shown)', totals.substituted],
    ['Fallback only (superset, partial)', totals.fallbackOnly],
    ['Missing', totals.missing],
    ['Broken frame references', totals.broken],
    ['Orphan asset files', totals.orphanAssets],
  ];
  const labelWidth = Math.max(...rows.map((r) => r[0].length));
  console.log('\nException/media audit summary');
  console.log('='.repeat(labelWidth + 10));
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(labelWidth)}  ${String(value).padStart(5)}`);
  }
}

function renderMarkdown(report) {
  const { generatedAt, totals, exercises, duplicates, brokenReferences, orphanAssets, supersets } = report;
  const lines = [];
  lines.push('# Exercise + Media Audit');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Canonical exercises (registry) | ${totals.canonicalExercises} |`);
  lines.push(`| Media records (manifest) | ${totals.mediaRecords} |`);
  lines.push(`| Unique exercise names found in app | ${totals.uniqueNames} |`);
  lines.push(`| Professional exact | ${totals.professionalExact} |`);
  lines.push(`| Legacy exact | ${totals.legacyExact} |`);
  lines.push(`| Alias covered | ${totals.aliasCovered} |`);
  lines.push(`| Substituted (different movement shown) | ${totals.substituted} |`);
  lines.push(`| Fallback only (superset, partial) | ${totals.fallbackOnly} |`);
  lines.push(`| Missing | ${totals.missing} |`);
  lines.push(`| Broken frame references | ${totals.broken} |`);
  lines.push(`| Orphan asset files | ${totals.orphanAssets} |`);
  lines.push('');

  lines.push('## Coverage by bucket');
  lines.push('');
  const buckets = [
    ['exact', 'professional', 'Approved exact (first-party Iron Six illustration)'],
    ['exact', 'legacy', 'Legacy exact (Everkinetic CC BY-SA, first name in record)'],
    ['alias', null, 'Alias covered (matches a non-first name in a record)'],
    ['substituted', null, 'Substituted (a different movement is shown, always labelled)'],
    ['missing', null, 'Missing (resolves to "demo coming soon")'],
  ];
  for (const [coverage, tier, label] of buckets) {
    const rows = exercises.filter(
      (e) => e.coverage === coverage && (tier === null || e.mediaTier === tier)
    );
    lines.push(`### ${label} (${rows.length})`);
    lines.push('');
    if (!rows.length) {
      lines.push('_none_');
      lines.push('');
      continue;
    }
    if (coverage === 'missing') {
      lines.push('_(see full list grouped by movement pattern below)_');
      lines.push('');
      continue;
    }
    lines.push('| Name | Media ID | Base | Sources |');
    lines.push('| --- | --- | --- | --- |');
    for (const e of rows) {
      lines.push(`| ${e.name} | ${e.mediaId} | ${e.base || ''} | ${e.sources.join('; ')} |`);
    }
    lines.push('');
  }

  lines.push('## Missing media, grouped by movement pattern (`base`)');
  lines.push('');
  const missingByBase = new Map();
  for (const e of exercises.filter((x) => x.coverage === 'missing')) {
    const key = e.base || '(no base)';
    if (!missingByBase.has(key)) missingByBase.set(key, []);
    missingByBase.get(key).push(e);
  }
  const baseKeys = [...missingByBase.keys()].sort();
  if (!baseKeys.length) {
    lines.push('_none_');
    lines.push('');
  }
  for (const base of baseKeys) {
    const rows = missingByBase.get(base).sort((a, b) => a.normalized.localeCompare(b.normalized));
    lines.push(`### ${base} (${rows.length})`);
    lines.push('');
    for (const e of rows) {
      const flags = [];
      if (e.isSupersetComponent) flags.push('superset component');
      if (e.alternativeOnly) flags.push('alternative-only');
      const flagText = flags.length ? ` _(${flags.join(', ')})_` : '';
      lines.push(`- **${e.name}**${flagText} — sources: ${e.sources.join('; ')}`);
    }
    lines.push('');
  }

  lines.push('## Duplicate candidates (same token set, different name)');
  lines.push('');
  if (!duplicates.length) {
    lines.push('_none found_');
    lines.push('');
  } else {
    lines.push('| Name A | Name B | Reason |');
    lines.push('| --- | --- | --- |');
    for (const [a, b, reason] of duplicates) {
      lines.push(`| ${a} | ${b} | ${reason} |`);
    }
    lines.push('');
  }

  lines.push('## Broken frame references');
  lines.push('');
  if (!brokenReferences.length) {
    lines.push('_none found_');
    lines.push('');
  } else {
    lines.push('| Record ID | Missing frame |');
    lines.push('| --- | --- |');
    for (const { recordId, frame } of brokenReferences) {
      lines.push(`| ${recordId} | ${frame} |`);
    }
    lines.push('');
  }

  lines.push('## Orphan asset files');
  lines.push('');
  lines.push('Files under `assets/exercises/` referenced by no catalog record.');
  lines.push('');
  if (!orphanAssets.length) {
    lines.push('_none found_');
    lines.push('');
  } else {
    for (const f of orphanAssets) lines.push(`- ${f}`);
    lines.push('');
  }

  lines.push('## Supersets');
  lines.push('');
  lines.push(
    'Names containing `\' + \'` are split and each half is resolved independently, matching exercise-media.js. `status` is `full` (both halves covered), `fallbackOnly` (one half covered), or `missing` (neither half covered).'
  );
  lines.push('');
  if (!supersets.length) {
    lines.push('_none found_');
    lines.push('');
  } else {
    lines.push('| Combo name | Components | Status | Workout keys |');
    lines.push('| --- | --- | --- | --- |');
    for (const s of supersets) {
      lines.push(`| ${s.name} | ${s.components.join(' / ')} | ${s.status} | ${s.workoutKeys.join(', ')} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

try {
  main();
} catch (err) {
  console.error('exercise-audit: unexpected error while building the report:');
  console.error(err);
} finally {
  // This is a report, not a gate: always exit 0.
  process.exitCode = 0;
}
