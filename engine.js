function buildWorkout(u){const key=u.program.currentWorkoutKey||'lower_strength';const variant=currentVariant(u,key);return optionsFor(key,variant,u).map(x=>({...x,variant}))}
function tailorWorkout(base,minutes){
 const m=Math.max(10,Math.min(120,Number(minutes)||60));
 const ordered=base.map((e,i)=>({...e,_i:i})).sort((a,b)=>(a.priority||2)-(b.priority||2)||a._i-b._i);
 const targetSets=m<=15?6:m<=20?8:m<=30?11:m<=45?15:m<=60?20:28;
 let remaining=targetSets;const selected=[];
 for(const e of ordered){if(remaining<=0)break;const min=e.priority===1?Math.min(e.sets,3):1;const take=Math.min(e.sets,Math.max(min,Math.min(remaining,e.sets)));if(take>0){selected.push({...e,sets:take});remaining-=take}}
 return selected.sort((a,b)=>a._i-b._i).map(({_i,...e})=>e);
}
function getWorkout(u){return tailorWorkout(buildWorkout(u),u.workoutMinutes||60)}
function durationSummary(minutes){const m=Number(minutes)||60;if(m<=15)return 'Only the highest-value movement patterns and a short finisher.';if(m<=20)return 'Priority compounds plus one targeted accessory.';if(m<=30)return 'Main strength work plus focused hypertrophy volume.';if(m<=45)return 'Balanced strength + hypertrophy with multiple movement patterns.';if(m<=60)return 'Full strength-and-size session with normal accessory volume.';return 'Extended session with full programmed volume and normal rest periods.'}
function equipmentLabel(u){const n=EQUIPMENT.filter(([k])=>has(u,k)).length;return n===0?'Bodyweight only':`${n} equipment options`}
function parseLoad(v){const m=String(v||'').match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):null}
function repRange(ex){const m=String(ex.prescription||'').match(/(\d+)\s*[–-]\s*(\d+)/);return m?[Number(m[1]),Number(m[2])]:[8,12]}
function repTarget(ex){const [a,b]=repRange(ex);return Math.round((a+b)/2)}
function roundLoad(x,ex,u){if(!Number.isFinite(x)||x<=0)return null;let step=5;if(/Dumbbell/i.test(ex.name))step=5;let r=Math.max(5,Math.round(x/step)*step);if(/Dumbbell/i.test(ex.name)&&u.capacities?.dumbbellMax)r=Math.min(r,u.capacities.dumbbellMax);if(/Barbell|Bench|Squat|Deadlift|Row|Press|Curl|Hip Thrust/i.test(ex.name)&&!(/Dumbbell|Landmine/i.test(ex.name))&&u.capacities?.barbellMax)r=Math.min(r,u.capacities.barbellMax);return r}
function historySetsFor(u,matcher){const rows=[];(u.history||[]).forEach(h=>(h.details||[]).forEach(d=>{if(matcher(d))(d.sets||[]).forEach(x=>{if(x.done!==false)rows.push({...x,_date:h.ts||0,_exercise:d.name,_base:d.base})})}));return rows}
function e1rmFromSet(set){const w=parseLoad(set.weight),r=Number(set.reps),rir=Number(set.rir);if(!w||!r||r<1||r>30)return null;const effective=r+(Number.isFinite(rir)?rir:0);return w*(1+effective/30)}
function median(nums){const a=[...nums].sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function benchReferenceE1RM(u){const nums=String(u.benchBest||'').match(/\d+(?:\.\d+)?/g)||[];if(nums.length<2)return null;const w=Number(nums[0]),reps=Number(nums[nums.length-1]);return w&&reps?w*(1+reps/30):null}
const SEED_FACTORS={squat:.52,hinge:.60,bench:.38,overhead_press:.22,row:.38,hip_thrust:.55,curl:.10,triceps:.10,split_squat:.14,lateral_raise:.035,ham_curl:.08,calves:.18,chest_press:.16};
function demographicSeed(u,ex){
 const key=ex.seedKey||'',baseFactor=SEED_FACTORS[key];if(!baseFactor)return null;
 const level={unknown:.78,beginner:.72,intermediate:1,advanced:1.22}[u.trainingLevel]||.78;
 const age=Number(u.age)||35;const ageAdj=age<45?1:age<55?.95:age<65?.90:.85;
 let load=u.weight*baseFactor*level*ageAdj;
 if(/Dumbbell/i.test(ex.name))load/=2;
 if(/Landmine/i.test(ex.name))load*=.70;
 return roundLoad(load,ex,u);
}
function priorPerformance(u,ex){
 let sets=historySetsFor(u,d=>d.name===ex.name);let source='exact';if(!sets.length){sets=historySetsFor(u,d=>d.base===ex.base);source='pattern'}
 const e1s=sets.slice(0,18).map(e1rmFromSet).filter(Boolean);return {sets,e1s,source}
}
function currentSessionCompleted(u,exIndex){const arr=[];for(const [k,s] of Object.entries(u.today||{})){if(Number(k.split('-')[0])===exIndex&&s.done)arr.push(s)}return arr}
function suggestedLoadObject(u,ex,exIndex){
 const today=currentSessionCompleted(u,exIndex).map(e1rmFromSet).filter(Boolean);const prior=priorPerformance(u,ex);const e1s=[...today,...prior.e1s].filter(Boolean);
 const target=repTarget(ex),targetRir=u.trainingLevel==='advanced'?1.5:2;
 if(e1s.length){const recent=e1s.slice(0,6),e1=median(recent);const load=roundLoad(e1/(1+(target+targetRir)/30),ex,u);return {load,target,text:`${load} lb × about ${target}`,confidence:today.length?'Updated from today':'Performance-based',detail:today.length?'Adjusted from the weight, reps and RIR you entered in this workout.':`Based on ${prior.source==='exact'?'this exercise':'the same movement pattern'} from prior sessions.`}}
 if(ex.seedKey==='bench'){const b=benchReferenceE1RM(u);if(b){const load=roundLoad(b/(1+(target+2)/30),ex,u);return {load,target,text:`${load} lb × about ${target}`,confidence:'Benchmark-based',detail:'Seeded from the saved bench reference.'}}}
 const seed=demographicSeed(u,ex);if(seed){return {load:seed,target,text:`Start around ${seed} lb × ${target}`,confidence:'Conservative starting estimate',detail:'Uses body weight, age and training level only as a first-session estimate; your logged performance replaces it as soon as data exists.'}}
 return {load:null,target,text:`Target ${target} controlled reps`,confidence:'Rep-based',detail:'Load cannot be estimated safely from profile data for this movement. Choose resistance that leaves about 2 reps in reserve.'}
}
function nextSetAdjustment(u,ex,exIndex){const sets=currentSessionCompleted(u,exIndex);if(!sets.length)return null;const last=sets[sets.length-1],w=parseLoad(last.weight),reps=Number(last.reps),rir=Number(last.rir),[lo,hi]=repRange(ex);if(!w||!reps)return null;let factor=1,label='Keep the same load';if(reps>=hi&&rir>=2){factor=1.035;label='You beat the target — add a little weight'}else if(reps<lo||rir===0){factor=.94;label='That set was too hard — reduce the load'}else if(reps>=lo&&reps<=hi&&rir>=1&&rir<=3){factor=1;label='Right on target — repeat this load'}else if(rir>=4){factor=1.025;label='Too much left in reserve — add a little weight'}const load=roundLoad(w*factor,ex,u);return `${label}: try about ${load} lb next set.`}
function workoutReadinessAdjustment(u,workout){const energy=Number(u.readiness?.energy)||4,sore=Number(u.readiness?.soreness)||1;if(energy<=2)return workout.map(e=>({...e,sets:Math.max(1,Math.ceil(e.sets*.75))}));if(sore>=4&&(u.program.currentWorkoutKey||'').includes('lower'))return workout.filter(e=>e.base!=='Hip hinge');return workout}
function finalWorkout(u){return workoutReadinessAdjustment(u,getWorkout(u))}
function nextWorkoutKey(u){const cur=u.program.currentWorkoutKey||'lower_strength',idx=ROTATION.indexOf(cur);return ROTATION[(idx+1+ROTATION.length)%ROTATION.length]}
function adaptationStatus(u,key){const stats=exposureStats(u,key),unlocked=variantUnlocked(u,key);if(unlocked>=3)return `Variant library fully unlocked (${stats.successful} successful exposures).`;
 const need=unlocked===1?4:8;return `${Math.min(stats.successful,need)} / ${need} successful exposures toward Variant ${unlocked===1?'B':'C'}.`}
