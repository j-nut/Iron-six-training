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
      #exerciseList.awc-focus .exercise:not(.sc-hidden){padding:18px 16px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-head{align-items:flex-start}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-title>span{font-size:13px;line-height:1.35;color:var(--muted);margin-top:3px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .tag,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-help-btn,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-swap-btn,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .substitution,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-media-missing,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .pose-bar{display:none!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion{margin-top:12px;padding:11px 13px;border-radius:13px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion strong{font-size:17px;line-height:1.25}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion .confidence,
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .suggestion>div{display:none!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-details .substitution{display:block!important;margin-top:10px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-details .suggestion .confidence,
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-details .suggestion>div{display:block!important}
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-form .exercise-media,
      #exerciseList.awc-focus .exercise:not(.sc-hidden).awc-form .exercise-media-missing{display:block!important;margin-top:12px}
      .awc-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 2px}
      .awc-action{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:10px;padding:8px 11px;font-size:12px;font-weight:800;cursor:pointer}
      .awc-action.primary-lite{border-color:rgba(46,229,128,.38);color:var(--accent);background:rgba(46,229,128,.08)}
      .awc-action[hidden]{display:none!important}
      .awc-why{display:none;margin:9px 0 0;padding:9px 11px;border-radius:10px;background:var(--surface2);border:1px solid var(--line);font-size:12px;line-height:1.45;color:var(--muted)}
      .awc-why.show{display:block}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .sets{margin-top:14px}
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .field-labels{font-size:10px;letter-spacing:.08em}
      @media(max-width:520px){
        #exerciseList.awc-focus .exercise:not(.sc-hidden){padding:16px 14px}
        .awc-actions{gap:7px}
        .awc-action{padding:8px 10px}
      }
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
      why.textContent = `Why ${Number(exercise?.sets) || ''} set${Number(exercise?.sets) === 1 ? '' : 's'}?`;
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
      <button type="button" class="awc-action awc-form-btn">Form guide</button>
      <button type="button" class="awc-action primary-lite awc-camera-btn" hidden>Camera</button>
      <button type="button" class="awc-action awc-swap-btn" hidden>Swap</button>
      <button type="button" class="awc-action awc-details-btn">Details</button>
      <button type="button" class="awc-action awc-why-btn" hidden></button>
      <div class="awc-why" role="status"></div>`;
    host.appendChild(actions);

    const form = actions.querySelector('.awc-form-btn');
    form.addEventListener('click', () => {
      const open = card.classList.toggle('awc-form');
      form.textContent = open ? 'Hide form' : 'Form guide';
    });
    const details = actions.querySelector('.awc-details-btn');
    details.addEventListener('click', () => {
      const open = card.classList.toggle('awc-details');
      details.textContent = open ? 'Less detail' : 'Details';
    });
    actions.querySelector('.awc-camera-btn').addEventListener('click', () => card.querySelector('.pose-bar button')?.click());
    actions.querySelector('.awc-swap-btn').addEventListener('click', () => card.querySelector('.exercise-swap-btn')?.click());
    const why = actions.querySelector('.awc-why-btn'), whyText = actions.querySelector('.awc-why');
    why.addEventListener('click', () => whyText.classList.toggle('show'));
    updateActions(card);
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
    } finally { applying = false; }
  }

  function scheduleApply() { setTimeout(apply, 0); }

  // Hook actual Iron Six renders. This replaces the MutationObserver that caused the freeze.
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

  // Session-card navigation changes visibility without rebuilding exercise cards, so update once
  // after those explicit user actions only. No background DOM/class observation.
  document.addEventListener('click', event => {
    if (event.target.closest?.('#sessionBeginBtn,#sessionCardNav,#sessionCardFoot,.done,.duration-btn,#applyCustomTime,.exercise-swap-btn,.awc-swap-btn,[data-view="today"]')) scheduleApply();
  });
  for (const id of ['energy','soreness']) document.getElementById(id)?.addEventListener('change', scheduleApply);

  scheduleApply();
  addEventListener('load', apply);
  window.IronSixActiveWorkoutClean = { apply, version: 2, observer: false };
})();
