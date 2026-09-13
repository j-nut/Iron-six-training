/* Today as a session flow: setup → one exercise at a time → review.
 *
 * This is a presentation shell, deliberately. renderExercises still builds every exercise card
 * exactly as before; this hides all but one and adds navigation around them. Everything fragile
 * hangs off those cards — set inputs, journal capture, swap, media, the next-set suggestion —
 * and none of it is touched. "All exercises" restores the old view in a tap, and circuit mode
 * is left completely alone because its timer panel above the list is already the guide; a
 * second guide would just argue with it.
 *
 * Position is derived, never stored. The workout is not a fixed list — changing duration
 * rebuilds it, readiness trims it, a swap replaces an entry — so a saved index can quietly come
 * to mean a different exercise. The active card is the one holding your first incomplete set,
 * and explicit navigation is remembered by exercise NAME and dropped the moment that name is no
 * longer in the workout. Nothing survives a reload except the log itself, which is the only
 * thing that should.
 */
(() => {
  if (window.__ironSixSessionCardsLoaded) return;
  window.__ironSixSessionCardsLoaded = true;

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // In-memory on purpose: it survives switching tabs (this is a single page, tabs do not
  // reload) and dies on a real reload, where the derived position is correct anyway.
  let began = false, focusName = null, showAll = false;

  const cards = () => [...document.querySelectorAll('#exerciseList [data-exercise-index]')];
  const listSection = () => $('exerciseList')?.closest('.section') || null;
  const isCircuit = user => user?.trainingMode === 'circuit';

  const setLogged = set => !!(set && (set.done || String(set.weight || '').trim() || String(set.reps || '').trim() || String(set.rir || '').trim()));
  const anyLogged = user => Object.entries(user?.today || {}).some(([key, set]) => /^\d+-\d+$/.test(key) && setLogged(set));

  function progress(user, workout) {
    let done = 0, planned = 0;
    const perExercise = workout.map((exercise, ei) => {
      let complete = 0;
      for (let i = 0; i < exercise.sets; i++) if (user.today?.[`${ei}-${i}`]?.done) complete++;
      done += complete; planned += exercise.sets;
      return { name: exercise.name, complete, sets: exercise.sets };
    });
    return { done, planned, perExercise };
  }

  // The first exercise with a set still to do. Past the end means everything is logged.
  function firstIncomplete(user, workout) {
    for (let ei = 0; ei < workout.length; ei++)
      for (let i = 0; i < workout[ei].sets; i++)
        if (!user.today?.[`${ei}-${i}`]?.done) return ei;
    return workout.length;
  }

  function activeIndex(user, workout) {
    if (focusName) {
      const index = workout.findIndex(exercise => exercise.name === focusName);
      if (index >= 0) return index;
      if (focusName === '__review') return workout.length;
      focusName = null; // the workout changed under us; fall back to the log
    }
    return firstIncomplete(user, workout);
  }

  function goTo(index, workout) {
    focusName = index >= workout.length ? '__review' : workout[index]?.name || null;
    apply();
    const target = $('sessionCardNav') || $('exerciseList');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function injectStyles() {
    if ($('sessionCardStyles')) return;
    const style = document.createElement('style');
    style.id = 'sessionCardStyles';
    style.textContent = `
      .sc-hidden{display:none!important}
      #sessionStart{border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:16px;margin:0 0 12px;text-align:center}
      #sessionStart h3{margin:0 0 5px;font-size:16px}
      #sessionStart p{margin:0 0 13px;font-size:12.5px;color:var(--muted);line-height:1.45}
      #sessionCardNav{display:flex;align-items:center;gap:9px;margin:0 0 11px}
      #sessionCardNav .sc-step{flex:1;min-width:0;text-align:center}
      #sessionCardNav .sc-step strong{display:block;font-size:12.5px;font-weight:850}
      #sessionCardNav .sc-step span{display:block;font-size:11px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .sc-arrow{flex:0 0 auto;min-width:46px;min-height:46px;border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:13px;font-size:17px;font-weight:800;cursor:pointer}
      .sc-arrow:disabled{opacity:.35;cursor:default}
      #scNextBtn{min-width:88px;padding:0 16px;border-color:rgba(46,229,128,.45);background:rgba(46,229,128,.09);color:var(--accent);font-size:13px;letter-spacing:.01em;box-shadow:0 0 0 1px rgba(46,229,128,.05),0 4px 14px rgba(0,0,0,.16)}
      #scNextBtn:hover{background:rgba(46,229,128,.15);border-color:rgba(46,229,128,.72)}
      @keyframes scReadyPulse{0%,100%{box-shadow:0 0 0 0 rgba(46,229,128,.28),0 4px 16px rgba(0,0,0,.18)}50%{box-shadow:0 0 0 7px rgba(46,229,128,0),0 0 24px rgba(46,229,128,.28)}}
      #scNextBtn.ready{border-color:var(--accent);background:rgba(46,229,128,.18);color:var(--accent);animation:scReadyPulse 1.6s ease-in-out infinite}
      @media(prefers-reduced-motion:reduce){#scNextBtn.ready{animation:none;box-shadow:0 0 0 2px rgba(46,229,128,.18),0 0 18px rgba(46,229,128,.18)}}
      #sessionCardFoot{display:flex;gap:9px;margin:11px 0 0}
      #sessionCardFoot button{flex:1;min-height:46px}
      #sessionReview{border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:16px;margin:12px 0 0}
      #sessionReview h3{margin:0 0 3px;font-size:16px}
      #sessionReview .sc-sub{margin:0 0 12px;font-size:12.5px;color:var(--muted)}
      .sc-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}
      .sc-row:last-of-type{border-bottom:0}
      .sc-row span{color:var(--muted);font-size:12px;white-space:nowrap}
      .sc-row span.full{color:var(--accent)}
      @media(max-width:390px){#scNextBtn{min-width:78px;padding:0 12px}}
    `;
    document.head.appendChild(style);
  }

  function chrome() {
    const section = listSection(), list = $('exerciseList');
    if (!section || !list) return null;
    if (!$('sessionStart')) {
      const start = document.createElement('div');
      start.id = 'sessionStart';
      start.innerHTML = '<h3 id="sessionStartTitle">Ready when you are</h3><p id="sessionStartText"></p><button class="btn primary" id="sessionBeginBtn" type="button">Begin workout</button>';
      list.before(start);
      start.querySelector('#sessionBeginBtn').addEventListener('click', () => {
        const user = activeUser(), workout = finalWorkout(user);
        began = true;
        goTo(firstIncomplete(user, workout), workout);
      });
    }
    if (!$('sessionCardNav')) {
      const nav = document.createElement('div');
      nav.id = 'sessionCardNav';
      nav.innerHTML = '<button class="sc-arrow" id="scPrev" type="button" aria-label="Previous exercise">‹</button>'
        + '<div class="sc-step"><strong id="scStep"></strong><span id="scNext"></span></div>'
        + '<button class="sc-arrow" id="scNextBtn" type="button" aria-label="Next exercise">Next ›</button>';
      list.before(nav);
      nav.querySelector('#scPrev').addEventListener('click', () => { const w = finalWorkout(activeUser()); goTo(Math.max(0, activeIndex(activeUser(), w) - 1), w); });
      nav.querySelector('#scNextBtn').addEventListener('click', () => { const w = finalWorkout(activeUser()); goTo(Math.min(w.length, activeIndex(activeUser(), w) + 1), w); });
    }
    if (!$('sessionCardFoot')) {
      const foot = document.createElement('div');
      foot.id = 'sessionCardFoot';
      foot.innerHTML = '<button class="btn secondary" id="scOverview" type="button">All exercises</button>';
      list.after(foot);
      foot.querySelector('#scOverview').addEventListener('click', () => { showAll = !showAll; apply(); });
    }
    if (!$('sessionReview')) {
      const review = document.createElement('div');
      review.id = 'sessionReview';
      review.innerHTML = '<h3>Review your session</h3><p class="sc-sub" id="scReviewSub"></p><div id="scReviewRows"></div>'
        + '<div class="cta"><button class="btn secondary" id="scBackToExercises" type="button">Back to exercises</button>'
        + '<button class="btn primary" id="scFinish" type="button">Finish workout</button></div>';
      $('sessionCardFoot').after(review);
      review.querySelector('#scBackToExercises').addEventListener('click', () => { const w = finalWorkout(activeUser()); goTo(Math.max(0, w.length - 1), w); });
      // Finishing is finishWorkout's job, including its own partial-session confirmation.
      review.querySelector('#scFinish').addEventListener('click', () => { if (typeof finishWorkout === 'function') finishWorkout(); });
    }
    return true;
  }

  function showEverything() {
    cards().forEach(card => card.classList.remove('sc-hidden'));
    for (const id of ['sessionStart', 'sessionCardNav', 'sessionReview']) $(id)?.classList.add('sc-hidden');
  }

  function apply() {
    if (typeof activeUser !== 'function' || typeof finalWorkout !== 'function') return;
    injectStyles();
    if (!chrome()) return;
    const user = activeUser(), workout = finalWorkout(user), all = cards();
    const cta = $('finishBtn')?.closest('.cta') || null;

    // Circuit mode already has a guide; stand down completely.
    if (isCircuit(user) || showAll || !all.length) {
      showEverything();
      $('sessionCardFoot')?.classList.toggle('sc-hidden', isCircuit(user) || !all.length);
      cta?.classList.remove('sc-hidden');
      const overview = $('scOverview');
      if (overview) overview.textContent = showAll ? 'Focus on one exercise' : 'All exercises';
      return;
    }

    const started = began || anyLogged(user);
    if (!started) {
      all.forEach(card => card.classList.add('sc-hidden'));
      $('sessionStart')?.classList.remove('sc-hidden');
      for (const id of ['sessionCardNav', 'sessionReview', 'sessionCardFoot']) $(id)?.classList.add('sc-hidden');
      cta?.classList.add('sc-hidden');
      const { planned } = progress(user, workout);
      const text = $('sessionStartText');
      if (text) text.textContent = `${workout.length} exercise${workout.length === 1 ? '' : 's'}, ${planned} sets. You can change anything in Session setup first.`;
      return;
    }

    $('sessionStart')?.classList.add('sc-hidden');
    const index = activeIndex(user, workout);
    if (focusName === null && index < workout.length) focusName = workout[index].name;
    const reviewing = index >= workout.length;
    const { done, planned, perExercise } = progress(user, workout);

    all.forEach(card => card.classList.toggle('sc-hidden', reviewing || Number(card.dataset.exerciseIndex) !== index));
    $('sessionCardFoot')?.classList.remove('sc-hidden');
    $('sessionCardNav')?.classList.toggle('sc-hidden', reviewing);
    $('sessionReview')?.classList.toggle('sc-hidden', !reviewing);
    cta?.classList.add('sc-hidden');
    const overview = $('scOverview');
    if (overview) overview.textContent = 'All exercises';

    if (reviewing) {
      const sub = $('scReviewSub');
      if (sub) sub.textContent = `${done} of ${planned} sets logged. Check anything you want before saving.`;
      const rows = $('scReviewRows');
      if (rows) rows.innerHTML = perExercise.map(row =>
        `<div class="sc-row"><b>${esc(row.name)}</b><span class="${row.complete >= row.sets ? 'full' : ''}">${row.complete} / ${row.sets} sets</span></div>`).join('');
      return;
    }

    const current = perExercise[index];
    const step = $('scStep'), nextLabel = $('scNext');
    if (step) step.textContent = `Exercise ${index + 1} of ${workout.length} · ${current.complete}/${current.sets} sets`;
    if (nextLabel) nextLabel.textContent = index + 1 < workout.length ? `Next: ${workout[index + 1].name}` : 'Next: review and finish';
    const prev = $('scPrev'), next = $('scNextBtn');
    if (prev) prev.disabled = index === 0;
    if (next) {
      const last = index + 1 >= workout.length;
      next.textContent = last ? 'Review ›' : 'Next ›';
      next.setAttribute('aria-label', last ? 'Review and finish workout' : `Next exercise: ${workout[index + 1]?.name || ''}`);
      // Highlight forward once this exercise is done, rather than moving the screen under someone
      // who may still be correcting a number.
      next.classList.toggle('ready', current.complete >= current.sets);
    }
  }

  const baseRenderExercises = window.renderExercises;
  if (typeof baseRenderExercises === 'function') window.renderExercises = function () { baseRenderExercises(); apply(); };
  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function') window.renderAll = function () { baseRenderAll(); apply(); };
  apply();
  addEventListener('load', apply);

  window.IronSixSessionCards = {
    apply, goTo, activeIndex, firstIncomplete, progress,
    state: () => ({ began, focusName, showAll }),
    reset: () => { began = false; focusName = null; showAll = false; apply(); }
  };
})();
