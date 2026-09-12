/* Iron Six camera-view classifier. Pure logic: no DOM, camera, network or storage.
   Estimates how the lifter's torso is turned relative to the camera from the landmarks the pose
   tracker already produces (no extra inference), so each movement family can decide whether the
   current view can actually observe its motion. A hip hinge filmed face-on is the motivating
   case: the tracker holds the lifter perfectly, but the shoulder-hip-knee angle collapses in a
   frontal projection, so counting silently fails unless the app tells the user to turn. */
(() => {
  const LS=11,RS=12,LH=23,RH=24,NOSE=0,LEAR=7,REAR=8;
  // Shoulder-joint separation is roughly 0.8 of shoulder-to-hip torso length for most adults when
  // square to the camera, hip-joint separation roughly 0.55. Projected separation shrinks with
  // cos(yaw). Anthropometry varies, which is why depth (z) and occlusion evidence also vote and why
  // the plane boundaries sit well away from the ideal 0/45/90 degree poses.
  const SHOULDER_FRONT=0.80,HIP_FRONT=0.55,MIN_VIS=0.3;
  const DEFAULTS={frontMax:32,sideMin:58,margin:6,dwellMs:450,smoothingMs:220,staleMs:1500};
  const finite=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const vis=p=>{if(!finite(p))return 0;const v=p.visibility===undefined?1:Number(p.visibility),q=p.presence===undefined?1:Number(p.presence);return Math.min(Number.isFinite(v)?v:0,Number.isFinite(q)?q:0)};
  const dist=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
  const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const deg=r=>r*180/Math.PI;

  // Single-frame estimate. Returns null when the torso itself is not measurable.
  function estimate(landmarks,aspect=1){
    if(!Array.isArray(landmarks))return null;aspect=Number(aspect)||1;
    const ls=landmarks[LS],rs=landmarks[RS],lh=landmarks[LH],rh=landmarks[RH];
    if(![ls,rs,lh,rh].every(finite))return null;
    // Occluded far-side joints still carry a coordinate estimate from the model, so the pair
    // geometry is usable as long as the near side is clearly seen.
    const shoulderVis=Math.max(vis(ls),vis(rs)),hipVis=Math.max(vis(lh),vis(rh));
    if(shoulderVis<MIN_VIS||hipVis<MIN_VIS)return null;
    const torso=dist(mid(ls,rs),mid(lh,rh),aspect);if(!(torso>0.03))return null;
    const votes=[];
    const shoulderRatio=dist(ls,rs,aspect)/torso,hipRatio=dist(lh,rh,aspect)/torso;
    const widthYaw=r=>deg(Math.acos(clamp(r,0,1)));
    votes.push({yaw:widthYaw(shoulderRatio/SHOULDER_FRONT),w:1});
    votes.push({yaw:widthYaw(hipRatio/HIP_FRONT),w:0.5});
    // MediaPipe z shares the x (image width) scale, so the shoulder line's depth-vs-width angle is
    // a direct, anthropometry-free yaw reading. It is noisy on the lite model, so it only votes.
    let depthYaw=null;
    if(Number.isFinite(ls.z)&&Number.isFinite(rs.z)){
      const dz=Math.abs(ls.z-rs.z),dx=Math.abs(ls.x-rs.x);
      if(dz+dx>0.01){depthYaw=deg(Math.atan2(dz,dx));votes.push({yaw:depthYaw,w:0.45})}
    }
    // In a true profile the far shoulder and hip are hidden behind the body. Strong one-sided
    // visibility is side-view evidence that does not depend on body proportions at all.
    const asym=(Math.abs(vis(ls)-vis(rs))+Math.abs(vis(lh)-vis(rh)))/2;
    if(asym>0.3)votes.push({yaw:80,w:clamp((asym-0.3)*2,0,0.8)});
    const total=votes.reduce((n,v)=>n+v.w,0),yaw=votes.reduce((n,v)=>n+v.yaw*v.w,0)/total;
    // Facing: a frontal subject shows the face; a rear view hides nose and both ears.
    const face=Math.max(vis(landmarks[NOSE]),vis(landmarks[LEAR]),vis(landmarks[REAR]));
    return {yaw,shoulderRatio,hipRatio,depthYaw,asymmetry:asym,faceVisibility:face,confidence:clamp(Math.min(shoulderVis,hipVis),0,1)};
  }

  function planeFor(yaw,current,config){
    let lo=config.frontMax,hi=config.sideMin;const m=config.margin;
    // Hysteresis: the current plane's boundaries are widened so noise near a threshold holds it.
    if(current==='frontal')lo+=m;else if(current==='oblique'){lo-=m;hi+=m}else if(current==='sagittal')hi-=m;
    return yaw<lo?'frontal':yaw>=hi?'sagittal':'oblique';
  }
  function labelFor(plane,facing){
    if(plane==='sagittal')return 'side';
    if(plane==='oblique')return facing==='rear'?'rear-quarter':'front-quarter';
    if(plane==='frontal')return facing==='rear'?'rear':'front';
    return 'unknown';
  }

  function createViewClassifier(options){
    const config={...DEFAULTS,...(options||{})};
    let yaw=null,plane=null,since=null,candidate=null,candidateSince=null,lastAt=null,lastSeenAt=null,faceScore=null,latest=null;
    const histogram={front:0,'front-quarter':0,side:0,'rear-quarter':0,rear:0,unknown:0};
    function reset(){yaw=null;plane=null;since=null;candidate=null;candidateSince=null;lastAt=null;lastSeenAt=null;faceScore=null;latest=null;for(const k of Object.keys(histogram))histogram[k]=0}
    function facing(){return faceScore===null?null:faceScore<0.3?'rear':'front'}
    function state(t){const label=labelFor(plane,facing());return {label,plane,facing:facing(),yaw:yaw===null?null:Math.round(yaw),stable:plane!==null,stableMs:plane!==null&&since!==null&&Number.isFinite(t)?Math.max(0,t-since):0,pending:candidate,confidence:latest?Number(latest.confidence.toFixed(2)):0}}
    function push(landmarks,t,aspect=1){
      t=Number(t)||0;const e=estimate(landmarks,aspect);
      if(!e){
        // A brief dropout keeps the last stable view; a long one forgets it, so a lifter who walks
        // off and comes back at a new angle is re-classified rather than trusted from memory.
        if(lastSeenAt!==null&&t-lastSeenAt>config.staleMs){yaw=null;plane=null;since=null;candidate=null;faceScore=null;latest=null}
        histogram[labelFor(plane,facing())]++;lastAt=t;return state(t);
      }
      const dt=lastAt===null?33:clamp(t-lastAt,1,500),alpha=1-Math.exp(-dt/config.smoothingMs);
      yaw=yaw===null||(lastSeenAt!==null&&t-lastSeenAt>config.staleMs)?e.yaw:yaw+alpha*(e.yaw-yaw);
      faceScore=faceScore===null?e.faceVisibility:faceScore+alpha*(e.faceVisibility-faceScore);
      latest=e;lastAt=t;lastSeenAt=t;
      const next=planeFor(yaw,plane,config);
      if(next===plane)candidate=null;
      else{if(candidate!==next){candidate=next;candidateSince=t}if(t-candidateSince>=config.dwellMs){plane=next;since=t;candidate=null}}
      histogram[labelFor(plane,facing())]++;return state(t);
    }
    return {push,reset,state:()=>state(lastAt),histogram:()=>({...histogram}),config};
  }

  const api={estimate,createViewClassifier,planeFor,labelFor,DEFAULTS,SHOULDER_FRONT,HIP_FRONT};
  if(typeof window!=='undefined')window.IronSixViewClassifier=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
