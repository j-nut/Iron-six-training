const SUPABASE_URL='https://btfrkfbxyowglrdwclei.supabase.co';
const SUPABASE_KEY='sb_publishable_lhLxwVoR5VcpNpOPs1bBVQ_ik42s4wi';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  try{
    const response=await fetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(8000)});
    if(!response.ok)return res.status(502).json({error:'Auth settings unavailable'});
    const body=await response.json();
    const external=body?.external||{};
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({providers:{google:external.google===true,apple:external.apple===true,microsoft:external.azure===true,github:external.github===true}});
  }catch(error){return res.status(502).json({error:'Auth settings unavailable'});}
}
