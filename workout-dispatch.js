const WORKOUT_BUILDERS={lower_strength:build_lower_strength,shoulders_arms:build_shoulders_arms,chest:build_chest,back:build_back,lower_hypertrophy:build_lower_hypertrophy,upper_specialization:build_upper_specialization};
function optionsFor(workoutKey,variant,u){return (WORKOUT_BUILDERS[workoutKey]||build_upper_specialization)(variant,u)}

/* Version 2 uses the approved legacy option library, with new session identities.
   Capture options without selecting/mutating a user's draft or legacy caches. */
function programOptions(key,variant,u){
  const captured=[],original=slot;
  slot=(user,options)=>{captured.push(options);return options[0]||null};
  try{WORKOUT_BUILDERS[key](variant,u)}finally{slot=original}
  return captured;
}
function programSlot(u,id,source,index,sets,priority=2,anchor=false){
  const key=u.program.currentWorkoutKey,exposure=Number(u.program.exposures[key])||0;
  const variation=anchor?Math.floor(exposure/4)%3:exposure%3;
  const original=programOptions(source,variation,u)[index]||[];
  let pool=[...original];
  // Pull sessions follow legs: select rows with support, not unsupported barbell rows.
  if(id==='row'){
    pool=[0,1,2].flatMap(v=>programOptions('back',v,u)[1]||[])
      .filter(e=>/Chest-Supported|One-Arm Dumbbell|Band Row/.test(e.name));
    pool.sort((a,b)=>Number(/Chest-Supported/.test(b.name))-Number(/Chest-Supported/.test(a.name)));
  }
  // Fill genuine equipment gaps with approved same-pattern options from other sessions.
  if(id==='curl')pool.push(...programOptions('shoulders_arms',0,u)[5]);
  const probe={...u,program:{...u.program,currentWorkoutKey:source}};
  pool.push(...generatedOptionsForSlot(probe,original));
  if(source==='chest'&&(id==='press'||id==='secondary'))pool=pool.filter(e=>!/Landmine Press/.test(e.name));
  pool=pool.filter((e,i,all)=>e&&exerciseAvailable(u,e)&&all.findIndex(x=>x.name===e.name)===i);
  if(!pool.length)return null;
  const token=`v2:${key}:${id}:${anchor?'block'+Math.floor(exposure/4):exposure}`;
  const cached=u.program.selectionCache[token];
  let selected=pool.find(e=>e.name===cached);
  if(!selected){
    // Avoid duplicating the counterpart session; recent-use scoring supplies planned variety.
    const exactPenalty=e=>(u.history||[]).slice(0,12).reduce((n,h,i)=>n+((h.details||[]).some(d=>d.name===e.name)?(12-i)*10:0),0);
    selected=pool.map((e,i)=>({e,score:exactPenalty(e)+i+(!e.requires.length&&pool.some(x=>x.requires.length)?30:0)})).sort((a,b)=>a.score-b.score)[0].e;
    u.program.selectionCache[token]=selected.name;
  }
  const reason=anchor?'Benchmark lift: repeat to measure progress.':'Accessory choice balances recent exercises and available equipment.';
  return {...selected,sets,priority,prescription:String(selected.prescription).replace(/^.*then \d+ ×\s*/,sets+' × ').replace(/^\d+ ×\s*/,sets+' × '),_programSlot:id,_anchor:anchor,_selectionReason:reason,_alternatives:pool.filter(e=>e.name!==selected.name).map(e=>({...e,sets,priority}))};
}
function buildBalancedProgram(key,u){
  const specs={
    push_a:[['press','chest',0,3,1,true],['secondary','chest',1,3,2],['lateral','shoulders_arms',1,3,2],['triceps','chest',3,2,2],['core','chest',4,2,2]],
    lower_a:[['squat','lower_strength',0,3,1,true],['hinge','lower_strength',2,2,1,true],['single','lower_strength',1,3,2],['ham','lower_strength',4,2,2],['calves','lower_strength',5,3,2]],
    pull_a:[['vertical','back',0,3,1,true],['row','back',1,3,1,true],['rear','back',2,2,2],['curl','back',4,3,2],['core','chest',4,2,2]],
    push_b:[['press','chest',1,3,1,true],['overhead','shoulders_arms',0,3,1,true],['fly','chest',2,3,2],['lateral','shoulders_arms',1,2,2],['triceps','shoulders_arms',4,2,2]],
    lower_b:[['hinge','lower_hypertrophy',1,3,1,true],['squat','lower_hypertrophy',0,3,1,true],['single','lower_hypertrophy',2,3,2],['ham','lower_hypertrophy',4,3,2],['calves','lower_hypertrophy',5,3,2]],
    pull_b:[['row','back',1,3,1,true],['vertical','back',0,3,1,true],['rear','back',2,2,2],['curl','shoulders_arms',3,3,2]]
  };
  const chosen=[],missing=[];
  for(const spec of specs[key]||[]){let e=programSlot(u,...spec);if(!e){missing.push(spec[0]);continue}
    if(chosen.some(x=>x.name===e.name)){
      const alternate=e._alternatives.find(x=>!chosen.some(y=>y.name===x.name));
      if(alternate)e={...e,...alternate,_alternatives:e._alternatives.filter(x=>x.name!==alternate.name)};
      else {missing.push(spec[0]);continue}
    }
    chosen.push(e);
  }
  u.program.planGaps={key,slots:missing};
  return chosen;
}
for(const key of ROTATION)WORKOUT_BUILDERS[key]=(variant,u)=>buildBalancedProgram(key,u);
