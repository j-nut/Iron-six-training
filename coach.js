(() => {
  const root = document.getElementById('app');
  if (!root || window.__ironSixCoachLoaded) return;
  window.__ironSixCoachLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
    .bottom-inner{grid-template-columns:repeat(5,1fr)}
    .coach-quick{display:flex;gap:8px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.coach-quick::-webkit-scrollbar{display:none}
    .coach-chip{white-space:nowrap;border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;padding:10px 12px;font-size:12px;font-weight:750;min-height:42px}
    .coach-chat{display:flex;flex-direction:column;gap:10px;margin-top:12px}.coach-msg{max-width:88%;padding:12px 14px;border-radius:16px;line-height:1.5;font-size:14px;white-space:pre-wrap}.coach-msg.user{align-self:flex-end;background:var(--accent);color:#0b0c0f;border-bottom-right-radius:5px}.coach-msg.assistant{align-self:flex-start;background:var(--surface);border:1px solid var(--line);color:var(--text);border-bottom-left-radius:5px}.coach-msg .meta{display:block;color:var(--muted);font-size:10px;margin-top:7px}.coach-compose{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px}.coach-compose textarea{resize:none;min-height:50px;max-height:140px;background:var(--surface2);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:13px;font-size:16px;outline:none}.coach-compose textarea:focus{border-color:var(--accent)}.coach-send{min-width:76px}.coach-action{margin-top:9px;border:1px solid rgba(157,223,104,.3);background:rgba(157,223,104,.08);border-radius:12px;padding:10px}.coach-action p{margin:0 0 8px;color:var(--muted);font-size:12px}.coach-video{margin-top:10px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#000}.coach-video iframe{display:block;width:100%;aspect-ratio:16/9;border:0}.coach-video-link{display:block;padding:11px 12px;color:var(--accent);text-decoration:none;background:var(--surface2);font-size:13px;font-weight:750}.coach-status{color:var(--muted);font-size:12px;margin-top:8px}.coach-thinking{opacity:.75}.coach-disclaimer{font-size:11px;color:var(--muted);line-height:1.45;margin-top:10px}
    @media(max-width:390px){.navbtn{font-size:10px;padding-left:3px;padding-right:3px}.coach-msg{max-width:94%}}
  `;
  document.head.appendChild(style);

  const nav = document.querySelector('.bottom-inner');
  const profilesBtn = nav?.querySelector('[data-view="profiles"]');
  const coachBtn = document.createElement('button');
  coachBtn.className = 'navbtn';
  coachBtn.dataset.view = 'coach';
  coachBtn.textContent = 'Coach';
  if (profilesBtn) nav.insertBefore(coachBtn, profilesBtn); else nav?.appendChild(coachBtn);

  const main = root.querySelector('main');
  const section = document.createElement('section');
  section.id = 'coach';
  section.className = 'view';
  section.innerHTML = `
    <div class="hero">
      <div class="eyebrow">AI training coach</div>
      <h1>Ask about this workout.</h1>
      <p id="coachHeroText">Iron Six Coach can see the active profile, equipment, today’s prescription, logged sets, and recent training history.</p>
      <div class="badge-row"><span class="badge">Context-aware</span><span class="badge">Exercise swaps</span><span class="badge">Load advice</span><span class="badge">Video search</span></div>
    </div>
    <div class="section">
      <div class="section-head"><div><h2>Quick asks</h2><small>Uses the current workout automatically</small></div></div>
      <div class="coach-quick" id="coachQuick">
        <button type="button" class="coach-chip">What should I do next?</button>
        <button type="button" class="coach-chip">Are my suggested weights right?</button>
        <button type="button" class="coach-chip">Give me warm-up sets</button>
        <button type="button" class="coach-chip">Do I need a deload?</button>
        <button type="button" class="coach-chip">Show me a demo of my first exercise</button>
      </div>
      <div class="coach-chat" id="coachChat"></div>
      <form class="coach-compose" id="coachForm">
        <textarea id="coachInput" rows="2" maxlength="1400" placeholder="Ask to change an exercise, explain a weight, find a form video…" aria-label="Ask Iron Six Coach"></textarea>
        <button class="btn primary coach-send" type="submit">Ask</button>
      </form>
      <div class="coach-status" id="coachStatus"></div>
      <div class="coach-disclaimer">Training guidance only. For sharp pain, sudden injury, chest pain, fainting, neurological symptoms, or other concerning symptoms, stop the provoking activity and seek appropriate medical care.</div>
    </div>`;
  main.appendChild(section);

  coachBtn.addEventListener('click', () => showView('coach'));
  document.querySelectorAll('.navbtn').forEach(b => {
    if (!b.__coachBound) {
      b.__coachBound = true;
      b.addEventListener('click', () => showView(b.dataset.view));
    }
  });

  const SWAPS = {
    'Primary squat': [
      ['Barbell Back Squat',['barbell','rack'],'1 top set × 4–6, then 3 × 6–8',4,'Priority','squat'],
      ['Paused Barbell Back Squat',['barbell','rack'],'4 × 4–6 • 1 sec pause',4,'Priority','squat'],
      ['Landmine Squat',['barbell','landmine'],'4 × 8–12',4,'Landmine','squat'],
      ['Goblet Squat',['dumbbells'],'4 × 8–15',4,'Priority','squat'],
      ['Tempo Bodyweight Squat',[],'4 × 15–25 • 3 sec down',4,'Priority','squat']
    ],
    'Hip hinge': [
      ['Barbell Romanian Deadlift',['barbell'],'3 × 6–10',3,'Posterior','hinge'],
      ['Landmine Romanian Deadlift',['barbell','landmine'],'3 × 8–12',3,'Posterior','hinge'],
      ['Dumbbell Romanian Deadlift',['dumbbells'],'3 × 10–15',3,'Posterior','hinge'],
      ['Single-Leg Hip Hinge',[],'3 × 12–15 each leg',3,'Posterior','hinge']
    ],
    'Single-leg work': [
      ['Landmine Reverse Lunge',['barbell','landmine'],'3 × 8–12 each leg',3,'Landmine','split_squat'],
      ['Dumbbell Bulgarian Split Squat',['dumbbells','bench'],'3 × 8–12 each leg',3,'Hypertrophy','split_squat'],
      ['Bodyweight Split Squat',[],'3 × 15–20 each leg',3,'Hypertrophy','split_squat']
    ],
    'Horizontal press': [
      ['Barbell Bench Press',['barbell','rack','bench'],'4 × 4–6',4,'Priority','bench'],
      ['Incline Barbell Bench Press',['barbell','rack','bench'],'4 × 5–8',4,'Priority','bench'],
      ['Dumbbell Bench Press',['dumbbells','bench'],'4 × 8–12',4,'Priority','bench'],
      ['Push-Up',[],'4 × 8–20',4,'Priority','bench']
    ],
    'Vertical press': [
      ['Barbell Overhead Press',['barbell','rack'],'4 × 5–8',4,'Priority','overhead_press'],
      ['Half-Kneeling Landmine Press',['barbell','landmine'],'4 × 8–12 each arm',4,'Landmine','overhead_press'],
      ['Dumbbell Shoulder Press',['dumbbells'],'4 × 8–12',4,'Priority','overhead_press'],
      ['Pike Push-Up',[],'4 × 8–15',4,'Priority','overhead_press']
    ],
    'Horizontal pull': [
      ['Barbell Row',['barbell'],'4 × 6–10',4,'Priority','row'],
      ['Landmine Row',['barbell','landmine'],'4 × 6–10',4,'Landmine','row'],
      ['Meadows Row',['barbell','landmine'],'4 × 6–10 each side',4,'Landmine','row'],
      ['One-Arm Dumbbell Row',['dumbbells','bench'],'4 × 8–12 each side',4,'Priority','row'],
      ['Band Row',['bands'],'4 × 12–20',4,'Priority','row']
    ],
    'Vertical pull': [
      ['Pull-Up',['pullup'],'4 × 5–10',4,'Priority','pullup'],
      ['Chin-Up',['pullup'],'4 × 5–10',4,'Priority','pullup'],
      ['Band Lat Pulldown',['bands'],'4 × 10–15',4,'Priority','pullup'],
      ['Prone Lat Pull',[],'4 × 10–15',4,'Priority','pullup']
    ],
    'Triceps press': [
      ['Close-Grip Bench Press',['barbell','rack','bench'],'3 × 6–10',3,'Triceps','triceps'],
      ['Band Pressdown',['bands'],'3 × 12–20',3,'Triceps','triceps'],
      ['Diamond Push-Up',[],'3 × 8–20',3,'Triceps','triceps']
    ],
    'Elbow flexion': [
      ['Barbell Curl',['barbell'],'3 × 6–10',3,'Biceps','curl'],
      ['Dumbbell Curl',['dumbbells'],'3 × 8–12',3,'Biceps','curl'],
      ['Band Curl',['bands'],'3 × 12–20',3,'Biceps','curl']
    ]
  };

  function optionObject(row, base) {
    return { name:row[0], requires:row[1], prescription:row[2], sets:row[3], tag:row[4], base, seedKey:row[5], priority:2 };
  }

  function availableOptions(u, exercise) {
    const dynamic=typeof swapOptionsForExercise==='function'?swapOptionsForExercise(u,exercise):[];
    if(dynamic.length)return dynamic;
    return (SWAPS[exercise.base] || []).map(x => optionObject(x, exercise.base)).filter(o => exerciseAvailable(u,o)).filter(o => o.name !== exercise.name);
  }

  function coachContext() {
    const u = activeUser();
    const workout = finalWorkout(u);
    const allowedSwaps = workout.map((e,i) => ({ targetIndex:i, targetName:e.name, targetBase:e.base, replacements:availableOptions(u,e).map(o=>o.name) })).filter(x=>x.replacements.length);
    const today = Object.entries(u.today || {}).map(([key,s]) => ({ key, weight:s.weight, reps:s.reps, rir:s.rir, done:!!s.done })).filter(x=>x.weight||x.reps||x.done).slice(-30);
    return {
      profile:{ name:u.name, bodyWeight:u.weight, age:u.age, heightIn:u.heightIn, trainingLevel:u.trainingLevel, equipment:[...EQUIPMENT.filter(([k])=>has(u,k)).map(([,label])=>label),...(u.customEquipment||[])], capacities:u.capacities, workoutMinutes:u.workoutMinutes },
      readiness:u.readiness,
      workout:workout.map((e,i)=>({ index:i, name:e.name, prescription:e.prescription, base:e.base, suggested:suggestedLoadObject(u,e,i) })),
      today,
      history:(u.history||[]).slice(0,8).map(h=>({ name:h.name, date:h.date, sets:h.sets, plannedSets:h.plannedSets, duration:h.duration, variant:h.variant, details:h.details })),
      allowedSwaps,
      program:{ currentWorkoutKey:u.program?.currentWorkoutKey, exposures:u.program?.exposures, unlocked:u.program?.unlocked, lastAdaptation:u.program?.lastAdaptation }
    };
  }

  function messages() {
    const u=activeUser();u.coachMessages=u.coachMessages||[];return u.coachMessages;
  }

  function renderMessages() {
    const chat=document.getElementById('coachChat'), arr=messages();
    if(!arr.length){chat.innerHTML='<div class="coach-msg assistant">I can see today’s workout and your profile. Ask me to explain a suggested weight, swap an exercise, build warm-up sets, check your progress, or find a demo video.</div>';return;}
    chat.innerHTML='';
    arr.slice(-20).forEach(m=>chat.appendChild(renderMessage(m)));
    const guide=document.getElementById('exerciseGuidePanel');
    if(window.__ironSixGuideFocus&&guide)guide.scrollIntoView({behavior:'smooth',block:'start'});
    else chat.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function renderMessage(m){
    const box=document.createElement('div');box.className=`coach-msg ${m.role==='user'?'user':'assistant'}`;
    (m.videos||[]).forEach(v=>box.appendChild(renderVideo(v)));
    const text=document.createElement('div');text.textContent=m.text||'';box.appendChild(text);
    (m.actions||[]).forEach(a=>{const wrap=document.createElement('div');wrap.className='coach-action';const p=document.createElement('p');p.textContent=a.reason||actionLabel(a);const btn=document.createElement('button');btn.type='button';btn.className='btn secondary';btn.textContent=`Apply: ${actionLabel(a)}`;btn.addEventListener('click',()=>applyAction(a,btn));wrap.append(p,btn);box.appendChild(wrap)});
    if(m.model){const meta=document.createElement('span');meta.className='meta';meta.textContent=m.model;box.appendChild(meta)}
    return box;
  }

  function actionLabel(a){if(a.type==='set_duration')return `${a.minutes} minute workout`;if(a.type==='swap_exercise')return `swap to ${a.replacementName}`;return 'coach change'}

  function applyAction(a,btn){
    const u=activeUser();
    if(a.type==='set_duration'){
      const n=Math.max(10,Math.min(120,Number(a.minutes)||0));if(!n)return;setWorkoutMinutes(n);btn.disabled=true;btn.textContent='Applied';return;
    }
    if(a.type==='swap_exercise'){
      const workout=finalWorkout(u),idx=Number(a.targetIndex),target=workout[idx];if(!target){toast('That exercise is no longer in this workout');return;}
      const option=availableOptions(u,target).find(x=>x.name===a.replacementName);if(!option){toast('That swap is not available with this profile');return;}
      if(typeof applyExerciseSwap!=='function'||!applyExerciseSwap(idx,option)){toast('That exercise could not be swapped');return;}
      btn.disabled=true;btn.textContent='Applied';return;
    }
  }

  function youtubeEmbed(url){try{const u=new URL(url);if(u.hostname.includes('youtu.be'))return `https://www.youtube.com/embed/${u.pathname.slice(1).split('/')[0]}`;if(u.hostname.includes('youtube.com')){const id=u.searchParams.get('v');if(id)return `https://www.youtube.com/embed/${id}`;if(u.pathname.startsWith('/shorts/'))return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`}}catch(_){}return null}
  function renderVideo(v){const wrap=document.createElement('div');wrap.className='coach-video';const embed=youtubeEmbed(v.url);if(embed){const f=document.createElement('iframe');f.src=embed;f.loading='lazy';f.title=v.title||'Exercise demonstration';f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';f.allowFullscreen=true;wrap.appendChild(f)}const a=document.createElement('a');a.className='coach-video-link';a.href=v.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=v.title||'Open exercise demo';wrap.appendChild(a);return wrap}

  async function askCoach(prompt){
    const input=document.getElementById('coachInput'),status=document.getElementById('coachStatus'),send=document.querySelector('.coach-send');
    const message=String(prompt||input.value||'').trim();if(!message)return;
    const arr=messages();arr.push({role:'user',text:message,ts:Date.now()});uTrim(arr);saveData();renderMessages();input.value='';send.disabled=true;status.textContent='Coach is thinking…';
    try{
      const r=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,context:coachContext()})});
      const contentType=r.headers.get('content-type')||'';
      if(!contentType.includes('application/json'))throw new Error('Coach returned an invalid response');
      const out=await r.json();if(!r.ok)throw new Error(out.error||'Coach request failed');
      arr.push({role:'assistant',text:out.reply||'No response.',actions:out.actions||[],videos:out.videos||[],followUps:out.followUps||[],model:out.model,ts:Date.now()});uTrim(arr);saveData();renderMessages();
      if(window.__ironSixGuideFocus){requestAnimationFrame(()=>document.getElementById('exerciseGuidePanel')?.scrollIntoView({behavior:'smooth',block:'start'}));window.__ironSixGuideFocus=false}
      if(out.followUps?.length)renderFollowUps(out.followUps);
      status.textContent='';
    }catch(err){arr.push({role:'assistant',text:`Coach is unavailable: ${err.message}. Please try again.`,ts:Date.now()});uTrim(arr);saveData();renderMessages();status.textContent='';}
    finally{send.disabled=false;input.focus()}
  }

  function uTrim(arr){while(arr.length>30)arr.shift()}
  function renderFollowUps(items){const quick=document.getElementById('coachQuick');quick.innerHTML='';items.slice(0,3).forEach(text=>{const b=document.createElement('button');b.type='button';b.className='coach-chip';b.textContent=text;b.addEventListener('click',()=>askCoach(text));quick.appendChild(b)})}

  document.getElementById('coachForm').addEventListener('submit',e=>{e.preventDefault();askCoach()});
  document.getElementById('coachInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askCoach()}});
  document.querySelectorAll('#coachQuick .coach-chip').forEach(b=>b.addEventListener('click',()=>askCoach(b.textContent)));

  const originalRenderAll = window.renderAll;
  window.renderAll = function(){originalRenderAll();renderMessages();const u=activeUser();const h=document.getElementById('coachHeroText');if(h)h.textContent=`Coaching ${u.name} with ${u.workoutMinutes||60} minutes available and ${equipmentLabel(u).toLowerCase()}.`};
  renderMessages();
})();

(() => {
  if(window.__ironSixDynamicWorkoutsLoaded)return;
  window.__ironSixDynamicWorkoutsLoaded=true;

  function hasWorkoutDraft(u){return Object.values(u.today||{}).some(set=>set&&(set.done||String(set.weight||'').trim()||String(set.reps||'').trim()||String(set.rir||'').trim()))}
  function equipmentId(item){return item.custom?`custom:${item.name.toLowerCase()}`:`builtin:${item.key}`}
  function builtinItem(key,label){return {id:`builtin:${key}`,key,name:label,custom:false}}
  function customItem(name){return {id:`custom:${name.toLowerCase()}`,name,custom:true}}
  function pruneGeneratedExercises(u){u.program.generatedExercises=(u.program.generatedExercises||[]).filter(exercise=>exerciseAvailable(u,exercise));clearCurrentSelectionCache(u)}

  window.renderCustomEquipmentEditor=function renderCustomEquipmentEditor(){
    const u=activeUser(),grid=document.getElementById('equipmentEditor');
    if(!grid)return;
    let panel=document.getElementById('customEquipmentPanel');
    if(!panel){panel=document.createElement('div');panel.id='customEquipmentPanel';panel.className='custom-equipment-panel';grid.after(panel)}
    const generation=u.program?.equipmentGeneration||{},items=(u.customEquipment||[]).map(name=>`<span class="custom-equipment-chip"><span>${escapeHtml(name)}</span><button type="button" data-remove-custom="${escapeHtml(name)}" aria-label="Remove ${escapeHtml(name)}">×</button></span>`).join('');
    const state=generation.state==='loading'?`Groq is building exercise options for ${escapeHtml(generation.equipment||'your equipment')}…`:generation.state==='ready'?escapeHtml(generation.message||'AI exercise options are ready.'):generation.state==='error'?escapeHtml(generation.message||'AI options will retry the next time equipment is added.'):'Add any equipment that is not listed above.';
    panel.innerHTML=`<div class="custom-equipment-label">Other equipment</div><div class="custom-equipment-add"><input id="customEquipmentInput" type="text" maxlength="48" placeholder="Kettlebell, cable machine, TRX…"><button class="btn secondary" id="addCustomEquipment" type="button">Add</button></div><div class="custom-equipment-chips">${items||'<span class="custom-equipment-empty">No custom equipment added</span>'}</div><div class="custom-equipment-status" data-state="${escapeHtml(generation.state||'idle')}">${state}</div>`;
    panel.querySelector('#addCustomEquipment').addEventListener('click',addCustomEquipment);
    panel.querySelector('#customEquipmentInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addCustomEquipment()}});
    panel.querySelectorAll('[data-remove-custom]').forEach(button=>button.addEventListener('click',()=>removeCustomEquipment(button.dataset.removeCustom)));
  };

  function addCustomEquipment(){
    const u=activeUser(),input=document.getElementById('customEquipmentInput'),name=normalizeEquipmentName(input?.value);
    if(!name){toast('Enter an equipment name');return}
    if(hasWorkoutDraft(u)){toast('Finish or reset the current workout before changing equipment');return}
    const known=[...EQUIPMENT.map(([,label])=>label),...(u.customEquipment||[])];
    if(known.some(value=>value.toLowerCase()===name.toLowerCase())){toast('That equipment is already listed');return}
    if((u.customEquipment||[]).length>=16){toast('Custom equipment is limited to 16 items');return}
    u.customEquipment=[...(u.customEquipment||[]),name];
    u.coachOverrides=null;
    clearCurrentSelectionCache(u);
    saveData();renderAll();toast(`${name} added • building exercise options`);
    refreshEquipmentExercises(u,[customItem(name)]);
  }

  function removeCustomEquipment(name){
    const u=activeUser(),clean=normalizeEquipmentName(name);
    if(hasWorkoutDraft(u)){toast('Finish or reset the current workout before changing equipment');return}
    u.customEquipment=(u.customEquipment||[]).filter(value=>value.toLowerCase()!==clean.toLowerCase());
    u.program.generatedExercises=(u.program.generatedExercises||[]).filter(exercise=>exercise.equipmentId!==`custom:${clean.toLowerCase()}`&&!((exercise.requiresCustom||[]).some(value=>value.toLowerCase()===clean.toLowerCase())));
    u.coachOverrides=null;
    clearCurrentSelectionCache(u);
    saveData();renderAll();toast(`${clean} removed`);
  }

  window.refreshEquipmentExercises=async function refreshEquipmentExercises(user,equipment){
    const requested=(equipment||[]).map(item=>({...item,id:item.id||equipmentId(item)})).slice(0,8);
    if(!requested.length)return;
    const userId=user.id,names=requested.map(item=>item.name).join(', ');
    user.program.equipmentGeneration={state:'loading',equipment:names,message:'',updatedAt:Date.now()};
    saveData();renderCustomEquipmentEditor();
    try{
      const response=await fetch('/api/equipment-exercises',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({equipment:requested,existingNames:(user.program.generatedExercises||[]).map(x=>x.name).slice(0,80),profile:{trainingLevel:user.trainingLevel,workoutMinutes:user.workoutMinutes}})}),output=await response.json();
      if(!response.ok)throw new Error(output.error||'Exercise generation failed');
      const target=data.users.find(candidate=>candidate.id===userId);
      if(!target)return;
      const ids=new Set(requested.map(item=>item.id)),incoming=(Array.isArray(output.exercises)?output.exercises:[]).filter(x=>x&&ids.has(String(x.equipmentId))&&x.name&&x.base&&x.seedKey).slice(0,40);
      target.program.generatedExercises=[...(target.program.generatedExercises||[]).filter(x=>!ids.has(String(x.equipmentId))),...incoming].slice(0,80);
      pruneGeneratedExercises(target);
      target.program.equipmentGeneration={state:'ready',equipment:names,message:`${incoming.length} new exercise option${incoming.length===1?'':'s'} added by ${output.model||'Groq'}.`,updatedAt:Date.now(),model:output.model||null};
      saveData();if(activeUser().id===userId)renderAll();
    }catch(error){
      const target=data.users.find(candidate=>candidate.id===userId);
      if(!target)return;
      target.program.equipmentGeneration={state:'error',equipment:names,message:'Could not expand the exercise library right now. Your equipment is still saved.',updatedAt:Date.now()};
      saveData();if(activeUser().id===userId)renderCustomEquipmentEditor();
    }
  };

  window.applyExerciseSwap=function applyExerciseSwap(index,option){
    const u=activeUser(),workout=finalWorkout(u),target=workout[index];
    if(!target||!option||option.base!==target.base||!exerciseAvailable(u,option))return false;
    const prefix=`${index}-`,logged=Object.entries(u.today||{}).filter(([key,set])=>key.startsWith(prefix)&&set&&(set.done||String(set.weight||'').trim()||String(set.reps||'').trim()||String(set.rir||'').trim()));
    if(logged.length&&!confirm(`Swap ${target.name} and clear only its ${logged.length} entered set${logged.length===1?'':'s'}?`))return false;
    for(const key of Object.keys(u.today||{}))if(key.startsWith(prefix))delete u.today[key];
    const key=u.program?.currentWorkoutKey||'lower_strength',exposure=Number(u.program?.exposures?.[key])||0;
    if(!u.coachOverrides||u.coachOverrides.workoutKey!==key||Number(u.coachOverrides.exposure)!==exposure)u.coachOverrides={workoutKey:key,exposure,byIndex:{},byBase:{}};
    u.coachOverrides.byIndex=u.coachOverrides.byIndex||{};
    const {_alternatives,...replacement}=option;
    u.coachOverrides.byIndex[index]=replacement;
    u.sessionCalibration=null;
    saveData();renderExercises();renderTodayHeader();toast(`${target.name} → ${option.name}`);return true;
  };

  window.openExerciseSwap=function openExerciseSwap(index){
    const u=activeUser(),exercise=finalWorkout(u)[index],modal=document.getElementById('exerciseSwapModal');
    if(!exercise||!modal)return;
    const options=swapOptionsForExercise(u,exercise),title=modal.querySelector('#exerciseSwapTitle'),summary=modal.querySelector('#exerciseSwapSummary'),list=modal.querySelector('#exerciseSwapList');
    title.textContent=`Swap ${exercise.name}`;
    summary.textContent=`Choose another ${exercise.base.toLowerCase()} movement. The muscle target and programming role stay the same.`;
    list.innerHTML=options.length?options.map((option,optionIndex)=>`<button type="button" class="exercise-swap-option" data-swap-option="${optionIndex}"><span><strong>${escapeHtml(option.name)}</strong><small>${escapeHtml(option.prescription)}${option.equipmentName?` • ${escapeHtml(option.equipmentName)}`:''}</small></span>${option.source==='groq'?'<b>AI option</b>':'<b>Swap</b>'}</button>`).join(''):'<div class="note">No equivalent movement is available with this profile’s equipment.</div>';
    list.querySelectorAll('[data-swap-option]').forEach(button=>button.addEventListener('click',()=>{const option=options[Number(button.dataset.swapOption)];if(applyExerciseSwap(index,option))modal.classList.remove('show')}));
    modal.classList.add('show');
  };

  function enhanceExerciseSwaps(){
    const u=activeUser(),workout=finalWorkout(u);
    document.querySelectorAll('[data-exercise-index]').forEach(card=>{
      const index=Number(card.dataset.exerciseIndex),exercise=workout[index],help=card.querySelector('.exercise-help-btn');
      if(!exercise||!help||card.querySelector('.exercise-swap-btn'))return;
      const options=swapOptionsForExercise(u,exercise),button=document.createElement('button');
      button.type='button';button.className='exercise-swap-btn';button.textContent='↔ Swap exercise';button.disabled=!options.length;
      button.title=options.length?`Choose another ${exercise.base.toLowerCase()} exercise`:'No equivalent exercise is available with this equipment';
      button.addEventListener('click',()=>openExerciseSwap(index));help.after(button);
    });
  }

  function saveProfileWithEquipmentAi(){
    const before=activeUser(),beforeId=before.id,prior={...(before.equipment||{})};
    saveProfile();
    const user=data.users.find(candidate=>candidate.id===beforeId);
    if(!user)return;
    const added=EQUIPMENT.filter(([key])=>!prior[key]&&user.equipment?.[key]).map(([key,label])=>builtinItem(key,label)),changed=EQUIPMENT.some(([key])=>!!prior[key]!==!!user.equipment?.[key]);
    if(changed){pruneGeneratedExercises(user);user.coachOverrides=null;saveData();renderAll()}
    if(added.length)refreshEquipmentExercises(user,added);
  }

  function installDynamicUi(){
    if(!document.getElementById('dynamicWorkoutStyles')){const style=document.createElement('style');style.id='dynamicWorkoutStyles';style.textContent='.exercise-help-btn,.exercise-swap-btn{display:inline-flex;align-items:center;border:0;background:none;padding:7px 10px 2px 0;font-size:12px;font-weight:800;cursor:pointer}.exercise-help-btn{color:var(--accent)}.exercise-swap-btn{color:#8fb8ff}.exercise-swap-btn:disabled{color:var(--muted);opacity:.45;cursor:not-allowed}.custom-equipment-panel{margin-top:12px;padding:12px;border:1px solid var(--line);background:var(--surface2);border-radius:14px}.custom-equipment-label{font-size:12px;font-weight:850;margin-bottom:8px}.custom-equipment-add{display:grid;grid-template-columns:1fr auto;gap:8px}.custom-equipment-add input{min-width:0;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:11px;padding:11px;font-size:16px}.custom-equipment-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.custom-equipment-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(143,184,255,.1);border:1px solid rgba(143,184,255,.3);border-radius:999px;padding:6px 7px 6px 10px;font-size:12px}.custom-equipment-chip button{border:0;background:none;color:var(--muted);font-size:16px;line-height:1;cursor:pointer}.custom-equipment-empty,.custom-equipment-status{color:var(--muted);font-size:11px}.custom-equipment-status{margin-top:9px;line-height:1.4}.custom-equipment-status[data-state="loading"]{color:#8fb8ff}.custom-equipment-status[data-state="ready"]{color:var(--accent)}.exercise-swap-list{display:grid;gap:8px;max-height:52vh;overflow:auto}.exercise-swap-option{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:13px;padding:12px;text-align:left;cursor:pointer}.exercise-swap-option span,.exercise-swap-option strong,.exercise-swap-option small{display:block}.exercise-swap-option small{color:var(--muted);margin-top:4px}.exercise-swap-option b{color:#8fb8ff;font-size:11px;white-space:nowrap}';document.head.appendChild(style)}
    if(!document.getElementById('exerciseSwapModal')){const modal=document.createElement('div');modal.className='modal-backdrop';modal.id='exerciseSwapModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','exerciseSwapTitle');modal.innerHTML='<div class="modal"><h3 id="exerciseSwapTitle">Swap exercise</h3><p id="exerciseSwapSummary"></p><div class="exercise-swap-list" id="exerciseSwapList"></div><div class="cta"><button class="btn secondary" id="closeExerciseSwap" type="button">Cancel</button></div></div>';document.body.appendChild(modal);modal.querySelector('#closeExerciseSwap').addEventListener('click',()=>modal.classList.remove('show'));modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('show')})}
    const button=document.getElementById('saveProfile');
    if(button&&!button.dataset.dynamicEquipmentSave){const replacement=button.cloneNode(true);replacement.dataset.dynamicEquipmentSave='true';button.replaceWith(replacement);replacement.addEventListener('click',saveProfileWithEquipmentAi)}
  }

  const baseRenderExercises=window.renderExercises;
  window.renderExercises=function(){baseRenderExercises();enhanceExerciseSwaps()};
  const baseRenderAll=window.renderAll;
  window.renderAll=function(){installDynamicUi();baseRenderAll()};
  installDynamicUi();renderAll();
})();
