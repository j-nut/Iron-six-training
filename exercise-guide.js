(() => {
  if (window.IronSixExerciseGuide) return;

  const patterns = {
    squat: {
      muscles:'quads, glutes, adductors and trunk',
      setup:['Set your feet in a stance that lets your knees track comfortably over your toes.','Brace your abdomen before you descend and keep the load balanced over the mid-foot.'],
      steps:['Sit down and slightly back while letting the knees bend naturally.','Descend only as far as you can control without losing your brace or foot pressure.','Drive the floor away and stand tall without violently locking the knees.'],
      cues:['Tripod foot: big toe, little toe, heel.','Knees follow the toes.','Brace before every rep.'],
      mistakes:['Heels or arches collapsing','Knees abruptly caving inward','Relaxing the trunk at the bottom']
    },
    split_squat:{
      muscles:'quads, glutes and adductors with single-leg stability',
      setup:['Use a stance long enough that both feet stay planted and balanced.','Keep most of your pressure through the working/front leg.'],
      steps:['Lower under control by bending both knees.','Keep the front knee tracking with the toes and the pelvis square.','Push through the front foot to return to the start.'],
      cues:['Elevator, not tightrope.','Front foot stays heavy.','Control the bottom.'],
      mistakes:['Stance too narrow to balance','Pushing mostly from the rear leg','Rushing the descent']
    },
    hinge:{
      muscles:'hamstrings, glutes and spinal erectors',
      setup:['Stand tall with a soft bend in the knees and brace the trunk.','Keep the weight close to your body.'],
      steps:['Push the hips backward instead of squatting straight down.','Lower until you feel a strong hamstring stretch while the spine stays controlled.','Drive the hips forward to stand tall.'],
      cues:['Close the car door with your hips.','Keep the load close.','Stop before the low back rounds.'],
      mistakes:['Turning it into a squat','Letting the weight drift away','Chasing depth after the pelvis/spine loses position']
    },
    hip_thrust:{
      muscles:'glutes with assistance from hamstrings',
      setup:['Position the upper back securely on the bench or floor and place the feet where the shins are roughly vertical near lockout.'],
      steps:['Brace, tuck the ribs slightly, and drive through the feet.','Extend the hips until the torso and thighs form a straight line.','Pause briefly, then lower under control.'],
      cues:['Finish with glutes, not low back.','Ribs down.','Pause at the top.'],
      mistakes:['Hyperextending the low back','Feet too far away or too close','Bouncing out of the bottom']
    },
    ham_curl:{
      muscles:'hamstrings',
      setup:['Anchor the band securely or set the body so the knees can flex freely.'],
      steps:['Curl the heel toward the glute without letting the hips twist.','Squeeze the hamstrings near the shortened position.','Return slowly to a long hamstring position.'],
      cues:['Move at the knee.','Slow return.','Keep hips quiet.'],
      mistakes:['Using momentum','Shortening the range','Arching or twisting to finish the rep']
    },
    calves:{
      muscles:'gastrocnemius and soleus',
      setup:['Use a stable support if needed and keep pressure through the ball of the foot.'],
      steps:['Lower the heel under control into a comfortable stretch.','Rise as high as you can through the ankle.','Pause briefly at the top before lowering.'],
      cues:['Full stretch, full rise.','Do not bounce.'],
      mistakes:['Tiny partial reps','Rolling the ankle outward','Using knee bounce for momentum']
    },
    bench:{
      muscles:'chest, triceps and front delts',
      setup:['Set the upper back firmly on the bench, feet planted, and shoulder blades controlled against the bench.','Use a grip that keeps the forearms near vertical at the bottom.'],
      steps:['Unrack with control and bring the weight over the shoulder line.','Lower toward the mid/lower chest while the elbows stay in a comfortable angle from the torso.','Press up and slightly back while keeping the upper back stable.'],
      cues:['Feet planted.','Upper back stays tight.','Control the touch; do not bounce.'],
      mistakes:['Losing shoulder-blade position','Wrists folded far backward','Bouncing the weight off the chest']
    },
    chest_press:{
      muscles:'chest, triceps and front delts',
      setup:['Set your torso and shoulder blades firmly before pressing.'],
      steps:['Lower the resistance under control until the chest is comfortably stretched.','Press until the arms are extended without losing shoulder position.'],
      cues:['Control down; drive up.','Keep shoulders away from ears.'],
      mistakes:['Shrugging','Cutting the range excessively','Using momentum instead of tension']
    },
    fly:{
      muscles:'chest',
      setup:['Start with a slight, fixed bend in the elbows and shoulders set down and back.'],
      steps:['Open the arms until you feel a comfortable chest stretch.','Bring the arms back together in a wide hugging motion.'],
      cues:['Hug a barrel.','Elbow angle stays mostly fixed.'],
      mistakes:['Turning it into a press','Dropping too deep for the shoulder','Jerking through the stretched position']
    },
    overhead_press:{
      muscles:'deltoids and triceps with trunk stabilization',
      setup:['Brace the trunk and glutes before the rep; keep the forearm stacked under the load.'],
      steps:['Press upward while keeping the ribs controlled.','Finish with the arm overhead in a comfortable shoulder position.','Lower under control to the start.'],
      cues:['Ribs down.','Reach tall, do not shrug aggressively.','No low-back lean to finish.'],
      mistakes:['Overarching the low back','Pressing around an unstable wrist','Turning every rep into a push press']
    },
    lateral_raise:{
      muscles:'lateral deltoids',
      setup:['Use a light load and keep a soft bend in the elbows.'],
      steps:['Raise the arms out and slightly forward until roughly shoulder height or your comfortable range.','Lower slowly while keeping tension on the delts.'],
      cues:['Lead with the elbows.','Use less weight than you think.'],
      mistakes:['Shrugging hard','Swinging the torso','Turning thumbs sharply downward']
    },
    rear_delt:{
      muscles:'rear delts, mid-back and external rotators',
      setup:['Set the rib cage and use a load you can move without shrugging.'],
      steps:['Move the arms outward/back while the shoulder blades stay controlled.','Pause briefly, then return slowly.'],
      cues:['Wide arms.','Neck relaxed.','Control the return.'],
      mistakes:['Using traps to shrug the load','Jerking with the torso','Going too heavy to feel the target muscles']
    },
    row:{
      muscles:'lats, rhomboids, traps, rear delts and biceps',
      setup:['Brace the trunk and set the shoulder in a strong, comfortable position.','Keep the resistance path close to the body.'],
      steps:['Pull the elbow toward the hip/rib cage rather than simply curling the hand.','Pause briefly when the back is shortened.','Reach forward under control without losing torso position.'],
      cues:['Drive the elbow.','Do not yank from the low back.','Long reach, strong pull.'],
      mistakes:['Excessive torso heaving','Shrugging every rep','Cutting the controlled stretch short']
    },
    pullup:{
      muscles:'lats, upper back and biceps',
      setup:['Start from a secure grip with the ribs controlled and shoulders active.'],
      steps:['Pull the elbows down toward the ribs.','Rise until the chest approaches the bar or you reach your clean range.','Lower to a controlled long-arm position.'],
      cues:['Elbows to pockets.','No kicking unless the exercise intentionally calls for it.'],
      mistakes:['Kipping unintentionally','Craning the neck over the bar','Dropping rapidly from the top']
    },
    lat_iso:{
      muscles:'lats and shoulder extensors',
      setup:['Brace the torso and begin with the arms long but shoulders controlled.'],
      steps:['Sweep or pull the arms toward the hips while keeping the elbows mostly fixed.','Squeeze the lats, then return slowly.'],
      cues:['Armpits to pockets.','Do not turn it into a triceps movement.'],
      mistakes:['Bending the elbows too much','Arching the low back','Rushing the stretch']
    },
    curl:{
      muscles:'biceps and elbow flexors',
      setup:['Keep the upper arm stable and choose a load that does not require body swing.'],
      steps:['Curl by bending the elbow.','Squeeze near the top without throwing the elbow far forward.','Lower until the elbow is nearly straight under control.'],
      cues:['Quiet shoulders.','Slow lower.'],
      mistakes:['Swinging the torso','Only doing the top half','Letting wrists collapse']
    },
    hammer_curl:{
      muscles:'brachialis, brachioradialis and biceps',
      setup:['Use a neutral/hammer grip and keep the upper arm close to the torso.'],
      steps:['Curl without rotating the wrist.','Pause briefly and lower under control.'],
      cues:['Thumbs stay up.','No body swing.'],
      mistakes:['Shoulder swinging','Wrist bending','Rushing the eccentric']
    },
    triceps:{
      muscles:'triceps',
      setup:['Keep the upper arm stable and the shoulder in a comfortable position.'],
      steps:['Extend the elbow until the arm is straight without forcing the joint.','Return under control into a comfortable stretch.'],
      cues:['Move at the elbow.','Control the last few inches.'],
      mistakes:['Using torso momentum','Elbows drifting wildly','Forcing painful shoulder positions']
    },
    core:{
      muscles:'abdominals and trunk stabilizers',
      setup:['Brace as if preparing to be lightly punched and keep breathing behind the brace.'],
      steps:['Move only through the range where the rib cage and pelvis stay controlled.','Return before the low back takes over.'],
      cues:['Ribs toward pelvis.','Quality beats range.','Keep breathing.'],
      mistakes:['Letting the low back sag','Holding breath for the entire set','Chasing range you cannot control']
    },
    arms:{
      muscles:'biceps and triceps',
      setup:['Treat the two movements as a controlled superset, not a race.'],
      steps:['Complete the first movement with clean reps.','Transition to the second movement and keep the same controlled tempo.'],
      cues:['Earn the burn with clean reps.','Keep 0–2 reps in reserve unless instructed otherwise.'],
      mistakes:['Racing between sloppy reps','Using momentum to finish both movements']
    }
  };

  function classify(exercise={}) {
    const n=String(exercise.name||'').toLowerCase();
    const b=String(exercise.seedKey||exercise.base||'').toLowerCase();
    if(/bulgarian|lunge|split squat/.test(n)||/split_squat|single-leg/.test(b))return 'split_squat';
    if(/romanian|good morning|hip hinge/.test(n)||/hinge/.test(b))return 'hinge';
    if(/hip thrust|glute bridge/.test(n)||/hip_thrust/.test(b))return 'hip_thrust';
    if(/hamstring curl|hamstring walkout/.test(n)||/ham_curl/.test(b))return 'ham_curl';
    if(/calf/.test(n)||/calves/.test(b))return 'calves';
    if(/squat/.test(n)||/squat/.test(b))return 'squat';
    if(/bench press|dumbbell bench|incline.*press|flat press|push-up/.test(n)||b==='bench')return 'bench';
    if(/chest fly|dumbbell fly|wide push-up/.test(n)||/fly/.test(b))return 'fly';
    if(/landmine press|shoulder press|overhead press|pike push-up/.test(n)||/overhead_press|vertical press/.test(b))return 'overhead_press';
    if(/lateral raise/.test(n)||/lateral_raise/.test(b))return 'lateral_raise';
    if(/face pull|rear-delt|y-t raise/.test(n)||/rear_delt|scapular pull/.test(b))return 'rear_delt';
    if(/row/.test(n)||b==='row'||/horizontal pull/.test(b))return 'row';
    if(/pull-up|chin-up|lat pulldown|prone lat pull/.test(n)||/pullup|vertical pull/.test(b))return 'pullup';
    if(/straight-arm pulldown|pullover|lat press/.test(n)||/lat_iso/.test(b))return 'lat_iso';
    if(/curl \+|arms finisher|supersets/.test(n)||b==='arms')return 'arms';
    if(/hammer curl/.test(n)||/hammer_curl/.test(b))return 'hammer_curl';
    if(/curl/.test(n)||b==='curl'||/elbow flexion/.test(b))return 'curl';
    if(/pressdown|skull crusher|close-grip|diamond push-up/.test(n)||/triceps/.test(b))return 'triceps';
    if(/ab wheel|pallof|plank|rotation/.test(n)||/core/.test(b))return 'core';
    return 'core';
  }

  function variantNotes(name='') {
    const n=name.toLowerCase(), notes=[];
    if(n.includes('paused'))notes.push('Pause without relaxing; keep tension in the paused position.');
    if(n.includes('tempo'))notes.push('Honor the prescribed tempo instead of speeding through the hard portion.');
    if(n.includes('incline'))notes.push('Use a moderate incline; an excessively steep bench shifts more work toward the shoulders.');
    if(n.includes('landmine'))notes.push('Make sure the bar is securely anchored and keep your body clear of the bar path.');
    if(n.includes('meadows'))notes.push('Use the end of the landmine bar and a staggered stance; pull the elbow back toward the hip.');
    if(n.includes('box squat'))notes.push('Touch the box under control; do not crash onto it or fully relax before standing.');
    if(n.includes('bulgarian'))notes.push('Rear-foot height should help balance, not force the hip into an uncomfortable position.');
    if(n.includes('ab wheel'))notes.push('Only roll as far as you can while keeping the ribs and pelvis controlled.');
    return notes;
  }

  function guideFor(exercise={}) {
    const key=classify(exercise), base=patterns[key]||patterns.core, name=exercise.name||'this exercise';
    return {
      name,
      muscles:base.muscles,
      setup:[...base.setup],
      steps:[...base.steps],
      cues:[...base.cues,...variantNotes(name)],
      mistakes:[...base.mistakes],
      videoUrl:`https://www.youtube.com/results?search_query=${encodeURIComponent(name+' exercise form tutorial')}`,
      imageUrl:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name+' exercise form steps')}`
    };
  }

  function format(exercise={}) {
    const g=guideFor(exercise);
    return `${g.name}\n\nTargets: ${g.muscles}.\n\nSETUP\n• ${g.setup.join('\n• ')}\n\nHOW TO DO IT\n${g.steps.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nBEST CUES\n• ${g.cues.join('\n• ')}\n\nAVOID\n• ${g.mistakes.join('\n• ')}`;
  }

  function findInContext(message,context={}) {
    const lower=String(message||'').toLowerCase(), list=Array.isArray(context.workout)?context.workout:[];
    let found=list.find(e=>lower.includes(String(e.name||'').toLowerCase()));
    if(!found && context.selectedExercise)found=context.selectedExercise;
    return found||null;
  }

  function teachingResponse(exercise) {
    const g=guideFor(exercise);
    return {
      reply:format(exercise),
      actions:[],
      videos:[{title:`Find a clear ${g.name} video demonstration`,url:g.videoUrl,source:'YouTube'}],
      followUps:[`What weight should I use for ${g.name}?`,`Can you swap ${g.name} for something easier on my joints?`],
      model:'Iron Six exercise guide'
    };
  }

  function openCoach(index) {
    const workout=typeof finalWorkout==='function'&&typeof activeUser==='function'?finalWorkout(activeUser()):[];
    const exercise=workout[Number(index)];
    if(!exercise)return;
    window.__ironSixSelectedExercise={...exercise,index:Number(index)};
    const prompt=`Teach me how to do ${exercise.name}. Explain setup, execution, form cues, common mistakes, and give me a video demonstration.`;
    if(typeof showView==='function')showView('coach');
    const submit=()=>{
      const input=document.getElementById('coachInput'),form=document.getElementById('coachForm');
      if(!input||!form)return false;
      input.value=prompt;
      form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      return true;
    };
    if(!submit()){
      let tries=0;const timer=setInterval(()=>{tries++;if(submit()||tries>30)clearInterval(timer)},100);
    }
  }

  window.IronSixExerciseGuide={patterns,classify,guideFor,format,findInContext,teachingResponse};
  window.openExerciseCoach=openCoach;
})();
