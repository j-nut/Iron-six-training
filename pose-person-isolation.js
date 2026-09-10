/* Persistent one-person isolation for the opt-in camera assistant.
   This module tracks only geometry: person boxes, motion and overlap. It performs no face recognition,
   appearance matching, biometric identification, network calls or storage. */
(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const distance=(a,b,aspect=1)=>a&&b?Math.hypot((a.cx-b.cx)*aspect,a.cy-b.cy):Infinity;
  const area=b=>b?Math.max(0,b.w)*Math.max(0,b.h):0;
  const iou=(a,b)=>{
    if(!a||!b)return 0;const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h);
    const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1),total=area(a)+area(b)-inter;return total>0?inter/total:0;
  };
  const finishBox=b=>{
    if(!b)return null;const x=clamp(Number(b.x)||0,0,1),y=clamp(Number(b.y)||0,0,1),w=clamp(Number(b.w)||0,0,1-x),h=clamp(Number(b.h)||0,0,1-y);
    if(w<0.03||h<0.08)return null;return {...b,x,y,w,h,cx:x+w/2,cy:y+h/2};
  };
  function normalizeDetections(result,width,height){
    const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1),detections=Array.isArray(result)?result:(result?.detections||[]),out=[];
    for(const detection of detections){
      const category=detection?.categories?.[0]||{},name=String(category.categoryName||category.displayName||'').toLowerCase();
      if(name&&name!=='person')continue;const box=detection?.boundingBox||detection?.box;if(!box)continue;
      const normalized=finishBox({x:Number(box.originX??box.x??0)/w,y:Number(box.originY??box.y??0)/h,w:Number(box.width??box.w??0)/w,h:Number(box.height??box.h??0)/h,score:Number(category.score??detection.score??0)});
      if(normalized)out.push(normalized);
    }
    return out;
  }
  function boxFromPose(points,minConfidence=0.16){
    if(!Array.isArray(points))return null;const ids=[0,11,12,23,24,25,26,27,28],usable=[];
    for(const i of ids){const p=points[i];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;const v=p.visibility===undefined?1:Number(p.visibility),q=p.presence===undefined?1:Number(p.presence),c=Math.min(Number.isFinite(v)?v:0,Number.isFinite(q)?q:0);if(c>=minConfidence)usable.push(p)}
    if(usable.length<3)return null;const xs=usable.map(p=>p.x),ys=usable.map(p=>p.y),x1=Math.min(...xs),x2=Math.max(...xs),y1=Math.min(...ys),y2=Math.max(...ys);
    return finishBox({x:x1,y:y1,w:x2-x1,h:y2-y1,score:0.5,source:'pose'});
  }
  function roiFromBox(box,options={}){
    if(!box)return null;const padX=options.padX??0.55,padY=options.padY??0.12,minWidth=options.minWidth??0.34,minHeight=options.minHeight??0.72;
    let w=Math.max(minWidth,box.w*(1+padX*2)),h=Math.max(minHeight,box.h*(1+padY*2));w=Math.min(1,w);h=Math.min(1,h);
    const cx=box.cx??box.x+box.w/2,cy=box.cy??box.y+box.h/2;let x=cx-w/2,y=cy-h/2;x=clamp(x,0,1-w);y=clamp(y,0,1-h);
    return {x,y,w,h,cx:x+w/2,cy:y+h/2};
  }
  function remapLandmarks(poses,roi){
    if(!roi)return poses||[];return (poses||[]).map(points=>(points||[]).map(p=>p?{...p,x:roi.x+p.x*roi.w,y:roi.y+p.y*roi.h,z:Number.isFinite(p.z)?p.z*Math.max(roi.w,roi.h):p.z}:p));
  }
  function createPersonTracker(options={}){
    const config={acquireMs:260,maxCoastMs:1800,maxLossMs:3200,ambiguityMargin:0.16,maxCost:1.25,...options};
    let track=null,pending=null,needsRelock=false,lastDetectionAt=null;
    const stats={accepted:0,coasted:0,losses:0,ambiguities:0,poseRefreshes:0};
    const predict=t=>{
      if(!track)return null;const dt=clamp((t-track.lastAt)/1000,0,1.5),cx=clamp(track.cx+track.vx*dt,0,1),cy=clamp(track.cy+track.vy*dt,0,1),w=track.w,h=track.h;
      return finishBox({...track,x:clamp(cx-w/2,0,1-w),y:clamp(cy-h/2,0,1-h),w,h,cx,cy});
    };
    const matchCost=(pred,c)=>{
      const scale=Math.max(0.08,Math.hypot(pred.w,pred.h)),center=distance(pred,c,1)/scale,size=Math.abs(Math.log(Math.max(0.02,area(c))/Math.max(0.02,area(pred)))),overlap=iou(pred,c);
      return 0.56*center+0.26*(1-overlap)+0.18*Math.min(2,size);
    };
    function accept(box,t,source='detector'){
      const old=track,dt=old?clamp((t-old.lastAt)/1000,0.02,0.5):0.1,vx=old?(box.cx-old.cx)/dt:0,vy=old?(box.cy-old.cy)/dt:0;
      track={...box,vx:old?old.vx*0.72+vx*0.28:0,vy:old?old.vy*0.72+vy*0.28:0,lastAt:t,lastSeen:t,source};lastDetectionAt=t;needsRelock=false;stats.accepted++;
      return snapshot(t,true,source);
    }
    function snapshot(t=0,visible=false,source=track?.source||null){
      const box=predict(t)||track,age=track?Math.max(0,t-track.lastSeen):Infinity,coasting=!!track&&!visible&&age>0;
      return {locked:!!track,visible,coasting,needsRelock,box,roi:box&&!needsRelock?roiFromBox(box,config):null,source,ageMs:Number.isFinite(age)?Math.round(age):null,message:needsRelock?'User isolation lost. Clear the view, then tap Re-lock user.':visible?'User isolated · person lock active':coasting?'User isolated · holding your last track':'Find one person in the centre to lock.'};
    }
    function push(detections,t){
      const boxes=(detections||[]).map(finishBox).filter(Boolean);
      if(needsRelock)return snapshot(t,false);
      if(!track){
        const centered=boxes.filter(b=>b.cx>0.14&&b.cx<0.86&&b.cy>0.08&&b.cy<0.94&&b.h>0.32).sort((a,b)=>Math.abs(a.cx-0.5)-Math.abs(b.cx-0.5));
        if(!centered.length){pending=null;return snapshot(t,false)}
        if(centered.length>1&&Math.abs(Math.abs(centered[0].cx-0.5)-Math.abs(centered[1].cx-0.5))<0.07){pending=null;stats.ambiguities++;return {...snapshot(t,false),message:'More than one person is equally close to the lock area.'}}
        const chosen=centered[0];const same=pending&&distance(pending.box,chosen,1)<0.16&&chosen.h/pending.box.h>0.6&&chosen.h/pending.box.h<1.7;
        if(!same||t-pending.last>500)pending={box:chosen,since:t,last:t};else{pending.box=chosen;pending.last=t}
        if(t-pending.since<config.acquireMs)return {...snapshot(t,false),message:'Hold position for a moment while Iron Six isolates you…'};
        pending=null;return accept(chosen,t,'detector');
      }
      const pred=predict(t),scored=boxes.map(b=>({box:b,cost:matchCost(pred,b)})).filter(x=>x.box.h/track.h>0.48&&x.box.h/track.h<2.1).sort((a,b)=>a.cost-b.cost);
      if(scored.length&&scored[0].cost<=config.maxCost){
        if(scored.length>1&&scored[1].cost-scored[0].cost<config.ambiguityMargin){stats.ambiguities++;stats.coasted++;return {...snapshot(t,false),message:'Two people overlap your track. User lock is held while they separate.'}}
        return accept(scored[0].box,t,'detector');
      }
      const age=t-track.lastSeen;if(age>=config.maxLossMs){needsRelock=true;stats.losses++;return snapshot(t,false)}stats.coasted++;return snapshot(t,false);
    }
    function observePose(points,t){
      if(!track||needsRelock)return snapshot(t,false);const box=boxFromPose(points,0.14);if(!box)return snapshot(t,false);const pred=predict(t),cost=matchCost(pred,box);
      if(cost>1.15)return snapshot(t,false);stats.poseRefreshes++;const blended=finishBox({x:track.x*0.65+box.x*0.35,y:track.y*0.65+box.y*0.35,w:track.w*0.72+box.w*0.28,h:track.h*0.72+box.h*0.28,score:box.score});return accept(blended,t,'pose');
    }
    function sample(t){
      if(!track)return snapshot(t,false);if(!needsRelock&&t-track.lastSeen>=config.maxLossMs){needsRelock=true;stats.losses++}return snapshot(t,false);
    }
    function reset(){track=null;pending=null;needsRelock=false;lastDetectionAt=null}
    function diagnostics(){return {...stats,locked:!!track,needsRelock,lastDetectionAt,box:track?{x:+track.x.toFixed(3),y:+track.y.toFixed(3),w:+track.w.toFixed(3),h:+track.h.toFixed(3)}:null}}
    return {push,observePose,sample,reset,diagnostics};
  }
  const api={normalizeDetections,boxFromPose,roiFromBox,remapLandmarks,createPersonTracker,iou};
  if(typeof window!=='undefined')window.IronSixPersonIsolation=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
