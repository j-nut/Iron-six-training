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

/* The original workout files intentionally stay small and readable, but the approved registry
   is much larger. Convert registry movements that honestly match a slot into selectable options
   so accessories are not trapped in a 3-exercise menu. Every registry row has exact first-party
   media; equipment is still checked by exerciseAvailable before selection. */
function registryPrescription(entry,sample){
  const name=String(entry?.name||''),pattern=String(entry?.pattern||sample?.seedKey||'').toLowerCase();
  if(/isometric/i.test(name))return '3 × 20–30 sec';
  if(/plank/i.test(name))return '2 × 30–60 sec';
  if(pattern==='core')return '2 × 8–15';
  if(pattern==='calves')return '3 × 12–20';
  if(pattern==='lateral_raise'||pattern==='rear_delt')return '3 × 12–20';
  if(pattern==='fly'||pattern==='lat_iso'||pattern==='ham_curl')return '3 × 10–15';
  if(pattern==='curl'||pattern==='hammer_curl'||pattern==='triceps')return '3 × 8–15';
  if(pattern==='pullup')return '3 × 6–12';
  if(pattern==='row'||pattern==='chest_press'||pattern==='overhead_press')return '3 × 8–12';
  if(pattern==='split_squat'||pattern==='hip_thrust')return '3 × 8–15';
  if(pattern==='squat'||pattern==='hinge'||pattern==='bench')return '3 × 6–12';
  return sample?.prescription||'3 × 8–12';
}
function registryOptionsForSlot(u,sample){
  const registry=window.IronSixExerciseRegistry?.exercises||[];
  if(!sample||!registry.length)return [];
  const wantedBase=String(sample.base||''),wantedSeed=String(sample.seedKey||sample.base||'');
  return registry.filter(r=>{
    if(!r||r.mediaMatch!=='exact'||!r.name)return false;
    // Base is the strongest semantic constraint. Pattern is accepted only when the legacy
    // sample and registry row use the same canonical movement pattern.
    return String(r.base||'')===wantedBase||String(r.pattern||'')===wantedSeed;
  }).map(r=>({
    name:r.name,
    requires:Array.isArray(r.equipment)?r.equipment.slice(0,4):[],
    prescription:registryPrescription(r,sample),
    sets:sample.sets||3,
    tag:sample.tag||'Accessory',
    base:sample.base,
    seedKey:sample.seedKey,
    priority:sample.priority||2,
    source:'registry'
  })).filter(e=>exerciseAvailable(u,e));
}
function counterpartKey(key){return ({push_a:'push_b',push_b:'push_a',lower_a:'lower_b',lower_b:'lower_a',pull_a:'pull_b',pull_b:'pull_a'})[key]||null}
function counterpartPenalty(u,key,e){
  const other=counterpartKey(key);if(!other)return 0;
  return (u.history||[]).slice(0,8).reduce((n,h,i)=>n+(h.workoutKey===other&&(h.details||[]).some(d=>d.name===e.name)?Math.max(12,70-i*8):0),0);
}
function patternRecentPenalty(u,e){
  return (u.history||[]).slice(0,6).reduce((n,h,i)=>n+(h.details||[]).some(d=>d.seedKey===e.seedKey)?Math.max(0,8-i):0,0);
}
function programSlot(u,id,source,index,sets,priority=2,anchor=false){
  const key=u.program.currentWorkoutKey,exposure=Number(u.program.exposures[key])||0;
  const variation=anchor?Math.floor(exposure/4)%3:exposure%3;
  const original=programOptions(source,variation,u)[index]||[];
  let pool=[...original];

  // Pull A and Pull B are different sessions, not the same menu in a different order.
  // A biases lat width/vertical pulling; B biases supported rows/mid-back thickness.
  if(id==='vertical'&&/^pull_/.test(key)){
    pool=[0,1,2].flatMap(v=>programOptions('back',v,u)[0]||[]);
    const order=key==='pull_a'
      ? ['Pull-Up','Chin-Up','Band Lat Pulldown','Prone Lat Pull']
      : ['Band Lat Pulldown','Chin-Up','Pull-Up','Prone Lat Pull'];
    pool.sort((a,b)=>{
      const ai=order.indexOf(a.name),bi=order.indexOf(b.name);
      return (ai<0?99:ai)-(bi<0?99:bi);
    });
  }

  // Pull sessions follow legs, so keep rows lower-back friendly. A uses a lighter unilateral
  // supported row; B owns the chest-supported row as its primary thickness movement.
  if(id==='row'){
    pool=[0,1,2].flatMap(v=>programOptions('back',v,u)[1]||[])
      .filter(e=>/Chest-Supported|One-Arm Dumbbell|Band Row/.test(e.name));
    const order=key==='pull_a'
      ? ['One-Arm Dumbbell Row','Band Row','Chest-Supported Dumbbell Row']
      : ['Chest-Supported Dumbbell Row','Band Row','One-Arm Dumbbell Row'];
    pool.sort((a,b)=>{
      const ai=order.indexOf(a.name),bi=order.indexOf(b.name);
      return (ai<0?99:ai)-(bi<0?99:bi);
    });
  }

  // Pull A uses a long-head-biased curl when equipment permits; Pull B uses hammer work instead.
  if(id==='curl_long'){
    pool=[0,1,2].flatMap(v=>programOptions('shoulders_arms',v,u)[3]||[]);
    const order=['Incline Dumbbell Curl','Barbell Curl','Dumbbell Curl','Band Curl'];
    pool.sort((a,b)=>{
      const ai=order.indexOf(a.name),bi=order.indexOf(b.name);
      return (ai<0?99:ai)-(bi<0?99:bi);
    });
  }

  // Fill genuine equipment gaps with approved same-pattern options from other sessions.
  if(id==='curl')pool.push(...programOptions('shoulders_arms',0,u)[5]);
  const probe={...u,program:{...u.program,currentWorkoutKey:source}};
  pool.push(...generatedOptionsForSlot(probe,original));

  // Enrich every honest slot with all matching exact-media movements from the approved registry.
  // Rows stay intentionally constrained after lower-body days to protect the sequence from excess
  // unsupported lower-back loading; custom cable/machine rows still arrive through generated options.
  const sample=original[0]||pool[0];
  if(sample&&id!=='row')pool.push(...registryOptionsForSlot(u,sample));
  if(source==='chest'&&(id==='press'||id==='secondary'))pool=pool.filter(e=>!/Landmine Press/.test(e.name));
  pool=pool.filter((e,i,all)=>e&&exerciseAvailable(u,e)&&all.findIndex(x=>x.name===e.name)===i);
  if(!pool.length)return null;

  // v4 opens the approved registry to the program. Accessory choices refresh every exposure;
  // anchors remain block-stable so benchmark progression is still measurable.
  const cacheVersion='v4';
  const token=`${cacheVersion}:${key}:${id}:${anchor?'block'+Math.floor(exposure/4):exposure}`;
  const cached=u.program.selectionCache[token];
  let selected=pool.find(e=>e.name===cached);
  if(!selected){
    const exactPenalty=e=>(u.history||[]).slice(0,12).reduce((n,h,i)=>n+((h.details||[]).some(d=>d.name===e.name)?(12-i)*11:0),0);
    const equipped=pool.some(e=>e.requires?.length);
    selected=pool.map((e,i)=>{
      const legacyBias=i<original.length?0:anchor?8:1;
      const noEquipmentBias=equipped&&!e.requires?.length?10:0;
      const patternPenalty=anchor?0:patternRecentPenalty(u,e);
      return {e,score:exactPenalty(e)+counterpartPenalty(u,key,e)+patternPenalty+legacyBias+noEquipmentBias};
    }).sort((a,b)=>a.score-b.score||stableNumber(`${token}:${a.e.name}`)-stableNumber(`${token}:${b.e.name}`))[0].e;
    u.program.selectionCache[token]=selected.name;
  }
  const reason=anchor?'Benchmark lift: repeat within the block to measure progress.':'Accessory selected from the approved movement library to balance recent work, A/B variety, and equipment.';
  return {...selected,sets,priority,prescription:String(selected.prescription).replace(/^.*then \d+ ×\s*/,sets+' × ').replace(/^\d+ ×\s*/,sets+' × '),_programSlot:id,_anchor:anchor,_selectionReason:reason,_alternatives:pool.filter(e=>e.name!==selected.name).map(e=>({...e,sets,priority}))};
}
function buildBalancedProgram(key,u){
  const specs={
    // Chest-biased push: horizontal pressing leads, then upper-chest/secondary pressing.
    push_a:[['press','chest',0,3,1,true],['secondary','chest',1,3,2],['lateral','shoulders_arms',1,3,2],['triceps','chest',3,2,2],['core','chest',4,2,2]],
    // Squat-biased lower: knee-dominant strength plus unilateral work, with a smaller hinge dose.
    lower_a:[['squat','lower_strength',0,3,1,true],['hinge','lower_strength',2,2,1,true],['single','lower_strength',1,3,2],['ham','lower_strength',4,2,2],['calves','lower_strength',5,3,2]],
    // Lat/width day: vertical pull is the benchmark, then direct lat work. The row is secondary.
    pull_a:[['vertical','back',0,3,1,true],['lat_iso','back',3,3,2],['row','back',1,2,2],['curl_long','shoulders_arms',3,3,2],['core','chest',4,2,2]],
    // Balanced push: a different chest angle plus true overhead work and chest isolation.
    push_b:[['press','chest',1,3,1,true],['overhead','shoulders_arms',0,3,1,true],['fly','chest',2,3,2],['lateral','shoulders_arms',1,2,2],['triceps','shoulders_arms',4,2,2]],
    // Hinge/posterior-chain lower: hinge leads, then squat support, direct hip extension and curls.
    // This intentionally does not repeat Lower A's unilateral slot.
    lower_b:[['hinge','lower_hypertrophy',1,3,1,true],['squat','lower_hypertrophy',0,3,1,true],['glute','lower_hypertrophy',3,3,2],['ham','lower_hypertrophy',4,3,2],['calves','lower_hypertrophy',5,3,2]],
    // Thickness day: supported row is the benchmark; vertical work is secondary, with more
    // scapular/rear-delt volume and hammer curling for brachialis/forearm emphasis.
    pull_b:[['row','back',1,3,1,true],['vertical','back',0,2,2],['rear','back',2,3,2],['hammer','shoulders_arms',5,3,2],['lat_iso_b','back',3,2,3]]
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
