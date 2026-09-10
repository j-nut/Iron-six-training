/* Quantization-aware load progression. Numeric performance leads; subjective feedback corroborates it. */
(() => {
  if (window.__ironSixLoadProgressionV2Loaded) return;
  window.__ironSixLoadProgressionV2Loaded = true;

  const originalBaseline = typeof baselineLoadObject === 'function' ? baselineLoadObject : null;
  const originalSuggested = typeof suggestedLoadObject === 'function' ? suggestedLoadObject : null;
  const originalRound = typeof roundLoad === 'function' ? roundLoad : null;
  const clampValue = (n, min, max) => Math.max(min, Math.min(max, n));
  const numeric = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const loadValue = value => {
    if (typeof parseLoad === 'function') return parseLoad(value);
    const match = String(value ?? '').match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  };
  const rangeFor = exercise => typeof repRange === 'function' ? repRange(exercise) : [8, 12];
  const midpointFor = exercise => typeof repTarget === 'function' ? repTarget(exercise) : Math.round(rangeFor(exercise).reduce((a, b) => a + b, 0) / 2);
  const targetRirFor = user => user?.trainingLevel === 'advanced' ? 1.5 : 2;
  const feedbackSupport = feedback => feedback === 'easy' ? 1 : feedback === 'hard' ? -0.5 : 0;

  function rounded(load, exercise, user) {
    return originalRound ? originalRound(load, exercise, user) : Math.max(5, Math.round(load / 5) * 5);
  }

  function discreteStep(weight, exercise, user, direction) {
    const delta = direction > 0 ? 5 : -5;
    let candidate = rounded(weight + delta, exercise, user);
    if (direction > 0 && candidate <= weight) candidate = rounded(weight * 1.08, exercise, user);
    if (direction < 0 && candidate >= weight && weight > 5) candidate = rounded(Math.max(5, weight * 0.92), exercise, user);
    return candidate;
  }

  function recommendationFromSet(user, exercise, set) {
    const weight = loadValue(set?.weight), reps = numeric(set?.reps);
    if (!weight || !reps || reps < 1) return null;
    const [lo, hi] = rangeFor(exercise), midpoint = clampValue(midpointFor(exercise), lo, hi);
    const rirText = String(set?.rir ?? '').trim();
    const rir = rirText === '' ? null : numeric(rirText);
    const feedback = String(set?.feedback || '').toLowerCase();
    const targetRir = targetRirFor(user);
    const wideRange = hi - lo >= 6;
    const finish = (load, target, label, direction = 'hold') => ({
      load,
      reps: clampValue(Math.round(target), lo, hi),
      label,
      direction,
      text: `${label}: try about ${load} lb × ${clampValue(Math.round(target), lo, hi)} next set.`
    });

    if (feedback === 'pain') {
      return finish(weight, clampValue(reps, lo, hi), 'Pain/discomfort noted — do not increase the load', 'hold');
    }

    if (reps < lo || rir === 0) {
      const lower = discreteStep(weight, exercise, user, -1);
      if (lower && lower < weight) return finish(lower, midpoint, 'That set was too hard — reduce the load', 'down');
      return finish(weight, lo, 'That set was too hard — reduce reps and reassess', 'down');
    }

    if (rir === null) {
      if (feedback === 'easy') {
        if (reps + 2 <= hi) return finish(weight, Math.max(midpoint, reps + 2), 'Too easy — add reps before making a large load jump', 'up');
        const higher = discreteStep(weight, exercise, user, 1);
        if (higher > weight) return finish(higher, wideRange ? lo : midpoint, 'Too easy — increase the load', 'up');
      }
      if (feedback === 'hard') return finish(weight, Math.max(lo, Math.min(reps, midpoint)), 'That felt hard — hold the load and reassess', 'hold');
      if (reps > hi) {
        const higher = discreteStep(weight, exercise, user, 1);
        if (higher > weight) return finish(higher, midpoint, 'Reps were above the target — increase the load', 'up');
      }
      return finish(weight, Math.max(lo, Math.min(hi, reps)), reps > hi ? 'Reps were high; add RIR next time for a sharper adjustment' : 'Repeat this load; add RIR for a sharper adjustment');
    }

    const gap = rir - targetRir;
    const supportedGap = gap + feedbackSupport(feedback);

    if (reps >= hi && rir >= 2) {
      const higher = discreteStep(weight, exercise, user, 1);
      if (higher > weight) return finish(higher, midpoint, 'You beat the target — add a little weight', 'up');
      return finish(weight, hi, 'You beat the target, but this is your configured load limit', 'hold');
    }

    // A very large reserve means the set is underdosed. With coarse 5 lb equipment jumps,
    // reset reps toward the bottom of a wide range instead of pretending +2.5% changed the load.
    if (supportedGap >= 3) {
      const resetTarget = wideRange ? lo : midpoint;
      const effectiveReps = reps + rir + Math.max(0, feedbackSupport(feedback));
      const estimatedMax = weight * (1 + effectiveReps / 30);
      const ideal = rounded(estimatedMax / (1 + (resetTarget + targetRir) / 30), exercise, user);
      const higher = discreteStep(weight, exercise, user, 1);
      if (higher > weight && ideal > weight) return finish(higher, resetTarget, feedback === 'easy' ? 'Too easy with plenty in reserve — increase the load' : 'Plenty left in reserve — increase the load', 'up');
      if (reps < hi) return finish(weight, Math.min(hi, reps + Math.max(2, Math.round(supportedGap))), 'Plenty left in reserve — add reps', 'up');
    }

    if (supportedGap >= 1.5 || rir >= 4) {
      if (reps < hi) return finish(weight, Math.min(hi, reps + Math.max(1, Math.round(supportedGap))), feedback === 'easy' ? 'Too easy — add reps' : 'More reps available — progress the reps', 'up');
      const higher = discreteStep(weight, exercise, user, 1);
      if (higher > weight) return finish(higher, midpoint, 'Too much left in reserve — increase the load', 'up');
    }

    if (reps >= lo && reps <= hi && rir >= 1 && rir <= 3) {
      return finish(weight, midpoint, feedback === 'hard' ? 'RIR is on target; hold the load and reassess' : 'Right on target — repeat this load', 'hold');
    }

    return finish(weight, midpoint, 'Keep the same load', 'hold');
  }

  nextSetRecommendation = function (user, exercise, exerciseIndex) {
    const sets = typeof currentSessionCompleted === 'function' ? currentSessionCompleted(user, exerciseIndex) : [];
    if (!sets.length) return null;
    return recommendationFromSet(user, exercise, sets[sets.length - 1]);
  };

  if (originalBaseline) {
    baselineLoadObject = function (user, exercise) {
      const base = originalBaseline(user, exercise);
      if (typeof priorPerformance !== 'function') return base;
      const sets = priorPerformance(user, exercise)?.sets || [];
      if (!sets.length) return base;
      const newestDate = Math.max(...sets.map(set => Number(set._date) || 0));
      const newest = sets.filter(set => (Number(set._date) || 0) === newestDate);
      const latest = newest[newest.length - 1] || sets[sets.length - 1];
      const rec = recommendationFromSet(user, exercise, latest);
      if (!rec || !rec.load) return base;
      const currentLoad = Number(base?.load) || 0;
      const shouldReplaceLoad = !currentLoad || (rec.direction === 'up' && rec.load > currentLoad) || (rec.direction === 'down' && rec.load < currentLoad);
      const load = shouldReplaceLoad ? rec.load : currentLoad;
      const target = rec.load === load && rec.reps ? rec.reps : base.target;
      if (load === currentLoad && target === base.target) return base;
      return {
        ...base,
        load,
        target,
        text: `${load} lb × about ${target}`,
        confidence: 'Recent performance',
        detail: `Latest ${exercise.name} performance was carried forward: ${rec.label.toLowerCase()}.`
      };
    };
  }

  if (originalSuggested) {
    suggestedLoadObject = function (user, exercise, exerciseIndex) {
      if (typeof currentSessionCompleted === 'function' && currentSessionCompleted(user, exerciseIndex).length) {
        const rec = nextSetRecommendation(user, exercise, exerciseIndex);
        if (rec) return {load: rec.load, target: rec.reps, text: `${rec.load} lb × about ${rec.reps}`, confidence: 'Updated from today', detail: rec.text};
      }
      return originalSuggested(user, exercise, exerciseIndex);
    };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-set-feedback]');
      if (!button) return;
      setTimeout(() => {
        if (typeof activeUser !== 'function' || typeof finalWorkout !== 'function' || typeof refreshRemainingWorkout !== 'function') return;
        refreshRemainingWorkout(activeUser(), finalWorkout(activeUser()));
        if (typeof saveData === 'function') saveData();
      }, 0);
    });
  }

  window.IronSixLoadProgressionV2 = {recommendationFromSet};
})();
