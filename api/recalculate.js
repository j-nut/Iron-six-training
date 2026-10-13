import { aiChat, aiConfigured } from './_lib/ai-chat.js';
import { aiCompact, aiGuard } from './_lib/ai-guard.js';

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}

export default async function handler(req,res){
  res.setHeader?.('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const guard=await aiGuard(req,'recalculate');
  if(guard.reason==='too_large')return res.status(413).json({error:'Calibration request is too large'});
  if(!aiConfigured())return res.status(503).json({error:'Cloud calibration is not configured'});
  const light=req.body?.profile?.workoutDifficulty==='light',ceiling=light?1:1.06;
  const deterministic=clamp(Number(req.body?.deterministicFactor)||1,.94,ceiling);
  const workout=Array.isArray(req.body?.workout)?req.body.workout.slice(0,12):[];
  const completed=Array.isArray(req.body?.completed)?req.body.completed.slice(0,30):[];
  if(!completed.length)return res.status(400).json({error:'Completed set data required'});
  const system=`You calibrate the remaining loads in a strength workout from completed weight, reps, and reps-in-reserve (RIR). Return only JSON: {"factor":1.00,"summary":"one short sentence"}. The factor applies conservatively to untouched exercises in the session. It must be between 0.94 and ${ceiling}. Respect profile.workoutDifficulty: Light keeps about 4 reps in reserve and cannot increase its planned load; Heavy is an equipment preference, not maximal lifting. Do not treat performance in one lift as proof of the same percentage change in every unrelated lift. Prefer the supplied deterministic factor; move at most 0.02 away from it. Missing RIR reduces confidence. Never diagnose or prescribe through pain.`;
  const validated=summary=>res.status(200).json({factor:Number(deterministic.toFixed(3)),summary,model:'validated-calculation'});
  if(!guard.allowed)return validated('The validated live calculation adjusted the remaining workout; cloud refinement is paused while you are over the usage limit.');
  try{
    const result=await aiChat({messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({deterministicFactor:deterministic,profile:aiCompact(req.body?.profile||{}),workout:aiCompact(workout),completed:completed.map(x=>aiCompact(x))})}],temperature:.1,maxTokens:220,json:true});
    if(!result.ok)return validated('The validated live calculation adjusted the remaining workout; cloud refinement was unavailable for this set.');
    let parsed={};try{parsed=JSON.parse(result.content||'{}')}catch(_){}
    const proposed=Number(parsed.factor),factor=clamp(Number.isFinite(proposed)?proposed:deterministic,Math.max(.94,deterministic-.02),Math.min(ceiling,deterministic+.02));
    return res.status(200).json({factor:Number(factor.toFixed(3)),summary:String(parsed.summary||'Remaining loads were calibrated from today’s completed sets.').slice(0,180),model:result.model});
  }catch(_){return validated('The validated live calculation adjusted the remaining workout; cloud refinement was unavailable for this set.')}
}
