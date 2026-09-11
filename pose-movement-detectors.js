/* Iron Six movement-family camera rules.
   Architecture: universal lifter tracker -> view classifier -> movement-family detector ->
   exercise-specific configuration -> validated form rules.
   Extends the proven pose rep counter without changing its state machine: angle families still run
   through IronSixRepCounter.createCounter unchanged (squat is the validated reference). Families
   whose motion a single joint angle cannot capture from every camera angle get a multi-signal
   phase detector here instead. */
(() => {
  const counter = typeof window !== 'undefined' && window.IronSixRepCounter
    ? window.IronSixRepCounter
    : (typeof require !== 'undefined' ? require('./pose-rep-counter.js') : null);
  const registry = typeof window !== 'undefined' && window.IronSixExerciseRegistry
    ? window.IronSixExerciseRegistry
    : (typeof require !== 'undefined' ? require('./exercise-registry.js') : null);
  const views = typeof window !== 'undefined' && window.IronSixViewClassifier
    ? window.IronSixViewClassifier
    : (typeof require !== 'undefined' ? require('./pose-view-classifier.js') : null);
  if (!counter) return;
  const P = counter.POINTS;
  const clean = v => String(v || '').trim().toLowerCase();

  function registryEntry(exercise) {
    const x = exercise || {}, id = clean(x.id), name = clean(x.name);
    const entries = registry?.exercises || [];
    return Array.isArray(entries) ? entries.find(e => clean(e.id) === id || clean(e.name) === name || (e.aliases || []).some(a => clean(a) === name)) || null : null;
  }
  function canonical(exercise) {
    const entry = registryEntry(exercise);
    return { ...(entry || {}), ...(exercise || {}), pattern: (exercise || {}).pattern || entry?.pattern || null };
  }

  // View policy per family, keyed by camera plane (see pose-view-classifier.js):
  //   ok       - the family's signal is observable; count normally.
  //   degraded - still counts, but the user is told which angle would be better.
  //   blocked  - the signal collapses in this projection; counting pauses and the user is told how
  //              to turn. Only used where geometry or real footage shows counting cannot work,
  //              because a false "turn around" is also a failure.
  const ALL_VIEWS = {frontal:'ok',oblique:'ok',sagittal:'ok'};
  const FAMILIES=[
    {id:'squat',label:'Squat',patterns:['squat','split_squat'],match:x=>/squat|lunge|split squat|step[- ]?up/i.test(x.name||''),joint:[[P.LHIP,P.LKNEE,P.LANKLE],[P.RHIP,P.RKNEE,P.RANKLE]],framing:[P.LSHOULDER,P.RSHOULDER,P.LHIP,P.RHIP,P.LKNEE,P.RKNEE,P.LANKLE,P.RANKLE],top:160,bottom:100,minActiveMs:500,maxActiveMs:15000,setup:'Place the phone around hip height, roughly level and side-on, far enough back to keep your full body in frame.',preferredView:'side',detectorFamily:'squat',formProfile:'squat',validated:true,
     // Squat counting is validated and must not regress, so no view ever blocks it.
     views:{frontal:'degraded',oblique:'ok',sagittal:'ok'},viewAdvice:{frontal:'Face-on view: reps still count, but depth is approximate. Turn side-on for depth and form feedback.'},
     fallback:{joint:[[P.LHIP,P.LKNEE],[P.RHIP,P.RKNEE]],framing:[P.LSHOULDER,P.RSHOULDER,P.LHIP,P.RHIP,P.LKNEE,P.RKNEE],top:30,bottom:75,note:'Ankles are out of frame, so reps are counted from your hips and knees. Depth is approximate and form watch is off.'}},
    {id:'hinge',label:'Hip hinge',patterns:['hinge'],match:x=>/deadlift|romanian|rdl|good morning|hip hinge/i.test(x.name||''),joint:[[P.LSHOULDER,P.LHIP,P.LKNEE],[P.RSHOULDER,P.RHIP,P.RKNEE]],framing:[P.LSHOULDER,P.RSHOULDER,P.LHIP,P.RHIP,P.LKNEE,P.RKNEE],top:160,bottom:105,minActiveMs:500,maxActiveMs:15000,setup:'Stand side-on to the phone with it around hip height. Keep shoulders, hips, and knees visible through the full hinge.',preferredView:'side',detectorFamily:'hinge',formProfile:'hinge',validated:false,
     // Real RDL footage: side view counted, face-on did not. The torso folds toward the camera, so
     // the shoulder-hip-knee angle stays near 180 degrees in a frontal projection.
     views:{frontal:'blocked',oblique:'degraded',sagittal:'ok'},viewAdvice:{frontal:'Face-on view. A hip hinge cannot be measured from the front. Turn side-on to the phone to count reps.',oblique:'Angled view. Turn a little more side-on for reliable hinge counting.'}},
    {id:'horizontal_press',label:'Horizontal press',patterns:['bench','pushup','horizontal_press','chest_press'],match:x=>/bench press|floor press|chest press|push[- ]?up/i.test(x.name||''),joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],top:155,bottom:90,minActiveMs:400,maxActiveMs:12000,setup:'Place the phone side-on near bench height so your shoulder, elbow, and wrist stay visible for the entire rep.',preferredView:'side',detectorFamily:'horizontal_press',formProfile:'horizontal_press',validated:false,
     views:{frontal:'degraded',oblique:'ok',sagittal:'ok'},viewAdvice:{frontal:'Face-on view. Turn side-on (phone near bench or floor height) for reliable press counting.'}},
    {id:'vertical_press',label:'Vertical press',patterns:['overhead_press','vertical_press'],match:x=>/overhead press|shoulder press|military press|arnold press|push press/i.test(x.name||''),joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],top:75,bottom:160,minActiveMs:450,maxActiveMs:12000,setup:'Face the phone or turn slightly side-on, far enough back that your hips and both hands stay visible overhead.',preferredView:'front-quarter',detectorFamily:'vertical_press',formProfile:'vertical_press',validated:false,
     // The old single elbow-angle rule counted 2 of 6 real barbell presses. Wrist height relative to
     // the shoulder is observable from any angle, so every plane is acceptable for the phase detector.
     detector:'vertical_press_phase',views:ALL_VIEWS},
    {id:'row',label:'Row',patterns:['row'],match:x=>/\brow\b|meadows row/i.test(x.name||''),joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST,P.LHIP,P.RHIP],top:150,bottom:80,minActiveMs:400,maxActiveMs:12000,setup:'Place the phone on your working side at torso height so shoulder, elbow, wrist, and torso stay visible.',preferredView:'working-side',detectorFamily:'row',formProfile:'row',validated:false,
     views:{frontal:'degraded',oblique:'ok',sagittal:'ok'},viewAdvice:{frontal:'Face-on view. Film from your working side or about 45 degrees so the elbow bend is visible.'}},
    {id:'curl',label:'Curl',patterns:['curl','hammer_curl'],match:x=>/curl/i.test(x.name||'')&&!/leg|hamstring|nordic/i.test(x.name||''),joint:[[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],framing:[P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],top:150,bottom:70,minActiveMs:400,maxActiveMs:12000,setup:'Face the phone or turn slightly to one side, about 6 feet back, with shoulders, elbows, and wrists visible.',preferredView:'front',detectorFamily:'curl',formProfile:'curl',validated:false,views:ALL_VIEWS}
  ];

  // Exercise-specific configuration: small overrides on a family, never a separate algorithm.
  const OVERRIDES=[
    // Registered as overhead_press, but inverted on the hands: wrist-over-shoulder height does not
    // apply, while the elbow angle is clean from the side, exactly like a push-up.
    {family:'vertical_press',match:/pike/i,apply:{detector:'angle',top:155,bottom:95,minActiveMs:400,setup:'Place the phone side-on at floor level, far enough back to keep your whole body in frame.',preferredView:'side',views:{frontal:'degraded',oblique:'ok',sagittal:'ok'},viewAdvice:{frontal:'Face-on view. Film a pike push-up from the side so the elbow bend is visible.'}}},
    // A landmine press finishes up and forward rather than straight overhead.
    {family:'vertical_press',match:/landmine/i,apply:{press:{lockHeight:0.45,highLock:0.8}}}
  ];

  // Vertical press phase thresholds, in torso lengths (shoulder-to-hip), measured as wrist height
  // above the shoulder. Rack at the shoulders is roughly 0 to 0.5; a locked-out arm reaches about
  // 1.0. The gaps between them are hysteresis, so noise near one threshold cannot flip phases.
  const PRESS={rackMin:-0.6,rackMax:0.55,leaveRack:0.67,lockHeight:0.75,lockElbow:145,highLock:0.95,minTravel:0.4,partialTravel:0.25};

  const originalRuleFor = counter.ruleFor.bind(counter);
  function ruleFor(exercise) {
    const x = canonical(exercise), pattern = clean(x.pattern);
    const family = FAMILIES.find(f=>f.patterns.includes(pattern)) || FAMILIES.find(f=>{try{return f.match(x)}catch(_){return false}});
    if(!family) return originalRuleFor(exercise);
    let rule={...family,sourcePattern:pattern||null,exerciseId:x.id||null,exerciseName:x.name||null};
    for(const o of OVERRIDES)if(o.family===family.id&&o.match.test(x.name||''))rule={...rule,...o.apply,press:{...(rule.press||{}),...(o.apply.press||{})},override:String(o.match)};
    if(rule.detector==='vertical_press_phase')rule.press={...PRESS,...(rule.press||{})};
    return rule;
  }
  function familyFor(exercise){const r=ruleFor(exercise);return r?.detectorFamily||r?.id||null}
  function supported(exercise){return !!ruleFor(exercise)}
  function coverage(){const entries=registry?.exercises||[],byFamily={};let supportedCount=0;for(const e of entries){const f=familyFor(e);if(!f)continue;supportedCount++;byFamily[f]=(byFamily[f]||0)+1}return {total:entries.length,supported:supportedCount,byFamily}}

  function viewGate(rule,view){
    const label=view?.label||'unknown',plane=view?.plane||null;
    if(!rule||!plane)return {status:'unknown',label,plane,message:null,preferred:rule?.preferredView||null};
    const status=(rule.views||ALL_VIEWS)[plane]||'ok';
    const message=status==='ok'?null:(rule.viewAdvice?.[plane]||(status==='blocked'?'This camera angle cannot measure this movement. Turn side-on to the phone.':'A different camera angle would track this movement better.'));
    return {status,label,plane,message,preferred:rule.preferredView||null};
  }

  // Shared continuity rules for phase detectors. Mirrors IronSixRepCounter.createCounter exactly so
  // a new detector cannot bridge a camera stall or a blind interval that the proven counter refuses.
  function createContinuity(){
    const LOST=counter.LOST_MS,LOCKED=counter.LOCKED_LOST_MS,WINDOW=counter.QUALITY_WINDOW_MS,MIN_Q=0.5;
    let lastAt=null,lastUsableAt=null,lostSince=null,firstAt=null,recent=[];
    function reset(){lastAt=null;lastUsableAt=null;lostSince=null;firstAt=null;recent=[]}
    function qualityLow(t){
      if(firstAt===null||t-firstAt<WINDOW||recent.length<2)return false;
      let observed=0,usable=0;
      for(let i=1;i<recent.length;i++){const dt=recent[i].t-Math.max(t-WINDOW,recent[i-1].t);observed+=dt;if(recent[i-1].ok)usable+=dt}
      return observed>0&&usable/observed<MIN_Q;
    }
    function step(t,usable,subjectPresent){
      if(lastAt!==null&&t<=lastAt)return {stale:true};
      let rearm=null;
      if((lastAt!==null&&t-lastAt>LOST)||(lastUsableAt!==null&&t-lastUsableAt>(subjectPresent?LOCKED:LOST)))rearm='Camera or joints were unavailable. Start again from the start position.';
      lastAt=t;if(firstAt===null)firstAt=t;
      recent.push({t,ok:usable?1:0});while(recent.length>1&&t-recent[1].t>WINDOW)recent.shift();
      const low=qualityLow(t);
      if(!usable||low){
        if(!usable&&lostSince===null)lostSince=t;
        const limit=subjectPresent?LOCKED:LOST;
        if(lostSince!==null&&t-lostSince>=limit)rearm='Lost your arms. Return to the start position.';
        else if(low)rearm='Too little of you in frame to count. Move back and re-aim.';
        return {usable:false,dropped:!usable,rearm};
      }
      lostSince=null;lastUsableAt=t;return {usable:true,rearm};
    }
    return {step,reset};
  }

  const visible=(p,threshold)=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;const v=p.visibility===undefined?1:Number(p.visibility),q=p.presence===undefined?1:Number(p.presence);return (Number.isFinite(v)?v:0)>=threshold&&(Number.isFinite(q)?q:0)>=threshold};
  const dist=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
  const middle=points=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
  const median=values=>{const s=[...values].sort((a,b)=>a-b);return s[(s.length-1)>>1]};
  const round2=v=>Number.isFinite(v)?Math.round(v*100)/100:null;

  // Vertical press as a phase machine: rack -> pressing -> lockout -> lowering -> rack (count).
  // Signals: wrist height above the shoulder (scale-normalised by torso length), elbow extension,
  // and travel from this rep's own rack position. The rack is found by wrist height, not elbow
  // angle, because a front-rack elbow projects unpredictably from the front; lockout needs height
  // AND extension, so a half press to the forehead is rejected instead of counted.
  function createVerticalPressCounter(rule,options){
    const config={...rule,...(options||{})},cfg={...PRESS,...(config.press||{})},gate=createContinuity();
    const minActiveMs=config.minActiveMs??450,maxActiveMs=config.maxActiveMs??12000;
    let reps=[],rejected=0,dropped=0,phase='waiting',message='',samples=[],angleNow=null,measurementValid=false,signal=null;
    let armed=false,rackLevel=null,peak=null,peakElbow=null,locked=false,repStart=0,torsoRef=null,upperArmMax=0,notice=null;
    function clearRep(){armed=false;samples=[];rackLevel=null;peak=null;peakElbow=null;locked=false;angleNow=null;measurementValid=false}
    function rearm(text){clearRep();phase='lost';message=text}
    function reset(){gate.reset();clearRep();reps=[];rejected=0;dropped=0;phase='waiting';message='';signal=null;repStart=0;torsoRef=null;upperArmMax=0}
    function interrupt(){gate.reset();rearm('Tracking paused. Start again from your shoulders.')}
    function state(){return {rule:config.id,detector:'vertical_press_phase',reps:reps.length,phase,angle:angleNow,tracking:measurementValid,measurementValid,dropped,rejected,message,log:reps.slice(),signal}}
    function measure(landmarks,aspect,minVis){
      const ok=p=>visible(p,minVis),shoulders=[landmarks[P.LSHOULDER],landmarks[P.RSHOULDER]].filter(ok),hips=[landmarks[P.LHIP],landmarks[P.RHIP]].filter(ok);
      if(!shoulders.length)return null;
      if(hips.length){const d=dist(middle(shoulders),middle(hips),aspect);if(d>0.04)torsoRef=torsoRef===null?d:torsoRef+0.1*(d-torsoRef)}
      const arms=[];
      for(const s of [0,1]){
        const sh=landmarks[s?P.RSHOULDER:P.LSHOULDER],el=landmarks[s?P.RELBOW:P.LELBOW],wr=landmarks[s?P.RWRIST:P.LWRIST];
        if(!ok(sh)||!ok(wr))continue;
        let elbow=null;if(ok(el)){elbow=counter.angle(sh,el,wr,aspect);upperArmMax=Math.max(upperArmMax,dist(sh,el,aspect))}
        arms.push({sh,wr,elbow});
      }
      if(!arms.length)return null;
      // Torso length is the stable scale; with hips out of shot, the longest upper arm seen stands in.
      const scale=torsoRef??(upperArmMax>0.03?upperArmMax/0.62:null);if(!scale)return null;
      // The higher hand leads: identical for a barbell, and follows the working arm when one side is
      // occluded in a side view.
      let best=null;for(const a of arms){const height=(a.sh.y-a.wr.y)/scale;if(!best||height>best.height)best={height,elbow:a.elbow}}
      return {...best,arms:arms.length};
    }
    function push(frame){
      const landmarks=frame&&frame.landmarks,t=Number(frame&&frame.t)||0,aspect=Number(frame&&frame.aspect)||1,subjectPresent=!!frame?.subjectPresent,minVis=Number.isFinite(Number(frame?.minVisibility))?Number(frame.minVisibility):counter.MIN_VISIBILITY;
      const m=landmarks&&frame?.framed!==false?measure(landmarks,aspect,minVis):null,g=gate.step(t,!!m,subjectPresent);
      if(g.stale)return state();
      if(g.rearm)rearm(g.rearm);
      measurementValid=false;
      if(!g.usable){if(g.dropped)dropped++;if(!g.rearm&&subjectPresent)message='User lock held · reacquiring your arms.';return state()}
      measurementValid=true;samples.push({t,h:m.height,e:m.elbow});while(samples.length>counter.SMOOTHING||(samples.length>1&&t-samples[0].t>140))samples.shift();
      const h=median(samples.map(s=>s.h)),elbows=samples.map(s=>s.e).filter(Number.isFinite),e=elbows.length?median(elbows):null;
      // A rejection is explained for a moment rather than for one frame the user never sees.
      angleNow=e===null?null:Math.round(e);message=notice&&t<notice.until?notice.text:'';
      if(h<cfg.rackMin){armed=false;rackLevel=null;peak=null;peakElbow=null;locked=false;phase='waiting';message='Bring the weight up to your shoulders to start.'}
      else if(!armed){if(h<=cfg.rackMax){armed=true;phase='rack';rackLevel=h;repStart=t}else{phase='waiting';message='Lower to the start position at your shoulders.'}}
      else{
        if(phase==='rack'&&h<cfg.leaveRack){rackLevel=Math.min(rackLevel,h);repStart=t}
        else{
          if(phase==='rack'){phase='pressing';peak=h;peakElbow=e;locked=false}
          peak=Math.max(peak,h);if(e!==null)peakElbow=Math.max(peakElbow??e,e);
          // Once this lifter has shown real lockouts, a rep must reach most of that height too. A
          // three-quarter press can read nearly straight-armed face-on; it cannot fake the reach.
          const shown=reps.slice(-3).map(r=>r.peakHeight).filter(Number.isFinite),lockHeight=shown.length?Math.max(cfg.lockHeight,0.85*median(shown)):cfg.lockHeight;
          const risen=h-rackLevel>=cfg.minTravel,extended=e!==null&&e>=cfg.lockElbow;
          if(risen&&((extended&&h>=lockHeight)||h>=Math.max(cfg.highLock,lockHeight))){locked=true;phase='lockout'}
          else if(h<=cfg.rackMax){
            const ms=t-repStart;
            const reject=text=>{rejected++;message=text;notice={text,until:t+1500}};
            if(locked){if(ms>=minActiveMs&&ms<=maxActiveMs)reps.push({index:reps.length+1,ms,extreme:peakElbow===null?null:Math.round(peakElbow),peakHeight:round2(peak),rackHeight:round2(rackLevel)});else reject(ms<minActiveMs?'Skipped a bounce.':'Skipped a long pause.')}
            else if(peak-rackLevel>=cfg.partialTravel)reject('Partial rep. Press all the way to lockout to count it.');
            phase='rack';rackLevel=h;peak=null;peakElbow=null;locked=false;repStart=t;
          }else phase=locked?(h<peak-0.12?'lowering':'lockout'):'pressing';
        }
      }
      signal={height:round2(h),elbow:angleNow,rackLevel:round2(rackLevel),peak:round2(peak),locked};
      return state();
    }
    return {push,reset,interrupt,state,rule:config,inverted:false};
  }

  const originalCreateCounter=counter.createCounter;
  function createCounter(rule,options){return rule&&rule.detector==='vertical_press_phase'?createVerticalPressCounter(rule,options):originalCreateCounter(rule,options)}

  // One frame through the whole chain. The live camera runtime and offline trace replay both use
  // this, so a recorded phone session replays through exactly the logic the phone ran.
  const MIN_VIS=0.32;
  function createSession(ruleOrExercise,options={}){
    const rule=ruleOrExercise&&Array.isArray(ruleOrExercise.joint)?ruleOrExercise:ruleFor(ruleOrExercise);
    if(!rule)return null;
    const reps=counter.createCounter(rule),view=views?.createViewClassifier?views.createViewClassifier(options.view):null;
    let blockedFrames=0,degradedFrames=0;const framingMisses={};let last=null;
    function push(frame){
      const landmarks=frame?.landmarks||null,t=Number(frame?.t)||0,aspect=Number(frame?.aspect)||1,side=frame?.side===1?1:0;
      const viewState=view?view.push(landmarks,t,aspect):null,gateState=viewGate(rule,viewState);
      const framed=landmarks?counter.framing(rule,landmarks,side,MIN_VIS):{ok:false,missing:[],message:null};
      if(landmarks&&!framed.ok)for(const part of framed.missing)framingMisses[part]=(framingMisses[part]||0)+1;
      if(gateState.status==='blocked')blockedFrames++;else if(gateState.status==='degraded')degradedFrames++;
      const state=reps.push({landmarks,t,aspect,side,subjectPresent:frame?.subjectPresent??!!landmarks,minVisibility:MIN_VIS,framed:framed.ok&&gateState.status!=='blocked'});
      last={state,view:viewState,gate:gateState,framed};return last;
    }
    function diagnostics(){return {family:rule.detectorFamily||rule.id,detector:rule.detector||'angle',validated:!!rule.validated,override:rule.override||null,view:view?{...view.state(),histogram:view.histogram()}:null,viewGate:last?.gate||null,viewBlockedFrames:blockedFrames,viewDegradedFrames:degradedFrames,framingMisses:{...framingMisses}}}
    function reset(){reps.reset?.();view?.reset?.();blockedFrames=0;degradedFrames=0;for(const k of Object.keys(framingMisses))delete framingMisses[k];last=null}
    return {rule,counter:reps,view,push,reset,interrupt:()=>reps.interrupt(),state:()=>reps.state(),last:()=>last,diagnostics};
  }

  // Compact landmark trace for offline replay of real phone sessions. Integers keep a 20 s trace
  // small enough to copy from a phone: x/y in thousandths of the frame, visibility in hundredths,
  // plus torso z for the view classifier.
  const TRACE_POINTS=[0,11,12,13,14,15,16,23,24,25,26,27,28],TRACE_Z=[11,12,23,24];
  function encodeTraceFrame(landmarks){
    if(!Array.isArray(landmarks))return null;const out=[];
    for(const i of TRACE_POINTS){const p=landmarks[i];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){out.push(0,0,0);continue}const v=Math.min(p.visibility??1,p.presence??1);out.push(Math.round(p.x*1000),Math.round(p.y*1000),Math.round((Number.isFinite(v)?v:0)*100))}
    for(const i of TRACE_Z){const z=landmarks[i]?.z;out.push(Number.isFinite(z)?Math.round(z*1000):null)}
    return out;
  }
  function decodeTraceFrame(data){
    if(!Array.isArray(data))return null;const lm=Array.from({length:33},()=>({x:0.5,y:0.5,visibility:0,presence:0}));
    TRACE_POINTS.forEach((idx,k)=>{const v=data[k*3+2]/100;lm[idx]={x:data[k*3]/1000,y:data[k*3+1]/1000,visibility:v,presence:v}});
    TRACE_Z.forEach((idx,k)=>{const z=data[TRACE_POINTS.length*3+k];if(Number.isFinite(z))lm[idx].z=z/1000});
    return lm;
  }
  // trace: {exercise, aspect, frames:[[t, side, flags, data|null]]}; flags bit 1 = side changed.
  function replayTrace(trace,exercise){
    const session=createSession(exercise||trace?.exercise);if(!session)return null;
    const aspect=Number(trace?.aspect)||1;let result=null;
    for(const row of trace?.frames||[]){const [t,side,flags,data]=row;if(flags&1)session.interrupt();result=session.push({landmarks:decodeTraceFrame(data),t,aspect,side})}
    return {state:session.state(),last:result,diagnostics:session.diagnostics()};
  }

  counter.ruleFor=ruleFor;counter.createCounter=createCounter;counter.MOVEMENT_FAMILIES=FAMILIES;counter.familyFor=familyFor;counter.cameraSupported=supported;counter.cameraCoverage=coverage;counter.__ironSixMovementFamiliesV1=true;counter.__ironSixMovementFamiliesV2=true;
  const api={FAMILIES,OVERRIDES,PRESS,ruleFor,familyFor,supported,coverage,canonical,viewGate,createVerticalPressCounter,createContinuity,createSession,encodeTraceFrame,decodeTraceFrame,replayTrace,TRACE_POINTS};
  if(typeof window!=='undefined')window.IronSixMovementDetectors=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
