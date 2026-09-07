const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('music.js','utf8');
assert(source.includes("const audio=new Audio()"),'music must use a dedicated audio element');
assert(!source.includes('IronSixCircuit.pause'),'starting music must never pause the workout timer');
assert(!source.includes('saveData()'),'music controls must not mutate workout persistence');
assert(source.includes("audio.addEventListener('ended'"),'radio should advance automatically');
assert(source.includes('localStorage.setItem(\'ironSixMusicPrefs\''),'volume and station preference should stay local');
