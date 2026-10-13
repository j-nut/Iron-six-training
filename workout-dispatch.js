const WORKOUT_BUILDERS={lower_strength:build_lower_strength,shoulders_arms:build_shoulders_arms,chest:build_chest,back:build_back,lower_hypertrophy:build_lower_hypertrophy,upper_specialization:build_upper_specialization};
function optionsFor(workoutKey,variant,u){return (WORKOUT_BUILDERS[workoutKey]||build_upper_specialization)(variant,u)}

function programOptions(key,variant,u){
  const captured=[],original=slot;
  slot=(user,options)=>{captured.push(options);return options[0]||null};
  try{WORKOUT_BUILDERS[key](variant,u)}finally{slot=original}
  return captured;
}

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
  return registry.filter(r=>r&&r.mediaMatch==='exact'&&r.name&&(String(r.base||'')===wantedBase||String(r.pattern||'')===wantedSeed)).map(r=>({
    name:r.name,requires:Array.isArray(r.equipment)?r.equipment.slice(0,4):[],prescription:registryPrescription(r,sample),sets:sample.sets||3,
    tag:sample.tag||'Accessory',base:sample.base,seedKey:sample.seedKey,priority:sample.priority||2,source:'registry'
  })).filter(e=>exerciseAvailable(u,e));
}
function counterpartKey(key){return ({push_a:'push_b',push_b:'push_a',lower_a:'lower_b',lower_b:'lower_a',pull_a:'pull_b',pull_b:'pull_a',upper_a:'upper_b',upper_b:'upper_a',full2_a:'full2_b',full2_b:'full2_a'})[key]||null}
// Sibling days of the same split prefer different accessory angles (A/B, or A/B/C for full body).
function counterpartKeys(key){return /^full_[abc]$/.test(key)?['full_a','full_b','full_c'].filter(k=>k!==key):[counterpartKey(key)].filter(Boolean)}
function counterpartPenalty(u,key,e){
  const others=counterpartKeys(key);if(!others.length)return 0;
  return (u.history||[]).slice(0,8).reduce((n,h,i)=>n+(others.includes(h.workoutKey)&&(h.details||[]).some(d=>d.name===e.name)?Math.max(12,70-i*8):0),0);
}
function patternRecentPenalty(u,e){
  return (u.history||[]).slice(0,6).reduce((n,h,i)=>n+((h.details||[]).some(d=>d.seedKey===e.seedKey)?Math.max(0,8-i):0),0);
}

/* Equipment is not neutral. When a user owns substantial free weights, those should do most of
   the primary progressive-overload work. Bands stay valuable for accessory/isolation slots and
   as fallbacks when a stronger loaded option is unavailable. */
function equipmentClass(e){
  const req=new Set(e.requires||[]),name=String(e.name||'').toLowerCase();
  if(req.has('barbell')||req.has('dumbbells')||req.has('landmine')||/barbell|dumbbell|landmine|weighted/.test(name))return 'free';
  if(req.has('bands')||/\bband|banded\b/.test(name))return 'band';
  if(req.size===0)return 'bodyweight';
  return 'other';
}
function equipmentPreferencePenalty(u,id,e,pool,anchor){
  const cls=equipmentClass(e),hasFree=pool.some(x=>equipmentClass(x)==='free'),freeSetup=!!(u.equipment?.barbell||u.equipment?.dumbbells||u.equipment?.landmine);
  if(!freeSetup||!hasFree)return 0;
  const supportSlots=new Set(['lateral','triceps','rear','lat_iso','lat_iso_b','ham','core','calves','fly','curl_long','hammer']);
  const compoundSlots=new Set(['press','secondary','overhead','squat','hinge','single','row','vertical','glute']);
  if(cls==='free')return -8;
  if(cls==='band'){
    if(anchor||compoundSlots.has(id))return 34;
    return supportSlots.has(id)?6:14;
  }
  if(cls==='bodyweight'&&compoundSlots.has(id))return 8;
  return 0;
}

/* Equipment-free movements that train their target muscle poorly (unloaded, isometric, or a
   weak lever). They stay available as last resorts, but never beat a loaded option the user's
   equipment allows. The penalty exceeds the largest realistic recency penalty on purpose. */
