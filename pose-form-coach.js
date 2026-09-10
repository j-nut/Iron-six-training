/* Conservative form observations from confidence-gated pose landmarks. Pure logic: no DOM,
   camera, network or speech. It reports only things a single 2D view can reasonably observe. */
(() => {
  const P={LSHOULDER:11,RSHOULDER:12,LHIP:23,RHIP:24,LKNEE:25,RKNEE:26,LANKLE:27,RANKLE:28};
  const median=values=>{const a=[...values].filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[(a.length-1)>>1]:null};
  const dist=(a,b,aspect=1)=>a&&b?Math.hypot((a.x-b.x)*aspect,a.y-b.y):null;
  function angle(a,b,c,aspect=1){
    if(!a||!b||!c)return null;
    const ax=(a.x-b.x)*aspect,ay=a.y-b.y,cx=(c.x-b.x)*aspect,cy=c.y-b.y,mag=Math.hypot(ax,ay)*Math.hypot(cx,cy);
    if(!mag)return null;
    return Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/mag)))*180/Math.PI;
  }
  function pointOk(p){return !!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility===undefined||p.visibility>=0.6)&&(p.presence===undefined||p.presence>=0.6)}
  function indices(side){return side===1?{shoulder:P.RSHOULDER,hip:P.RHIP,knee:P.RKNEE,ankle:P.RANKLE}:{shoulder:P.LSHOULDER,hip:P.LHIP,knee:P.LKNEE,ankle:P.LANKLE}}
  function metrics(landmarks,side,aspect=1){
    if(!landmarks||side===null||side===undefined)return null;
    const i=indices(side),shoulder=landmarks[i.shoulder],hip=landmarks[i.hip],knee=landmarks[i.knee],ankle=landmarks[i.ankle];
    if(![shoulder,hip,knee,ankle].every(pointOk))return null;
    const torso=dist(shoulder,hip,aspect);if(!torso||torso<0.04)return null;
    const dx=Math.abs((shoulder.x-hip.x)*aspect),dy=Math.abs(shoulder.y-hip.y);
    return {shoulder,hip,knee,ankle,torso,kneeAngle:angle(hip,knee,ankle,aspect),torsoLean:Math.atan2(dx,Math.max(0.0001,dy))*180/Math.PI,depthRatio:(hip.y-knee.y)/torso};
  }

  const COPY={
    depth:{level:'watch',text:'Camera view suggests this rep finished a little higher than your other reps. If that depth is intentional, ignore this; otherwise aim for a more repeatable bottom position.'},
    depthConsistency:{level:'watch',text:'Your bottom position changed noticeably from recent reps. Try to make the next rep match your intended depth.'},
    torso:{level:'cue',text:'Your torso angle changed a lot from the setup position. Brace and try to let your chest and hips rise together.'},
    hipLead:{level:'cue',text:'Your hips started rising ahead of your chest on this rep. Stay braced and try to bring chest and hips up together.'},
    tempo:{level:'watch',text:'That rep was very quick. If speed was not intentional, use a more deliberate descent so the position is easier to control.'}
  };

  function assessSquat(rep,prior){
    const issues=[];
    if(Number.isFinite(rep.depthRatio)&&rep.depthRatio<-0.10)issues.push('depth');
    const priorDepths=prior.slice(-3).map(x=>x.extreme).filter(Number.isFinite);
    if(priorDepths.length>=2&&Number.isFinite(rep.extreme)&&Math.abs(rep.extreme-median(priorDepths))>12)issues.push('depthConsistency');
    if(Number.isFinite(rep.maxLeanDelta)&&rep.maxLeanDelta>28)issues.push('torso');
    if(Number.isFinite(rep.maxHipLead)&&rep.maxHipLead>0.16)issues.push('hipLead');
    if(Number.isFinite(rep.descentMs)&&rep.descentMs>0&&rep.descentMs<550)issues.push('tempo');
    return issues;
  }

  function createSquatEvaluator(options){
    const config={minFrames:8,...(options||{})};
    let topLean=[],current=null,history=[],latest=null,lastLogCount=0;
    function reset(){topLean=[];current=null;history=[];latest=null;lastLogCount=0}
    function resetSet(){topLean=[];current=null;latest=null;lastLogCount=0}
    function interrupt(logCount){topLean=[];current=null;lastLogCount=Number.isFinite(Number(logCount))?Number(logCount):lastLogCount}
    function begin(m,t){current={startedAt:t,baselineLean:median(topLean.slice(-20))??m.torsoLean,samples:0,bottomAt:null,depthRatio:null,maxLeanDelta:0,maxHipLead:0,bottomHipY:null,bottomShoulderY:null,extreme:null};}
    function push(frame){
      const state=frame&&frame.counterState||{},phase=state.phase||'waiting',t=Number(frame&&frame.t)||0;
      const m=metrics(frame&&frame.landmarks,frame&&frame.side,Number(frame&&frame.aspect)||1);
      if(!m){if(phase==='lost')current=null;return snapshot()}
      if((phase==='top'||phase==='waiting')&&!current){topLean.push(m.torsoLean);if(topLean.length>30)topLean.shift()}
      if((phase==='descending'||phase==='bottom'||phase==='ascending')&&!current)begin(m,t);
      if(current){
        current.samples++;
        current.maxLeanDelta=Math.max(current.maxLeanDelta,Math.max(0,m.torsoLean-current.baselineLean));
        if(phase==='bottom'&&current.bottomAt===null){current.bottomAt=t;current.depthRatio=m.depthRatio;current.bottomHipY=m.hip.y;current.bottomShoulderY=m.shoulder.y}
        if(phase==='ascending'&&current.bottomAt!==null){
          const hipRise=(current.bottomHipY-m.hip.y)/m.torso,shoulderRise=(current.bottomShoulderY-m.shoulder.y)/m.torso;
          current.maxHipLead=Math.max(current.maxHipLead,hipRise-shoulderRise);
        }
      }
      const log=Array.isArray(state.log)?state.log:[];
      if(log.length>lastLogCount){
        const item=log[log.length-1],rep={index:item.index,ms:item.ms,extreme:item.extreme,samples:current?.samples||0,
          descentMs:current?.bottomAt===null||current?.bottomAt===undefined?null:Math.max(0,current.bottomAt-current.startedAt),
          ascentMs:current?.bottomAt===null||current?.bottomAt===undefined?null:Math.max(0,t-current.bottomAt),
          depthRatio:current?.depthRatio??null,maxLeanDelta:current?.maxLeanDelta??null,maxHipLead:current?.maxHipLead??null};
        const issues=rep.samples>=config.minFrames?assessSquat(rep,history):[];
        latest={...rep,issues,cues:issues.map(id=>({id,...COPY[id]})),confidence:rep.samples>=14&&rep.depthRatio!==null?'high':'medium'};
        history.push(latest);lastLogCount=log.length;current=null;topLean=[m.torsoLean];
      } else lastLogCount=Math.max(lastLogCount,log.length);
      return snapshot();
    }
    function repeatedCue(){
      const recent=history.slice(-3),counts={};for(const rep of recent)for(const id of rep.issues)counts[id]=(counts[id]||0)+1;
      const id=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];return id&&counts[id]>=2?{id,...COPY[id],repeated:counts[id]}:null;
    }
    function snapshot(){return {kind:'squat',latest,repeatedCue:repeatedCue(),history:history.slice()}}
    function summary(){
      const counts={};for(const rep of history)for(const id of rep.issues)counts[id]=(counts[id]||0)+1;
      const top=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
      return {reps:history.length,issues:counts,primary:top?{id:top,count:counts[top],...COPY[top]}:null};
    }
    return {push,reset,resetSet,interrupt,state:snapshot,summary};
  }

  function createGenericEvaluator(){
    let history=[],latest=null,lastLogCount=0;
    function push(frame){
      const log=Array.isArray(frame?.counterState?.log)?frame.counterState.log:[];
      if(log.length>lastLogCount){const item=log[log.length-1],issues=item.ms<1200?['tempo']:[];latest={...item,issues,cues:issues.map(id=>({id,...COPY[id]})),confidence:'medium'};history.push(latest)}
      lastLogCount=log.length;return state();
    }
    function state(){const recent=history.slice(-3),fast=recent.filter(x=>x.issues.includes('tempo')).length;return {kind:'generic',latest,repeatedCue:fast>=2?{id:'tempo',...COPY.tempo,repeated:fast}:null,history:history.slice()}}
    function summary(){return {reps:history.length,issues:{tempo:history.filter(x=>x.issues.includes('tempo')).length},primary:null}}
    function reset(){history=[];latest=null;lastLogCount=0}function resetSet(){latest=null;lastLogCount=0}function interrupt(logCount){lastLogCount=Number.isFinite(Number(logCount))?Number(logCount):lastLogCount}
    return {push,reset,resetSet,interrupt,state,summary};
  }
  function createEvaluator(rule,options){return rule?.id==='squat'?createSquatEvaluator(options):createGenericEvaluator(options)}
  const api={POINTS:P,metrics,createEvaluator,COPY};
  if(typeof window!=='undefined')window.IronSixFormCoach=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
