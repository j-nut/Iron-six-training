import {readFile, writeFile, mkdir, rm, cp} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'web-dist');
const manifest = JSON.parse(await readFile(resolve(root, 'exercise-assets.json'), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(manifest.commit)) throw Error('Invalid asset source commit');
await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});

const pending = Object.entries(manifest.files);
await Promise.all(Array.from({length: 6}, async () => {
  while (pending.length) {
    const [file, expected] = pending.pop();
    if (!/^assets\/exercises\/[a-z0-9_-]+\.png$/.test(file) || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid image manifest entry');
    let bytes;
    try { bytes = await readFile(resolve(root, file)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(`https://raw.githubusercontent.com/j-nut/Iron-six-training/${manifest.commit}/${file}`, {signal: AbortSignal.timeout(30000), redirect: 'error'});
      if (!response.ok) throw Error(`Image download failed: ${file} (${response.status})`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error(`Image checksum mismatch: ${file}`);
    await mkdir(dirname(resolve(out, file)), {recursive: true});
    await writeFile(resolve(out, file), bytes);
  }
}));

// First-party approved illustrations. These are ours rather than a third-party download, but
// they still ship through a committed checksum manifest so a corrupted or swapped asset fails
// the build instead of reaching a user's phone.
let artCount = 0;
const illustrationDir = 'assets/exercise-illustrations';
const illustrations = JSON.parse(await readFile(resolve(root, illustrationDir, 'manifest.json'), 'utf8'));
await mkdir(resolve(out, illustrationDir), { recursive: true });
for (const row of illustrations) {
  if (!/^[a-z0-9-]+\.webp$/.test(row.filename) || !/^[a-f0-9]{64}$/.test(row.sha256)) throw Error('Invalid illustration manifest entry');
  const bytes = await readFile(resolve(root, illustrationDir, row.filename));
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error(`Illustration checksum mismatch: ${row.filename}`);
  await writeFile(resolve(out, illustrationDir, row.filename), bytes);
  artCount++;
}
await cp(resolve(root, illustrationDir, 'manifest.json'), resolve(out, illustrationDir, 'manifest.json'));

// Brand assets are small, first-party and hand-authored, so they ship as-is.
await cp(resolve(root, 'assets/brand'), resolve(out, 'assets/brand'), { recursive: true });

const html = await readFile(resolve(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)].map(match => match[1]);
const runtimeScripts = ['coach-recovery.js','auth-hardening.js','account-polish.js','load-progression-v2.js','adaptive-insights.js','trainer-intelligence-v2.js','progress-analytics-v2.js','session-adaptation-v3.js','media-experience-v2.js','music-originals.js','music.js','session-resume.js','pose-person-isolation.js'];
const files = [...new Set(['index.html','live.html','welcome.html','style.css','EXERCISE_MEDIA.md','MUSIC.md',...scripts,...runtimeScripts])];
for (const file of files) { if (!/^[a-zA-Z0-9_.-]+$/.test(file) || file.includes('..')) throw Error('Unexpected public file'); await cp(resolve(root,file),resolve(out,file)); }
const checksums = {};
for (const file of files) checksums[file] = createHash('sha256').update(await readFile(resolve(out,file))).digest('hex');
await writeFile(resolve(out,'release.json'), JSON.stringify({files:checksums,images:manifest.files},null,2)+'\n');
console.log(`Web release ready: ${files.length} public files (${runtimeScripts.length} runtime-loaded), ${Object.keys(manifest.files).length} verified exercise images, ${artCount} verified Iron Six illustrations.`);
