/* Equipment coverage analysis.
 *
 * Answers "what can this profile actually train?" by running every workout builder for every
 * variant against the profile's real equipment and counting how many options survive. Nothing
 * here is a guess or a model call: it walks the same option lists the workout engine walks, so
 * a slot reported as empty really does fall back to whatever the builder lists last.
 *
 * The analysis runs against a copy of the profile. Building a workout writes a selection cache,
 * and inspecting coverage must never change which exercise the user is about to be shown.
 */
(function(){
if(window.IronSixEquipmentCoverage)return;

const KEYS=['lower_strength','shoulders_arms','chest','back','lower_hypertrophy','upper_specialization'];
const VARIANTS=[0,1,2];

function copyUser(u){try{return JSON.parse(JSON.stringify(u))}catch(_){return {...u}}}

// Run the builders with `slot` stubbed so every option list is captured instead of resolved.
// Resolving would pick one exercise; we want to see all of them.
function captureSlots(user,key,variant){
  const captured=[],real=window.slot;
  window.slot=(u,options)=>{captured.push(Array.isArray(options)?options:[]);return options?.[0]||null};
  try{optionsFor(key,variant,user)}catch(_){}finally{window.slot=real}
  return captured;
}

function availableOptions(user,options){
  const generated=typeof generatedOptionsForSlot==='function'?generatedOptionsForSlot(user,options):[];
  const seen=new Set();
  return [...options,...generated].filter(option=>{
    if(!option?.name||!exerciseAvailable(user,option))return false;
    const key=String(option.name).toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function equipmentNeededFor(option){
  const catalog=window.IronSixEquipmentCatalog;
  const builtin=(option.requires||[]).map(key=>catalog?.builtins.find(item=>item.builtinKey===key)?.name||key);
  return [...builtin,...(option.requiresCustom||[])];
}

function analyze(user){
  const probe=copyUser(user),rows=[];
  for(const key of KEYS){
    probe.program=probe.program||{};
    probe.program.currentWorkoutKey=key;
    const byBase=new Map();
    for(const variant of VARIANTS){
      for(const options of captureSlots(probe,key,variant)){
        const base=options?.[0]?.base;
        if(!base)continue;
        const available=availableOptions(probe,options);
        const row=byBase.get(base)||{workoutKey:key,workoutName:WORKOUT_META[key]?.name||key,base,counts:[],names:new Set(),loaded:0,total:options.length};
        row.counts.push(available.length);
        available.forEach(option=>{
          row.names.add(option.name);
          if((option.requires||[]).length||(option.requiresCustom||[]).length)row.loaded++;
        });
        byBase.set(base,row);
      }
    }
    for(const row of byBase.values())rows.push({
      workoutKey:row.workoutKey,workoutName:row.workoutName,base:row.base,
      min:Math.min(...row.counts),max:Math.max(...row.counts),
      options:[...row.names],loadedOptions:row.loaded
    });
  }

  const keys=ownedKeys(user);
  const empty=rows.filter(row=>row.min===0),thin=rows.filter(row=>row.min===1);
  const bodyweightOnly=rows.filter(row=>row.min>0&&!row.loadedOptions);
  const gaps=[...empty,...thin,...bodyweightOnly]
    .filter((row,index,all)=>all.findIndex(x=>x.workoutKey===row.workoutKey&&x.base===row.base)===index)
    .map(row=>({...row,severity:row.min===0?'empty':row.min===1?'thin':'unloaded',suggestions:suggestionsFor(user,row.base,keys)}))
    .sort((a,b)=>({empty:0,thin:1,unloaded:2}[a.severity]-{empty:0,thin:1,unloaded:2}[b.severity]));

  return {
    rows,gaps,
    total:rows.length,
    healthy:rows.length-empty.length-thin.length,
    empty:empty.length,
    thin:thin.length,
    score:rows.length?Math.round(((rows.length-empty.length-thin.length*0.5)/rows.length)*100):0,
    equipment:activeEquipment(user)
  };
}

// Ownership is resolved through the catalogue, not by string equality: someone who typed
// "Cable machine" owns the item whose canonical name is "Cable machine / functional trainer",
// and someone with gymnastic rings does not need to be sold a TRX for the same movements.
function ownedKeys(user){
  const catalog=window.IronSixEquipmentCatalog,keys=new Set();
  const add=item=>{if(!item)return;keys.add(item.id);if(item.family)keys.add('family:'+item.family)};
  for(const item of catalog?.builtins||[])if(user.equipment?.[item.builtinKey])add(item);
  for(const name of user.customEquipment||[])add(catalog?.match(name));
  return keys;
}

function owned(user,item,keys){
  if(item.builtinKey)return !!user.equipment?.[item.builtinKey];
  const set=keys||ownedKeys(user);
  return set.has(item.id)||(!!item.family&&set.has('family:'+item.family));
}

// Which catalogue items would add a movement to this slot, excluding anything already owned.
function suggestionsFor(user,base,keys){
  const catalog=window.IronSixEquipmentCatalog,library=window.IronSixEquipmentLibrary;
  if(!catalog||!library)return [];
  const families=new Set(library.familiesForSlot(base));
  if(!families.size)return [];
  const set=keys||ownedKeys(user);
  return catalog.items
    .filter(item=>families.has(item.family)&&!owned(user,item,set))
    .map(item=>({id:item.id,name:item.name,category:item.category,adds:library.namesFor(item.family).length}))
    .sort((a,b)=>b.adds-a.adds||a.name.localeCompare(b.name))
    .slice(0,3);
}

function activeEquipment(user){
  const catalog=window.IronSixEquipmentCatalog,library=window.IronSixEquipmentLibrary,rows=[];
  for(const item of catalog?.builtins||[])
    if(user.equipment?.[item.builtinKey])rows.push({id:item.id,name:item.name,category:item.category,builtinKey:item.builtinKey,custom:false,adds:0,conditioning:false});
  for(const name of user.customEquipment||[]){
    const item=catalog?.match(name);
    rows.push({id:item?.id||null,name,category:item?.category||'Other',builtinKey:null,custom:true,
      adds:item?.family&&library?library.namesFor(item.family).length:0,
      conditioning:!!item?.conditioning,recognised:!!item});
  }
  return rows;
}

// "If I add this, what changes?" — used by the picker before anything is saved.
function preview(user,name){
  const catalog=window.IronSixEquipmentCatalog,library=window.IronSixEquipmentLibrary;
  const item=catalog?.match(name);
  if(!item)return {recognised:false,conditioning:false,names:[],slots:[],fills:[]};
  if(!item.family)return {recognised:true,item,conditioning:!!item.conditioning,names:[],slots:[],fills:[]};
  const slots=library.slotsFor(item.family),current=analyze(user);
  const weak=new Set(current.gaps.filter(gap=>gap.severity!=='unloaded').map(gap=>gap.base));
  return {recognised:true,item,conditioning:false,names:library.namesFor(item.family),slots,
    fills:slots.filter(base=>weak.has(base))};
}

window.IronSixEquipmentCoverage={analyze,preview,suggestionsFor,equipmentNeededFor,activeEquipment,ownedKeys,owned};
})();
