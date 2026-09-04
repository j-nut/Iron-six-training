const IRON_SIX_SUPABASE_URL='https://btfrkfbxyowglrdwclei.supabase.co';
const IRON_SIX_SUPABASE_PUBLISHABLE_KEY='sb_publishable_lhLxwVoR5VcpNpOPs1bBVQ_ik42s4wi';

export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({
    supabaseUrl:process.env.SUPABASE_URL||IRON_SIX_SUPABASE_URL,
    supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||IRON_SIX_SUPABASE_PUBLISHABLE_KEY
  });
}
