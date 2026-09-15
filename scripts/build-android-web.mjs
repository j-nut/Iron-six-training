import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';

const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'www');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});

let html=await readFile(resolve(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);

// Keep this list in lockstep with the web release. Android adds the camera/form/voice
// runtimes below, but should never omit a production runtime that users see on the web.
const sharedRuntimeScripts=[
  'coach-recovery.js',
  'auth-hardening.js',
  'account-polish.js',
  'profile-delete.js',
  'load-progression-v2.js',
  'bodyweight-load-fix.js',
  'adaptive-insights.js',
  'trainer-intelligence-v2.js',
  'program-intelligence-v3.js',
  'progress-analytics-v2.js',
  'session-adaptation-v3.js',
  'media-experience-v2.js',
  'music-originals.js',
  'music.js',
  'session-resume.js',
  'accent-theme.js',
  'active-workout-clean.js',
  'set-coach-feedback.js',
  'iron-marks-engine.js',
  'iron-marks.js',
  'wearable-core.js',
  'wearables.js',
  'pose-person-isolation.js'
];
const androidRuntimeScripts=['pose-form-coach.js','workout-voice.js'];
const runtimeScripts=[...sharedRuntimeScripts,...androidRuntimeScripts];
const publicFiles=[...new Set([...scripts,...runtimeScripts,'style.css','premium-ui.css','EXERCISE_MEDIA.md','MUSIC.md'])];

for(const file of publicFiles){
  if(file.includes('/')||file.includes('..'))throw Error('Unexpected entrypoint asset: '+file);
  await cp(resolve(root,file),resolve(out,file));
}
await cp(resolve(root,'assets'),resolve(out,'assets'),{recursive:true});

await build({
  entryPoints:[resolve(root,'native/entry.mjs')],
  outfile:resolve(out,'native.js'),
  bundle:true,
  format:'iife',
  platform:'browser',
  target:'chrome109',
  minify:true,
  legalComments:'eof'
});

html=html.replace('<script src="core.js','<script src="native.js"></script><script src="core.js');
await writeFile(resolve(out,'index.html'),html);
console.log(`Android web bundle ready: ${scripts.length} direct scripts, ${sharedRuntimeScripts.length} shared runtimes, ${androidRuntimeScripts.length} Android runtimes, premium UI, native bridge and local exercise images.`);
