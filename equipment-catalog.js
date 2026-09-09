/* Shared equipment catalogue.
 *
 * One source of truth for the equipment picker (client) and the exercise generator (api), so a
 * name a user taps in the UI always resolves to the same exercise family on the server.
 *
 * `builtinKey` items map onto the nine original `user.equipment` flags and keep their storage
 * shape. Everything else is stored by display name in `user.customEquipment`.
 *
 * `family` selects the curated exercise list in api/equipment-exercises.js. A null family means
 * the item is real equipment worth recording but does not add strength movements — conditioning
 * and recovery gear. The UI says so rather than silently adding nothing.
 */
(function(root){
const items=[
  // ---- Free weights -------------------------------------------------------------------------
  {id:'dumbbells',name:'Dumbbells',category:'Free weights',builtinKey:'dumbbells',family:null,
   aliases:['dumbbell','adjustable dumbbells','powerblock','bowflex dumbbells','free weights','db']},
  {id:'kettlebells',name:'Kettlebells',category:'Free weights',family:'kettlebell',
   aliases:['kettlebell','kb','adjustable kettlebell','competition kettlebell']},
  {id:'barbell',name:'Olympic barbell + plates',category:'Free weights',builtinKey:'barbell',family:null,
   aliases:['barbell','olympic bar','bar and plates','straight bar','7ft bar']},
  {id:'ez-bar',name:'EZ curl bar',category:'Free weights',family:'ez_bar',
   aliases:['ez bar','ez-bar','curl bar','w bar','preacher bar']},
  {id:'trap-bar',name:'Trap / hex bar',category:'Free weights',family:'trap_bar',
   aliases:['trap bar','hex bar','deadlift bar','shrug bar']},
  {id:'plates',name:'Weight plates',category:'Free weights',family:'plates',
   aliases:['plates','bumper plates','iron plates','weight plate','45s']},
  {id:'sandbag',name:'Sandbag',category:'Free weights',family:'sandbag',
   aliases:['sandbag','sand bag','strongman bag','bulgarian bag']},
  {id:'medball',name:'Medicine ball',category:'Free weights',builtinKey:'medball',family:null,
   aliases:['medicine ball','med ball','wall ball']},
  {id:'slam-ball',name:'Slam ball',category:'Free weights',family:'slam_ball',
   aliases:['slam ball','dead ball','slamball']},
  {id:'weight-vest',name:'Weighted vest',category:'Free weights',family:'weight_vest',
   aliases:['weight vest','weighted vest','ruck plate','ruck']},

  // ---- Racks, benches and bars --------------------------------------------------------------
  {id:'rack',name:'Squat / bench rack',category:'Racks & benches',builtinKey:'rack',family:null,
   aliases:['rack','power rack','squat rack','cage','half rack','squat stands']},
  {id:'bench',name:'Adjustable bench',category:'Racks & benches',builtinKey:'bench',family:null,
   aliases:['bench','flat bench','weight bench','incline bench','adjustable bench']},
  {id:'smith',name:'Smith machine',category:'Racks & benches',family:'smith',
   aliases:['smith machine','smith','guided bar']},
  {id:'landmine',name:'Landmine attachment',category:'Racks & benches',builtinKey:'landmine',family:null,
   aliases:['landmine','corner bar','viking press attachment']},
  {id:'pullup',name:'Pull-up bar',category:'Racks & benches',builtinKey:'pullup',family:null,
   aliases:['pull up bar','pull-up bar','chin up bar','chin-up bar','doorway bar']},
  {id:'dip-station',name:'Dip station / parallel bars',category:'Racks & benches',family:'dip',
   aliases:['dip station','dip bars','parallel bars','dip','parallel bar','power tower']},
  {id:'plyo-box',name:'Plyo box / step',category:'Racks & benches',family:'box',
   aliases:['plyo box','box','step','aerobic step','jump box','stool']},
  {id:'ghd',name:'GHD / back extension bench',category:'Racks & benches',family:'ghd',
   aliases:['ghd','glute ham developer','glute ham raise bench','back extension','roman chair','hyperextension']},

  // ---- Cables and machines ------------------------------------------------------------------
  {id:'cable',name:'Cable machine / functional trainer',category:'Cables & machines',family:'cable',
   aliases:['cable','cables','cable machine','functional trainer','pulley','crossover','cable crossover']},
  {id:'lat-pulldown',name:'Lat pulldown machine',category:'Cables & machines',family:'lat_machine',
   aliases:['lat pulldown','pulldown','lat machine','lat pull down']},
  {id:'leg-press',name:'Leg press machine',category:'Cables & machines',family:'leg_press',
   aliases:['leg press','hack squat','sled press']},
  {id:'leg-curl',name:'Leg curl / extension machine',category:'Cables & machines',family:'leg_machine',
   aliases:['leg curl','hamstring curl machine','leg extension','leg curl machine']},
  {id:'chest-press-machine',name:'Selectorized weight machines',category:'Cables & machines',family:'machine',
   aliases:['machine','machines','weight machine','chest press machine','seated row machine','pec deck','selectorized','multi gym','home gym machine','shoulder press machine']},
  {id:'calf-machine',name:'Calf raise machine',category:'Cables & machines',family:'calf_machine',
   aliases:['calf machine','calf raise machine','standing calf raise','seated calf raise']},
  {id:'hip-thrust-machine',name:'Hip thrust machine',category:'Cables & machines',family:'hip_thrust_machine',
   aliases:['hip thrust machine','glute drive','glute bridge machine']},
  {id:'assist-machine',name:'Assisted pull-up / dip machine',category:'Cables & machines',family:'assist_machine',
   aliases:['assisted pull up machine','assisted dip machine','gravitron','assist machine']},

  // ---- Bands and small gear -----------------------------------------------------------------
  {id:'bands',name:'Resistance bands',category:'Bands & small gear',builtinKey:'bands',family:null,
   aliases:['bands','resistance band','loop band','tube band','power band','pull up band']},
  {id:'mini-bands',name:'Mini / glute bands',category:'Bands & small gear',family:'mini_band',
   aliases:['mini band','glute band','hip band','booty band','fabric band','mini loop']},
  {id:'suspension',name:'Suspension trainer (TRX)',category:'Bands & small gear',family:'suspension',
   aliases:['trx','suspension trainer','suspension straps','jungle gym','straps']},
  {id:'rings',name:'Gymnastic rings',category:'Bands & small gear',family:'suspension',
   aliases:['rings','gymnastic rings','gymnastics rings','olympic rings']},
  {id:'abwheel',name:'Ab roller',category:'Bands & small gear',builtinKey:'abwheel',family:null,
   aliases:['ab wheel','ab roller','ab roll out wheel']},
  {id:'parallettes',name:'Parallettes',category:'Bands & small gear',family:'parallettes',
   aliases:['parallettes','paralletes','push up bars','push-up bars','handstand blocks']},
  {id:'dip-belt',name:'Dip belt',category:'Bands & small gear',family:'dip_belt',
   aliases:['dip belt','weight belt for pull ups','loading pin belt']},

  // ---- Conditioning and recovery ------------------------------------------------------------
  // Recorded so the coach knows about them, but they add no strength slots.
  {id:'rower',name:'Rowing machine',category:'Conditioning & recovery',family:null,conditioning:true,
   aliases:['rower','rowing machine','concept2','concept 2','erg','ergometer']},
  {id:'air-bike',name:'Air / assault bike',category:'Conditioning & recovery',family:null,conditioning:true,
   aliases:['assault bike','air bike','airdyne','echo bike','exercise bike','spin bike','stationary bike']},
  {id:'treadmill',name:'Treadmill',category:'Conditioning & recovery',family:null,conditioning:true,
   aliases:['treadmill','running machine','elliptical','stair climber','stairmaster']},
  {id:'jump-rope',name:'Jump rope',category:'Conditioning & recovery',family:null,conditioning:true,
   aliases:['jump rope','skipping rope','speed rope']},
  {id:'sled',name:'Sled / prowler',category:'Conditioning & recovery',family:null,conditioning:true,
   aliases:['sled','prowler','push sled','drag sled']},
  {id:'battle-ropes',name:'Battle ropes',category:'Conditioning & recovery',family:null,conditioning:true,
   aliases:['battle rope','battle ropes','heavy rope']},
  {id:'foam-roller',name:'Foam roller',category:'Conditioning & recovery',family:null,conditioning:true,
   aliases:['foam roller','massage gun','lacrosse ball','mobility tools']}
];

const CATEGORIES=['Free weights','Racks & benches','Cables & machines','Bands & small gear','Conditioning & recovery'];

const normalize=value=>String(value||'').normalize('NFKC').toLowerCase()
  .replace(/[–—]/g,'-').replace(/[^a-z0-9 +/-]/g,' ').replace(/\s+/g,' ').trim();

// Exact lookups first, then a contained-word match, so "Bowflex adjustable kettlebells" and
// "my TRX straps" both land on the right family without matching on a stray letter.
const exact=new Map();
for(const item of items){
  exact.set(normalize(item.name),item);
  exact.set(normalize(item.id),item);
  for(const alias of item.aliases)if(!exact.has(normalize(alias)))exact.set(normalize(alias),item);
}

function match(value){
  const text=normalize(value);
  if(!text)return null;
  const hit=exact.get(text);
  if(hit)return hit;
  let best=null,bestLength=0;
  for(const item of items){
    for(const term of [item.name,...item.aliases]){
      const needle=normalize(term);
      if(needle.length<3||needle.length<=bestLength)continue;
      const boundary=new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^a-z0-9])`);
      if(boundary.test(text)){best=item;bestLength=needle.length}
    }
  }
  return best;
}

const byId=new Map(items.map(item=>[item.id,item]));
const familyFor=value=>match(value)?.family||null;
const isConditioning=value=>!!match(value)?.conditioning;

const api={items,categories:CATEGORIES,byId,match,familyFor,isConditioning,normalize,
  builtins:items.filter(item=>item.builtinKey),
  selectable:items.filter(item=>!item.builtinKey)};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.IronSixEquipmentCatalog=api;
})(typeof window!=='undefined'?window:globalThis);
