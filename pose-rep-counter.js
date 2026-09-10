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

  // Geometry continuity, NOT biometric identity. Never reacquire after a sustained loss or
  // an ambiguous crossing without the lifter explicitly starting a new lock.
  function createTracker(rule,options){
    const config={confidence:0.7,acquireMs:1000,lossMs:600,...(options||{})};
    let locked=null,pending=null,side=null,lastAt=null,missingAt=null,needsRelock=false;
    let previous=null,smoothed=null,history=[];
    const stats={accepted:0,rejected:0,losses:0};
    const visible=p=>seen(p)&&(p.visibility===undefined||p.visibility>=config.confidence)&&
      (p.presence===undefined||p.presence>=config.confidence)&&p.x>EDGE&&p.x<1-EDGE&&p.y>EDGE&&p.y<1-EDGE;
    const distance=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
    const middle=points=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
    function describe(points,aspect){
      if(!Array.isArray(points))return null;
      const shoulders=[11,12].map(i=>points[i]).filter(visible);
      const hips=[23,24].map(i=>points[i]).filter(visible);
      if(!shoulders.length||!hips.length)return null;
      const shoulder=middle(shoulders),hip=middle(hips),scale=distance(shoulder,hip,aspect);
      if(scale<0.07||scale>0.65)return null;
      return {points,center:middle([shoulder,hip]),scale};
    }
    function matches(a,b,aspect,limit){
      return distance(a.center,b.center,aspect)/b.scale<limit&&a.scale/b.scale>0.65&&a.scale/b.scale<1.55;
    }
    function indices(s){return [...new Set([11+s,23+s,...rule.joint[s]])]}
    function quality(candidate,s){
      const points=indices(s).map(i=>candidate.points[i]);
      return points.every(visible)?Math.min(...points.map(p=>Math.min(p.visibility??1,p.presence??1))):0;
    }
    function reset(){locked=null;pending=null;side=null;lastAt=null;missingAt=null;needsRelock=false;previous=null;smoothed=null;history=[]}
    function reject(message,hard,t){
      stats.rejected++;
      if(locked&&missingAt===null)missingAt=t;
      if(hard||(locked&&t-missingAt>=config.lossMs)){
        if(!needsRelock)stats.losses++;
        needsRelock=true;
      }
      // Drop smoothing history instead of showing an invented/frozen skeleton.
      previous=null;smoothed=null;history=[];
      return {landmarks:null,locked:!!locked,needsRelock,side,message:needsRelock?'Tracking paused. Clear the view, then tap Re-lock user.':message};
    }
    function push(poses,t,aspect=1){
      if(needsRelock)return reject('',false,t);
      const candidates=(poses||[]).map(p=>describe(p,aspect)).filter(Boolean);
      let chosen;
      if(!locked){
        // Acquire only a single clearly framed person in the centre. Never pick index 0
        // when multiple people could be the lifter.
        const centered=candidates.filter(c=>c.center.x>0.25&&c.center.x<0.75&&Math.max(quality(c,0),quality(c,1))>0);
        if(centered.length!==1){pending=null;return reject(centered.length>1?'More than one person in the centre. Clear the view to lock.':'Centre yourself with the working side fully visible.',false,t)}
        chosen=centered[0];
        if(candidates.some(c=>c!==chosen&&distance(c.center,chosen.center,aspect)<chosen.scale)){
          pending=null;return reject('Move away from other people to lock.',false,t);
        }
        if(!pending||!matches(chosen,pending,aspect,0.25)||t-pending.last>250)pending={...chosen,since:t,last:t};
        pending.last=t;
        if(t-pending.since<config.acquireMs)return reject('Hold still in the centre to lock…',false,t);
        side=quality(chosen,0)>=quality(chosen,1)?0:1;
        locked={...chosen,initialScale:chosen.scale};
      }else{
        if(lastAt!==null&&t-lastAt>=config.lossMs)return reject('',true,t);
        const dt=lastAt===null?0.033:Math.max(0,(t-lastAt)/1000);
        const possible=candidates.filter(c=>matches(c,locked,aspect,Math.min(0.85,0.35+dt*2))&&c.scale/locked.initialScale>0.6&&c.scale/locked.initialScale<1.6);
        if(possible.length!==1)return reject('Lost a clear view of you. Counting paused.',possible.length>1,t);
        chosen=possible[0];
        if(candidates.some(c=>c!==chosen&&distance(c.center,chosen.center,aspect)<locked.scale*0.9))return reject('',true,t);
      }
      if(!quality(chosen,side))return reject('Working side is obscured. Counting paused.',false,t);
      const keep=indices(side),points=chosen.points;
      if(previous){
        // Reject teleporting joints before filtering: smoothing an outlier still corrupts
        // the angle and can turn a bad frame into a plausible-looking false rep.
        if(keep.some(i=>distance(points[i],previous[i],aspect)>chosen.scale*0.7))return reject('Unstable landmarks. Hold position.',false,t);
        const chain=rule.joint[side];
        for(let j=1;j<chain.length;j++){
          const a=chain[j-1],b=chain[j],old=distance(previous[a],previous[b],aspect),next=distance(points[a],points[b],aspect);
          if(next<0.015||(old>0.015&&(next/old<0.45||next/old>1.8)))return reject('Unstable limb tracking. Re-aim the camera.',false,t);
        }
      }
      const dt=lastAt===null?1/30:Math.min(0.1,Math.max(0.001,(t-lastAt)/1000));
      history.push(points);if(history.length>3)history.shift();
      const filtered=points.map(p=>({...p,visibility:0,presence:0}));
      for(const i of keep){
        const p=points[i],m={x:median(history.map(h=>h[i].x)),y:median(history.map(h=>h[i].y))};
        const speed=smoothed?distance(m,smoothed[i],aspect)/dt:0;
        // Time-aware low pass: quiet at rest, responsive during deliberate movement.
        const cutoff=1.5+Math.min(10,speed*8),alpha=1-Math.exp(-2*Math.PI*cutoff*dt);
        filtered[i]={...p,x:smoothed?smoothed[i].x+alpha*(m.x-smoothed[i].x):m.x,y:smoothed?smoothed[i].y+alpha*(m.y-smoothed[i].y):m.y};
      }
      previous=points;smoothed=filtered;lastAt=t;missingAt=null;stats.accepted++;
      locked={...chosen,initialScale:locked.initialScale};
      return {landmarks:filtered,locked:true,needsRelock:false,side,message:'User locked · '+(side===0?'left':'right')+' side'};
    }
    return {push,reset,diagnostics:()=>({...stats,locked:!!locked,needsRelock,side})};
  }

  function createCounter(rule,options){
    const config={...rule,...(options||{})};
    const inverted=config.top<config.bottom;
    const atTop=v=>inverted?v<=config.top:v>=config.top;
    const atBottom=v=>inverted?v>=config.bottom:v<=config.bottom;
    let samples=[],reps=[],armed=false,bottomed=false,repStart=0,extreme=null,lost=0,dropped=0,rejected=0,phase='waiting',angleNow=null,message='';

    function reset(){samples=[];reps=[];armed=false;bottomed=false;repStart=0;extreme=null;lost=0;dropped=0;rejected=0;phase='waiting';angleNow=null;message=''}

    // Used when subject/landmark confidence fails. Keep completed reps but never count
    // across an uncertain interval or a deliberate re-lock onto a new person.
    function interrupt(){samples=[];armed=false;bottomed=false;repStart=0;extreme=null;lost=0;phase='lost';angleNow=null;message='Tracking paused. Start again from the top.'}

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

    return {push,reset,interrupt,state,rule:config,inverted};
  }

  const api={POINTS:P,PART,RULES,CAUTIONS,MIN_VISIBILITY,SMOOTHING,LOST_FRAMES,ruleFor,cautionFor,angle,jointAngle,framing,createCounter,createTracker};
  if(typeof window!=='undefined')window.IronSixRepCounter=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
