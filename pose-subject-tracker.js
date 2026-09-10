/* Motion-aware subject association for the opt-in camera assistant.
   Inspired by the useful ideas behind ByteTrack/OC-SORT/Norfair: associate high-confidence
   observations first, recover an existing track from lower-confidence observations second,
   and predict short-term motion instead of treating one weak frame as a new person.

   This is geometry/motion continuity only. It does not use faces, appearance embeddings,
   biometric identity, network calls, storage, or image uploads. */
(() => {
  const BODY=[0,11,12,23,24,25,26,27,28];
  const SIDES=[[11,23,25,27],[12,24,26,28]];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const confidence=p=>{
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return 0;
    const v=p.visibility===undefined?1:Number(p.visibility),q=p.presence===undefined?1:Number(p.presence);
    return Math.max(0,Math.min(Number.isFinite(v)?v:0,Number.isFinite(q)?q:0));
  };
  const pointDistance=(a,b,aspect=1)=>a&&b?Math.hypot((a.x-b.x)*aspect,a.y-b.y):Infinity;
  const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const boxIou=(a,b)=>{
    if(!a||!b)return 0;
    const x1=Math.max(a.x1,b.x1),y1=Math.max(a.y1,b.y1),x2=Math.min(a.x2,b.x2),y2=Math.min(a.y2,b.y2);
    const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1),aa=Math.max(0,a.x2-a.x1)*Math.max(0,a.y2-a.y1),bb=Math.max(0,b.x2-b.x1)*Math.max(0,b.y2-b.y1);
    return aa+bb-inter>0?inter/(aa+bb-inter):0;
  };

  function describe(points,aspect,options){
    if(!Array.isArray(points))return null;
    const low=options.lowConfidence;
    const visible=BODY.map(i=>({i,p:points[i],c:confidence(points[i])})).filter(x=>x.c>=low&&x.p.x>-0.04&&x.p.x<1.04&&x.p.y>-0.04&&x.p.y<1.04);
    if(visible.length<3)return null;
    const xs=visible.map(x=>x.p.x),ys=visible.map(x=>x.p.y),box={x1:Math.min(...xs),y1:Math.min(...ys),x2:Math.max(...xs),y2:Math.max(...ys)};
    const shoulder= [11,12].map(i=>({p:points[i],c:confidence(points[i])})).filter(x=>x.c>=low).sort((a,b)=>b.c-a.c)[0];
    const hip= [23,24].map(i=>({p:points[i],c:confidence(points[i])})).filter(x=>x.c>=low).sort((a,b)=>b.c-a.c)[0];
    let center,scale;
    if(shoulder&&hip){center=midpoint(shoulder.p,hip.p);scale=pointDistance(shoulder.p,hip.p,aspect)}
    else {center={x:(box.x1+box.x2)/2,y:(box.y1+box.y2)/2};scale=Math.max((box.y2-box.y1)*0.45,(box.x2-box.x1)*aspect*0.35)}
    if(!Number.isFinite(scale)||scale<0.035||scale>0.8)return null;
    const sideStats=SIDES.map(indices=>{
      const cs=indices.map(i=>confidence(points[i])),usable=cs.filter(c=>c>=low).length,strong=cs.filter(c=>c>=options.highConfidence).length;
      const weighted=cs.reduce((n,c)=>n+(c>=low?c:0),0)/indices.length;
      return {usable,strong,quality:weighted};
    });
    const side=sideStats[0].quality>=sideStats[1].quality?0:1,best=sideStats[side];
    const bodyQuality=visible.reduce((n,x)=>n+x.c,0)/visible.length;
    return {points,center,scale,box,side,sideStats,quality:0.65*best.quality+0.35*bodyQuality,visible:visible.length};
  }

  function predicted(track,t){
    const dt=track.lastAt===null?0:clamp((t-track.lastAt)/1000,0,1.2);
    return {x:track.center.x+track.velocity.x*dt,y:track.center.y+track.velocity.y*dt,dt};
  }

  function keypointCost(track,candidate,aspect,options){
    let sum=0,weight=0,overlap=0;
    for(const i of BODY){
      const a=track.points?.[i],b=candidate.points?.[i],ca=confidence(a),cb=confidence(b);
      if(ca<options.lowConfidence||cb<options.lowConfidence)continue;
      const w=Math.min(ca,cb);sum+=pointDistance(a,b,aspect)/Math.max(0.04,track.scale)*w;weight+=w;overlap++;
    }
    return {cost:weight?sum/weight:2.5,overlap};
  }

  function association(track,candidate,t,aspect,options){
    const pred=predicted(track,t),centerCost=pointDistance(pred,candidate.center,aspect)/Math.max(0.04,track.scale);
    const scaleCost=Math.abs(Math.log(Math.max(0.05,candidate.scale)/Math.max(0.05,track.scale)));
    const kp=keypointCost(track,candidate,aspect,options),iou=boxIou(track.box,candidate.box);
    const cost=0.47*centerCost+0.28*Math.min(2.5,kp.cost)+0.13*Math.min(2,scaleCost)+0.12*(1-iou);
    return {candidate,cost,centerCost,overlap:kp.overlap,iou,pred};
  }

  function smoothPoints(previous,current,dt,options){
    if(!Array.isArray(current))return null;
    const out=current.map(p=>p?{...p}:p);
    if(!previous)return out;
    for(const i of BODY){
      const p=current[i],old=previous[i],c=confidence(p);if(!p||!old||c<options.lowConfidence)continue;
      const speed=pointDistance(p,old,1)/Math.max(0.008,dt),alpha=clamp(0.22+speed*1.7+c*0.32,0.28,0.82);
      out[i]={...p,x:old.x+alpha*(p.x-old.x),y:old.y+alpha*(p.y-old.y)};
    }
    return out;
  }

  function createSubjectTracker(rule,options={}){
    const config={
      lowConfidence:0.18,highConfidence:0.48,acquireQuality:0.34,acquireMs:420,
      maxCoastMs:950,ambiguityMargin:0.16,highCost:1.35,lowCost:0.92,...options
    };
    let track=null,pending=null,needsRelock=false,side=null,sideWeakSince=null,smoothed=null;
    const stats={accepted:0,rejected:0,losses:0,coasted:0,lowConfidenceMatches:0,ambiguities:0};

    function candidatePool(poses,aspect){return (poses||[]).map(p=>describe(p,aspect,config)).filter(Boolean)}
    function viableForAcquire(c){const s=c.sideStats[c.side];return c.quality>=config.acquireQuality&&s.usable>=3&&c.center.x>0.14&&c.center.x<0.86&&c.center.y>0.08&&c.center.y<0.9}
    function samePending(a,b,aspect){return !!a&&!!b&&pointDistance(a.center,b.center,aspect)/Math.max(0.04,a.scale)<0.65&&b.scale/a.scale>0.55&&b.scale/a.scale<1.8}
    function chooseSide(candidate,t){
      if(side===null){side=candidate.side;sideWeakSince=null;return side}
      const current=candidate.sideStats[side],other=candidate.sideStats[1-side];
      if(current.usable>=3&&current.quality>=config.lowConfidence+0.05){sideWeakSince=null;return side}
      if(other.usable>=3&&other.quality>current.quality+0.12){
        if(sideWeakSince===null)sideWeakSince=t;
        if(t-sideWeakSince>350){side=1-side;sideWeakSince=null}
      }else sideWeakSince=null;
      return side;
    }
    function accept(candidate,t,aspect,tier,cost=null,overlap=0){
      const old=track,dt=old?.lastAt===null||old?.lastAt===undefined?1/30:clamp((t-old.lastAt)/1000,0.001,0.2);
      const nextSmooth=smoothPoints(smoothed,candidate.points,dt,config);
      let velocity={x:0,y:0};
      if(old){const vx=(candidate.center.x-old.center.x)/dt,vy=(candidate.center.y-old.center.y)/dt;velocity={x:old.velocity.x*0.68+vx*0.32,y:old.velocity.y*0.68+vy*0.32};const speed=Math.hypot(velocity.x*aspect,velocity.y);if(speed>1.2){const f=1.2/speed;velocity.x*=f;velocity.y*=f}}
      side=chooseSide(candidate,t);
      track={center:candidate.center,scale:candidate.scale,box:candidate.box,points:candidate.points,velocity,lastAt:t,lastSeen:t,initialScale:old?.initialScale||candidate.scale,tier,cost,overlap};
      smoothed=nextSmooth;stats.accepted++;if(tier==='low')stats.lowConfidenceMatches++;
      return {landmarks:nextSmooth,locked:true,needsRelock:false,side,message:'User locked · '+(side===0?'left':'right')+' side · '+(tier==='low'?'recovered':'motion track'),tier,matchCost:cost};
    }
    function hold(message,t){
      stats.rejected++;
      if(!track)return {landmarks:null,locked:false,needsRelock:false,side:null,message};
      const age=t-track.lastSeen;
      if(age>=config.maxCoastMs){needsRelock=true;stats.losses++;return {landmarks:null,locked:true,needsRelock:true,side,message:'Tracking paused. Clear the view, then tap Re-lock user.',tier:'lost'}}
      stats.coasted++;return {landmarks:null,locked:true,needsRelock:false,side,message:message||'Lock held · pose briefly obscured.',tier:'coast'};
    }
    function reset(){track=null;pending=null;needsRelock=false;side=null;sideWeakSince=null;smoothed=null}
    function push(poses,t,aspect=1){
      if(needsRelock)return {landmarks:null,locked:!!track,needsRelock:true,side,message:'Tracking paused. Clear the view, then tap Re-lock user.',tier:'lost'};
      const candidates=candidatePool(poses,aspect);
      if(!track){
        const viable=candidates.filter(viableForAcquire);
        if(viable.length!==1){pending=null;return {landmarks:null,locked:false,needsRelock:false,side:null,message:viable.length>1?'More than one likely lifter is in the lock area. Move to the centre alone.':'Centre yourself so at least one shoulder, hip, knee and ankle chain is visible.',tier:'acquire'}}
        const chosen=viable[0];
        if(!samePending(pending?.candidate,chosen,aspect)||t-(pending?.last||0)>280)pending={candidate:chosen,since:t,last:t};
        else {pending.candidate=chosen;pending.last=t}
        if(t-pending.since<config.acquireMs)return {landmarks:null,locked:false,needsRelock:false,side:null,message:'Hold position for a moment…',tier:'acquire'};
        return accept(chosen,t,aspect,'high',0,chosen.visible);
      }

      const scored=candidates.map(c=>association(track,c,t,aspect,config)).filter(x=>x.candidate.scale/track.initialScale>0.48&&x.candidate.scale/track.initialScale<2.05).sort((a,b)=>a.cost-b.cost);
      const high=scored.filter(x=>x.candidate.quality>=config.highConfidence&&x.cost<=config.highCost);
      let pool=high,tier='high';
      if(!pool.length){pool=scored.filter(x=>x.candidate.quality>=config.lowConfidence&&x.overlap>=2&&x.cost<=config.lowCost);tier='low'}
      if(!pool.length)return hold('Lock held · pose confidence dipped.',t);
      if(pool.length>1&&pool[1].cost-pool[0].cost<config.ambiguityMargin){stats.ambiguities++;return hold('Two people overlap the predicted track. Counting paused until the view separates.',t)}
      const best=pool[0];
      return accept(best.candidate,t,aspect,tier,best.cost,best.overlap);
    }
    function diagnostics(){return {...stats,locked:!!track,needsRelock,side,tier:track?.tier||null,matchCost:Number.isFinite(track?.cost)?Number(track.cost.toFixed(3)):null,overlap:track?.overlap||0,ageMs:track?Math.max(0,performanceSafeNow()-track.lastSeen):null}}
    function performanceSafeNow(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now()}
    return {push,reset,diagnostics};
  }

  function install(counterApi){
    if(!counterApi||counterApi.__ironSixSubjectTrackerV4)return false;
    counterApi.createTracker=(rule,options)=>{
      const tracker=createSubjectTracker(rule,options),reset=tracker.reset.bind(tracker);
      tracker.reset=()=>{counterApi.__ironSixForceInterrupt=true;counterApi.__ironSixForceFormInterrupt=true;return reset()};
      return tracker;
    };
    counterApi.__ironSixSubjectTrackerV4=true;return true;
  }

  const api={createSubjectTracker,describe,association,confidence,install};
  if(typeof window!=='undefined'){window.IronSixSubjectTracker=api;install(window.IronSixRepCounter)}
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
