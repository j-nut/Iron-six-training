import { createClient } from 'npm:@supabase/supabase-js@2.112.4'

const VERIFY_URL='https://iron-six-training.vercel.app/api/verify-nomad-google'
const CORS={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store',
  'Content-Type':'application/json'
}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS})

function adminKey(){
  try{const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');if(keys?.default)return keys.default}catch(_){ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}
function tokenHash(data:any){
  const direct=data?.properties?.hashed_token||data?.properties?.hashedToken
  if(direct)return String(direct)
  const action=data?.properties?.action_link||data?.properties?.actionLink
  if(action){try{const u=new URL(action);return u.searchParams.get('token')||u.searchParams.get('token_hash')||''}catch(_){ }}
  return ''
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS})
  if(req.method!=='POST')return reply({error:'POST required'},405)
  try{
    const body=await req.json().catch(()=>null)
    const token=typeof body?.token==='string'?body.token.trim():''
    if(token.length<80||token.length>10000)return reply({error:'Invalid sign-in token'},400)

    const verified=await fetch(VERIFY_URL,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(10000)
    })
    if(!verified.ok)return reply({error:'Google identity could not be verified'},verified.status===401||verified.status===403?verified.status:502)
    const identity=await verified.json()
    const email=typeof identity?.email==='string'?identity.email.trim().toLowerCase():''
    if(!email)return reply({error:'Verified Google email required'},403)

    const key=adminKey(),url=Deno.env.get('SUPABASE_URL')||''
    if(!key||!url)return reply({error:'Iron Six auth service is unavailable'},503)
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
    const listed=await admin.auth.admin.listUsers({page:1,perPage:1000})
    if(listed.error)throw listed.error
    let user=listed.data.users.find(u=>String(u.email||'').toLowerCase()===email)
    if(!user){
      const created=await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{iron_six_identity_source:'google_bridge'}})
      if(created.error)throw created.error
      user=created.data.user
    }
    const generated=await admin.auth.admin.generateLink({type:'magiclink',email})
    if(generated.error)throw generated.error
    const hash=tokenHash(generated.data)
    if(!hash)throw new Error('One-time sign-in token was not generated')
    return reply({token_hash:hash})
  }catch(error){
    console.error('auth-bridge failure',error instanceof Error?error.message:'unknown')
    return reply({error:'Google sign-in could not be completed'},500)
  }
})
