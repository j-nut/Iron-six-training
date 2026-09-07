// Iron Six workout radio — rights-aware multi-source discovery.
//
// Rights rule (do not weaken): a track is only ever returned when its own license
// metadata explicitly permits commercial use. Missing, unclear, All Rights Reserved
// and NonCommercial metadata are all rejected. "Free to listen" is not "free to embed".
const AUDIUS='https://discoveryprovider.audius.co/v1';
const APP='IronSix';
const CCMIXTER='https://ccmixter.org/api/query';
const ALLOWED_GENRES=new Set(['Electronic','Rock','Metal','Hip-Hop/Rap','House','Techno','Trap','Drum & Bass','Dubstep','Hardstyle','Future Bass','Alternative']);
const UPSTREAM_TIMEOUT_MS=8000;
const MAX_UPSTREAM_CALLS=10;
const POOL_LIMIT=40;

// Station families. Each station pools several genre and keyword queries so a strict
// licence filter still leaves a usable rotation instead of one or two tracks.
const STATIONS={
  circuit:{label:'Circuit / Hype',genres:['Electronic','House','Techno','Trap','Drum & Bass','Dubstep','Hardstyle','Future Bass'],terms:['workout','hype','high energy','gym','cardio','banger'],bpm:[130,175],moods:['energizing','excited','aggressive','fiery']},
  heavy:{label:'Heavy / Strength',genres:['Rock','Metal','Hip-Hop/Rap','Electronic','Alternative'],terms:['heavy','lifting','gym','hard','powerful','instrumental hip hop'],bpm:[100,160],moods:['aggressive','defiant','excited','fiery']},
  focus:{label:'Focus',genres:['Electronic','Techno','House','Alternative'],terms:['instrumental','focus','progressive','synth','deep','driving'],bpm:[110,145],moods:['cool','sophisticated','peaceful','yearning']},
  cooldown:{label:'Cooldown',genres:['Electronic','Alternative'],terms:['ambient','chill','downtempo','relax','cooldown','meditation'],bpm:[60,105],moods:['peaceful','sentimental','tender','melancholy']}
};
// A bare ?genre= request (the legacy client contract) still gets pooled discovery.
const GENRE_TERMS={Electronic:['workout','energetic','driving'],Rock:['gym','hard rock','powerful'],Metal:['heavy','aggressive','riff'],'Hip-Hop/Rap':['instrumental','hype','beat'],House:['workout','groove','club'],Techno:['driving','peak time','warehouse'],Trap:['hype','hard','beat'],'Drum & Bass':['workout','liquid','energy'],Dubstep:['heavy','bass','hype'],Hardstyle:['hard','energy','raw'],'Future Bass':['energetic','melodic','uplifting'],Alternative:['gym','driving','indie rock']};

function commercialLicense(license){
  const raw=String(license||'').trim();
  if(!raw)return false;
  const s=raw.toLowerCase().replace(/[_-]+/g,' ');
  if(/\b(non.?commercial|nc)\b/.test(s))return false;
  if(/all rights reserved|arr|none|copyright/.test(s))return false;
  return /\bcc0\b|creative commons|\bcc by\b|attribution/.test(s);
}

// Second, stricter gate used for any source outside Audius. The licence URL must name
// a specific commercially usable deed; an unrecognised or missing URL fails closed.
function explicitCommercialDeed(url){
  const s=String(url||'').toLowerCase();
  if(!s)return false;
  if(/\/licenses\/[a-z-]*nc/.test(s))return false;
  return /\/licenses\/by(?:-sa|-nd)?\//.test(s)||/\/publicdomain\/(?:zero|mark)\//.test(s);
}

function resolveStation(query){
  const requested=String(query?.station||'').toLowerCase();
  if(STATIONS[requested])return{key:requested,...STATIONS[requested]};
  const genre=ALLOWED_GENRES.has(String(query?.genre||''))?String(query.genre):'';
  if(genre)return{key:`genre:${genre}`,label:genre,genres:[genre],terms:GENRE_TERMS[genre]||['workout'],bpm:null,moods:[]};
  return{key:'circuit',...STATIONS.circuit};
}

