const NOMAD_URL='https://nemgmavvuoulrahvrdwh.supabase.co';
const NOMAD_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoibmVtZ21hdnZ1b3VscmFodnJkd2giLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTI1NDA1NSwiZXhwIjoyMDk0ODMwMDU1fQ.6g0YhUutPI-wydfv2dClMDXT-8fhKEJSdzkipGc7_Yo';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  try{
    const token=typeof req.body?.token==='string'?req.body.token.trim():'';
    if(token.length<80||token.length>10000)return res.status(400).json({error:'Invalid sign-in token'});
    const response=await fetch(NOMAD_URL+'/auth/v1/user',{
      headers:{apikey:NOMAD_KEY,Authorization:'Bearer '+token},
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)return res.status(401).json({error:'Google identity could not be verified'});
    const user=await response.json();
    const providers=Array.isArray(user?.app_metadata?.providers)?user.app_metadata.providers:[];
    const google=user?.app_metadata?.provider==='google'||providers.includes('google');
    const email=typeof user?.email==='string'?user.email.trim().toLowerCase():'';
    if(!google||!email||!user?.email_confirmed_at)return res.status(403).json({error:'Verified Google email required'});
    return res.status(200).json({email});
  }catch(_){return res.status(502).json({error:'Identity verification unavailable'});}
}
