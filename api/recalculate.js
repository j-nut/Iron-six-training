const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(!process.env.GROQ_API_KEY)return res.status(503).json({error:'Cloud calibration is not configured'});
  const deterministic=clamp(Number(req.body?.deterministicFactor)||1,.94,1.06);
  const workout=Array.isArray(req.body?.workout)?req.body.workout.slice(0,12):[];
  const completed=Array.isArray(req.body?.completed)?req.body.completed.slice(0,30):[];
  if(!completed.length)return res.status(400).json({error:'Completed set data required'});
  const system=`You calibrate the remaining loads in a strength workout from completed weight, reps, and reps-in-reserve (RIR). Return only JSON: {"factor":1.00,"summary":"one short sentence"}. The factor applies conservatively to untouched exercises in the session. It must be between 0.94 and 1.06. Do not treat performance in one lift as proof of the same percentage change in every unrelated lift. Prefer the supplied deterministic factor; move at most 0.02 away from it. Missing RIR reduces confidence. Never diagnose or prescribe through pain.`;
  try{
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({deterministicFactor:deterministic,profile:req.body?.profile||{},workout,completed})}],response_format:{type:'json_object'},temperature:.1,max_completion_tokens:180})});
    const body=await response.json();if(!response.ok)return res.status(response.status).json({error:body?.error?.message||'AI calibration failed'});
    let parsed={};try{parsed=JSON.parse(body?.choices?.[0]?.message?.content||'{}')}catch(_){}
    const proposed=Number(parsed.factor),factor=clamp(Number.isFinite(proposed)?proposed:deterministic,Math.max(.94,deterministic-.02),Math.min(1.06,deterministic+.02));
    return res.status(200).json({factor:Number(factor.toFixed(3)),summary:String(parsed.summary||'Remaining loads were calibrated from today’s completed sets.').slice(0,180),model:MODEL});
  }catch(err){return res.status(500).json({error:'Cloud calibration failed',detail:String(err?.message||err)})}
}
