(() => {
  let clock=null,steps=[],bound=null,audio=null,wake=null,lastCount=-1,lastCheckpoint=0,note='',muted=false;
  const $=id=>document.getElementById(id);
  const owner=()=>window.ironSixAccountScope||'guest';
  const binding=()=>owner()+':'+activeUser().id+':'+(activeUser().workoutDraft?.id||'');
  const fmt=ms=>{const seconds=Math.ceil(ms/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')};
  function checkpoint(){
    if(!clock||bound!==binding())return;
    const state=clock.state;IronSixJournal.timerCheckpoint(activeUser(),{index:state.index,remaining:state.remaining,running:false});
    window.IronSixCloud?.saveLocal();lastCheckpoint=Date.now();
  }
  function release(){if(wake){wake.release().catch(()=>{});wake=null}}
  async function keepAwake(){try{if(navigator.wakeLock)wake=await navigator.wakeLock.request('screen');if(!clock?.state.running)release()}catch(_){note='Keep this screen open; automatic screen wake is unavailable.'}paint()}
  async function unlockAudio(){
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error();audio=audio||new Audio();await audio.resume();if(audio.state!=='running')throw new Error();return true}
    catch(_){note='Sound unavailable. Follow the visual countdown.';paint();return false}
  }
  function beep(long=false){
    if(muted||!audio||audio.state!=='running')return;
    const oscillator=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime;
    oscillator.frequency.value=long?880:550;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.16,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+(long?.4:.12));
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+(long?.45:.16));oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
  }
  function pause(reason='Paused'){
    if(clock?.state.running){clock.pause(Date.now());checkpoint()}
    release();note=reason;paint();
  }
  function bind(){
    if(bound===binding()&&clock)return;
    release();bound=binding();const u=activeUser();
    steps=circuitTimeline(u,finalWorkout(u));clock=circuitClock(steps,u.workoutDraft?.timer);lastCount=-1;
    note=u.workoutDraft?.timer?'Recovered paused timer. Resume when ready.':'Sound starts when you tap Start. Keep the app visible.';
  }
  async function start(){
    const u=activeUser();IronSixJournal.ensure(u,finalWorkout(u));bind();
    const original=bound;await unlockAudio();if(original!==binding())return;
    clock.start(Date.now());note='';checkpoint();beep(true);keepAwake();paint();
  }
  function skip(){
    if(!clock||clock.state.index>=steps.length)return;
    if(steps[clock.state.index]?.kind==='work'&&!confirm('Skip this work interval? It will not be marked complete.'))return;
    clock.advance(Date.now());checkpoint();beep(true);paint();
  }
  function logInterval(){
    const state=clock?.state;if(!state)return;
    // During rest, offer the work interval that just ended.
    const step=steps[state.index]?.kind==='work'?steps[state.index]:steps[state.index-1];
    if(step?.kind!=='work')return;
    const row=document.querySelector('[data-exercise-index="'+step.index+'"]')?.querySelectorAll('.set-row')[step.setIndex];
    row?.scrollIntoView({behavior:'smooth',block:'center'});row?.querySelector('.reps')?.focus();
  }
  function paint(){
    if(!$('circuitPlayer')||activeUser().trainingMode!=='circuit'||!clock)return;
    const state=clock.state,step=steps[state.index],next=steps.slice(state.index+1).find(x=>x.kind==='work');
    $('circuitPlayer').dataset.phase=step?.kind||'complete';
    $('circuitPhase').textContent=step?(step.round?'Round '+step.round+' / '+step.rounds+' · ':'')+({work:'WORK',rest:'REST',roundRest:'RECOVER',warmup:'WARM UP',cooldown:'COOL DOWN'}[step.kind]):'SESSION COMPLETE';
    $('circuitClock').textContent=fmt(state.remaining);$('circuitTitle').textContent=step?.title||'You’re done with the timer';
    $('circuitCue').textContent=step?.cue||'Check your logged sets, then finish the workout to save your session.';
    $('circuitNext').textContent=next?'Up next: '+next.title:'Next: review your session';
    $('circuitStatus').textContent=note||((wake&&!wake.released?'Screen stays awake · ':'')+(state.running?'Timer running':'Timer paused'));
    $('circuitStart').textContent=state.running?'Pause':state.index===0&&!activeUser().workoutDraft?.timer?'Start circuit':'Resume';
    $('circuitStart').disabled=!step;$('circuitSkip').disabled=!step;
    $('circuitLog').disabled=!(step?.kind==='work'||steps[state.index-1]?.kind==='work');
    $('circuitProgress').max=steps.length;$('circuitProgress').value=state.index;
  }
  function setMode(value){
    const u=activeUser();if(u.trainingMode===value)return;
    if((u.workoutDraft||Object.keys(u.today).length)&&!confirm('Archive this session and switch training modes? Your recorded sets remain recoverable.'))return;
    if(!IronSixJournal.archive(u,'Change training mode'))return;
    u.trainingMode=value;u.today={};u.coachOverrides=null;u.sessionCalibration=null;saveData();renderAll();
  }
  function render(){
    install();if(!$('trainingModes'))return;
    const u=activeUser(),circuit=u.trainingMode==='circuit';
    if(bound&&bound!==binding()){pause('Profile or workout changed');clock=null;bound=null}
    document.querySelectorAll('[data-training-mode]').forEach(b=>{const active=b.dataset.trainingMode===(u.trainingMode||'traditional');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
    $('circuitPlayer').hidden=!circuit;$('circuitSettings').hidden=!circuit;
    $('circuitPace').value=u.circuitPace||'balanced';
    const plan=finalWorkout(u),seconds=sessionSeconds(u,plan);
    $('sessionBudget').textContent=(circuit?'Circuit':'Traditional')+' · about '+Math.ceil(seconds/60)+' of '+u.workoutMinutes+' minutes planned, including '+sessionWarmup(u)/60+' min warm-up, setup/rest, and 1 min cool-down. '+(circuit?'Rotate through one interval of each exercise, then repeat. The last round may be shorter to fit your time.':'Finish each exercise’s sets before moving on. Allow more rest when you need it.');
    $('sessionPriorities').textContent='Priorities: '+[...new Set(plan.flatMap(exerciseMuscles))].join(', ')+'. Major movement patterns come first; overdue muscles receive a reserved slot.';
    const order=document.querySelector('.workout-order-note');if(order)order.textContent=circuit?'Circuit: follow the timer through each station and repeat for the next round. Enter your actual reps and mark sets complete; the timer never invents results.':'Traditional: Finish all sets of the first exercise, resting between sets, then move to the next. Your planned rests are included in the estimate.';
    if(circuit){bind();paint()}
  }
  function install(){
    if($('trainingModes'))return;const section=$('durationSection');if(!section)return;
    const modes=document.createElement('div');modes.id='trainingModes';modes.innerHTML='<h3>How do you want to train?</h3><div class="training-mode-picker"><button type="button" class="btn secondary" data-training-mode="traditional">Traditional<small>Focused sets · full rests</small></button><button type="button" class="btn secondary" data-training-mode="circuit">Guided circuit<small>Timed rounds · sound cues</small></button></div><div id="circuitSettings" hidden><label for="circuitPace">Circuit intensity</label><select id="circuitPace"><option value="steady">Steady · 30s work / 30s rest</option><option value="balanced">Strong · 40s work / 20s rest</option><option value="intense">Intense · 45s work / 20s transition</option></select><p>Includes 45s between rounds. Low energy uses the steady pace. Choose manageable resistance and controlled reps, not maximum loads.</p></div><p id="sessionBudget"></p><p id="sessionPriorities"></p>';
    section.append(modes);modes.querySelectorAll('[data-training-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.trainingMode));
    $('circuitPace').onchange=e=>{const u=activeUser(),value=e.target.value;if(u.workoutDraft&&!confirm('Archive this session and rebuild the circuit pace?')){e.target.value=u.circuitPace||'balanced';return}if(!IronSixJournal.archive(u,'Change circuit pace'))return;u.circuitPace=value;u.today={};saveData();renderAll()};
    const player=document.createElement('div');player.id='circuitPlayer';player.hidden=true;player.innerHTML='<div id="circuitPhase" role="status" aria-live="polite"></div><h2 id="circuitTitle"></h2><div id="circuitClock" role="timer" aria-label="Interval time remaining">0:00</div><p id="circuitCue"></p><p id="circuitNext"></p><progress id="circuitProgress" aria-label="Circuit progress"></progress><div class="circuit-controls"><button type="button" class="btn primary" id="circuitStart">Start circuit</button><button type="button" class="btn secondary" id="circuitSkip">Skip interval</button><button type="button" class="btn secondary" id="circuitLog">Log this set</button></div><div class="circuit-controls"><button type="button" class="btn secondary" id="circuitSound" aria-pressed="true">Sound on</button><button type="button" class="btn secondary" id="circuitTest">Test sound</button></div><p id="circuitStatus" role="status"></p><small>Leaving this screen pauses the timer. Skipped intervals are not marked complete.</small>';
    $('exerciseList')?.before(player);
    $('circuitStart').onclick=()=>clock?.state.running?pause():start();$('circuitSkip').onclick=skip;$('circuitLog').onclick=logInterval;
    $('circuitSound').onclick=()=>{muted=!muted;$('circuitSound').textContent=muted?'Sound off':'Sound on';$('circuitSound').setAttribute('aria-pressed',String(!muted))};
    $('circuitTest').onclick=async()=>{if(await unlockAudio()){muted=false;$('circuitSound').textContent='Sound on';$('circuitSound').setAttribute('aria-pressed','true');beep(true)}};
    const style=document.createElement('style');style.textContent='.training-mode-picker{display:grid;grid-template-columns:1fr 1fr;gap:10px}.training-mode-picker button{min-height:72px;text-align:left}.training-mode-picker small{display:block;font-weight:400;margin-top:7px}.training-mode-picker .active{border-color:var(--accent);background:rgba(157,223,104,.12)}#trainingModes p{font-size:13px;color:var(--muted);line-height:1.5}#circuitSettings{margin-top:15px}#circuitSettings select{display:block;width:100%;padding:12px;margin-top:8px;background:var(--surface2);color:var(--text);border:1px solid var(--line);border-radius:12px}#circuitPlayer{padding:22px 18px;margin:16px 0;border:2px solid var(--accent);border-radius:20px;background:var(--surface2);text-align:center}#circuitPlayer[data-phase="rest"],#circuitPlayer[data-phase="roundRest"]{border-color:#7cbcff}#circuitPhase{letter-spacing:.12em;font-size:12px;font-weight:800}#circuitClock{font-size:clamp(64px,20vw,104px);line-height:1.1;font-variant-numeric:tabular-nums;font-weight:900;margin:16px 0}#circuitPlayer h2{font-size:23px}#circuitPlayer p{line-height:1.5}#circuitPlayer progress{width:100%;height:10px;accent-color:var(--accent)}.circuit-controls{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:15px}.circuit-controls button{min-height:48px;flex:1}#circuitStatus,#circuitPlayer small{font-size:12px;color:var(--muted)}';
    document.head.append(style);
  }
  setInterval(()=>{
    if(!clock?.state.running)return;
    if(bound!==binding()){pause('Workout changed');return}
    const now=Date.now(),changed=clock.tick(now),state=clock.state,count=Math.ceil(state.remaining/1000);
    if(changed){checkpoint();beep(true);lastCount=-1;if(!state.running)release()}
    else if(count<=3&&count>0&&count!==lastCount){beep();lastCount=count}
    if(now-lastCheckpoint>=15000)checkpoint();
    paint();
  },100);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')pause('Paused while the app was in the background. Resume when ready.')});
  window.addEventListener('pagehide',()=>pause('Paused'));
  window.IronSixCircuit={render,pause,rebuild:()=>{pause('Plan updated');clock=null;bound=null;render()}};render();
})();