const LOW_STIMULUS_FALLBACKS=new Set(['Lean-Away Lateral Raise','Prone Lat Pull','Isometric Lat Press','Towel Isometric Curl','Bodyweight Curl Isometric','Hamstring Walkout']);
function lowStimulusPenalty(e,pool){
  if(!LOW_STIMULUS_FALLBACKS.has(e.name))return 0;
  return pool.some(x=>!LOW_STIMULUS_FALLBACKS.has(x.name))?1000:0;
}

const VERTICAL_FIRST={pull_a:'Pull-Up',pull_b:'Chin-Up',upper_a:'Pull-Up',upper_b:'Chin-Up',full_b:'Pull-Up',full_c:'Chin-Up',full2_a:'Chin-Up',full2_b:'Pull-Up',full_a:'Chin-Up'};
function programSlot(u,id,source,index,sets,priority=2,anchor=false){
  const key=u.program.currentWorkoutKey,exposure=Number(u.program.exposures[key])||0;
  // Strength keeps one benchmark per slot (the foundation lift) instead of rotating it every block.
  const goal=typeof programGoal==='function'?programGoal(u):'muscle',stableAnchor=anchor&&goal==='strength';
  const variation=stableAnchor?0:anchor?Math.floor(exposure/4)%3:exposure%3;
  const original=programOptions(source,variation,u)[index]||[];
  let pool=[...original];

  if(id==='vertical'&&VERTICAL_FIRST[key]){
    pool=[0,1,2].flatMap(v=>programOptions('back',v,u)[0]||[]);
    const order=VERTICAL_FIRST[key]==='Pull-Up'
      ? ['Pull-Up','Chin-Up','Band Lat Pulldown','Prone Lat Pull']
      : ['Chin-Up','Pull-Up','Band Lat Pulldown','Prone Lat Pull'];
    pool.sort((a,b)=>{const ai=order.indexOf(a.name),bi=order.indexOf(b.name);return (ai<0?99:ai)-(bi<0?99:bi)});
  }

  if(id==='row'){
    const rows=[0,1,2].flatMap(v=>programOptions('back',v,u)[1]||[]);
    /* Supported rows (chest-supported, one-arm braced, band) protect the lower back next to hinge
       work, so they win whenever a loaded one is possible. With none available the whole row
       family opens up (barbell/Pendlay/landmine rows) so a barbell-only lifter still gets a
       horizontal pull. Equipment-free setups have no illustrated row, so the slot is reported
       in planGaps rather than filled with a movement that has no truthful artwork. */
    const supported=/Chest-Supported|One-Arm Dumbbell|Band Row/;
    const loadedSupported=rows.some(e=>supported.test(e.name)&&equipmentClass(e)!=='band'&&exerciseAvailable(u,e));
    pool=loadedSupported?rows.filter(e=>supported.test(e.name)):rows;
    const order=key==='pull_a'
      ? ['One-Arm Dumbbell Row','Chest-Supported Dumbbell Row','Band Row']
      : ['Chest-Supported Dumbbell Row','One-Arm Dumbbell Row','Band Row'];
    pool.sort((a,b)=>{const ai=order.indexOf(a.name),bi=order.indexOf(b.name);return (ai<0?99:ai)-(bi<0?99:bi)});
  }

  if(id==='curl_long'){
    pool=[0,1,2].flatMap(v=>programOptions('shoulders_arms',v,u)[3]||[]);
    const order=['Incline Dumbbell Curl','Barbell Curl','Dumbbell Curl','Band Curl'];
    pool.sort((a,b)=>{const ai=order.indexOf(a.name),bi=order.indexOf(b.name);return (ai<0?99:ai)-(bi<0?99:bi)});
  }

  /* Bodyweight presses are always a valid chest-press fallback, whichever variant is current. */
  if(source==='chest'&&(id==='press'||id==='secondary'))pool.push(...[0,1,2].flatMap(v=>programOptions('chest',v,u)[0]||[]).filter(e=>!e.requires?.length));
  if(id==='curl')pool.push(...programOptions('shoulders_arms',0,u)[5]);
  if(id==='hammer')pool.push(...programOptions('shoulders_arms',0,u)[3].filter(e=>e.name==='Barbell Curl'));
  const probe={...u,program:{...u.program,currentWorkoutKey:source}};
  pool.push(...generatedOptionsForSlot(probe,original));
  const sample=original[0]||pool[0];
  if(sample&&id!=='row')pool.push(...registryOptionsForSlot(u,sample));
  if(source==='chest'&&(id==='press'||id==='secondary'))pool=pool.filter(e=>!/Landmine Press/.test(e.name));
  pool=pool.filter((e,i,all)=>e&&exerciseAvailable(u,e)&&all.findIndex(x=>x.name===e.name)===i);
  if(!pool.length)return null;

  const cacheVersion='v5';
  const difficulty=window.IronSixDifficulty?.effectiveFor(u)||'balanced';
  const token=`${cacheVersion}:${key}:${id}:${stableAnchor?'block-strength':anchor?'block'+Math.floor(exposure/4):exposure}${difficulty==='heavy'?':difficulty:heavy':''}`;
  const cached=u.program.selectionCache[token];
  let selected=pool.find(e=>e.name===cached);
  if(!selected){
    const exactPenalty=e=>(u.history||[]).slice(0,12).reduce((n,h,i)=>n+((h.details||[]).some(d=>d.name===e.name)?(12-i)*11:0),0);
    const equipped=pool.some(e=>e.requires?.length);
    selected=pool.map((e,i)=>{
      const legacyBias=i<original.length?0:anchor?8:1;
      const noEquipmentBias=equipped&&!e.requires?.length?10:0;
      const patternPenalty=anchor?0:patternRecentPenalty(u,e);
      const equipmentPenalty=equipmentPreferencePenalty(u,id,e,pool,anchor);
      // A strength benchmark ignores recency and A/B variety: the builder's listed order (barbell first) wins.
      const history=stableAnchor?i*6:exactPenalty(e)+counterpartPenalty(u,key,e);
      return {e,score:history+patternPenalty+legacyBias+noEquipmentBias+equipmentPenalty+lowStimulusPenalty(e,pool)+(window.IronSixDifficulty?.selectionPenalty(u,e)||0)};
    }).sort((a,b)=>a.score-b.score||stableNumber(`${token}:${a.e.name}`)-stableNumber(`${token}:${b.e.name}`))[0].e;
    u.program.selectionCache[token]=selected.name;
  }
  const reason=stableAnchor?'Benchmark lift: kept the same so strength progress is measured on one lift.':anchor?'Benchmark lift: repeat within the block to measure progress.':'Accessory selected to balance recent work, A/B variety, available equipment, and free-weight priority.';
  const result={...selected,sets,priority,prescription:String(selected.prescription).replace(/^.*then \d+ ×\s*/,sets+' × ').replace(/^\d+ ×\s*/,sets+' × '),_programSlot:id,_anchor:anchor,_selectionReason:reason,_alternatives:pool.filter(e=>e.name!==selected.name).map(e=>({...e,sets,priority}))};
  if(goal==='muscle'||typeof goalPrescription!=='function')return result;
  // Goal ranges apply to the chosen lift and every swap option, so a swap keeps the goal's reps.
  const main=priority===1;
  return {...result,prescription:goalPrescription(goal,result,main),_goal:goal,_alternatives:result._alternatives.map(e=>({...e,prescription:goalPrescription(goal,e,main)}))};
}
function buildBalancedProgram(key,u){
  const specs={
    push_a:[['press','chest',0,3,1,true],['secondary','chest',1,3,2],['lateral','shoulders_arms',1,3,2],['triceps','chest',3,2,2],['core','chest',4,2,2]],
    lower_a:[['squat','lower_strength',0,3,1,true],['hinge','lower_strength',2,2,1,true],['single','lower_strength',1,3,2],['ham','lower_strength',4,2,2],['calves','lower_strength',5,3,2]],
    pull_a:[['vertical','back',0,3,1,true],['lat_iso','back',3,3,2],['row','back',1,2,2],['curl_long','shoulders_arms',3,3,2],['core','chest',4,2,2]],
    push_b:[['press','chest',1,3,1,true],['overhead','shoulders_arms',0,3,1,true],['fly','chest',2,3,2],['lateral','shoulders_arms',1,2,2],['triceps','shoulders_arms',4,2,2]],
    lower_b:[['hinge','lower_hypertrophy',1,3,1,true],['squat','lower_hypertrophy',0,3,1,true],['glute','lower_hypertrophy',3,3,2],['ham','lower_hypertrophy',4,3,2],['calves','lower_hypertrophy',5,3,2]],
    pull_b:[['row','back',1,3,1,true],['vertical','back',0,2,2],['rear','back',2,3,2],['hammer','shoulders_arms',5,3,2],['lat_iso_b','back',3,2,3]]
  };
  Object.assign(specs,SPLIT_SPECS);
  // In the upper/lower split the legs days also carry the week's direct core work.
  const daySpecs=[...(specs[key]||[]),...(/^lower_[ab]$/.test(key)&&typeof rotationFor==='function'&&rotationFor(u).length===4?[['core','chest',4,2,2]]:[])];
  const chosen=[],missing=[];
  for(const spec of daySpecs){
    // An optional fallback slot (7th element) keeps a pattern when equipment rules the first one out,
    // e.g. a pull-up when no row is possible. The original slot is still reported as a gap.
    // A low-stimulus last resort (e.g. Prone Lat Pull) also gives way to a loaded fallback pattern.
    let e=programSlot(u,...spec.slice(0,6));
    if(Array.isArray(spec[6])&&(!e||LOW_STIMULUS_FALLBACKS.has(e.name))){const fallback=programSlot(u,...spec[6]);if(fallback&&!LOW_STIMULUS_FALLBACKS.has(fallback.name)){missing.push(spec[0]);e=fallback}}
    if(!e){missing.push(spec[0]);continue}
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
/* Lower-frequency splits reuse the same slots (and so the same option lists, equipment fallbacks and
 * media). Slot: [id, source builder, option index, base sets, priority, benchmark anchor, fallback]. */
const SPLIT_SPECS={
  upper_a:[['press','chest',0,3,1,true],['vertical','back',0,3,1,true,['row','back',1,3,1,true]],['row','back',1,3,2],['fly','chest',2,2,2],['lateral','shoulders_arms',1,3,2],['curl_long','shoulders_arms',3,2,2],['triceps','chest',3,2,2]],
  upper_b:[['overhead','shoulders_arms',0,3,1,true],['row','back',1,3,1,true,['vertical','back',0,3,1,true]],['press','chest',1,3,2],['vertical','back',0,2,2,false,['lat_iso','back',3,2,2]],['rear','back',2,2,2],['lateral','shoulders_arms',1,2,2],['hammer','shoulders_arms',5,2,2],['triceps','shoulders_arms',4,2,2]],
  full_a:[['squat','lower_strength',0,3,1,true],['press','chest',0,3,1,true],['row','back',1,3,1,true,['vertical','back',0,3,1,true]],['ham','lower_strength',4,2,2],['lateral','shoulders_arms',1,2,2],['curl_long','shoulders_arms',3,2,2]],
  full_b:[['hinge','lower_hypertrophy',1,3,1,true],['overhead','shoulders_arms',0,3,1,true],['vertical','back',0,3,1,true,['row','back',1,3,1,true]],['secondary','chest',1,2,2],['single','lower_strength',1,2,2],['triceps','shoulders_arms',4,2,2],['calves','lower_strength',5,3,2]],
  full_c:[['squat','lower_hypertrophy',0,3,1,true],['press','chest',1,3,1,true],['vertical','back',0,3,1,true,['row','back',1,3,1,true]],['row','back',1,2,2],['rear','back',2,2,2],['core','chest',4,2,2],['hammer','shoulders_arms',5,2,3]],
  full2_a:[['squat','lower_strength',0,3,1,true],['press','chest',0,3,1,true],['row','back',1,3,1,true,['vertical','back',0,3,1,true]],['ham','lower_strength',4,2,2],['lateral','shoulders_arms',1,2,2],['curl_long','shoulders_arms',3,2,2],['calves','lower_strength',5,2,2]],
  full2_b:[['hinge','lower_hypertrophy',1,3,1,true],['overhead','shoulders_arms',0,3,1,true],['vertical','back',0,3,1,true,['row','back',1,3,1,true]],['secondary','chest',1,3,2],['single','lower_strength',1,2,2],['triceps','shoulders_arms',4,2,2],['rear','back',2,2,2],['core','chest',4,2,2]]
};
for(const key of [...ROTATION,...Object.keys(SPLIT_SPECS)])WORKOUT_BUILDERS[key]=(variant,u)=>buildBalancedProgram(key,u);
