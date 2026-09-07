// Regression coverage for Iron Six Music v2 discovery: station pooling, ranking,
// the rights gates for every source, and graceful upstream-provider failure.
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');

// api/music.js is an ESM Vercel function; load it as text so this CJS test can inject
// a stub fetch and a stub process.env without a live network call.
function loadModule(env={}){
  const src=fs.readFileSync('api/music.js','utf8')
    .replace(/^export default async function handler/m,'async function handler')
    .replace(/^export \{[\s\S]*?\};?\s*$/m,'');
  const calls=[];
  const factory=new Function('fetch','process','__calls',`${src}\nreturn {handler,commercialLicense,explicitCommercialDeed,resolveStation,planQueries,rankPool,scoreTrack,cleanCcMixter,clean,STATIONS,ALLOWED_GENRES};`);
  const api=factory((url)=>{calls.push(String(url));return env.fetch(String(url))},{env:env.env||{}},calls);
  return {api,calls};
}
function jsonResponse(body,ok=true,status=200){return Promise.resolve({ok,status,json:()=>Promise.resolve(body)})}
function makeRes(){
  const res={statusCode:0,body:null,headers:{}};
  res.setHeader=(k,v)=>{res.headers[k]=v};
  res.status=code=>{res.statusCode=code;return res};
  res.json=payload=>{res.body=payload;return res};
  return res;
}
function audiusTrack(over={}){
  return {id:'t1',title:'Track',user:{name:'Artist'},genre:'Electronic',mood:'energizing',bpm:150,duration:200,license:'CC BY 4.0',is_stream_gated:false,is_unlisted:false,play_count:10,artwork:{'480x480':'a.png'},permalink:'/artist/track',...over};
}

test('every station only names genres the API is allowed to query', () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[]})});
  for(const [key,station] of Object.entries(api.STATIONS)){
    assert(station.genres.length>0,`${key} must define genres`);
    for(const g of station.genres)assert(api.ALLOWED_GENRES.has(g),`${key} uses disallowed genre ${g}`);
    assert(station.terms.length>0,`${key} must define fallback search terms`);
  }
});

test('a station pools several distinct upstream queries instead of one', () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[]})});
  const urls=api.planQueries(api.STATIONS.circuit);
  assert(urls.length>=5,'a station must pool at least five upstream queries');
  assert.equal(new Set(urls).size,urls.length,'pooled queries must be distinct');
  assert(urls.length<=10,'upstream fan-out must stay bounded');
  assert(urls.some(u=>u.includes('/tracks/trending?')),'pool must include genre trending');
  assert(urls.some(u=>u.includes('/tracks/trending/underground')),'pool must include underground discovery');
  assert(urls.some(u=>u.includes('/tracks/search?')),'pool must include keyword search fallbacks');
});

test('the legacy ?genre= contract still resolves to a pooled station', () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[]})});
  const station=api.resolveStation({genre:'Metal'});
  assert.equal(station.key,'genre:Metal');
  assert(api.planQueries(station).length>=3,'a bare genre request must still pool multiple queries');
  assert.equal(api.resolveStation({genre:'Polka'}).key,'circuit','an unknown genre falls back to a known station');
});

test('ranking dedupes ids, drops unstreamable tracks and prefers the BPM window', () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[]})});
  const station=api.STATIONS.circuit;
  const pool=[
    {id:'a',stream:'s',bpm:150,genre:'Electronic',mood:'energizing',duration:200,plays:5,source:'Audius'},
    {id:'a',stream:'s',bpm:150,genre:'Electronic',mood:'energizing',duration:200,plays:5,source:'Audius'},
    {id:'b',stream:'s',bpm:60,genre:'Electronic',mood:'',duration:200,plays:5,source:'Audius'},
    {id:'c',stream:'',bpm:150,genre:'Electronic',mood:'',duration:200,plays:5,source:'Audius'}
  ];
  const ranked=api.rankPool(pool,station);
  assert.deepEqual(ranked.map(t=>t.id),['a','b'],'duplicates and unstreamable tracks must be dropped');
  assert(ranked[0].score>ranked[1].score,'an in-window BPM must outrank an out-of-window BPM');
});

test('the explicit-deed gate fails closed for anything but a named commercial licence', () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[]})});
  const allowed=['http://creativecommons.org/licenses/by/3.0/','https://creativecommons.org/licenses/by-sa/4.0/','http://creativecommons.org/licenses/by-nd/3.0/','https://creativecommons.org/publicdomain/zero/1.0/','https://creativecommons.org/publicdomain/mark/1.0/'];
  for(const url of allowed)assert.equal(api.explicitCommercialDeed(url),true,url);
  const denied=['','http://creativecommons.org/licenses/by-nc/3.0/','https://creativecommons.org/licenses/by-nc-sa/4.0/','https://creativecommons.org/licenses/by-nc-nd/4.0/','https://example.com/free-music','https://ccmixter.org/','not a url'];
  for(const url of denied)assert.equal(api.explicitCommercialDeed(url),false,url);
});

