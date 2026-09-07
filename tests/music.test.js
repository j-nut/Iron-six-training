const assert=require('node:assert/strict');
const fs=require('node:fs');

const api=fs.readFileSync('api/music.js','utf8');
const match=api.match(/function commercialLicense\(license\)\{([\s\S]*?)\n\}/);
assert(match,'commercial license filter must exist');
const commercialLicense=new Function('license',match[1]);
assert.equal(commercialLicense('CC BY 4.0'),true);
assert.equal(commercialLicense('cc_by_sa'),true);
assert.equal(commercialLicense('Creative Commons Attribution-NoDerivatives'),true);
assert.equal(commercialLicense('CC0'),true);
assert.equal(commercialLicense('CC BY-NC 4.0'),false);
assert.equal(commercialLicense('cc_by_nc_sa'),false);
assert.equal(commercialLicense('All Rights Reserved'),false);
assert.equal(commercialLicense(''),false);
assert(api.includes('!t?.is_stream_gated'),'gated tracks must be excluded');
assert(api.includes('commercialLicense(t?.license)'),'every surfaced Audius track must pass the commercial-license filter');
assert(api.includes('/stream?app_name='),'track payloads must expose a stream endpoint');

const music=fs.readFileSync('music.js','utf8');
assert(music.includes('Iron Six Radio'));
assert(music.includes('Iron Six Originals'));
assert(music.includes('open.spotify.com'),'Spotify must remain an optional external launch');
assert(music.includes('data-music-match'),'player must support workout-matched stations');
assert(music.includes("u?.trainingMode==='circuit'"),'music matching must understand circuit mode');
assert(!music.includes("crossOrigin='anonymous'"),'basic audio playback should not unnecessarily require CORS headers');

const native=fs.readFileSync('native/runtime.mjs','utf8');
assert(native.includes("'/api/music'"),'Android must route the music API to production');
const originals=fs.readFileSync('music-originals.js','utf8');
assert(originals.includes('documented commercial rights'),'original catalog must keep a rights gate in source');
