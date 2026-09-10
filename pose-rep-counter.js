/* Rep counting from pose landmarks. Pure logic: no DOM, no camera, no network.
   Kept separate from pose-spike.js so the part that decides "that was a rep" can be tested
   against synthetic or recorded landmark sequences without a browser or a webcam.

   Landmark input is the MediaPipe Pose 33-point layout. Coordinates are normalized to the
   frame (x by width, y by height), so x is scaled by the aspect ratio before any angle is
   measured — skipping that quietly skews every angle on a non-square frame. */
(() => {
  const P={LSHOULDER:11,RSHOULDER:12,LELBOW:13,RELBOW:14,LWRIST:15,RWRIST:16,LHIP:23,RHIP:24,LKNEE:25,RKNEE:26,LANKLE:27,RANKLE:28};
  const PART={11:'shoulders',12:'shoulders',13:'elbows',14:'elbows',15:'wrists',16:'wrists',23:'hips',24:'hips',25:'knees',26:'knees',27:'ankles',28:'ankles'};

  // Each rule measures one joint angle over time. `top` is the angle held between reps;
  // `bottom` is the far end of the movement. top>bottom for movements that flex away from a
  // straight limb (squat, curl, push-up); top<bottom inverts the comparison for movements
  // that finish straight (overhead press). The gap between them is the hysteresis band —
  // narrow it and landmark jitter starts counting reps on its own.
  const RULES=[
    {id:'squat',label:'Squat',test:x=>/squat/i.test(x.name||'')||x.base==='squat',
     joint:[[P.LHIP,P.LKNEE,P.LANKLE],[P.RHIP,P.RKNEE,P.RANKLE]],
     framing:[P.LHIP,P.RHIP,P.LKNEE,P.RKNEE,P.LANKLE,P.RANKLE,P.LSHOULDER,P.RSHOULDER],
     top:160,bottom:100,minRepMs:900,maxRepMs:15000,
     setup:'Stand side-on to the phone, about 8 feet back, with hips and ankles both in frame.'},
    {id:'curl',label:'Biceps curl',test:x=>/curl/i.test(x.name||'')&&!/leg|hamstring|nordic/i.test(x.name||''),
     joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],
     framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],
     top:150,bottom:70,minRepMs:800,maxRepMs:12000,
     setup:'Face the phone from about 6 feet back with both arms in frame.'},
    {id:'pushup',label:'Push-up',test:x=>/push[- ]?up/i.test(x.name||''),
     joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],
     framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],
     top:155,bottom:100,minRepMs:800,maxRepMs:12000,
     setup:'Lay the phone on the floor side-on, far enough back to keep your whole body in frame.'},
    {id:'press',label:'Overhead press',test:x=>/overhead press|shoulder press|military press/i.test(x.name||''),
     joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],
     framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],
     top:75,bottom:160,minRepMs:900,maxRepMs:12000,
     setup:'Face the phone from about 8 feet back so your hands stay in frame overhead.'}
  ];

  const MIN_VISIBILITY=0.6, SMOOTHING=5, LOST_FRAMES=20, EDGE=0.02;

  // Some variants match a rule but are known to track badly, and saying so up front is more
  // use than a confident wrong count. These are warnings, not exclusions — the spike exists
  // partly to find out how bad "badly" actually is.
  const CAUTIONS=[
    {when:/back squat|front squat|barbell squat/i,note:'A loaded bar and the rack hide your hips from a single camera. Expect this to track worse than a goblet or bodyweight squat.'},
    {when:/bulgarian|split squat|lunge|single[- ]leg|pistol/i,note:'One leg is behind the other from most angles, so film this one square to your working side.'}
  ];
  function cautionFor(exercise){const name=String(exercise&&exercise.name||'');const hit=CAUTIONS.find(c=>c.when.test(name));return hit?hit.note:null}

  function ruleFor(exercise){const x=exercise||{};return RULES.find(r=>{try{return r.test(x)}catch(_){return false}})||null}

  function angle(a,b,c,aspect){
    if(!a||!b||!c)return null;
    const scale=Number(aspect)||1;
    const ax=(a.x-b.x)*scale,ay=a.y-b.y,cx=(c.x-b.x)*scale,cy=c.y-b.y;
    const magnitude=Math.hypot(ax,ay)*Math.hypot(cx,cy);
    if(!magnitude)return null;
    return Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/magnitude)))*180/Math.PI;
  }

  function seen(point){return !!point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&(point.visibility===undefined||point.visibility>=MIN_VISIBILITY)}

  // The angle a rep is judged on. Both sides are measured when both are visible and averaged;
  // one clearly visible side is enough. Nothing visible returns null, which is deliberately
  // different from returning a plausible resting angle.
  function jointAngle(rule,landmarks,aspect){
    if(!landmarks)return null;
    const values=rule.joint.map(([a,b,c])=>seen(landmarks[a])&&seen(landmarks[b])&&seen(landmarks[c])?angle(landmarks[a],landmarks[b],landmarks[c],aspect):null).filter(v=>v!==null);
    if(!values.length)return null;
    return values.reduce((sum,v)=>sum+v,0)/values.length;
  }

  // Framing is checked before counting, because a half-visible lifter produces angles that
  // look entirely plausible and are wrong. Names the missing body part rather than "no pose".
  function framing(rule,landmarks){
    if(!landmarks||!landmarks.length)return {ok:false,missing:[],message:'No one in frame yet.'};
    const missing=[];
    for(const index of rule.framing){
      const point=landmarks[index];
      const inFrame=!!point&&point.x>EDGE&&point.x<1-EDGE&&point.y>EDGE&&point.y<1-EDGE;
      if(!seen(point)||!inFrame){const part=PART[index];if(part&&!missing.includes(part))missing.push(part)}
    }
    if(!missing.length)return {ok:true,missing:[],message:'Framing looks good.'};
    return {ok:false,missing,message:'Move back or re-aim the phone: cannot see your '+missing.slice(0,2).join(' or ')+'.'};
  }

  function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[(sorted.length-1)>>1]}

  function createCounter(rule,options){
    const config={...rule,...(options||{})};
    const inverted=config.top<config.bottom;
    const atTop=v=>inverted?v<=config.top:v>=config.top;
    const atBottom=v=>inverted?v>=config.bottom:v<=config.bottom;
    let samples=[],reps=[],armed=false,bottomed=false,repStart=0,extreme=null,lost=0,dropped=0,rejected=0,phase='waiting',angleNow=null,message='';

    function reset(){samples=[];reps=[];armed=false;bottomed=false;repStart=0;extreme=null;lost=0;dropped=0;rejected=0;phase='waiting';angleNow=null;message=''}

    function state(){return {rule:config.id,reps:reps.length,phase,angle:angleNow,tracking:phase!=='lost',dropped,rejected,message,log:reps.slice()}}

    function push(frame){
      const landmarks=frame&&frame.landmarks,t=Number(frame&&frame.t)||0,aspect=Number(frame&&frame.aspect)||1;
      const raw=jointAngle(config,landmarks,aspect);
      if(raw===null){
        dropped++;lost++;
        // A brief occlusion mid-rep is normal. A sustained one means the machine no longer
        // knows where in the movement the lifter is, so it re-arms from the top instead of
        // guessing across the gap.
        if(lost>=LOST_FRAMES){armed=false;bottomed=false;samples=[];phase='lost';message='Lost you. Step back into frame.'}
        return state();
      }
      lost=0;samples.push(raw);if(samples.length>SMOOTHING)samples.shift();
      const value=median(samples);angleNow=Math.round(value);

      if(!armed){
        if(atTop(value)){armed=true;repStart=t;extreme=value;phase='top';message=''}
        else{phase='waiting';message='Start from the top of the movement.'}
        return state();
      }
      extreme=extreme===null?value:(inverted?Math.max(extreme,value):Math.min(extreme,value));

      if(!bottomed){
        if(atBottom(value)){bottomed=true;phase='bottom'}
        else{phase=atTop(value)?'top':'descending';if(atTop(value)){repStart=t;extreme=value}}
        return state();
      }
      if(atTop(value)){
        const ms=t-repStart;
        // Too fast is jitter or a bounce, not a rep. Too slow means the lifter racked it,
        // walked away and came back. Both are recorded as rejections rather than dropped
        // silently, so the spike can report how often it had to make that call.
        if(ms>=config.minRepMs&&ms<=config.maxRepMs){reps.push({index:reps.length+1,ms,extreme:Math.round(extreme)});message=''}
        else{rejected++;message=ms<config.minRepMs?'Skipped a bounce.':'Skipped a long pause.'}
        bottomed=false;repStart=t;extreme=value;phase='top';
        return state();
      }
      phase=atBottom(value)?'bottom':'ascending';
      return state();
    }

    return {push,reset,state,rule:config,inverted};
  }

  const api={POINTS:P,PART,RULES,CAUTIONS,MIN_VISIBILITY,SMOOTHING,LOST_FRAMES,ruleFor,cautionFor,angle,jointAngle,framing,createCounter};
  if(typeof window!=='undefined')window.IronSixRepCounter=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
