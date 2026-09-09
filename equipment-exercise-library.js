/* Shared equipment exercise library.
 *
 * Keyed by the family that equipment-catalog.js resolves an equipment name to. Loaded by the
 * client (to say which gap a piece of equipment would fill) and imported by
 * api/equipment-exercises.js (to bound what the model may return), so the promise the picker
 * makes and the exercises the server hands back can never disagree.
 */
(function(root){
// This is an allowlist, not a suggestion: the model picks from it and cannot add to it, so a
// hostile equipment name cannot invent a movement or relabel one slot as another.
//
// Slotting rule: an exercise only appears under a base whose movement pattern it actually
// trains. Where a family has no honest option for a slot it simply has no entry — a leg
// extension is not "Squat volume", so it is absent rather than mis-filed.
const CURATED={
  kettlebell:[['Kettlebell Goblet Squat','Primary squat'],['Kettlebell Goblet Squat','Squat volume'],['Kettlebell Front Squat','Squat volume'],['Kettlebell Reverse Lunge','Single-leg work'],['Kettlebell Reverse Lunge','Single-leg volume'],['Kettlebell Romanian Deadlift','Hip hinge'],['Kettlebell Swing','Hip hinge'],['Kettlebell Single-Leg Deadlift','Hip hinge'],['Kettlebell Hip Thrust','Hip extension'],['Kettlebell Floor Press','Secondary press'],['Single-Arm Kettlebell Press','Vertical press'],['Single-Arm Kettlebell Row','Horizontal pull'],['Kettlebell Bent-Over Row','Horizontal pull'],['Kettlebell Lateral Raise','Lateral delts'],['Kettlebell Hammer Curl','Brachialis'],['Kettlebell Overhead Triceps Extension','Triceps press'],['Kettlebell Calf Raise','Calves'],['Kettlebell Suitcase Carry','Anterior core']],
  cable:[['Cable Chest Press','Secondary press'],['Cable Chest Fly','Chest isolation'],['Cable Lat Pulldown','Vertical pull'],['Seated Cable Row','Horizontal pull'],['Cable Face Pull','Scapular pull'],['Cable Rear Delt Fly','Rear delts'],['Cable Lateral Raise','Lateral delts'],['Cable Curl','Elbow flexion'],['Cable Hammer Curl','Brachialis'],['Cable Triceps Pressdown','Triceps press'],['Cable Overhead Triceps Extension','Triceps press'],['Cable Straight-Arm Pulldown','Lat isolation'],['Cable Pull-Through','Hip hinge'],['Cable Glute Kickback','Hip extension'],['Cable Woodchop','Anterior core'],['Cable Crunch','Anterior core'],['Half-Kneeling Cable Press','Vertical press']],
  suspension:[['Suspension Trainer Row','Horizontal pull'],['Suspension Trainer Row','Upper pull'],['Suspension Trainer Push-Up','Secondary press'],['Suspension Trainer Chest Fly','Chest isolation'],['Suspension Trainer Hamstring Curl','Knee flexion'],['Suspension Trainer Split Squat','Single-leg work'],['Suspension Trainer Pistol Squat','Single-leg volume'],['Suspension Trainer Body Saw','Anterior core'],['Suspension Trainer Face Pull','Scapular pull'],['Suspension Trainer Y-Raise','Rear delts'],['Suspension Trainer Biceps Curl','Elbow flexion'],['Suspension Trainer Triceps Extension','Triceps press']],
  machine:[['Machine Chest Press','Horizontal press'],['Machine Chest Press','Upper press'],['Machine Shoulder Press','Vertical press'],['Machine Lat Pulldown','Vertical pull'],['Machine Seated Row','Horizontal pull'],['Machine Seated Row','Upper pull'],['Machine Pec Deck','Chest isolation'],['Machine Rear Delt Fly','Rear delts'],['Machine Lateral Raise','Lateral delts'],['Machine Preacher Curl','Elbow flexion'],['Machine Triceps Extension','Triceps press'],['Machine Leg Curl','Knee flexion'],['Machine Calf Raise','Calves'],['Machine Hip Thrust','Hip extension'],['Machine Abdominal Crunch','Anterior core']],
  smith:[['Smith Machine Squat','Primary squat'],['Smith Machine Squat','Squat volume'],['Smith Machine Split Squat','Single-leg work'],['Smith Machine Romanian Deadlift','Hip hinge'],['Smith Machine Hip Thrust','Hip extension'],['Smith Machine Bench Press','Horizontal press'],['Smith Machine Bench Press','Upper press'],['Smith Machine Incline Press','Secondary press'],['Smith Machine Overhead Press','Vertical press'],['Smith Machine Inverted Row','Horizontal pull'],['Smith Machine Calf Raise','Calves']],
  sandbag:[['Sandbag Front Squat','Primary squat'],['Sandbag Front Squat','Squat volume'],['Sandbag Reverse Lunge','Single-leg work'],['Sandbag Romanian Deadlift','Hip hinge'],['Sandbag Shouldering','Hip hinge'],['Bent-Over Sandbag Row','Horizontal pull'],['Sandbag Floor Press','Secondary press'],['Sandbag Overhead Press','Vertical press'],['Sandbag Bear Hug Carry','Anterior core']],
  trap_bar:[['Trap Bar Deadlift','Hip hinge'],['Trap Bar Romanian Deadlift','Hip hinge'],['Trap Bar Squat','Primary squat'],['Trap Bar Shrug','Scapular pull'],["Trap Bar Farmer's Carry",'Anterior core']],
  ez_bar:[['EZ-Bar Curl','Elbow flexion'],['EZ-Bar Preacher Curl','Elbow flexion'],['EZ-Bar Reverse Curl','Brachialis'],['EZ-Bar Skull Crusher','Triceps press'],['EZ-Bar Overhead Triceps Extension','Triceps press'],['EZ-Bar Upright Row','Lateral delts'],['EZ-Bar Bent-Over Row','Horizontal pull']],
  dip:[['Parallel-Bar Dip','Triceps press'],['Assisted Parallel-Bar Dip','Secondary press'],['Weighted Parallel-Bar Dip','Secondary press'],['Parallel-Bar Leg Raise','Anterior core']],
  lat_machine:[['Machine Lat Pulldown','Vertical pull'],['Wide-Grip Lat Pulldown','Vertical pull'],['Close-Grip Lat Pulldown','Vertical pull'],['Straight-Arm Lat Pulldown','Lat isolation']],
  leg_press:[['Machine Leg Press','Primary squat'],['Machine Leg Press','Squat volume'],['Single-Leg Machine Leg Press','Single-leg volume'],['Leg Press Calf Raise','Calves']],
  leg_machine:[['Seated Machine Leg Curl','Knee flexion'],['Lying Machine Leg Curl','Knee flexion']],
  calf_machine:[['Machine Calf Raise','Calves'],['Seated Machine Calf Raise','Calves']],
  hip_thrust_machine:[['Machine Hip Thrust','Hip extension']],
  assist_machine:[['Assisted Pull-Up','Vertical pull'],['Assisted Parallel-Bar Dip','Secondary press']],
  mini_band:[['Banded Glute Bridge','Hip extension'],['Lateral Band Walk','Hip extension'],['Banded Clamshell','Hip extension']],
  ghd:[['Glute-Ham Raise','Knee flexion'],['Back Extension','Hip hinge'],['GHD Sit-Up','Anterior core']],
  box:[['Box Step-Up','Single-leg work'],['Box Step-Up','Single-leg volume'],['Bulgarian Split Squat','Single-leg work'],['Box Squat','Primary squat']],
  parallettes:[['Parallette Push-Up','Secondary press'],['Parallette Pike Push-Up','Vertical press'],['Parallette L-Sit','Anterior core']],
  dip_belt:[['Weighted Pull-Up','Vertical pull'],['Weighted Parallel-Bar Dip','Triceps press']],
  plates:[['Plate Goblet Squat','Primary squat'],['Plate Overhead Press','Vertical press'],['Plate Russian Twist','Anterior core']],
  slam_ball:[['Medicine Ball Slam','Anterior core'],['Slam Ball Russian Twist','Anterior core']],
  weight_vest:[['Weighted Vest Push-Up','Secondary press'],['Weighted Vest Pull-Up','Vertical pull'],['Weighted Vest Squat','Squat volume'],['Weighted Vest Plank','Anterior core']]
};

// Which movement slots a family can fill, so the picker can answer "what would this add?".
const slotsFor=family=>[...new Set((CURATED[family]||[]).map(([,base])=>base))];
const namesFor=family=>[...new Set((CURATED[family]||[]).map(([name])=>name))];
const familiesForSlot=base=>Object.keys(CURATED).filter(family=>CURATED[family].some(([,slot])=>slot===base));

const api={curated:CURATED,slotsFor,namesFor,familiesForSlot,families:Object.keys(CURATED)};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.IronSixEquipmentLibrary=api;
})(typeof window!=='undefined'?window:globalThis);
