const AUDIUS='https://discoveryprovider.audius.co/v1';
const APP='IronSix';
const ALLOWED_GENRES=new Set(['Electronic','Rock','Metal','Hip-Hop/Rap','House','Techno','Trap','Drum & Bass','Dubstep','Hardstyle','Future Bass','Alternative']);

function commercialLicense(license){
  const raw=String(license||'').trim();
  if(!raw)return false;
  const s=raw.toLowerCase().replace(/[_-]+/g,' ');
  if(/\b(non.?commercial|nc)\b/.test(s))return false;
  if(/all rights reserved|arr|none|copyright/.test(s))return false;
  return /\bcc0\b|creative commons|\bcc by\b|attribution/.test(s);
}
function clean(track){
  const user=track?.user||{};
  return {id:String(track?.id||''),title:String(track?.title||'Untitled'),artist:String(user?.name||user?.handle||'Audius artist'),genre:String(track?.genre||''),mood:String(track?.mood||''),bpm:Number(track?.bpm)||null,duration:Number(track?.duration)||0,license:String(track?.license||''),artwork:track?.artwork?.['480x480']||track?.artwork?.['150x150']||'',permalink:track?.permalink?`https://audius.co${track.permalink}`:'',stream:`${AUDIUS}/tracks/${encodeURIComponent(track?.id||'')}/stream?app_name=${APP}`};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=900');
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  const genre=ALLOWED_GENRES.has(String(req.query?.genre||''))?String(req.query.genre):'Electronic';
  const mood=String(req.query?.mood||'').slice(0,40);
  const action=String(req.query?.action||'trending');
  let url;
  if(action==='search'){
    const q=String(req.query?.q||'').trim().slice(0,80);
    if(!q)return res.status(400).json({error:'Search query required'});
    url=`${AUDIUS}/tracks/search?query=${encodeURIComponent(q)}&limit=30&app_name=${APP}`;
  }else{
    url=`${AUDIUS}/tracks/trending?genre=${encodeURIComponent(genre)}&time=week&limit=50&app_name=${APP}`;
  }
  try{
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)return res.status(502).json({error:`Audius returned ${response.status}`});
    const body=await response.json();
    let tracks=Array.isArray(body?.data)?body.data:[];
    tracks=tracks.filter(t=>!t?.is_stream_gated&&!t?.is_unlisted&&commercialLicense(t?.license));
    if(mood)tracks=tracks.filter(t=>String(t?.mood||'').toLowerCase().includes(mood.toLowerCase()));
    tracks=tracks.slice(0,20).map(clean);
    return res.status(200).json({source:'Audius',genre,tracks,commercialLicenseRequired:true});
  }catch(err){
    return res.status(502).json({error:'Workout radio is temporarily unavailable.',detail:String(err?.message||err)});
  }
}
export {commercialLicense};
