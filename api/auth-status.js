const IRON_URL='https://btfrkfbxyowglrdwclei.supabase.co';
const IRON_KEY='sb_publishable_lhLxwVoR5VcpNpOPs1bBVQ_ik42s4wi';
const NOMAD_URL='https://nemgmavvuoulrahvrdwh.supabase.co';
const NOMAD_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbWdtYXZ2dW91bHJhaHZyZHdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTQwNTUsImV4cCI6MjA5NDgzMDA1NX0.6g0YhUutPI-wydfv2dClMDXT-8fhKEJSdzkipGc7_Yo';
const map=x=>({google:x.google===true,apple:x.apple===true,microsoft:x.azure===true,github:x.github===true});
async function settings(url,key){const r=await fetch(url+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Auth settings unavailable');return map((await r.json())?.external||{})}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  try{
    const [iron,nomad]=await Promise.all([settings(IRON_URL,IRON_KEY),settings(NOMAD_URL,NOMAD_KEY)]);
    res.setHeader('Cache-Control','no-store');return res.status(200).json({iron,nomad});
  }catch(error){return res.status(502).json({error:'Auth settings unavailable'});}
}
