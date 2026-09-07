// Generates the canonical exercise registry and the media manifest from the workout
// definitions plus whatever art exists. Both outputs are committed so the app ships static
// data, but they are generated so they can never drift from the workouts they describe.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const WORKOUT_KEYS = ['lower_strength', 'shoulders_arms', 'chest', 'back', 'lower_hypertrophy', 'upper_specialization'];
const SOURCES = ['core.js', 'workout-lower.js', 'workout-shoulders.js', 'workout-chest.js', 'workout-back.js', 'workout-lower-hypertrophy.js', 'workout-upper.js', 'workout-dispatch.js', 'engine.js', 'session-planner.js'];

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalize = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
// Token-set identity: "Dumbbell Floor Press" and "Floor Dumbbell Press" are one movement.
const tokenKey = s => normalize(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

function loadWorkouts() {
  const storage = {};
  const context = { console, Date, Math, localStorage: { getItem: k => storage[k] || null, setItem: (k, v) => { storage[k] = v; } } };
  context.window = context;
  vm.createContext(context);
  for (const f of SOURCES) vm.runInContext(readFileSync(f, 'utf8'), context);
  return context;
}

function collect(context) {
  const script = [
    '(()=>{',
    'const captured=[],realSlot=slot;',
    'globalThis.slot=(u,options)=>{captured.push(options);return realSlot(u,options)};',
    'const u=makeUser("registry",200,DEFAULT_EQUIPMENT),out=[];',
    'for(const key of ' + JSON.stringify(WORKOUT_KEYS) + ')for(const v of [0,1,2]){',
    'captured.length=0;optionsFor(key,v,u);',
    'captured.forEach(options=>options.forEach(o=>out.push({name:o.name,requires:o.requires||[],base:o.base,seedKey:o.seedKey,workoutKey:key})));',
    '}',
    'globalThis.slot=realSlot;',
    'return JSON.stringify(out);',
    '})()'
  ].join('\n');
  const raw = JSON.parse(vm.runInContext(script, context));
  const musclesFor = seedKey => JSON.parse(vm.runInContext('JSON.stringify(exerciseMuscles(' + JSON.stringify({ seedKey }) + '))', context));

  const byName = new Map();
  for (const row of raw) {
    // A superset is two movements; the media layer resolves each half independently.
    const parts = String(row.name).split(' + ').map(s => s.trim());
    for (const part of parts) {
      const key = normalize(part);
      if (!byName.has(key)) {
        byName.set(key, {
          name: part, requires: [...row.requires], base: row.base, seedKey: row.seedKey,
          workoutKeys: new Set(), isSupersetComponent: parts.length > 1, muscles: musclesFor(row.seedKey)
        });
      }
      const entry = byName.get(key);
      entry.workoutKeys.add(row.workoutKey);
      if (parts.length === 1 && !entry.requires.length && row.requires.length) entry.requires = [...row.requires];
    }
  }
  return byName;
}

const context = loadWorkouts();
const byName = collect(context);

const art = existsSync('assets/exercise-art') ? readdirSync('assets/exercise-art').filter(f => f.endsWith('.svg')) : [];
const artIds = [...new Set(art.map(f => f.replace(/-(start|finish)\.svg$/, '')))].sort();
const legacy = require('../exercise-media-catalog.js');
const poses = (await import('./exercise-art/poses.mjs')).POSES;
const cues = JSON.parse(readFileSync('tools/exercise-art/cues.json', 'utf8'));

const manifest = [];
for (const id of artIds) {
  const pose = poses[id] || {};
  manifest.push({
    id: 'ironsix-' + id, tier: 'schematic', style: 'ironsix-schematic-v1', status: 'schematic',
    title: pose.title || id,
    thumbnail: 'assets/exercise-art/' + id + '-start.svg',
    start: 'assets/exercise-art/' + id + '-start.svg',
    finish: 'assets/exercise-art/' + id + '-finish.svg',
    motion: ['assets/exercise-art/' + id + '-start.svg', 'assets/exercise-art/' + id + '-finish.svg'],
    muscles: pose.muscles || [], cues: (cues[id] && cues[id].cues) || [], mistake: (cues[id] && cues[id].mistake) || '',
    author: 'Iron Six', license: 'First-party', licenseUrl: '', source: 'tools/exercise-art/poses.mjs'
  });
}
for (const rec of legacy.records) {
  manifest.push({
    id: 'legacy-' + rec.id, tier: 'legacy', style: 'everkinetic', status: 'approved',
    title: rec.title, thumbnail: rec.frames[0], start: rec.frames[0], finish: rec.frames[1] || rec.frames[0],
    motion: rec.frames.slice(0, 2), muscles: [], cues: [], mistake: '',
    author: rec.author, license: rec.license, licenseUrl: rec.licenseUrl, source: rec.source
  });
}

// Explicit name mapping beats fuzzy matching: a drawing only ever claims the movements its
// pose actually depicts.
const artByName = new Map();
for (const id of artIds) {
  const declared = (poses[id] && poses[id].names) || [(poses[id] && poses[id].title) || id];
  for (const n of declared) artByName.set(normalize(n), 'ironsix-' + id);
}
const legacyByName = new Map(legacy.records.flatMap(r => r.names.map((n, i) => [normalize(n), { id: 'legacy-' + r.id, primary: i === 0 }])));

const rows = [];
for (const [, e] of [...byName].sort((a, b) => a[0].localeCompare(b[0]))) {
  const tk = tokenKey(e.name);
  const legacyHit = legacyByName.get(normalize(e.name));
  const artHit = artByName.get(normalize(e.name));
  const mediaId = artHit || (legacyHit && legacyHit.id) || null;
  rows.push({
    id: slug(e.name), name: e.name, aliases: [],
    equipment: e.requires, muscles: e.muscles, pattern: e.seedKey, base: e.base,
    workoutKeys: [...e.workoutKeys].sort(), isSupersetComponent: e.isSupersetComponent,
    mediaId,
    mediaMatch: artHit ? 'exact' : legacyHit ? (legacyHit.primary ? 'exact' : 'alias') : 'none',
    fallbackMediaId: null
  });
}

// Collapse token-identical names so one movement has exactly one canonical id.
const canonical = new Map();
const collapsed = [];
for (const row of rows) {
  const tk = tokenKey(row.name);
  if (!canonical.has(tk)) canonical.set(tk, row);
  else { canonical.get(tk).aliases.push(row.name); collapsed.push(canonical.get(tk).name + ' = ' + row.name); }
}
const registry = [...canonical.values()].sort((a, b) => a.id.localeCompare(b.id));

const banner = '/* GENERATED by tools/build-exercise-registry.mjs - do not edit by hand. */\n';
const umd = (name, body) => banner + '(function(root){\n' + body + '\nif(typeof module!=="undefined"&&module.exports)module.exports=api;\nelse root.' + name + '=api;\n})(typeof window!=="undefined"?window:globalThis);\n';

const normalizeSrc = 'const normalize=name=>String(name||"").normalize("NFKC").toLowerCase().replace(/[\\u2013\\u2014]/g,"-").replace(/\\s+/g," ").trim();';

writeFileSync('exercise-registry.js', umd('IronSixExerciseRegistry',
  'const exercises=' + JSON.stringify(registry, null, 1) + ';\n' + normalizeSrc + '\n' +
  'const byName=new Map();for(const e of exercises){byName.set(normalize(e.name),e);for(const a of e.aliases)byName.set(normalize(a),e)}\n' +
  'const api={exercises,lookup:name=>byName.get(normalize(name))||null};'));

writeFileSync('exercise-media-manifest.js', umd('IronSixMediaManifest',
  'const media=' + JSON.stringify(manifest, null, 1) + ';\n' +
  'const byId=new Map(media.map(m=>[m.id,m]));\n' +
  'const api={media,get:id=>byId.get(id)||null};'));

const counts = registry.reduce((a, e) => {
  const m = e.mediaId ? manifest.find(x => x.id === e.mediaId) : null;
  const k = !m ? 'missing' : m.tier === 'schematic' ? 'schematic' : e.mediaMatch === 'alias' ? 'alias' : 'legacy';
  a[k] = (a[k] || 0) + 1;
  return a;
}, {});
console.log('registry: ' + registry.length + ' canonical exercises (from ' + byName.size + ' names)');
console.log('manifest: ' + manifest.length + ' media records (' + artIds.length + ' Iron Six, ' + legacy.records.length + ' legacy)');
console.log('coverage: ' + JSON.stringify(counts));
console.log('collapsed duplicates: ' + (collapsed.join(' | ') || 'none'));
