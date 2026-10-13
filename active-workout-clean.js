/* Focused active-workout presentation. Updates only from Iron Six render/actions; no DOM observer. */
(() => {
  if (window.__ironSixActiveWorkoutCleanLoaded) return;
  window.__ironSixActiveWorkoutCleanLoaded = true;

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const visible = el => !!el && !el.classList.contains('sc-hidden') && getComputedStyle(el).display !== 'none';
  let applying = false;

  function injectStyles() {
    if (document.getElementById('activeWorkoutCleanStyles')) return;
    const style = document.createElement('style');
    style.id = 'activeWorkoutCleanStyles';
    style.textContent = `
      /* Active workout = control surface, not a stack of cards. */
      #sessionCardNav{gap:7px!important;margin:0 0 8px!important;position:sticky;top:var(--app-safe-top,0px);z-index:8;padding:6px 0;background:var(--bg)}
      #sessionCardNav .sc-arrow{min-width:42px!important;min-height:42px!important;height:42px!important;border-radius:12px!important}
      #sessionCardNav .sc-step{display:flex!important;flex-direction:column;justify-content:center;min-width:0;line-height:1.1}
      #sessionCardNav .sc-step strong{font-size:11.5px!important;line-height:1.15!important}
      #sessionCardNav .sc-step span{font-size:10.5px!important;margin-top:2px!important}
      #scNextBtn{min-width:76px!important;min-height:42px!important;height:42px!important;padding:0 11px!important}
      .awc-overview-proxy{flex:0 0 auto;min-width:46px;height:42px;border:1px solid var(--line);background:var(--surface2);color:var(--muted);border-radius:12px;font-size:11px;font-weight:850;padding:0 9px;cursor:pointer}
      .awc-overview-proxy:active{transform:scale(.96)}

      #exerciseList.awc-focus .exercise:not(.sc-hidden){padding:13px 13px 14px!important;border-radius:18px!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-head{align-items:flex-start;margin-bottom:0!important;padding:0;flex-wrap:wrap}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title{flex:1 1 100%;width:100%}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title h3,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title>strong:first-child{font-size:20px!important;line-height:1.12!important;margin:0!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title>span{font-size:12px;line-height:1.25;color:var(--muted);margin-top:2px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .tag,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-help-btn,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-swap-btn,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .substitution,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .pose-bar{display:none!important}

      /* Details stack under the target instead of competing for a narrow flex row. */
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion{display:grid!important;gap:6px;width:100%;min-width:0;margin:7px 0 0!important;padding:7px 10px!important;border-radius:11px!important;min-height:0!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion strong{font-size:15px!important;line-height:1.15!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion .confidence{justify-self:start;margin:0}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion>div{margin:0!important;line-height:1.5}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion .confidence,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion>div{display:none!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-details .substitution{display:block!important;margin-top:8px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-details .suggestion .confidence,
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-details .suggestion>div{display:block!important}

      .awc-actions{display:flex;gap:6px;flex-wrap:wrap;margin:7px 0 0}
      .awc-action{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:9px;padding:6px 9px;font-size:11px;font-weight:800;cursor:pointer;min-height:32px}
      .awc-action.primary-lite{border-color:rgba(46,229,128,.38);color:var(--accent);background:rgba(46,229,128,.08)}
      .awc-action[hidden]{display:none!important}
      .awc-why{display:none;margin:7px 0 0;padding:8px 10px;border-radius:9px;background:var(--surface2);border:1px solid var(--line);font-size:11px;line-height:1.4;color:var(--muted)}
      .awc-why.show{display:block}

      /* Set logging gets the majority of the first viewport. */
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .sets{margin-top:10px!important;padding-top:9px!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .field-labels{font-size:9px!important;letter-spacing:.06em;margin-bottom:3px!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .rows{gap:5px!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .set-row{gap:6px!important;margin:0!important;min-height:52px!important;align-items:center!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .set-row input,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .set-row select,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .set-row .done{height:50px!important;min-height:50px!important;border-radius:12px!important;font-size:16px!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .set-row .done{width:50px!important;min-width:50px!important;padding:0!important}

      /* Feedback behaves like a discrete slider: four compact stops in one pill. */
      #exerciseList.awc-focus .set-feedback{display:flex!important;align-items:center;gap:7px;grid-column:1/-1;padding:2px 0 4px!important;min-width:0;width:100%}
      #exerciseList.awc-focus .set-feedback-label{font-size:9.5px!important;margin:0!important;white-space:nowrap;color:var(--muted);flex:0 0 auto}
      #exerciseList.awc-focus .set-feedback-actions{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:0!important;min-width:0;flex:1;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--surface2)}
      #exerciseList.awc-focus .set-feedback-btn{position:relative;border:0!important;border-right:1px solid var(--line)!important;background:transparent!important;border-radius:0!important;padding:0 4px!important;font-size:0!important;line-height:1!important;white-space:nowrap;min-width:0!important;min-height:30px!important;width:100%}
      #exerciseList.awc-focus .set-feedback-btn:last-child{border-right:0!important}
      #exerciseList.awc-focus .set-feedback-btn::after{font-size:9.5px;font-weight:750;color:var(--muted)}
      #exerciseList.awc-focus .set-feedback-btn[data-set-feedback="easy"]::after{content:'Easy'}
      #exerciseList.awc-focus .set-feedback-btn[data-set-feedback="right"]::after{content:'Good'}
      #exerciseList.awc-focus .set-feedback-btn[data-set-feedback="hard"]::after{content:'Hard'}
      #exerciseList.awc-focus .set-feedback-btn[data-set-feedback="pain"]::after{content:'Pain'}
      #exerciseList.awc-focus .set-feedback-btn.active{background:rgba(46,229,128,.14)!important;box-shadow:inset 0 0 0 1px var(--accent)!important}
      #exerciseList.awc-focus .set-feedback-btn.active::after{color:var(--text)}

      /* Illustration/form reference remains available but no longer competes with logging. */
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media-missing{display:block!important;margin:11px 0 2px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media figcaption{font-size:10px;color:var(--muted);text-align:center;margin-top:4px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media .media-credit{opacity:.65}

      /* The large footer button is redundant in focus mode; the top bar owns this action. */
      #exerciseList.awc-focus ~ #sessionCardFoot{display:none!important}

      @media(max-width:520px){
        #exerciseList.awc-focus .set-feedback{gap:5px}
        #exerciseList.awc-focus .set-feedback-label{font-size:9px!important}
        #exerciseList.awc-focus .set-feedback-btn::after{font-size:9px}
      }
      @media(max-width:390px){
        #sessionCardNav{gap:5px!important}
        #sessionCardNav .sc-arrow{min-width:39px!important;width:39px!important}
        #scNextBtn{min-width:68px!important;padding:0 8px!important}
        .awc-overview-proxy{min-width:42px;padding:0 7px}
        #exerciseList.awc-focus .exercise:not(.sc-hidden){padding:12px 11px 13px!important}
        #exerciseList.awc-focus .set-feedback-label{display:none!important}
      }
      @media(prefers-reduced-motion:reduce){.awc-overview-proxy:active{transform:none}}
    `;
    document.head.appendChild(style);
  }

  function workoutFor(card) {
    try {
      const workout = typeof finalWorkout === 'function' && typeof activeUser === 'function' ? finalWorkout(activeUser()) : [];
      return workout[Number(card.dataset.exerciseIndex)] || null;
    } catch (_) { return null; }
  }

  function updateActions(card, exercise = workoutFor(card)) {
    const actions = card.querySelector('.awc-actions');
    if (!actions) return;
    const camera = actions.querySelector('.awc-camera-btn');
    const swap = actions.querySelector('.awc-swap-btn');
    const why = actions.querySelector('.awc-why-btn');
    const whyText = actions.querySelector('.awc-why');
    camera.hidden = !card.querySelector('.pose-bar button');
    swap.hidden = !card.querySelector('.exercise-swap-btn');
    const reason = String(exercise?._adaptReason || '').trim();
    why.hidden = !reason;
    if (reason) {
      why.textContent = 'Why?';
      why.setAttribute('aria-label', `Why ${Number(exercise?.sets) || ''} sets today?`);
      whyText.innerHTML = `<strong style="color:var(--text)">Adjusted today</strong><br>${esc(reason)}`;
    } else {
      whyText.classList.remove('show');
      whyText.textContent = '';
    }
  }

  function addActions(card) {
    if (card.querySelector('.awc-actions')) { updateActions(card); return; }
    const host = card.querySelector('.exercise-title');
    if (!host) return;
    const actions = document.createElement('div');
    actions.className = 'awc-actions';
    actions.innerHTML = `
      <button type="button" class="awc-action primary-lite awc-camera-btn" hidden>Camera</button>
      <button type="button" class="awc-action awc-swap-btn" hidden>Swap</button>
      <button type="button" class="awc-action awc-details-btn">More</button>
      <button type="button" class="awc-action awc-why-btn" hidden>Why?</button>
      <div class="awc-why" role="status"></div>`;
    host.appendChild(actions);

    const details = actions.querySelector('.awc-details-btn');
    details.addEventListener('click', () => {
      const open = card.classList.toggle('awc-details');
      details.textContent = open ? 'Less' : 'More';
    });
    actions.querySelector('.awc-camera-btn').addEventListener('click', () => card.querySelector('.pose-bar button')?.click());
    actions.querySelector('.awc-swap-btn').addEventListener('click', () => card.querySelector('.exercise-swap-btn')?.click());
    const why = actions.querySelector('.awc-why-btn'), whyText = actions.querySelector('.awc-why');
    why.addEventListener('click', () => whyText.classList.toggle('show'));
    updateActions(card);
  }

  // A full-page illustration between the sets and next workout made the card
  // look lopsided and forced the primary controls below the fold. Keep every
  // picture and form cue available in a semantic, keyboard-operable disclosure.
  function foldFormGuide(card) {
    const media=[...card.children].filter(node=>
      node.classList?.contains('exercise-media')||
      node.classList?.contains('exercise-media-missing'));
    if(!media.length)return;
    let guide=[...card.children].find(node=>node.classList?.contains('awc-form-guide'));
    if(!guide){
      guide=document.createElement('details');
      guide.className='awc-form-guide';
      const summary=document.createElement('summary');
      summary.innerHTML='<strong>Exercise form guide</strong><span>Photos and technique</span>';
      guide.appendChild(summary);
      card.appendChild(guide);
    }
    media.forEach(node=>guide.appendChild(node));
  }

  // A tap still opens the keyboard. On touchscreens, a deliberate hold
  // (380 ms) turns the same field into a vertical precision scrubber:
  // upward increases, downward decreases. Do not write a set or queue a
  // cloud sync for every pixel: commit one normal input event on release.
  function scrubValue(raw, steps, kind) {
    const weight=kind==='weight';
    const starting=Number.parseFloat(raw);
    const base=Number.isFinite(starting)?starting:(weight?0:1);
    const increment=weight?2.5:1;
    const floor=weight?0:1;
    const ceiling=weight?2000:200;
    return Math.max(floor,Math.min(ceiling,Math.round((base+steps*increment)*10)/10));
  }

  function enableScrub(card) {
    const sets=card.querySelector('.sets');
    if(!sets)return;
    if(!sets.querySelector('.awc-scrub-tip')){
      const tip=document.createElement('p');
      tip.className='awc-scrub-tip';
      tip.textContent='Tap to type  ·  Hold and slide to adjust';
      sets.appendChild(tip);
    }
    for(const input of card.querySelectorAll('.set-row input.weight, .set-row input.reps')){
      if(input.dataset.ixScrubReady)continue;
      input.dataset.ixScrubReady='true';
      const kind=input.classList.contains('weight')?'weight':'reps';
      input.setAttribute('aria-description',
        'Tap to type. On a touchscreen, press and hold, then slide up or down to adjust.');
      // An overlay receives the *initial* touch, not the editable input.
      // Android WebView may open its IME before a pointerdown preventDefault
      // callback can stop the input's native focus. A non-editable pointer
      // target eliminates that race. We focus the input only after a short tap.
      let wrapper=input.parentElement;
      if(!wrapper.classList.contains('awc-adjust-field')){
        wrapper=document.createElement('div');
        wrapper.className='awc-adjust-field';
        input.before(wrapper);
        wrapper.appendChild(input);
      }
      const overlay=document.createElement('span');
      overlay.className='awc-touch-target';
      overlay.setAttribute('aria-hidden','true');
      overlay.dataset.adjust=kind;
      wrapper.appendChild(overlay);
      let drag=null;
      const finish=()=>{
        if(!drag)return;
        clearTimeout(drag.timer);
        drag.bubble?.remove();
        input.classList.remove('awc-scrubbing');
        try{overlay.releasePointerCapture?.(drag.id)}catch(_){}
        drag=null;
      };
      overlay.addEventListener('pointerdown',event=>{
        if(event.pointerType!=='touch'||event.isPrimary===false||drag)return;
        if(event.cancelable)event.preventDefault();
        const next={id:event.pointerId,startY:event.clientY,startX:event.clientX,
          initial:input.value,changed:false,armed:false,moved:false,bubble:null,timer:null};
        drag=next;
        try{overlay.setPointerCapture?.(event.pointerId)}catch(_){}
        next.timer=setTimeout(()=>{
          if(drag!==next||next.moved)return;
          next.armed=true;
          input.blur();
          input.classList.add('awc-scrubbing');
          const bubble=document.createElement('output');
          bubble.className='awc-scrub-value';
          bubble.setAttribute('role','status');
          bubble.textContent=(kind==='weight'?'Weight ':'Reps ')+(input.value||'—')+(kind==='weight'?' lb':'');
          const rect=input.getBoundingClientRect();
          bubble.style.left=Math.max(58,Math.min(window.innerWidth-58,rect.left+rect.width/2))+'px';
          bubble.style.top=Math.max(64,rect.top-56)+'px';
          document.body.appendChild(bubble);next.bubble=bubble;
          if(window.navigator?.vibrate)try{window.navigator.vibrate(8)}catch(_){}
        },380);
      },{passive:false});
      overlay.addEventListener('pointermove',event=>{
        if(!drag||event.pointerId!==drag.id)return;
        if(!drag.armed){
          if(Math.hypot(event.clientY-drag.startY,event.clientX-drag.startX)>12){
            drag.moved=true;clearTimeout(drag.timer);
          }
          return;
        }
        if(event.cancelable)event.preventDefault();
        const steps=Math.round((drag.startY-event.clientY)/20);
        const next=String(scrubValue(drag.initial,steps,kind));
        if(input.value!==next){
          input.value=next;drag.changed=input.value!==drag.initial;
          if(drag.bubble)drag.bubble.textContent=
            (kind==='weight'?'Weight ':'Reps ')+next+(kind==='weight'?' lb':'');
        }
      },{passive:false});
      const end=(event,cancelled=false)=>{
        if(!drag||event.pointerId!==drag.id)return;
        const armed=drag.armed,moved=drag.moved,changed=drag.changed;
        if(event.cancelable)event.preventDefault();
        finish();
        if(armed){
          if(changed)input.dispatchEvent(new Event('input',{bubbles:true}));
        }else if(!cancelled&&!moved){
          // This is the only touch path that focuses an editable element.
          // The native keyboard must never open during touch-down or hold.
          input.focus();
        }
      };
      overlay.addEventListener('pointerup',event=>end(event));
      overlay.addEventListener('pointercancel',event=>end(event,true));
      overlay.addEventListener('click',event=>event.preventDefault());
      overlay.addEventListener('contextmenu',event=>event.preventDefault());
    }
  }

  function addOverviewShortcut() {
    const nav = document.getElementById('sessionCardNav');
    const original = document.getElementById('scOverview');
    const next = document.getElementById('scNextBtn');
    if (!nav || !original || !next || nav.querySelector('.awc-overview-proxy')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'awc-overview-proxy';
    button.textContent = 'All';
    button.setAttribute('aria-label', 'Show all exercises');
    button.addEventListener('click', () => original.click());
    nav.insertBefore(button, next);
  }

  function apply() {
    if (applying) return;
    applying = true;
    try {
      injectStyles();
      const list = document.getElementById('exerciseList');
      if (!list) return;
      const cards = [...list.querySelectorAll('[data-exercise-index]')];
      cards.forEach(card=>{ addActions(card); foldFormGuide(card); enableScrub(card); });
      const shown = cards.filter(visible);
      const state = window.IronSixSessionCards?.state();
      const circuit = typeof activeUser === 'function' && activeUser()?.trainingMode === 'circuit';
      const focused = shown.length === 1 && !circuit && !state?.showAll && visible(document.getElementById('sessionCardNav'));
      list.classList.toggle('awc-focus', focused);
      if (focused) addOverviewShortcut();
    } finally { applying = false; }
  }

  function scheduleApply() { setTimeout(apply, 0); }

  if (typeof window.renderExercises === 'function' && !window.renderExercises.__awcWrapped) {
    const base = window.renderExercises;
    const wrapped = function(){ const result = base.apply(this, arguments); scheduleApply(); return result; };
    wrapped.__awcWrapped = true;
    window.renderExercises = wrapped;
  }
  if (typeof window.renderAll === 'function' && !window.renderAll.__awcWrapped) {
    const base = window.renderAll;
    const wrapped = function(){ const result = base.apply(this, arguments); scheduleApply(); return result; };
    wrapped.__awcWrapped = true;
    window.renderAll = wrapped;
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('#sessionBeginBtn,#sessionCardNav,#sessionCardFoot,.done,.duration-btn,#applyCustomTime,.exercise-swap-btn,.awc-swap-btn,[data-view="today"]')) scheduleApply();
  });
  for (const id of ['energy','soreness']) document.getElementById(id)?.addEventListener('change', scheduleApply);

  scheduleApply();
  addEventListener('load', apply);
  window.IronSixActiveWorkoutClean = { apply, scrubValue, version: 7, observer: false, layout: 'premium-mobile-workout' };
})();
