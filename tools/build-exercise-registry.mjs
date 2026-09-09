// Generates the canonical exercise registry and the media manifest from the workout
// definitions plus whatever art exists. Both outputs are committed so the app ships static
// data, but they are generated so they can never drift from the workouts they describe.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

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

const legacy = require('../exercise-media-catalog.js');
const poses = (await import('./exercise-art/poses.mjs')).POSES;
const cues = JSON.parse(readFileSync('tools/exercise-art/cues.json', 'utf8'));

// Approved first-party illustrations. Each file is one wide composite holding all three
// phases of the movement, so it is a single frame with its own in-image step labels rather
// than a start/finish pair the app cross-fades between; `layout: 'composite'` tells the
// renderers that. The manifest carries a sha256 per file so a silently swapped or truncated
// asset fails the build instead of shipping.
const ILLUSTRATION_DIR = 'assets/exercise-illustrations';
const approved = existsSync(ILLUSTRATION_DIR + '/manifest.json')
  ? JSON.parse(readFileSync(ILLUSTRATION_DIR + '/manifest.json', 'utf8')) : [];
for (const row of approved) {
  const file = ILLUSTRATION_DIR + '/' + row.filename;
  if (!existsSync(file)) throw Error('approved illustration missing from disk: ' + file);
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (digest !== row.sha256) throw Error('approved illustration checksum mismatch: ' + row.filename);
}
const approvedByName = new Map(approved.map(row => [normalize(row.canonicalName), row]));

// Cue text was written against the schematic pose library and is keyed by pose id. The
// approved illustrations replace the drawings, not the coaching, so the cues are carried
// across by movement name.
const cuesByName = new Map();
for (const [id, pose] of Object.entries(poses)) {
  const entry = cues[id];
  if (!entry) continue;
  for (const n of pose.names || [pose.title || id]) cuesByName.set(normalize(n), entry);
}

const manifest = [];
for (const rec of legacy.records) {
  manifest.push({
    id: 'legacy-' + rec.id, tier: 'legacy', style: 'everkinetic', status: 'approved',
    title: rec.title, thumbnail: rec.frames[0], start: rec.frames[0], finish: rec.frames[1] || rec.frames[0],
    motion: rec.frames.slice(0, 2), muscles: [], cues: [], mistake: '',
    author: rec.author, license: rec.license, licenseUrl: rec.licenseUrl, source: rec.source
  });
}

// Explicit name mapping beats fuzzy matching: an illustration only ever claims the movement
// it actually depicts.
const legacyByName = new Map(legacy.records.flatMap(r => r.names.map((n, i) => [normalize(n), { id: 'legacy-' + r.id, primary: i === 0 }])));

const rows = [];
for (const [, e] of [...byName].sort((a, b) => a[0].localeCompare(b[0]))) {
  const tk = tokenKey(e.name);
  const legacyHit = legacyByName.get(normalize(e.name));
  const approvedHit = approvedByName.get(normalize(e.name));
  const mediaId = approvedHit ? 'ironsix-' + slug(e.name) : (legacyHit && legacyHit.id) || null;
  rows.push({
    id: slug(e.name), name: e.name, aliases: [],
    equipment: e.requires, muscles: e.muscles, pattern: e.seedKey, base: e.base,
    workoutKeys: [...e.workoutKeys].sort(), isSupersetComponent: e.isSupersetComponent,
    mediaId,
    mediaMatch: approvedHit ? 'exact' : legacyHit ? (legacyHit.primary ? 'exact' : 'alias') : 'none',
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

// Approved illustrations are emitted from the FINAL registry, after token-identical names have
// been collapsed, so a media record only ever exists for a canonical exercise and its id is the
// row that points at it. Anything left over means an illustration names a movement the app does
// not program, which is a mapping error rather than something to quietly drop.
const usedIllustrations = new Set();
for (const row of registry) {
  const hit = approvedByName.get(normalize(row.name));
  if (!hit) continue;
  usedIllustrations.add(hit.filename);
  const file = ILLUSTRATION_DIR + '/' + hit.filename;
  const cue = cuesByName.get(normalize(row.name)) || {};
  manifest.push({
    id: 'ironsix-' + row.id, tier: 'professional', style: 'ironsix-form-guide-v1', status: 'approved',
    layout: 'composite', title: row.name,
    thumbnail: file, start: file, finish: null, motion: [file],
    width: hit.width, height: hit.height,
    muscles: row.muscles, cues: cue.cues || [], mistake: cue.mistake || '',
    author: 'Iron Six', license: 'First-party', licenseUrl: '', source: ILLUSTRATION_DIR + '/manifest.json'
  });
}
const unusedIllustrations = approved.filter(row => !usedIllustrations.has(row.filename)).map(row => row.canonicalName);
if (unusedIllustrations.length) throw Error('illustrations match no canonical exercise: ' + unusedIllustrations.join(', '));

const manifestIds = new Set(manifest.map(m => m.id));
const danglingMedia = registry.filter(row => row.mediaId && !manifestIds.has(row.mediaId)).map(row => row.name + ' -> ' + row.mediaId);
if (danglingMedia.length) throw Error('registry points at missing media: ' + danglingMedia.join(', '));

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
  const k = !m ? 'missing' : m.tier === 'professional' ? 'approved' : m.tier === 'schematic' ? 'schematic' : e.mediaMatch === 'alias' ? 'alias' : 'legacy';
  a[k] = (a[k] || 0) + 1;
  return a;
}, {});
console.log('registry: ' + registry.length + ' canonical exercises (from ' + byName.size + ' names)');
console.log('manifest: ' + manifest.length + ' media records (' + usedIllustrations.size + ' approved Iron Six, ' + legacy.records.length + ' legacy)');
console.log('coverage: ' + JSON.stringify(counts));
console.log('collapsed duplicates: ' + (collapsed.join(' | ') || 'none'));
