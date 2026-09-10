/* Camera rep-counting spike. Off unless explicitly enabled with ?pose=1.
   Everything here is the plumbing around pose-rep-counter.js: camera, pose model, overlay,
   and the diagnostics the spike exists to produce. No frame, image or landmark ever leaves
   the device — the count is written into the reps field the lifter already fills in by hand.

   The pose model and its wasm are fetched from a CDN on first use, so this needs a network
   connection the first time and does not work in the packaged Android build yet. */
(() => {
  const FLAG='ironSixPoseSpike';
  const VISION='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
  const WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
  const MODEL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  function readFlag(){
    let stored=null;try{stored=localStorage.getItem(FLAG)}catch(_){}
    const query=new URLSearchParams(location.search||'').get('pose');
    if(query==='1'||query==='0'){stored=query;try{localStorage.setItem(FLAG,query)}catch(_){}}
    return stored==='1';
  }
  if(!readFlag())return;

  const counterApi=window.IronSixRepCounter;
  if(!counterApi)return;

  let sheet=null,video=null,canvas=null,landmarker=null,stream=null,counter=null,rule=null,target=null,raf=0,wake=null;
  let framesSeen=0,framesTracked=0,startedAt=0,fps=0,lastFrameAt=0,lastVideoTime=-1,loading=false;

  const el=id=>document.getElementById(id);
  const setText=(id,value)=>{const node=el(id);if(node)node.textContent=value};

  // ---- the sheet ---------------------------------------------------------------------
  function build(){
    if(sheet)return sheet;
    sheet=document.createElement('div');
    sheet.className='modal-backdrop pose-sheet';sheet.id='poseSheet';
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Count reps with the camera');
    sheet.innerHTML=`<div class="modal pose-modal">
      <div class="pose-head"><div><h3 id="poseTitle">Count reps</h3><p id="poseSetup">Setting up the camera…</p><p class="pose-caution" id="poseCaution" hidden></p></div><div class="pose-count"><strong id="poseReps">0</strong><span>reps</span></div></div>
      <div class="pose-stage"><video id="poseVideo" playsinline muted autoplay></video><canvas id="poseCanvas"></canvas><div class="pose-status" id="poseStatus">Starting…</div></div>
      <div class="pose-readout-row"><span class="pose-readout" id="poseReadout"></span><button type="button" class="pose-copy" id="poseCopy">Copy diagnostics</button></div>
      <div class="helper pose-privacy">Video stays on this device. Nothing is uploaded, recorded or sent to the coach — only the number you choose to keep.</div>
      <div class="cta"><button type="button" class="btn secondary" id="poseClose">Close</button><button type="button" class="btn primary" id="poseUse" disabled>Use count</button></div>
    </div>`;
    document.body.appendChild(sheet);
    video=el('poseVideo');canvas=el('poseCanvas');
    el('poseClose').addEventListener('click',close);
    el('poseUse').addEventListener('click',useCount);
    el('poseCopy').addEventListener('click',copyDiagnostics);
    sheet.addEventListener('click',event=>{if(event.target===sheet)close()});
    return sheet;
  }

  function fail(message){setText('poseStatus',message);setText('poseSetup',message)}

  // ---- camera and model --------------------------------------------------------------
  async function loadModel(){
    if(landmarker)return landmarker;
    const vision=await import(VISION);
    const files=await vision.FilesetResolver.forVisionTasks(WASM);
    const options={baseOptions:{modelAssetPath:MODEL,delegate:'GPU'},runningMode:'VIDEO',numPoses:1};
    try{landmarker=await vision.PoseLandmarker.createFromOptions(files,options)}
    catch(_){landmarker=await vision.PoseLandmarker.createFromOptions(files,{...options,baseOptions:{...options.baseOptions,delegate:'CPU'}})}
    return landmarker;
  }

  async function startCamera(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('This browser cannot open the camera. It needs a secure (https) page.');
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720},frameRate:{ideal:30}},audio:false});
    video.srcObject=stream;
    await video.play().catch(()=>{});
    // Metadata can land after play() resolves, and the aspect correction needs real numbers.
    if(!video.videoWidth)await new Promise(resolve=>{video.addEventListener('loadedmetadata',resolve,{once:true});setTimeout(resolve,3000)});
  }

  async function keepAwake(){try{if(navigator.wakeLock)wake=await navigator.wakeLock.request('screen')}catch(_){}}
  function release(){if(wake){wake.release().catch(()=>{});wake=null}}

  // ---- the loop ----------------------------------------------------------------------
  function tick(){
    raf=requestAnimationFrame(tick);
    if(!landmarker||!video||video.readyState<2||!video.videoWidth)return;
    // The display refreshes at 60Hz and the camera delivers about 30fps, so half these calls
    // would re-detect a frame already seen: wasted inference, and a frame count that no longer
    // means what the diagnostics claim it means.
    if(video.currentTime===lastVideoTime)return;
    lastVideoTime=video.currentTime;
    const now=performance.now();
    if(lastFrameAt)fps=fps?fps*0.9+(1000/Math.max(1,now-lastFrameAt))*0.1:1000/Math.max(1,now-lastFrameAt);
    lastFrameAt=now;
    let landmarks=null;
    try{landmarks=landmarker.detectForVideo(video,now)?.landmarks?.[0]||null}catch(_){}
    framesSeen++;if(landmarks)framesTracked++;
    const state=counter.push({landmarks,t:now,aspect:video.videoWidth/video.videoHeight});
    const frame=landmarks?counterApi.framing(rule,landmarks):{ok:false,message:'No one in frame yet.'};
    draw(landmarks,state);
    paint(state,frame);
  }

  function paint(state,frame){
    setText('poseReps',String(state.reps));
    // Nothing counted is not a count worth writing into the log, so the button stays inert.
    const use=el('poseUse');
    if(use){use.disabled=!state.reps;use.textContent=state.reps?('Use '+state.reps+' reps'):'Use count'}
    const status=!frame.ok?frame.message:(state.message||{waiting:'Stand at the top to start.',top:'Ready.',descending:'Down…',bottom:'Bottom.',ascending:'Up…',lost:'Lost you.'}[state.phase]||'Tracking.');
    setText('poseStatus',status);
    const tracked=framesSeen?Math.round(framesTracked/framesSeen*100):0;
    const durations=state.log.map(r=>r.ms);
    const average=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0;
    setText('poseReadout',[
      `${Math.round(fps)} fps`,
      `${tracked}% of frames tracked`,
      state.angle===null?'no angle':`${state.angle}°`,
      state.rejected?`${state.rejected} rejected`:'0 rejected',
      average?`avg rep ${(average/1000).toFixed(1)}s`:'—'
    ].join(' · '));
  }

  // Draws what is actually being measured rather than a full skeleton: every landmark faintly,
  // the tracked joint chain brightly, and the angle the count is being made from.
  function draw(landmarks,state){
    if(!canvas)return;
    if(canvas.width!==video.videoWidth||canvas.height!==video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight}
    const context=canvas.getContext('2d');if(!context)return;
    context.clearRect(0,0,canvas.width,canvas.height);
    if(!landmarks)return;
    const toPixels=point=>[point.x*canvas.width,point.y*canvas.height];
    context.fillStyle='rgba(255,255,255,.32)';
    for(const point of landmarks){if(point.visibility===undefined||point.visibility>=counterApi.MIN_VISIBILITY){const [x,y]=toPixels(point);context.beginPath();context.arc(x,y,3,0,Math.PI*2);context.fill()}}
    const good=state.phase!=='lost'&&state.phase!=='waiting';
    context.strokeStyle=good?'#2ee580':'#ff8b8b';context.fillStyle=context.strokeStyle;context.lineWidth=Math.max(3,canvas.width/220);
    for(const chain of rule.joint){
      const points=chain.map(index=>landmarks[index]);
      if(points.some(point=>!point||(point.visibility!==undefined&&point.visibility<counterApi.MIN_VISIBILITY)))continue;
      context.beginPath();points.forEach((point,index)=>{const [x,y]=toPixels(point);index?context.lineTo(x,y):context.moveTo(x,y)});context.stroke();
      const [vx,vy]=toPixels(points[1]);
      context.beginPath();context.arc(vx,vy,context.lineWidth*1.8,0,Math.PI*2);context.fill();
    }
    if(state.angle!==null){
      const [ax,ay]=toPixels(landmarks[rule.joint[0][1]]);
      context.save();context.scale(-1,1); // the stage is mirrored for the lifter; text must not be
      context.font=`700 ${Math.round(canvas.width/24)}px system-ui,sans-serif`;context.textAlign='left';
      context.fillText(`${state.angle}°`,-ax+18,ay-14);context.restore();
    }
  }

  // ---- open / close ------------------------------------------------------------------
  async function open(card,exercise){
    if(loading)return;
    rule=counterApi.ruleFor(exercise);
    if(!rule)return;
    build();
    target=card;
    counter=counterApi.createCounter(rule);
    framesSeen=0;framesTracked=0;fps=0;lastFrameAt=0;lastVideoTime=-1;startedAt=Date.now();
    sheet.classList.add('show');
    setText('poseTitle',rule.label+' · '+String(exercise.name||'').slice(0,40));
    setText('poseSetup',rule.setup);
    const caution=counterApi.cautionFor(exercise),cautionNode=el('poseCaution');
    if(cautionNode){cautionNode.textContent=caution||'';cautionNode.hidden=!caution}
    setText('poseReps','0');setText('poseReadout','');
    setText('poseStatus','Starting the camera…');
    const use=el('poseUse');if(use){use.disabled=true;use.textContent='Use count'}
    loading=true;
    try{
      await startCamera();
      setText('poseStatus','Loading the pose model…');
      await loadModel();
      await keepAwake();
      setText('poseStatus','Stand at the top to start.');
      cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
    }catch(error){
      const message=error&&error.name==='NotAllowedError'?'Camera permission was declined. Nothing else changed.':(error&&error.message)||'Could not start the camera.';
      fail(message);
      stop();
    }finally{loading=false}
  }

  function stop(){
    cancelAnimationFrame(raf);raf=0;
    if(stream){for(const track of stream.getTracks())track.stop();stream=null}
    if(video)video.srcObject=null;
    release();
  }

  function close(){stop();if(sheet)sheet.classList.remove('show')}

  function diagnostics(){
    const state=counter?counter.state():null;
    return {rule:rule&&rule.id,reps:state?state.reps:0,rejected:state?state.rejected:0,
      framesSeen,framesTracked,trackedPercent:framesSeen?Math.round(framesTracked/framesSeen*100):0,
      fps:Math.round(fps),seconds:startedAt?Math.round((Date.now()-startedAt)/1000):0,
      resolution:video&&video.videoWidth?`${video.videoWidth}x${video.videoHeight}`:null,
      userAgent:navigator.userAgent,log:state?state.log:[]};
  }

  function copyDiagnostics(){
    const text=JSON.stringify(diagnostics(),null,2);
    const done=()=>{if(typeof toast==='function')toast('Diagnostics copied')};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done).catch(()=>console.log(text));
    else console.log(text);
  }

  // Writes into the reps field the lifter would have typed, then fires the same input event
  // the keyboard fires, so the existing journal/save path runs untouched. The first set that
  // is not already marked done is the one being worked on.
  function applyCount(card,reps){
    const rows=[...card.querySelectorAll('.set-row')];
    const row=rows.find(r=>!r.querySelector('.done')?.classList.contains('active'))||rows[rows.length-1];
    const input=row&&row.querySelector('.reps');
    if(!input)return null;
    input.value=String(reps);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return input;
  }

  function useCount(){
    const state=counter&&counter.state();
    if(!state||!state.reps||!target)return close();
    const input=applyCount(target,state.reps);
    close();
    if(!input)return;
    if(typeof toast==='function')toast('Logged '+state.reps+' reps. Check it before you finish the set.');
    input.focus();
  }

  // ---- injection into the exercise list ----------------------------------------------
  function decorate(){
    const workout=typeof finalWorkout==='function'&&typeof activeUser==='function'?finalWorkout(activeUser()):[];
    for(const card of document.querySelectorAll('#exerciseList [data-exercise-index]')){
      if(card.querySelector('.pose-bar'))continue;
      const exercise=workout[Number(card.dataset.exerciseIndex)];
      if(!exercise||!counterApi.ruleFor(exercise))continue;
      const sets=card.querySelector('.sets');if(!sets)continue;
      const bar=document.createElement('div');
      bar.className='pose-bar';
      bar.innerHTML='<button type="button" class="pose-open">Count reps with camera</button><span>Spike · on-device · check the count</span>';
      bar.querySelector('.pose-open').addEventListener('click',()=>open(card,exercise));
      sets.appendChild(bar);
    }
  }

  // renderExercises is wrapped rather than edited so the spike adds no risk to the logging
  // path it sits next to. Removing this file removes the feature completely.
  const original=window.renderExercises;
  if(typeof original==='function')window.renderExercises=function(){const result=original.apply(this,arguments);try{decorate()}catch(_){}return result};
  window.addEventListener('pagehide',close);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)close()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{try{decorate()}catch(_){}});
  else try{decorate()}catch(_){}

  window.IronSixPoseSpike={open,close,decorate,diagnostics,applyCount};
})();
