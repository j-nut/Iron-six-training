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
      #sessionCardNav{gap:7px!important;margin:0 0 8px!important;position:sticky;top:0;z-index:8;padding:6px 0;background:linear-gradient(180deg,var(--bg) 78%,transparent)}
      #sessionCardNav .sc-arrow{min-width:42px!important;min-height:42px!important;height:42px!important;border-radius:12px!important}
      #sessionCardNav .sc-step{display:flex!important;flex-direction:column;justify-content:center;min-width:0;line-height:1.1}
      #sessionCardNav .sc-step strong{font-size:11.5px!important;line-height:1.15!important}
      #sessionCardNav .sc-step span{font-size:10.5px!important;margin-top:2px!important}
      #scNextBtn{min-width:76px!important;min-height:42px!important;height:42px!important;padding:0 11px!important}
      .awc-overview-proxy{flex:0 0 auto;min-width:46px;height:42px;border:1px solid var(--line);background:var(--surface2);color:var(--muted);border-radius:12px;font-size:11px;font-weight:850;padding:0 9px;cursor:pointer}
      .awc-overview-proxy:active{transform:scale(.96)}

      #exerciseList.awc-focus .exercise:not(.sc-hidden){padding:13px 13px 14px!important;border-radius:18px!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-head{align-items:flex-start;margin-bottom:0!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title h3,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title strong:first-child{font-size:20px!important;line-height:1.12!important;margin:0!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title>span{font-size:12px;line-height:1.25;color:var(--muted);margin-top:2px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .tag,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-help-btn,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-swap-btn,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .substitution,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .pose-bar{display:none!important}

      /* Keep the target prominent, but make it a compact pill rather than another card. */
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion{display:inline-flex!important;align-items:center;margin:7px 0 0!important;padding:7px 10px!important;border-radius:11px!important;min-height:0!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion strong{font-size:15px!important;line-height:1.15!important}
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

      /* Feedback is one compact horizontal strip beneath the completed set. */
      #exerciseList.awc-focus .set-feedback{display:flex!important;align-items:center;gap:7px;grid-column:1/-1;padding:3px 0 5px!important;min-width:0}
      #exerciseList.awc-focus .set-feedback-label{font-size:10px!important;margin:0!important;white-space:nowrap;flex:0 0 auto}
      #exerciseList.awc-focus .set-feedback-actions{display:flex!important;gap:4px!important;flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;min-width:0}
      #exerciseList.awc-focus .set-feedback-actions::-webkit-scrollbar{display:none}
      #exerciseList.awc-focus .set-feedback-btn{padding:5px 8px!important;font-size:10px!important;line-height:1.1!important;white-space:nowrap;min-height:28px!important}

      /* Illustration/form reference remains available but no longer competes with logging. */
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media-missing{display:block!important;margin:11px 0 2px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media figcaption{font-size:10px;color:var(--muted);text-align:center;margin-top:4px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media .media-credit{opacity:.65}

      /* The large footer button is redundant in focus mode; the top bar owns this action. */
      #exerciseList.awc-focus ~ #sessionCardFoot{display:none!important}

      @media(max-width:390px){
        #sessionCardNav{gap:5px!important}
        #sessionCardNav .sc-arrow{min-width:39px!important;width:39px!important}
        #scNextBtn{min-width:68px!important;padding:0 8px!important}
        .awc-overview-proxy{min-width:42px;padding:0 7px}
        #exerciseList.awc-focus .exercise:not(.sc-hidden){padding:12px 11px 13px!important}
        #exerciseList.awc-focus .set-feedback-label{display:none!important}
        #exerciseList.awc-focus .set-feedback-actions{width:100%}
        #exerciseList.awc-focus .set-feedback-btn{flex:1 0 auto}
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
      cards.forEach(addActions);
      const shown = cards.filter(visible);
      list.classList.toggle('awc-focus', shown.length === 1);
      if (shown.length === 1) addOverviewShortcut();
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
  window.IronSixActiveWorkoutClean = { apply, version: 4, observer: false, layout: 'compact-control-surface' };
})();