test('ccMixter normalisation rejects every record it cannot prove is commercially usable', () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[]})});
  const base={upload_id:'99',upload_name:'Song',user_name:'someone',files:[{download_url:'https://ccmixter.org/content/song.mp3'}],license_name:'Attribution 3.0',license_url:'http://creativecommons.org/licenses/by/3.0/',upload_extra:{bpm:'140',duration:180}};
  const ok=api.cleanCcMixter(base);
  assert(ok,'a CC BY track with an https audio file must normalise');
  assert.equal(ok.source,'ccMixter');
  assert.equal(ok.id,'ccmixter:99');
  assert.equal(ok.bpm,140);
  assert.equal(api.cleanCcMixter({...base,license_name:'Attribution-NonCommercial 3.0',license_url:'http://creativecommons.org/licenses/by-nc/3.0/'}),null,'NonCommercial must be rejected');
  assert.equal(api.cleanCcMixter({...base,license_url:''}),null,'a missing licence URL must be rejected');
  assert.equal(api.cleanCcMixter({...base,license_name:'',license_url:'https://example.com/whatever'}),null,'an unrecognised deed must be rejected');
  assert.equal(api.cleanCcMixter({...base,files:[{download_url:'http://ccmixter.org/song.mp3'}]}),null,'a non-https stream must be rejected');
  assert.equal(api.cleanCcMixter({...base,files:[]}),null,'a record with no audio file must be rejected');
  assert.equal(api.cleanCcMixter({}),null,'an unrecognised payload shape must yield nothing');
});

test('no unlicensed Audius track can reach the client through the handler', async () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[
    audiusTrack({id:'ok',license:'CC BY 4.0'}),
    audiusTrack({id:'arr',license:'All Rights Reserved'}),
    audiusTrack({id:'nc',license:'CC BY-NC 4.0'}),
    audiusTrack({id:'blank',license:''}),
    audiusTrack({id:'gated',license:'CC BY 4.0',is_stream_gated:true}),
    audiusTrack({id:'unlisted',license:'CC BY 4.0',is_unlisted:true})
  ]})});
  const res=makeRes();
  await api.handler({method:'GET',query:{station:'circuit'}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.tracks.map(t=>t.id),['ok'],'only the commercially licensed, ungated, listed track survives');
  for(const t of res.body.tracks)assert.equal(api.commercialLicense(t.license),true);
  assert.equal(res.body.commercialLicenseRequired,true);
});

test('pooling keeps the station usable when most upstream queries fail', async () => {
  let n=0;
  const {api}=loadModule({fetch:()=>{
    n++;
    if(n%3!==0)return Promise.reject(Error('upstream down'));
    return jsonResponse({data:[audiusTrack({id:`t${n}`})]});
  }});
  const res=makeRes();
  await api.handler({method:'GET',query:{station:'heavy'}},res);
  assert.equal(res.statusCode,200,'partial upstream failure must still serve a station');
  assert(res.body.tracks.length>0,'surviving queries must still produce tracks');
  const audius=res.body.providers.find(p=>p.name==='Audius');
  assert(audius.succeeded>0&&audius.succeeded<audius.queries,'provider telemetry must report the partial failure');
});

test('a total provider outage degrades to a clean 502 and never throws', async () => {
  const {api}=loadModule({fetch:()=>Promise.reject(Error('network down'))});
  const res=makeRes();
  await api.handler({method:'GET',query:{station:'circuit'}},res);
  assert.equal(res.statusCode,502);
  assert(String(res.body.error).length>0,'an outage must return a message the player can display');
  assert(!('tracks' in res.body)||res.body.tracks.length===0);
});

test('ccMixter stays disabled unless explicitly enabled for the deployment', async () => {
  const off=loadModule({fetch:()=>jsonResponse({data:[audiusTrack()]}),env:{}});
  const resOff=makeRes();
  await off.api.handler({method:'GET',query:{station:'circuit'}},resOff);
  assert(!off.calls.some(u=>u.includes('ccmixter.org')),'ccMixter must not be queried by default');
  assert(!resOff.body.providers.some(p=>p.name==='ccMixter'));

  const on=loadModule({fetch:url=>url.includes('ccmixter.org')?jsonResponse([]):jsonResponse({data:[audiusTrack()]}),env:{MUSIC_CCMIXTER:'1'}});
  const resOn=makeRes();
  await on.api.handler({method:'GET',query:{station:'circuit'}},resOn);
  assert(on.calls.some(u=>u.includes('ccmixter.org')),'the flag must enable the ccMixter provider');
  assert(resOn.body.providers.some(p=>p.name==='ccMixter'));
});

test('search still works and stays behind the same licence gate', async () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[audiusTrack({id:'s1'}),audiusTrack({id:'s2',license:'All Rights Reserved'})]})});
  const res=makeRes();
  await api.handler({method:'GET',query:{action:'search',q:'deadlift anthem'}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.tracks.map(t=>t.id),['s1']);
  const blank=makeRes();
  await api.handler({method:'GET',query:{action:'search',q:'  '}},blank);
  assert.equal(blank.statusCode,400,'an empty search must stay a 400');
});

test('non-GET is still rejected', async () => {
  const {api}=loadModule({fetch:()=>jsonResponse({data:[]})});
  const res=makeRes();
  await api.handler({method:'POST',query:{}},res);
  assert.equal(res.statusCode,405);
});

// Client player contract for the new station UI.
const player=fs.readFileSync('music.js','utf8');
test('the player exposes stations, keeps genres, and keeps music off the workout path', () => {
  assert(player.includes('data-music-station'),'player must offer station chips');
  assert(player.includes('data-music-genre'),'genre selection must remain available');
  assert(player.includes('data-music-match'),'match-workout must remain available');
  assert(player.includes('workoutStation'),'match-workout must map workout state to a station');
  assert(player.includes('?station='),'the player must be able to request a pooled station');
  assert(player.includes('?genre='),'the player must keep the legacy genre request');
  assert(player.includes('function shuffle'),'the licensed pool must rotate between loads');
  assert(!player.includes('saveData()'),'music must never touch workout persistence');
  assert(!player.includes('IronSixCircuit'),'music must never drive the circuit timer');
});
