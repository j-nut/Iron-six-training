/* Puts the user back at the next incomplete set when a workout is genuinely resumed
   (page load with a session already in progress, or the app returning to the
   foreground) instead of at the top of the page. Never fires on ordinary re-renders. */
(() => {
  if (window.__ironSixSessionResumeLoaded) return;
  window.__ironSixSessionResumeLoaded = true;

  // Derive the next incomplete set from real completion state (u.today + finalWorkout).
  // u.activeSetPointer, if present, is only ever used as a short-circuit hint — it is
  // always validated against the actual workout/today shape before being trusted, and
  // silently ignored (falling back to a full scan) whenever it is missing, stale, or
  // already-complete.
  function computeTarget(u, workout) {
    if (!u) return null;
    workout = workout || (typeof finalWorkout === 'function' ? finalWorkout(u) : []);
    if (!Array.isArray(workout) || !workout.length) return null;
    const today = u.today || {};
    const hint = u.activeSetPointer;
    if (hint && Number.isInteger(hint.ei) && Number.isInteger(hint.i) && hint.ei >= 0 && hint.i >= 0) {
      const exercise = workout[hint.ei];
      if (exercise && hint.i < exercise.sets) {
        const rec = today[`${hint.ei}-${hint.i}`];
        if (!rec || !rec.done) return {ei: hint.ei, i: hint.i};
      }
    }
    for (let ei = 0; ei < workout.length; ei++) {
      const exercise = workout[ei];
      const sets = Number(exercise?.sets) || 0;
      for (let i = 0; i < sets; i++) {
        const rec = today[`${ei}-${i}`];
        if (!rec || !rec.done) return {ei, i};
      }
    }
    return null;
  }

  // Best-effort hint only — never required for correctness. Safe to call from anywhere;
  // never touches u.today or the set-write path.
  function markPointer(u) {
    try {
      const target = computeTarget(u);
      u.activeSetPointer = target ? {ei: target.ei, i: target.i, _updatedAt: Date.now()} : null;
    } catch (_) {}
  }

  function hasLoggedAnything(u) {
    return !!(u && u.today && Object.keys(u.today).length);
  }

  function todayViewActive() {
    const view = document.getElementById('today');
    return !view || view.classList.contains('active');
  }

  function findRowEl(target) {
    if (!target) return null;
    const card = document.querySelector(`.exercise[data-exercise-index="${target.ei}"]`);
    if (!card) return null;
    const rows = card.querySelectorAll('.rows .set-row');
    return rows[target.i] || null;
  }

  function ensureStyle() {
    if (document.getElementById('sessionResumeStyle')) return;
    const style = document.createElement('style');
    style.id = 'sessionResumeStyle';
    style.textContent = `
      .set-row.resume-highlight{border-radius:12px;animation:ironSixResumeGlow 1.8s ease-out 1}
      @keyframes ironSixResumeGlow{0%{box-shadow:0 0 0 2px var(--accent,#2ee580)}100%{box-shadow:0 0 0 0 rgba(46,229,128,0)}}
      @media (prefers-reduced-motion: reduce){
        .set-row.resume-highlight{animation:none;outline:2px solid var(--accent,#2ee580);outline-offset:2px}
      }
    `;
    document.head.appendChild(style);
  }

  function prefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  }

  function fixedChromeOffsets() {
    // Defensive: account for any sticky/fixed header and the fixed bottom nav + safe areas,
    // even though only the bottom nav is currently fixed in this app.
    let top = 0, bottom = 0;
    document.querySelectorAll('.topbar,[data-app-header]').forEach(el => {
      const pos = window.getComputedStyle ? window.getComputedStyle(el).position : '';
      if (pos === 'fixed' || pos === 'sticky') top = Math.max(top, el.getBoundingClientRect().height || 0);
    });
    const nav = document.querySelector('.bottom-nav');
    if (nav) {
      const pos = window.getComputedStyle ? window.getComputedStyle(nav).position : '';
      if (pos === 'fixed') bottom = Math.max(bottom, nav.getBoundingClientRect().height || 0);
    }
    return {top, bottom};
  }

  function scrollToTarget(target) {
    const el = findRowEl(target);
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    ensureStyle();
    const reduceMotion = prefersReducedMotion();
    const behavior = reduceMotion ? 'auto' : 'smooth';
    try {
      if (typeof window.scrollTo === 'function') {
        const rect = el.getBoundingClientRect();
        const chrome = fixedChromeOffsets();
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        // Land the set in the upper-centre band of the viewport, clear of any fixed chrome.
        const band = Math.max(chrome.top + 16, Math.min(viewportH * 0.22, viewportH - chrome.bottom - 40));
        const currentScroll = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
        const targetScroll = Math.max(0, currentScroll + rect.top - band);
        window.scrollTo({top: targetScroll, left: 0, behavior});
      } else if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({behavior, block: 'center'});
      }
    } catch (_) {
      try { el.scrollIntoView(); } catch (_) {}
    }
    el.classList.add('resume-highlight');
    setTimeout(() => el.classList.remove('resume-highlight'), 2200);
    return true;
  }

  // The single entry point for a genuine resume. Never called from renderAll()/
  // renderExercises() — only from the page-load hydration hook and the
  // visibility/pageshow foreground hooks below.
  function resumeNow() {
    if (typeof activeUser !== 'function') return false;
    const u = activeUser();
    if (!u || !hasLoggedAnything(u)) return false; // nothing in progress
    if (!todayViewActive()) return false; // don't hijack a different screen
    const workout = typeof finalWorkout === 'function' ? finalWorkout(u) : [];
    const target = computeTarget(u, workout);
    markPointer(u);
    if (!target) return false; // workout complete (or nothing to resume) — leave it alone
    let acted = false;
    const attempt = () => { acted = scrollToTarget(target) || acted; };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(attempt));
    } else {
      setTimeout(attempt, 0);
    }
    return true;
  }

  let didInitialResume = false;
  function initialResumeOnce() {
    if (didInitialResume) return;
    didInitialResume = true;
    resumeNow();
  }

  // Genuine resume trigger #1: the first render after page load, once the session
  // (recovered drafts, journal restore) has actually finished hydrating.
  const hydrated = window.IronSixJournal && window.IronSixJournal.hydrated;
  if (hydrated && typeof hydrated.then === 'function') {
    hydrated.then(initialResumeOnce, initialResumeOnce);
  } else {
    setTimeout(initialResumeOnce, 0);
  }

  // Genuine resume trigger #2: the app returning to the foreground. `pageshow` is the
  // event the native Capacitor bridge dispatches on appStateChange (see
  // native/runtime.mjs); `visibilitychange` covers ordinary browser tab switching.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeNow();
  });
  window.addEventListener('pageshow', () => resumeNow());

  window.IronSixSessionResume = {computeTarget, markPointer, resumeNow};
})();
