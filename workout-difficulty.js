/* Session intent changes equipment preference and effort, never the user's recorded work. */
(() => {
  const root=typeof window!=='undefined'?window:globalThis;
  if(root.IronSixDifficulty)return;
  const LEVELS=['light','balanced','heavy'];
  const normalize=value=>LEVELS.includes(String(value||'').toLowerCase())?String(value).toLowerCase():'balanced';
  const sessionKey=u=>u?.program?.currentWorkoutKey||'lower_strength';
  const exposureFor=u=>Number(u?.program?.exposures?.[sessionKey(u)])||0;
  const loadNumber=value=>typeof parseLoad==='function'?parseLoad(value):Number(String(value||'').match(/\d+(?:\.\d+)?/)?.[0])||null;
  function validOverride(u,value=u?.sessionDifficulty){return !!value&&LEVELS.includes(value.level)&&value.workoutKey===sessionKey(u)&&Number(value.exposure)===exposureFor(u)}
  function effectiveFor(u){
    if(validOverride(u))return u.sessionDifficulty.level;
    if(LEVELS.includes(u?.workoutDraft?.difficulty))return u.workoutDraft.difficulty;
    return normalize(u?.workoutDifficulty);
  }
  function equipmentKind(ex){
    const req=ex?.requires||[],name=String(ex?.name||'');
    if(req.includes('landmine')||/landmine/i.test(name))return 'landmine';
    if(req.includes('barbell')||/barbell|pendlay|good morning/i.test(name))return 'barbell';
    if((ex?.requiresCustom||[]).length||/machine|cable/i.test(name))return 'machine';
    if(req.includes('dumbbells')||/dumbbell|goblet|weighted|kettlebell|medicine ball/i.test(name))return 'dumbbell';
    if(req.includes('bands')||/\bband|banded/i.test(name))return 'band';
    if(req.includes('pullup')||/pull[- ]?up|chin[- ]?up|pike push[- ]?up|ab wheel|ab roller/i.test(name))return 'challenging-bodyweight';
    return 'bodyweight';
  }
  function selectionPenalty(u,ex,level=effectiveFor(u)){
    if(level==='balanced')return 0;
    const kind=equipmentKind(ex);
    // Larger than recency penalties: intent is a preference, not another random variation.
    const light={bodyweight:0,band:1500,dumbbell:3000,'challenging-bodyweight':4500,machine:6000,landmine:7500,barbell:9000};
    const heavy={machine:-500,barbell:0,landmine:1500,dumbbell:3000,'challenging-bodyweight':4500,bodyweight:6000,band:7500};
    return (level==='light'?light:heavy)[kind]||0;
  }
  const available=(u,ex)=>typeof exerciseAvailable==='function'?exerciseAvailable(u,ex):(ex?.requires||[]).every(k=>u?.equipment?.[k])&&(ex?.requiresCustom||[]).every(n=>(u?.customEquipment||[]).some(x=>String(x).toLowerCase()===String(n).toLowerCase()));
  const painless=(u,ex)=>!(u?.trainingFeedback||[]).some(f=>f.feedback==='pain'&&Date.now()-Number(f.ts)<7*864e5&&String(f.exercise||'').toLowerCase()===String(ex.name||'').toLowerCase());
  function selectAlternative(u,ex,used,level){
    const pool=[ex,...(ex._alternatives||[])].filter((candidate,i,all)=>candidate?.name&&candidate.base===ex.base&&(!ex.seedKey||candidate.seedKey===ex.seedKey)&&available(u,candidate)&&painless(u,candidate)&&!used.has(candidate.name.toLowerCase())&&(u.trainingMode!=='circuit'||typeof circuitSuitable!=='function'||circuitSuitable(candidate))&&all.findIndex(x=>x.name===candidate.name)===i);
    const chosen=pool.map((candidate,index)=>({candidate,index,score:selectionPenalty(u,candidate,level)})).sort((a,b)=>a.score-b.score||a.index-b.index)[0]?.candidate||ex;
    const sets=Number(ex.sets)||1;
    return {...ex,...chosen,sets,priority:ex.priority,_programSlot:ex._programSlot,_anchor:ex._anchor,_difficulty:level,_alternatives:[ex,...(ex._alternatives||[])].filter(x=>x.name!==chosen.name).map(x=>({...x})),prescription:String(chosen.prescription||ex.prescription||'').replace(/^\d+\s*×/,sets+' ×')};
  }
  function transformWorkout(u,workout){
    // Rendering, changing a saved default, or a calendar tick cannot rewrite a draft.
    if(u?.workoutDraft?.plan?.length)return workout;
    const level=effectiveFor(u);
    if(level==='balanced')return workout;
    const used=new Set();
    return (workout||[]).map(ex=>{
      const chosen=selectAlternative(u,ex,used,level);used.add(chosen.name.toLowerCase());
      if(level==='light'){
        chosen.sets=Math.max(1,Math.ceil(chosen.sets*.75));
        chosen.prescription=String(chosen.prescription).replace(/^\d+\s*×/,chosen.sets+' ×');
      }
      return chosen;
    });
  }
  function enteredIndices(u){return new Set(Object.keys(u?.today||{}).map(k=>Number(k.split('-')[0])).filter(Number.isInteger))}
  function formatPrescription(u,ex){
    if(u.trainingMode==='circuit'&&typeof circuitPace==='function')return circuitPace(u).work+'s controlled work · '+ex.sets+' rounds';
    return String(ex.prescription||'').replace(/^\d+\s*×/,ex.sets+' ×');
  }
  function replanRemaining(u,value,oldPlan){
    const level=normalize(value),plan=oldPlan||u?.workoutDraft?.plan||(typeof finalWorkout==='function'?finalWorkout(u):[]),protectedIndices=enteredIndices(u);
    const used=new Set(plan.filter((_,i)=>protectedIndices.has(i)).map(ex=>String(ex.name).toLowerCase()));
    let result=plan.map((ex,index)=>{
      let chosen;
      if(protectedIndices.has(index)){
        chosen={...ex,_difficulty:level};
        const entries=Object.entries(u.today||{}).filter(([k])=>Number(k.split('-')[0])===index).sort((a,b)=>Number(b[0].split('-')[1])-Number(a[0].split('-')[1]));
        const anchor=entries.map(([,s])=>loadNumber(s.weight)).find(n=>Number.isFinite(n)&&n>0);
        if(level==='light'&&anchor)chosen._difficultyAnchorLoad=anchor;
        else delete chosen._difficultyAnchorLoad;
      }else{
        chosen=selectAlternative(u,ex,used,level);
        // A day adjustment cannot lengthen a live session or reindex entered work.
        if(level==='light'&&ex._difficulty!=='light')chosen.sets=Math.max(1,Math.ceil(ex.sets*.75));
        chosen.prescription=String(chosen.prescription).replace(/^\d+\s*×/,chosen.sets+' ×');
        delete chosen._difficultyAnchorLoad;
      }
      chosen.prescription=formatPrescription(u,chosen);
      used.add(chosen.name.toLowerCase());return chosen;
    });
    if(typeof sessionSeconds==='function'){
      const limit=Math.max(600,Math.min(7200,(Number(u.workoutMinutes)||60)*60));
      while(sessionSeconds(u,result)>limit){
        const donor=result.map((ex,index)=>({ex,index})).filter(({ex,index})=>!protectedIndices.has(index)&&ex.sets>1).sort((a,b)=>(b.ex.priority||2)-(a.ex.priority||2)||b.ex.sets-a.ex.sets||b.index-a.index)[0];
        if(!donor)break;
        result[donor.index]={...donor.ex,sets:donor.ex.sets-1};result[donor.index].prescription=formatPrescription(u,result[donor.index]);
      }
      // If a slower unilateral substitute cannot fit even one set per slot,
      // retain the already-budgeted movements and adjust resistance instead.
      if(sessionSeconds(u,result)>limit)result=result.map((ex,index)=>{
        if(protectedIndices.has(index))return ex;
        const prior={...plan[index],sets:ex.sets,_difficulty:level};delete prior._difficultyAnchorLoad;
        prior.prescription=formatPrescription(u,prior);return prior;
      });
    }
    return result;
  }
  function adjustSuggestion(u,ex,base,{fromToday=false}={}){
    const level=LEVELS.includes(ex?._difficulty)?ex._difficulty:effectiveFor(u);
    if(level==='heavy'&&Number(base?.load)>0&&typeof roundLoad==='function'){
      const load=Math.min(Number(base.load),roundLoad(Number(base.load),ex,u)||Number(base.load));
      return load<Number(base.load)?{...base,load,text:`${load} lb × about ${base.target||base.reps}`,detail:'Kept within your configured equipment limit. '+String(base.detail||'')}:base;
    }
    if(level!=='light'||!base||base._difficultyAdjusted)return base;
    const prescription=String(ex?.prescription||'');
    // Detect the time-unit marker directly. Parsing overlapping numeric ranges here
    // caused quadratic backtracking on long imported exercise prescriptions.
    const timed=/\b(?:sec|seconds?)\b/i.test(prescription)||prescription.toLowerCase().includes('s controlled work'),kind=equipmentKind(ex);
    if(timed||kind==='bodyweight'||kind==='challenging-bodyweight')return {...base,load:null,_difficultyAdjusted:true,text:timed?'Timed controlled work · comfortable effort':`Bodyweight × about ${base.target||base.reps}`,confidence:'Light effort',detail:'Light effort: keep movement controlled and leave about 4 reps in reserve. '+String(base.detail||'')};
    if(!(Number(base.load)>0))return {...base,_difficultyAdjusted:true,detail:'Light effort: choose a comfortable resistance with about 4 reps in reserve. '+String(base.detail||'')};
    const reserveFactor=Number(u?.readiness?.energy)<=2||Number(u?.readiness?.soreness)>=4?.75:.8;
    let desired=Number(base.load)*(fromToday?1:reserveFactor);
    if(Number(ex?._difficultyAnchorLoad)>0)desired=Math.min(desired,Number(ex._difficultyAnchorLoad)*reserveFactor);
    let load=typeof roundLoad==='function'?roundLoad(desired,ex,u):Math.max(5,Math.floor(desired/5)*5);
    if(desired<Number(base.load)&&load>=Number(base.load)&&Number(base.load)>5)load=Math.max(5,Math.floor(desired/5)*5);
    load=Math.min(Number(base.load),load||Number(base.load));
    return {...base,load,_difficultyAdjusted:true,text:`${load} lb × about ${base.target||base.reps}`,confidence:'Light effort',detail:'Comfortable working resistance; leave about 4 reps in reserve. '+String(base.detail||'')};
  }
  function installLoadAdjustment(){
    if(root.__ironSixDifficultyLoadsInstalled||typeof baselineLoadObject!=='function'||typeof suggestedLoadObject!=='function')return false;
    root.__ironSixDifficultyLoadsInstalled=true;
    const baseline=baselineLoadObject,suggested=suggestedLoadObject,next=typeof nextSetRecommendation==='function'?nextSetRecommendation:null;
    baselineLoadObject=(u,ex)=>adjustSuggestion(u,ex,baseline(u,ex));
    suggestedLoadObject=(u,ex,index)=>adjustSuggestion(u,ex,suggested(u,ex,index),{fromToday:typeof currentSessionCompleted==='function'&&currentSessionCompleted(u,index).length>0});
    if(next)nextSetRecommendation=(u,ex,index)=>{
      const result=next(u,ex,index),level=LEVELS.includes(ex?._difficulty)?ex._difficulty:effectiveFor(u);
      if(!result||!(result.load>0))return result;
      if(level!=='light')return adjustSuggestion(u,ex,result,{fromToday:true});
      const sets=typeof currentSessionCompleted==='function'?currentSessionCompleted(u,index):[],last=sets[sets.length-1],weight=loadNumber(last?.weight);
      const base=adjustSuggestion(u,ex,{...result,target:result.reps},{fromToday:true});
      if(base.load==null)return {...base,label:'Comfortable controlled work',text:base.text};
      if(weight>0)base.load=Math.min(base.load,weight);
      const rirText=String(last?.rir??'').trim(),rir=rirText===''?null:Number(rirText),reps=Number(last?.reps);
      if(weight>0&&reps>0&&Number.isFinite(rir)&&rir<4&&last?.feedback!=='pain'){
        const desired=weight*(30+reps+rir)/(30+(Number(base.reps)||reps)+4);
        const lower=typeof roundLoad==='function'?roundLoad(desired,ex,u):Math.max(5,Math.floor(desired/5)*5);
        base.load=Math.min(base.load,lower>=weight&&weight>5?Math.max(5,Math.floor(desired/5)*5):lower||weight);
      }
      const label=last?.feedback==='pain'?result.label:'Light effort — keep about 4 reps in reserve';
      return {...base,label,text:`${label}: try about ${base.load} lb × ${base.reps} next set.`};
    };
    return true;
  }
  const api={levels:LEVELS,labels:{light:'Light',balanced:'Balanced',heavy:'Heavy'},normalize,effectiveFor,validOverride,selectionPenalty,equipmentKind,transformWorkout,replanRemaining,adjustSuggestion,installLoadAdjustment};
  root.IronSixDifficulty=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
