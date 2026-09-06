/* Exact movement mappings. See EXERCISE_MEDIA.md for provenance and coverage. */
(function(root){
const records=[
  {
    "id": "bench-press",
    "names": [
      "Barbell Bench Press",
      "Paused Barbell Bench Press"
    ],
    "title": "Bench Press",
    "frames": [
      "assets/exercises/bench-press-1.png",
      "assets/exercises/bench-press-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/bench-press-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "bench-press-dumbbell",
    "names": [
      "Dumbbell Bench Press",
      "Dumbbell Flat Press"
    ],
    "title": "Bench Press Dumbbell",
    "frames": [
      "assets/exercises/bench-press-dumbbell-1.png",
      "assets/exercises/bench-press-dumbbell-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/bench-press-dumbbell-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "close-grip-barbell-bench-press",
    "names": [
      "Close-Grip Bench Press"
    ],
    "title": "Close Grip Barbell Bench Press",
    "frames": [
      "assets/exercises/close-grip-barbell-bench-press-1.png",
      "assets/exercises/close-grip-barbell-bench-press-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/close-grip-barbell-bench-press-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "incline-bench-press",
    "names": [
      "Incline Barbell Bench Press"
    ],
    "title": "Incline Bench Press",
    "frames": [
      "assets/exercises/incline-bench-press-1.png",
      "assets/exercises/incline-bench-press-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/incline-bench-press-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "dumbbell-incline-bench-press",
    "names": [
      "Incline Dumbbell Press"
    ],
    "title": "Dumbbell Incline Bench Press",
    "frames": [
      "assets/exercises/dumbbell-incline-bench-press-1.png",
      "assets/exercises/dumbbell-incline-bench-press-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/dumbbell-incline-bench-press-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "dumbbell-flys",
    "names": [
      "Dumbbell Fly"
    ],
    "title": "Dumbbell Flys",
    "frames": [
      "assets/exercises/dumbbell-flys-1.png",
      "assets/exercises/dumbbell-flys-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/dumbbell-flys-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "dumbbell-bent-arm-pullover",
    "names": [
      "Dumbbell Pullover"
    ],
    "title": "Dumbbell Bent Arm Pullover",
    "frames": [
      "assets/exercises/dumbbell-bent-arm-pullover-1.png",
      "assets/exercises/dumbbell-bent-arm-pullover-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/dumbbell-bent-arm-pullover-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "push-ups",
    "names": [
      "Push-Up",
      "Tempo Push-Up"
    ],
    "title": "Push Ups",
    "frames": [
      "assets/exercises/push-ups-1.png",
      "assets/exercises/push-ups-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/push-ups-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "close-triceps-pushup",
    "names": [
      "Diamond Push-Up",
      "Close-Grip Push-Up"
    ],
    "title": "Close Triceps Pushup",
    "frames": [
      "assets/exercises/close-triceps-pushup-1.png",
      "assets/exercises/close-triceps-pushup-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/close-triceps-pushup-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "push-up-feet-elevated",
    "names": [
      "Feet-Elevated Push-Up"
    ],
    "title": "Push Up with Feet Elevated",
    "frames": [
      "assets/exercises/push-up-feet-elevated-1.png",
      "assets/exercises/push-up-feet-elevated-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/push-up-feet-elevated-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "barbell-squat",
    "names": [
      "Barbell Back Squat",
      "High-Bar Back Squat",
      "Paused Barbell Back Squat"
    ],
    "title": "Barbell Squat",
    "frames": [
      "assets/exercises/barbell-squat-1.png",
      "assets/exercises/barbell-squat-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/barbell-squat-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "squat-to-bench-with-barbell",
    "names": [
      "Barbell Box Squat"
    ],
    "title": "Squat to Bench with Barbell",
    "frames": [
      "assets/exercises/squat-to-bench-with-barbell-1.png",
      "assets/exercises/squat-to-bench-with-barbell-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/squat-to-bench-with-barbell-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "romanian-dead-lift",
    "names": [
      "Barbell Romanian Deadlift"
    ],
    "title": "Romanian Dead Lift",
    "frames": [
      "assets/exercises/romanian-dead-lift-1.png",
      "assets/exercises/romanian-dead-lift-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/romanian-dead-lift-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "barbell-good-mornings",
    "names": [
      "Barbell Good Morning"
    ],
    "title": "Barbell Good Mornings",
    "frames": [
      "assets/exercises/barbell-good-mornings-1.png",
      "assets/exercises/barbell-good-mornings-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/barbell-good-mornings-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "standing-barbell-calf-raise",
    "names": [
      "Barbell Standing Calf Raise"
    ],
    "title": "Standing Barbell Calf Raise",
    "frames": [
      "assets/exercises/standing-barbell-calf-raise-1.png",
      "assets/exercises/standing-barbell-calf-raise-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/standing-barbell-calf-raise-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "lateral-dumbbell-raises",
    "names": [
      "Dumbbell Lateral Raise"
    ],
    "title": "Lateral Dumbbell Raises",
    "frames": [
      "assets/exercises/lateral-dumbbell-raises-1.png",
      "assets/exercises/lateral-dumbbell-raises-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/lateral-dumbbell-raises-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "biceps-curls-with-barbell",
    "names": [
      "Barbell Curl"
    ],
    "title": "Biceps Curls with Barbell",
    "frames": [
      "assets/exercises/bicep-curls-with-barbell-1.png",
      "assets/exercises/bicep-curls-with-barbell-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/bicep-curls-with-barbell-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "biceps-curl-with-dumbbell",
    "names": [
      "Dumbbell Curl"
    ],
    "title": "Biceps Curl with Dumbbell",
    "frames": [
      "assets/exercises/biceps-curl-with-dumbbell-1.png",
      "assets/exercises/biceps-curl-with-dumbbell-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/biceps-curl-with-dumbbell-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "biceps-hammer-curl-with-dumbbell",
    "names": [
      "Dumbbell Hammer Curl"
    ],
    "title": "Biceps Hammer Curl with Dumbbell",
    "frames": [
      "assets/exercises/bicep-hammer-curl-with-dumbbell-1.png",
      "assets/exercises/bicep-hammer-curl-with-dumbbell-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/bicep-hammer-curl-with-dumbbell-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "lying-two-arm-triceps-extension-with-dumbbell",
    "names": [
      "Dumbbell Skull Crusher"
    ],
    "title": "Lying Two Arm Triceps Extension with Dumbbell",
    "frames": [
      "assets/exercises/lying-two-arm-triceps-extension-with-dumbbell-1.png",
      "assets/exercises/lying-two-arm-triceps-extension-with-dumbbell-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/lying-two-arm-triceps-extension-with-dumbbell-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "pull-ups",
    "names": [
      "Pull-Up"
    ],
    "title": "Pull Ups",
    "frames": [
      "assets/exercises/pull-ups-1.png",
      "assets/exercises/pull-ups-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/pull-ups-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "chin-ups",
    "names": [
      "Chin-Up"
    ],
    "title": "Chin Ups",
    "frames": [
      "assets/exercises/chin-ups-1.png",
      "assets/exercises/chin-ups-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/chin-ups-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "seated-cable-rows",
    "names": [
      "Seated Cable Row"
    ],
    "title": "Seated Cable Rows",
    "frames": [
      "assets/exercises/seated-cable-rows-1.png",
      "assets/exercises/seated-cable-rows-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/seated-cable-rows-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "standing-biceps-curl-with-cable",
    "names": [
      "Cable Curl"
    ],
    "title": "Standing Biceps Curl with Cable",
    "frames": [
      "assets/exercises/standing-biceps-curl-with-cable-1.png",
      "assets/exercises/standing-biceps-curl-with-cable-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/standing-biceps-curl-with-cable-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "cable-crossover",
    "names": [
      "Cable Chest Fly"
    ],
    "title": "Cable Crossover",
    "frames": [
      "assets/exercises/cable-crossover-1.png",
      "assets/exercises/cable-crossover-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/cable-crossover-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "triceps-pushdown-with-cable",
    "names": [
      "Cable Triceps Pressdown"
    ],
    "title": "Triceps Pushdown with Cable",
    "frames": [
      "assets/exercises/triceps-pushdown-with-cable-1.png",
      "assets/exercises/triceps-pushdown-with-cable-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/triceps-pushdown-with-cable-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "wide-grip-lat-pull-down",
    "names": [
      "Cable Lat Pulldown",
      "Machine Lat Pulldown"
    ],
    "title": "Wide Grip Lat Pull Down",
    "frames": [
      "assets/exercises/wide-grip-lat-pull-down-1.png",
      "assets/exercises/wide-grip-lat-pull-down-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/wide-grip-lat-pull-down-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "machine-bench-press",
    "names": [
      "Machine Chest Press"
    ],
    "title": "Machine Bench Press",
    "frames": [
      "assets/exercises/machine-bench-press-1.png",
      "assets/exercises/machine-bench-press-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/machine-bench-press-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "seated-shoulder-press-machine",
    "names": [
      "Machine Shoulder Press"
    ],
    "title": "Seated Shoulder Press Machine",
    "frames": [
      "assets/exercises/seated-shoulder-press-machine-1.png",
      "assets/exercises/seated-shoulder-press-machine-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/seated-shoulder-press-machine-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "lying-leg-curl-machine",
    "names": [
      "Machine Leg Curl"
    ],
    "title": "Lying Leg Curl Machine",
    "frames": [
      "assets/exercises/lying-leg-curl-machine-1.png",
      "assets/exercises/lying-leg-curl-machine-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/lying-leg-curl-machine-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "smith-machine-squats",
    "names": [
      "Smith Machine Squat"
    ],
    "title": "Smith Machine Squats",
    "frames": [
      "assets/exercises/smith-machine-squats-1.png",
      "assets/exercises/smith-machine-squats-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/smith-machine-squats-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "smith-machine-bench-press",
    "names": [
      "Smith Machine Bench Press"
    ],
    "title": "Smith Machine Bench Press",
    "frames": [
      "assets/exercises/smith-machine-bench-press-1.png",
      "assets/exercises/smith-machine-bench-press-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/smith-machine-bench-press-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "ez-bar-curl-with-barbell",
    "names": [
      "EZ-Bar Curl"
    ],
    "title": "EZ Bar Curl with Barbell",
    "frames": [
      "assets/exercises/ez-bar-curl-with-barbell-1.png",
      "assets/exercises/ez-bar-curl-with-barbell-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/ez-bar-curl-with-barbell-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  {
    "id": "tricep-dips-using-body-weight",
    "names": [
      "Parallel-Bar Dip"
    ],
    "title": "Tricep Dips using Body Weight",
    "frames": [
      "assets/exercises/tricep-dips-using-body-weight-1.png",
      "assets/exercises/tricep-dips-using-body-weight-2.png"
    ],
    "source": "https://github.com/everkinetic/data/blob/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6/src/images-web/tricep-dips-using-body-weight-1.png",
    "author": "Everkinetic / Greg Priday",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"
  }
];
const normalize=name=>String(name||"").normalize("NFKC").toLowerCase().replace(/[–—]/g,"-").replace(/\s+/g," ").trim();
const byName=new Map(records.flatMap(row=>row.names.map(name=>[normalize(name),row])));
const resolve=name=>byName.get(normalize(name))||null;
const api={records,resolve,has:name=>!!resolve(name)};
if(typeof module!=="undefined"&&module.exports)module.exports=api;
else root.IronSixExerciseMedia=api;
})(typeof window!=="undefined"?window:globalThis);

