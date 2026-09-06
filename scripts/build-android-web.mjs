import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'www');
// Recreate only this generated directory; server files and secrets never enter the APK.
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
let html=await readFile(resolve(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
for(const file of [...new Set([...scripts,'style.css','EXERCISE_MEDIA.md'])]){
  if(file.includes('/')||file.includes('..'))throw Error('Unexpected entrypoint asset: '+file);
  await cp(resolve(root,file),resolve(out,file));
}
await cp(resolve(root,'assets'),resolve(out,'assets'),{recursive:true});
await build({entryPoints:[resolve(root,'native/entry.mjs')],outfile:resolve(out,'native.js'),bundle:true,format:'iife',platform:'browser',target:'chrome109',minify:true,legalComments:'eof'});
html=html.replace('<script src="core.js','<script src="native.js"></script><script src="core.js');
await writeFile(resolve(out,'index.html'),html);
console.log(`Android web bundle ready: ${scripts.length} app scripts, native bridge and local exercise images.`);