function planQueries(station){
  const urls=[];
  const trending=g=>`${AUDIUS}/tracks/trending?genre=${encodeURIComponent(g)}&time=week&limit=50&app_name=${APP}`;
  const trendingMonth=g=>`${AUDIUS}/tracks/trending?genre=${encodeURIComponent(g)}&time=month&limit=50&app_name=${APP}`;
  const underground=`${AUDIUS}/tracks/trending/underground?limit=50&app_name=${APP}`;
  const search=q=>`${AUDIUS}/tracks/search?query=${encodeURIComponent(q)}&limit=50&app_name=${APP}`;
  for(const g of station.genres.slice(0,4))urls.push(trending(g));
  if(station.genres[0])urls.push(trendingMonth(station.genres[0]));
  urls.push(underground);
  for(const t of station.terms.slice(0,4))urls.push(search(t));
  return urls.slice(0,MAX_UPSTREAM_CALLS);
}

async function fetchJson(url){
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)});
  if(!response.ok)throw Error(`Upstream returned ${response.status}`);
  return response.json();
}

function clean(track){
  const user=track?.user||{};
  return {id:String(track?.id||''),source:'Audius',title:String(track?.title||'Untitled'),artist:String(user?.name||user?.handle||'Audius artist'),genre:String(track?.genre||''),mood:String(track?.mood||''),bpm:Number(track?.bpm)||null,duration:Number(track?.duration)||0,license:String(track?.license||''),licenseUrl:'',artwork:track?.artwork?.['480x480']||track?.artwork?.['150x150']||'',permalink:track?.permalink?`https://audius.co${track.permalink}`:'',stream:`${AUDIUS}/tracks/${encodeURIComponent(track?.id||'')}/stream?app_name=${APP}`,plays:Number(track?.play_count)||0};
}

// ccMixter records are normalised into the same track model. Deny-by-default: an
// unexpected payload shape yields zero tracks rather than unlicensed ones.
function cleanCcMixter(item){
  const files=Array.isArray(item?.files)?item.files:[];
  const audio=files.find(f=>/\.(mp3|ogg|m4a|flac|wav)$/i.test(String(f?.download_url||f?.file_name||'')));
  const stream=String(audio?.download_url||'');
  if(!/^https:\/\/[^\s]+$/i.test(stream))return null;
  const licenseName=String(item?.license_name||'');
  const licenseUrl=String(item?.license_url||'');
  if(!commercialLicense(`${licenseName} ${licenseUrl}`)||!explicitCommercialDeed(licenseUrl))return null;
  const bpm=Number(item?.upload_extra?.bpm)||null;
  return {id:`ccmixter:${String(item?.upload_id||'')}`,source:'ccMixter',title:String(item?.upload_name||'Untitled'),artist:String(item?.user_real_name||item?.user_name||'ccMixter artist'),genre:'',mood:'',bpm,duration:Number(item?.upload_extra?.duration)||0,license:licenseName||licenseUrl,licenseUrl,artwork:'',permalink:String(item?.file_page_url||item?.upload_page_url||''),stream,plays:0};
}

function inBpmWindow(bpm,window){
  if(!window||!Number.isFinite(bpm)||bpm<=0)return null;
  return bpm>=window[0]&&bpm<=window[1];
}

function scoreTrack(track,station){
  let score=0;
  const bpmFit=inBpmWindow(track.bpm,station.bpm);
  if(bpmFit===true)score+=40;
  else if(bpmFit===false)score-=25;
  if(station.genres.includes(track.genre))score+=18;
  if(track.mood&&station.moods.includes(String(track.mood).toLowerCase()))score+=14;
  if(track.duration>=90&&track.duration<=600)score+=10;
  else if(track.duration>0)score-=15;
  if(track.source==='ccMixter')score+=4;
  score+=Math.min(8,Math.log10(Math.max(1,track.plays)));
  return score;
}

