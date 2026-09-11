/* Rep counting from MediaPipe Pose landmarks. Pure logic: no DOM, camera, network or storage.
   v5 keeps identity confidence separate from rep confidence: a locked person may remain isolated
   while the rep counter waits for a trustworthy working-side joint angle. */
(() => {
  const P={LSHOULDER:11,RSHOULDER:12,LELBOW:13,RELBOW:14,LWRIST:15,RWRIST:16,LHIP:23,RHIP:24,LKNEE:25,RKNEE:26,LANKLE:27,RANKLE:28};
  const PART={11:'shoulders',12:'shoulders',13:'elbows',14:'elbows',15:'wrists',16:'wrists',23:'hips',24:'hips',25:'knees',26:'knees',27:'ankles',28:'ankles'};
  const RULES=[
    {id:'squat',label:'Squat',test:x=>/squat/i.test(x.name||'')||x.base==='squat',joint:[[P.LHIP,P.LKNEE,P.LANKLE],[P.RHIP,P.RKNEE,P.RANKLE]],framing:[P.LHIP,P.RHIP,P.LKNEE,P.RKNEE,P.LANKLE,P.RANKLE,P.LSHOULDER,P.RSHOULDER],top:160,bottom:100,minActiveMs:500,maxActiveMs:15000,setup:'Place the phone around hip height, roughly level and side-on, about 8 feet back with your full body in frame.',
     // Not every room has the depth to get ankles in shot. This measures the same movement from
     // shoulder-hip-knee, which needs only the upper two thirds of the body. It is genuinely
     // weaker — it cannot see the shin, so it cannot judge depth as precisely — so it is used only
     // when the ankles really are unavailable, and the UI says so while it is in use.
     fallback:{
       // Thigh angle from vertical, measured at the hip. A three-point shoulder-hip-knee angle was
       // tried first and is unusable: it moves with torso lean as much as with depth, so at a 45
       // degree lean a standing lifter already reads below the top threshold and no rep ever
       // starts. This uses only hip and knee, so lean cannot contaminate it. The scale inverts:
       // standing is near zero degrees, a parallel squat around ninety.
       joint:[[P.LHIP,P.LKNEE],[P.RHIP,P.RKNEE]],
       framing:[P.LSHOULDER,P.RSHOULDER,P.LHIP,P.RHIP,P.LKNEE,P.RKNEE],
       top:30,bottom:75,
       note:'Ankles are out of frame, so reps are counted from your hips and knees. Depth is approximate and form watch is off.'
     }},
    {id:'curl',label:'Biceps curl',test:x=>/curl/i.test(x.name||'')&&!/leg|hamstring|nordic/i.test(x.name||''),joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],top:150,bottom:70,minActiveMs:400,maxActiveMs:12000,setup:'Face the phone from about 6 feet back with both arms in frame.'},
    {id:'pushup',label:'Push-up',test:x=>/push[- ]?up/i.test(x.name||''),joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],top:155,bottom:100,minActiveMs:400,maxActiveMs:12000,setup:'Lay the phone on the floor side-on, far enough back to keep your whole body in frame.'},
    {id:'press',label:'Overhead press',test:x=>/overhead press|shoulder press|military press/i.test(x.name||''),joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],top:75,bottom:160,minActiveMs:450,maxActiveMs:12000,setup:'Face the phone from about 8 feet back so your hands stay in frame overhead.'}
  ];
  // 0.60 was too strict for true side profiles: the near-side knee/ankle regularly dipped below it
  // even while MediaPipe and the identity tracker still had a coherent person. Rep geometry remains
  // stricter than identity maintenance, but now matches the form-analysis confidence floor.
  // LOST_FRAMES/LOCKED_LOST_FRAMES catch a clean dropout. Real occlusion is not clean — it
  // flickers, so a consecutive-null counter alone never fires and the machine bridges a gap it
  // was blind through. QUALITY_WINDOW/MIN_QUALITY judge the recent past as a whole instead.
  // The window is deliberately longer than the longest permitted contiguous dropout
  // (LOCKED_LOST_FRAMES), so a gap the identity lock is entitled to ride out cannot trip it,
  // while a sustained flickering blindness — which no single-gap counter ever notices — does.
  const MIN_VISIBILITY=0.42,SMOOTHING=5,LOST_FRAMES=20,LOCKED_LOST_FRAMES=42,QUALITY_WINDOW=120,MIN_QUALITY=0.5,EDGE=0.02;
  const CAUTIONS=[
    {when:/back squat|front squat|barbell squat/i,note:'A loaded bar and the rack can hide your hips from a single camera. A level side view around hip height usually tracks best.'},
    {when:/bulgarian|split squat|lunge|single[- ]leg|pistol/i,note:'One leg is behind the other from most angles, so film this one square to your working side.'}
  ];
  function cautionFor(exercise){const name=String(exercise&&exercise.name||'');const hit=CAUTIONS.find(c=>c.when.test(name));return hit?hit.note:null}
  // A reduced-information variant of a rule, for a camera that cannot see the whole body.
  function degradedRule(rule){
    if(!rule||!rule.fallback)return null;
    return {...rule,...rule.fallback,id:rule.id,label:rule.label,fallback:null,degraded:true};
  }

  function ruleFor(exercise){const x=exercise||{};return RULES.find(r=>{try{return r.test(x)}catch(_){return false}})||null}
  function angle(a,b,c,aspect){if(!a||!b||!c)return null;const scale=Number(aspect)||1,ax=(a.x-b.x)*scale,ay=a.y-b.y,cx=(c.x-b.x)*scale,cy=c.y-b.y,mag=Math.hypot(ax,ay)*Math.hypot(cx,cy);if(!mag)return null;return Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/mag)))*180/Math.PI}
  function seen(point,threshold=MIN_VISIBILITY){if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;const v=point.visibility===undefined?1:Number(point.visibility),p=point.presence===undefined?1:Number(point.presence);return (Number.isFinite(v)?v:0)>=threshold&&(Number.isFinite(p)?p:0)>=threshold}
  function jointAngle(rule,landmarks,aspect,side=null,minVisibility=MIN_VISIBILITY){
    if(!landmarks)return null;const chains=side===0||side===1?[rule.joint[side]]:rule.joint,values=chains.map(chain=>{
      if(!chain.every(i=>seen(landmarks[i],minVisibility)))return null;
      // A two-point chain measures that limb's angle from vertical, at its first point, against a
      // virtual point directly below it. Nothing above that point is involved, so torso lean
      // cannot contaminate it the way it contaminates a three-point hip angle.
      if(chain.length===2){const pivot=landmarks[chain[0]];return angle(landmarks[chain[1]],pivot,{x:pivot.x,y:pivot.y+0.2},aspect)}
      return angle(landmarks[chain[0]],landmarks[chain[1]],landmarks[chain[2]],aspect);
    }).filter(v=>v!==null);if(!values.length)return null;return values.reduce((n,v)=>n+v,0)/values.length;
  }
  function framing(rule,landmarks,side=null,minVisibility=MIN_VISIBILITY){
    if(!landmarks||!landmarks.length)return {ok:false,missing:[],message:'No one in frame yet.'};
    let required=rule.framing;if(side===0||side===1){required=[...new Set(rule.joint[side])];if(rule.id==='squat')required.push(side?P.RSHOULDER:P.LSHOULDER)}
    const missing=[];for(const index of required){const point=landmarks[index],inFrame=!!point&&point.x>EDGE&&point.x<1-EDGE&&point.y>EDGE&&point.y<1-EDGE;if(!seen(point,minVisibility)||!inFrame){const part=PART[index];if(part&&!missing.includes(part))missing.push(part)}}
    return missing.length?{ok:false,missing,message:'Move back or re-aim the phone: cannot see your '+missing.slice(0,2).join(' or ')+'.'}:{ok:true,missing:[],message:'Framing looks good.'};
  }
  function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[(sorted.length-1)>>1]}

  // Legacy pure-logic tracker retained for tests/non-browser use. In the camera UI v4/v5 replaces
  // this through pose-form-coach.js with the motion-aware working-side tracker.
  function createTracker(rule,options){
    const config={confidence:0.7,acquireMs:1000,lossMs:600,...(options||{})};let locked=null,pending=null,side=null,lastAt=null,missingAt=null,needsRelock=false,previous=null,smoothed=null,history=[];const stats={accepted:0,rejected:0,losses:0};
    const visible=p=>seen(p,config.confidence)&&p.x>EDGE&&p.x<1-EDGE&&p.y>EDGE&&p.y<1-EDGE,distance=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y),middle=points=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
    function describe(points,aspect){if(!Array.isArray(points))return null;const shoulders=[11,12].map(i=>points[i]).filter(visible),hips=[23,24].map(i=>points[i]).filter(visible);if(!shoulders.length||!hips.length)return null;const shoulder=middle(shoulders),hip=middle(hips),scale=distance(shoulder,hip,aspect);return scale<0.07||scale>0.65?null:{points,center:middle([shoulder,hip]),scale}}
    const matches=(a,b,aspect,limit)=>distance(a.center,b.center,aspect)/b.scale<limit&&a.scale/b.scale>0.65&&a.scale/b.scale<1.55,indices=s=>[...new Set([11+s,23+s,...rule.joint[s]])],quality=(candidate,s)=>{const points=indices(s).map(i=>candidate.points[i]);return points.every(visible)?Math.min(...points.map(p=>Math.min(p.visibility??1,p.presence??1))):0};
    function reset(){locked=null;pending=null;side=null;lastAt=null;missingAt=null;needsRelock=false;previous=null;smoothed=null;history=[]}
    function reject(message,hard,t){stats.rejected++;if(locked&&missingAt===null)missingAt=t;if(hard||(locked&&t-missingAt>=config.lossMs)){if(!needsRelock)stats.losses++;needsRelock=true}previous=null;smoothed=null;history=[];return {landmarks:null,locked:!!locked,needsRelock,side,message:needsRelock?'Tracking paused. Clear the view, then tap Re-lock user.':message}}
    function push(poses,t,aspect=1){if(needsRelock)return reject('',false,t);const candidates=(poses||[]).map(p=>describe(p,aspect)).filter(Boolean);let chosen;
      if(!locked){const centered=candidates.filter(c=>c.center.x>0.25&&c.center.x<0.75&&Math.max(quality(c,0),quality(c,1))>0);if(centered.length!==1){pending=null;return reject(centered.length>1?'More than one person in the centre. Clear the view to lock.':'Centre yourself with the working side fully visible.',false,t)}chosen=centered[0];if(!pending||!matches(chosen,pending,aspect,0.25)||t-pending.last>250)pending={...chosen,since:t,last:t};pending.last=t;if(t-pending.since<config.acquireMs)return reject('Hold still in the centre to lock…',false,t);side=quality(chosen,0)>=quality(chosen,1)?0:1;locked={...chosen,initialScale:chosen.scale};
      }else{if(lastAt!==null&&t-lastAt>=config.lossMs)return reject('',true,t);const dt=lastAt===null?0.033:Math.max(0,(t-lastAt)/1000),possible=candidates.filter(c=>matches(c,locked,aspect,Math.min(0.85,0.35+dt*2))&&c.scale/locked.initialScale>0.6&&c.scale/locked.initialScale<1.6);if(possible.length!==1)return reject('Lost a clear view of you. Counting paused.',possible.length>1,t);chosen=possible[0]}
      if(!quality(chosen,side))return reject('Working side is obscured. Counting paused.',false,t);const keep=indices(side),points=chosen.points;if(previous&&keep.some(i=>distance(points[i],previous[i],aspect)>chosen.scale*0.7))return reject('Unstable landmarks. Hold position.',false,t);
      const dt=lastAt===null?1/30:Math.min(0.1,Math.max(0.001,(t-lastAt)/1000));history.push(points);if(history.length>3)history.shift();const filtered=points.map(p=>({...p,visibility:0,presence:0}));for(const i of keep){const p=points[i],m={x:median(history.map(h=>h[i].x)),y:median(history.map(h=>h[i].y))},speed=smoothed?distance(m,smoothed[i],aspect)/dt:0,cutoff=1.5+Math.min(10,speed*8),alpha=1-Math.exp(-2*Math.PI*cutoff*dt);filtered[i]={...p,x:smoothed?smoothed[i].x+alpha*(m.x-smoothed[i].x):m.x,y:smoothed?smoothed[i].y+alpha*(m.y-smoothed[i].y):m.y}}
      previous=points;smoothed=filtered;lastAt=t;missingAt=null;stats.accepted++;locked={...chosen,initialScale:locked.initialScale};return {landmarks:filtered,locked:true,needsRelock:false,side,message:'User locked · '+(side===0?'left':'right')+' side'};
    }
    return {push,reset,diagnostics:()=>({...stats,locked:!!locked,needsRelock,side})};
  }

  function createCounter(rule,options){
    const config={...rule,...(options||{})},inverted=config.top<config.bottom,atTop=v=>inverted?v<=config.top:v>=config.top,atBottom=v=>inverted?v>=config.bottom:v<=config.bottom;let samples=[],reps=[],armed=false,bottomed=false,repStart=0,extreme=null,lost=0,dropped=0,rejected=0,phase='waiting',angleNow=null,message='',recent=[];
    function reset(){samples=[];reps=[];armed=false;bottomed=false;repStart=0;extreme=null;lost=0;dropped=0;rejected=0;phase='waiting';angleNow=null;message='';recent=[]}
    function interrupt(){samples=[];armed=false;bottomed=false;repStart=0;extreme=null;lost=0;recent=[];phase='lost';angleNow=null;message='Tracking paused. Start again from the top.'}
    // True once the recent past is more blind than seeing. Judged only on a full window, so a
    // set never starts out "low quality". Independent of the identity lock: a locked person the
    // counter cannot actually see is still a person whose reps it must not invent.
    function qualityLow(){return recent.length>=QUALITY_WINDOW&&recent.reduce((a,b)=>a+b,0)/recent.length<MIN_QUALITY}
    function rearm(text){armed=false;bottomed=false;samples=[];phase='lost';message=text}
    function state(){return {rule:config.id,reps:reps.length,phase,angle:angleNow,tracking:phase!=='lost',dropped,rejected,message,log:reps.slice()}}
    function push(frame){
      const landmarks=frame&&frame.landmarks,t=Number(frame&&frame.t)||0,aspect=Number(frame&&frame.aspect)||1,side=frame?.side===0||frame?.side===1?frame.side:null,subjectPresent=!!frame?.subjectPresent,minVisibility=Number.isFinite(Number(frame?.minVisibility))?Number(frame.minVisibility):MIN_VISIBILITY,raw=jointAngle(config,landmarks,aspect,side,minVisibility);
      // `framed` lets the caller veto a frame the lifter is only half inside. Without it the
      // angle still computes and still looks plausible, which is worse than not counting.
      const usable=raw!==null&&frame?.framed!==false;
      recent.push(usable?1:0);if(recent.length>QUALITY_WINDOW)recent.shift();
      if(!usable||qualityLow()){
        if(!usable){dropped++;lost++}
        // A brief occlusion mid-rep is survivable, and the identity lock buys more patience for
        // it. A sustained gap — solid or flickering — means the counter no longer knows where in
        // the movement the lifter is, so it re-arms rather than counting across what it missed.
        const limit=subjectPresent?LOCKED_LOST_FRAMES:LOST_FRAMES;
        if(lost>=limit)rearm('Lost the working-side joints. Return to the top position.');
        else if(qualityLow())rearm('Too little of you in frame to count. Move back and re-aim.');
        else if(subjectPresent)message='User lock held · reacquiring the working-side pose.';
        return state();
      }
      lost=0;samples.push(raw);if(samples.length>SMOOTHING)samples.shift();const value=median(samples);angleNow=Math.round(value);message='';
      if(!armed){if(atTop(value)){armed=true;repStart=t;extreme=value;phase='top'}else{phase='waiting';message='Start from the top of the movement.'}return state()}
      extreme=extreme===null?value:(inverted?Math.max(extreme,value):Math.min(extreme,value));
      if(!bottomed){if(atBottom(value)){bottomed=true;phase='bottom'}else{phase=atTop(value)?'top':'descending';if(atTop(value)){repStart=t;extreme=value}}return state()}
      // NOTE: `ms` is time spent below the top threshold, not full rep duration — it excludes the
      // travel between the standing angle and `top` at both ends, roughly 300ms of a normal rep.
      // minActiveMs/maxActiveMs are named and tuned for that, because reading them as rep
      // duration rejects an ordinary one-second cadence outright.
      if(atTop(value)){const ms=t-repStart;if(ms>=config.minActiveMs&&ms<=config.maxActiveMs)reps.push({index:reps.length+1,ms,extreme:Math.round(extreme)});else{rejected++;message=ms<config.minActiveMs?'Skipped a bounce.':'Skipped a long pause.'}bottomed=false;repStart=t;extreme=value;phase='top';return state()}
      phase=atBottom(value)?'bottom':'ascending';return state();
    }
    return {push,reset,interrupt,state,rule:config,inverted};
  }
  const api={POINTS:P,PART,RULES,CAUTIONS,MIN_VISIBILITY,SMOOTHING,LOST_FRAMES,LOCKED_LOST_FRAMES,ruleFor,cautionFor,degradedRule,angle,jointAngle,framing,createCounter,createTracker};
  if(typeof window!=='undefined')window.IronSixRepCounter=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
