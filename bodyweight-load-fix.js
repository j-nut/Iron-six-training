/* Bodyweight movements should progress through reps, control and variation — not fake external-pound estimates. */
(() => {
  if (window.__ironSixBodyweightLoadFix) return;
  window.__ironSixBodyweightLoadFix = true;

  const originalBaseline = typeof baselineLoadObject === 'function' ? baselineLoadObject : null;
  const originalSuggested = typeof suggestedLoadObject === 'function' ? suggestedLoadObject : null;
  const originalNextSet = typeof nextSetRecommendation === 'function' ? nextSetRecommendation : null;
  const originalRenderExercises = typeof renderExercises === 'function' ? renderExercises : null;
  const originalRefreshRemaining = typeof refreshRemainingWorkout === 'function' ? refreshRemainingWorkout : null;

  const BODYWEIGHT_NAME = /(?:^|\b)(?:push[- ]?up|pull[- ]?up|chin[- ]?up|bodyweight|plank|ab wheel(?: rollout)?|rollout|walkout|inverted row|pike push[- ]?up|dip)(?:\b|$)/i;

  function isBodyweightExercise(exercise) {
    const name = String(exercise?.name || '');
    if (!name) return false;
    // Explicitly weighted/loaded variants are allowed to keep an external-load field.
    if (/\b(weighted|loaded|dumbbell|barbell|landmine|machine|cable|band)\b/i.test(name)) return false;
    return BODYWEIGHT_NAME.test(name);
  }

  function bodyweightRecommendation(exercise, completedSet = null) {
    const range = typeof repRange === 'function' ? repRange(exercise) : [8, 12];
    const lo = Number(range?.[0]) || 8, hi = Number(range?.[1]) || 12;
    const midpoint = typeof repTarget === 'function' ? repTarget(exercise) : Math.round((lo + hi) / 2);
    if (!completedSet) {
      return {
        load: null,
        target: midpoint,
        text: `Bodyweight × about ${midpoint}`,
        confidence: 'Bodyweight',
        detail: 'No external load is prescribed. Progress with clean reps, control, range of motion, and harder variations when appropriate.'
      };
    }
    const reps = Number(completedSet.reps) || 0;
    const rirText = String(completedSet.rir ?? '').trim();
    const rir = rirText === '' ? null : Number(rirText);
    let target = Math.max(lo, Math.min(hi, reps || midpoint));
    let label = 'Repeat clean bodyweight reps';
    if (reps < lo || rir === 0) {
      target = lo;
      label = 'Keep it bodyweight and reduce reps until form is solid';
    } else if (reps >= hi && rir !== null && rir >= 2) {
      target = hi;
      label = 'You own this rep range — use a harder variation next time';
    } else if (rir !== null && rir >= 3 && reps < hi) {
      target = Math.min(hi, reps + Math.max(1, Math.round((rir - 1) / 2)));
      label = 'Add reps before making the variation harder';
    } else if (reps >= lo && reps < hi) {
      target = Math.min(hi, reps + 1);
      label = 'Add a rep if form stays clean';
    }
    return {
      load: null,
      reps: target,
      target,
      label,
      text: `${label}: aim for about ${target} reps.`,
      confidence: 'Bodyweight progression',
      detail: 'Progress bodyweight work with reps and movement difficulty rather than an invented pound value.'
    };
  }

  if (originalBaseline) {
    baselineLoadObject = function (user, exercise) {
      if (isBodyweightExercise(exercise)) return bodyweightRecommendation(exercise);
      return originalBaseline(user, exercise);
    };
  }

  if (originalSuggested) {
    suggestedLoadObject = function (user, exercise, exerciseIndex) {
      if (isBodyweightExercise(exercise)) {
        const completed = typeof currentSessionCompleted === 'function' ? currentSessionCompleted(user, exerciseIndex) : [];
        return bodyweightRecommendation(exercise, completed[completed.length - 1] || null);
      }
      return originalSuggested(user, exercise, exerciseIndex);
    };
  }

  if (originalNextSet) {
    nextSetRecommendation = function (user, exercise, exerciseIndex) {
      if (isBodyweightExercise(exercise)) {
        const completed = typeof currentSessionCompleted === 'function' ? currentSessionCompleted(user, exerciseIndex) : [];
        if (!completed.length) return null;
        return bodyweightRecommendation(exercise, completed[completed.length - 1]);
      }
      return originalNextSet(user, exercise, exerciseIndex);
    };
  }

  function bodyweightSetRows(user, workout) {
    (workout || []).forEach((exercise, exerciseIndex) => {
      if (!isBodyweightExercise(exercise)) return;
      const card = document.querySelector(`[data-exercise-index="${exerciseIndex}"]`);
      if (!card) return;
      const labels = card.querySelector('.field-labels');
      const weightLabel = labels?.children?.[1];
      if (weightLabel) weightLabel.textContent = 'Load';
      card.querySelectorAll('.set-row').forEach((row, setIndex) => {
        const input = row.querySelector('input.weight');
        if (!input) return;
        input.value = 'bodyweight';
        input.setAttribute('value', 'bodyweight');
        const marker = document.createElement('div');
        marker.className = 'field bodyweight-load';
        marker.textContent = 'Bodyweight';
        marker.setAttribute('aria-label', `${exercise.name} set ${setIndex + 1} load: bodyweight`);
        input.style.display = 'none';
        input.insertAdjacentElement('afterend', marker);
      });
    });
  }

  if (originalRenderExercises) {
    renderExercises = function () {
      const result = originalRenderExercises.apply(this, arguments);
      try {
        const user = typeof activeUser === 'function' ? activeUser() : null;
        const workout = user && typeof finalWorkout === 'function' ? finalWorkout(user) : [];
        bodyweightSetRows(user, workout);
      } catch (_) {}
      return result;
    };
  }

  if (originalRefreshRemaining) {
    refreshRemainingWorkout = function (user, workout) {
      const result = originalRefreshRemaining.apply(this, arguments);
      try { bodyweightSetRows(user, workout); } catch (_) {}
      return result;
    };
  }

  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = '.bodyweight-load{display:flex;align-items:center;min-height:38px;color:var(--text);font-weight:750;background:var(--surface2);border:1px solid var(--line);border-radius:8px;padding:0 10px;font-size:12px}';
    document.head.append(style);
    setTimeout(() => { try { if (typeof renderAll === 'function') renderAll(); } catch (_) {} }, 0);
  }

  window.IronSixBodyweightLoad = { isBodyweightExercise, bodyweightRecommendation };
})();