function rankPool(tracks,station){
  const seen=new Set();
  const unique=[];
  for(const t of tracks){
    if(!t||!t.id||!t.stream||seen.has(t.id))continue;
    seen.add(t.id);
    unique.push({...t,score:scoreTrack(t,station)});
  }
  unique.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return unique.slice(0,POOL_LIMIT);
}

async function collectAudius(urls){
  const results=await Promise.allSettled(urls.map(fetchJson));
  const raw=[];
  let ok=0;
  for(const r of results){
    if(r.status!=='fulfilled')continue;
    ok++;
    const data=Array.isArray(r.value?.data)?r.value.data:[];
    for(const t of data)raw.push(t);
  }
  const licensed=raw.filter(t=>!t?.is_stream_gated&&!t?.is_unlisted&&commercialLicense(t?.license));
  return {tracks:licensed.map(clean),ok,attempted:urls.length,candidates:raw.length};
}

async function collectCcMixter(station){
  const tags=[...station.genres.map(g=>g.toLowerCase().replace(/[^a-z]+/g,'')),...station.terms].filter(Boolean).slice(0,3);
  const urls=tags.map(tag=>`${CCMIXTER}?f=json&limit=30&sinced=3+years+ago&tags=${encodeURIComponent(tag)}`);
  const results=await Promise.allSettled(urls.map(fetchJson));
  const tracks=[];
  let ok=0;
  for(const r of results){
    if(r.status!=='fulfilled')continue;
    ok++;
    const rows=Array.isArray(r.value)?r.value:(Array.isArray(r.value?.results)?r.value.results:[]);
    for(const row of rows){const t=cleanCcMixter(row);if(t)tracks.push(t)}
  }
  return {tracks,ok,attempted:urls.length};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  const genre=ALLOWED_GENRES.has(String(req.query?.genre||''))?String(req.query.genre):'Electronic';
  const mood=String(req.query?.mood||'').slice(0,40);
  const action=String(req.query?.action||'trending');
  const station=resolveStation(req.query);
  const providers=[];
  try{
    let pool=[];
    if(action==='search'){
      const q=String(req.query?.q||'').trim().slice(0,80);
      if(!q)return res.status(400).json({error:'Search query required'});
      const found=await collectAudius([`${AUDIUS}/tracks/search?query=${encodeURIComponent(q)}&limit=50&app_name=${APP}`]);
      providers.push({name:'Audius',queries:found.attempted,succeeded:found.ok,licensed:found.tracks.length});
      pool=found.tracks;
    }else{
      const jobs=[collectAudius(planQueries(station))];
      if(process.env.MUSIC_CCMIXTER==='1')jobs.push(collectCcMixter(station));
      const [audius,ccmixter]=await Promise.all(jobs);
      providers.push({name:'Audius',queries:audius.attempted,succeeded:audius.ok,licensed:audius.tracks.length});
      pool=audius.tracks;
      if(ccmixter){
        providers.push({name:'ccMixter',queries:ccmixter.attempted,succeeded:ccmixter.ok,licensed:ccmixter.tracks.length});
        pool=pool.concat(ccmixter.tracks);
      }
    }
    if(mood)pool=pool.filter(t=>String(t?.mood||'').toLowerCase().includes(mood.toLowerCase()));
    const tracks=rankPool(pool,station);
    if(!tracks.length&&!providers.some(p=>p.succeeded>0))return res.status(502).json({error:'Workout radio is temporarily unavailable.',providers});
    return res.status(200).json({source:'Audius',station:station.key,stationLabel:station.label,genre,tracks,providers,commercialLicenseRequired:true});
  }catch(err){
    return res.status(502).json({error:'Workout radio is temporarily unavailable.',detail:String(err?.message||err)});
  }
}
export {commercialLicense,explicitCommercialDeed,resolveStation,planQueries,rankPool,scoreTrack,cleanCcMixter,clean,STATIONS,ALLOWED_GENRES};
