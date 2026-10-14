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
  // Goal-aware (core.js goalTargetRir): general fitness works about one rep further from failure.
  const targetRirFor = user => typeof goalTargetRir === 'function' ? goalTargetRir(user) : user?.trainingLevel === 'advanced' ? 1.5 : 2;
  const feedbackSupport = feedback => feedback === 'easy' ? 1 : feedback === 'hard' ? -0.5 : 0;

  function rounded(load, exercise, user) {
    return originalRound ? originalRound(load, exercise, user) : Math.max(5, Math.round(load / 5) * 5);
  }

  const stepFor = (exercise, user) => typeof loadIncrement === 'function' ? loadIncrement(exercise, user) : 5;
  const freeWeight = exercise => typeof exerciseLoadEquipment === 'function' && ['barbell', 'dumbbell', 'landmine'].includes(exerciseLoadEquipment(exercise));

  function discreteStep(weight, exercise, user, direction) {
    const step = stepFor(exercise, user);
    const delta = direction > 0 ? step : -step;
    let candidate = rounded(weight + delta, exercise, user);
    if (direction > 0 && candidate <= weight) candidate = rounded(weight * 1.08, exercise, user);
    if (direction < 0 && candidate >= weight && weight > step) candidate = rounded(Math.max(step, weight * 0.92), exercise, user);
    return candidate;
  }

  // `between` marks a judgement about the next session rather than the next set. Between
  // sessions, normal end-of-session fatigue is expected: reaching the top of the range with
  // one rep left earns more load, and a hard but in-range set is repeated, not cut.
  function recommendationFromSet(user, exercise, set, between = false) {
    const weight = loadValue(set?.weight), reps = numeric(set?.reps);
    if (!weight || !reps || reps < 1) return null;
    const [lo, hi] = rangeFor(exercise), midpoint = clampValue(midpointFor(exercise), lo, hi);
    const rirText = String(set?.rir ?? '').trim();
    const rir = rirText === '' ? null : numeric(rirText);
    const feedback = String(set?.feedback || '').toLowerCase();
    const targetRir = targetRirFor(user);
    const wideRange = hi - lo >= 6;
    const finish = (load, target, label, direction = 'hold', maxReps = hi) => {
      const repsOut = clampValue(Math.round(target), lo, maxReps);
      return {load, reps: repsOut, label, direction, text: `${label}: try about ${load} lb × ${repsOut} next set.`};
    };
    // On light free weights one step can be a huge jump (10 → 15 lb lateral raises is +50%).
    // Jumps over 15% first build reps a little past the range, then move up.
    const extraReps = Math.max(2, Math.round((hi - lo) / 2));
    const up = (load, target, label) => {
      if (freeWeight(exercise) && load > weight * 1.15) {
        if (reps < hi + extraReps) {
          const hint = stepFor(exercise, user) > 2.5 ? ' (or set a 2.5 lb jump in your profile if your weights allow it)' : '';
          return finish(weight, reps + 1, `${load} lb is too big a jump from ${weight} lb — build reps first${hint}`, 'up', hi + extraReps);
        }
        return finish(load, lo, 'Move up — expect fewer reps at the heavier weight at first', 'up');
      }
      return finish(load, target, label, 'up');
    };

    if (feedback === 'pain') {
      return finish(weight, clampValue(reps, lo, hi), 'Pain/discomfort noted — do not increase the load', 'hold');
    }

    if (reps < lo || (rir === 0 && !between)) {
      const lower = discreteStep(weight, exercise, user, -1);
      if (lower && lower < weight) return finish(lower, midpoint, 'That set was too hard — reduce the load', 'down');
      return finish(weight, lo, 'That set was too hard — reduce reps and reassess', 'down');
    }
    if (between && rir === 0) return finish(weight, Math.min(reps, hi), 'Hard but in range — repeat this load before adding weight', 'hold');

    if (rir === null) {
      if (feedback === 'easy') {
        if (reps + 2 <= hi) return finish(weight, Math.max(midpoint, reps + 2), 'Too easy — add reps before making a large load jump', 'up');
        const higher = discreteStep(weight, exercise, user, 1);
        if (higher > weight) return up(higher, wideRange ? lo : midpoint, 'Too easy — increase the load');
      }
      if (feedback === 'hard') return finish(weight, Math.max(lo, Math.min(reps, midpoint)), 'That felt hard — hold the load and reassess', 'hold');
      if (reps > hi) {
        const higher = discreteStep(weight, exercise, user, 1);
        if (higher > weight) return up(higher, midpoint, 'Reps were above the target — increase the load');
      }
      return finish(weight, Math.max(lo, Math.min(hi, reps)), reps > hi ? 'Reps were high; add RIR next time for a sharper adjustment' : 'Repeat this load; add RIR for a sharper adjustment');
    }

    const gap = rir - targetRir;
    const supportedGap = gap + feedbackSupport(feedback);

    if (reps >= hi && rir >= (between ? 1 : 2)) {
      const higher = discreteStep(weight, exercise, user, 1);
      if (higher > weight) return up(higher, midpoint, 'You beat the target — add a little weight');
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
      if (higher > weight && ideal > weight) return up(higher, resetTarget, feedback === 'easy' ? 'Too easy with plenty in reserve — increase the load' : 'Plenty left in reserve — increase the load');
      if (reps < hi) return finish(weight, Math.min(hi, reps + Math.max(2, Math.round(supportedGap))), 'Plenty left in reserve — add reps', 'up');
    }

    if (supportedGap >= 1.5 || rir >= 4) {
      if (reps < hi) return finish(weight, Math.min(hi, reps + Math.max(1, Math.round(supportedGap))), feedback === 'easy' ? 'Too easy — add reps' : 'More reps available — progress the reps', 'up');
      const higher = discreteStep(weight, exercise, user, 1);
      if (higher > weight) return up(higher, midpoint, 'Too much left in reserve — increase the load');
    }

    if (reps >= lo && reps <= hi && rir >= 1 && rir <= 3) {
      if (between && feedback !== 'hard') return finish(weight, Math.max(midpoint, reps + 1), 'Right on target — same load, aim for one more rep', 'hold');
      return finish(weight, midpoint, feedback === 'hard' ? 'RIR is on target; hold the load and reassess' : 'Right on target — repeat this load', 'hold');
    }

    return finish(weight, midpoint, 'Keep the same load', 'hold');
  }

  // The set that best shows what the lifter can do: a pain report wins outright, otherwise the
  // strongest set by estimated max. Later sets normally lose reps to fatigue, so judging the
  // session by its last set would cut the load after a perfectly good workout.
  function representativeSet(sets) {
    const pain = sets.find(set => String(set?.feedback || '').toLowerCase() === 'pain');
    if (pain) return pain;
    let best = null, bestScore = -Infinity;
    for (const set of sets) {
      const weight = loadValue(set?.weight), reps = numeric(set?.reps);
      if (!weight || !reps) continue;
      const rir = numeric(String(set?.rir ?? '').trim() === '' ? null : set.rir) ?? 0;
      const score = weight * (1 + (reps + rir) / 30);
      if (score > bestScore) { best = set; bestScore = score; }
    }
    return best || sets[sets.length - 1];
  }

  // Relative strength of common variants within one movement and equipment type. Only ratios
  // below 1 are applied, so a new variant never starts heavier than the lift it came from.
  const VARIANT_FACTORS = [[/\bpaused?\b/, 0.9], [/\btempo\b/, 0.85], [/\bincline\b/, 0.82], [/\bclose-grip\b/, 0.9], [/\bbox squat\b/, 0.95], [/\bfront squat\b/, 0.8], [/\bdeficit\b/, 0.9]];
  const variantFactor = name => VARIANT_FACTORS.reduce((f, [pattern, factor]) => pattern.test(name) ? f * factor : f, 1);

  // When the program rotates to a variant with no history (Bench -> Incline Bench), start from
  // the related lift on the same equipment instead of a body-weight guess.
  function relatedLiftBaseline(user, exercise, base) {
    if (base?.confidence === 'Benchmark-based' || !freeWeight(exercise)) return null;
    if (typeof historySetsFor !== 'function' || typeof e1rmFromSet !== 'function') return null;
    const name = String(exercise.name || '').trim().toLowerCase(), equipment = exerciseLoadEquipment(exercise);
    const related = historySetsFor(user, d => d.base === exercise.base && String(d.name || '').trim().toLowerCase() !== name && exerciseLoadEquipment(d) === equipment);
    const bestBySession = new Map();
    for (const set of related) {
      const e1 = e1rmFromSet(set);
      if (!e1) continue;
      const key = `${set._date}|${set._exercise}`;
      const ratio = Math.min(1, variantFactor(name) / variantFactor(String(set._exercise || '').toLowerCase()));
      const adjusted = e1 * ratio * 0.95;
      if (!bestBySession.has(key) || bestBySession.get(key).adjusted < adjusted) bestBySession.set(key, {adjusted, source: set._exercise, date: set._date});
    }
    const recent = [...bestBySession.values()].sort((a, b) => b.date - a.date).slice(0, 3);
    if (!recent.length) return null;
    const e1 = recent.map(r => r.adjusted).sort((a, b) => a - b)[Math.floor(recent.length / 2)];
    const target = Number(base?.target) || midpointFor(exercise);
    const load = rounded(e1 / (1 + (target + targetRirFor(user)) / 30), exercise, user);
    if (!load) return null;
    const result = {...base, load, target, text: `${load} lb × about ${target}`, confidence: 'Estimated from a related lift', detail: `Estimated conservatively from your ${recent[0].source}; your first sets here will replace this estimate.`};
    return typeof applyTrainerMemory === 'function' ? applyTrainerMemory(user, exercise, result) : result;
  }

  // First-day loads from the strength check done in onboarding. Only used when the exercise has
  // no logged history (exact or related lift). A barbell reference never seeds a per-hand
  // dumbbell exercise and vice versa; a landmine exercise counts as barbell-class at 70%.
  const STRENGTH_REF_KEYS = {squat: 'squat', bench: 'bench', chest_press: 'bench', hinge: 'hinge', overhead_press: 'overhead_press', row: 'row'};
  const STRENGTH_REF_LABELS = {squat: 'squat', bench: 'bench press', hinge: 'hinge (deadlift-style) lift', overhead_press: 'overhead press', row: 'row'};
  function readStrengthRef(user, key) {
    const raw = user && user.strengthRefs && typeof user.strengthRefs === 'object' ? user.strengthRefs[key] : null;
    if (!raw || typeof raw !== 'object') return null;
    const weight = Number(raw.weight), reps = Math.round(Number(raw.reps));
    const equipment = raw.equipment === 'dumbbell' || raw.equipment === 'barbell' ? raw.equipment : null;
    if (!equipment || !(weight > 0 && weight <= 1500) || !(reps >= 1 && reps <= 30)) return null;
    return {weight, reps, equipment};
  }
  function seedStrength(exercise) {
    const factors = typeof SEED_FACTORS !== 'undefined' ? SEED_FACTORS : {};
    return /good morning/i.test(String(exercise?.name || '')) ? 0.25 : factors[exercise?.seedKey];
  }
  function strengthRefBaseline(user, exercise, base) {
    if (!freeWeight(exercise) || typeof exerciseLoadEquipment !== 'function') return null;
    const key = STRENGTH_REF_KEYS[String(exercise.seedKey || '')];
    const ref = key ? readStrengthRef(user, key) : null;
    if (!ref) return null;
    const equipment = exerciseLoadEquipment(exercise);
    if (ref.equipment !== (equipment === 'dumbbell' ? 'dumbbell' : 'barbell')) return null;
    const own = seedStrength(exercise), reference = typeof SEED_FACTORS !== 'undefined' ? SEED_FACTORS[key] : null;
    // Related movements (chest press vs bench, good morning vs hinge) start proportionally lighter,
    // and no variant ever starts heavier than the reference lift itself.
    const slotRatio = own && reference ? Math.min(1, own / reference) : 1;
    const ratio = Math.min(1, slotRatio * variantFactor(String(exercise.name || '').toLowerCase()) * (equipment === 'landmine' ? 0.7 : 1));
    const e1 = ref.weight * (1 + Math.min(ref.reps, 12) / 30);
    const target = Number(base?.target) || midpointFor(exercise);
    let load = rounded(e1 * ratio * 0.95 / (1 + (target + targetRirFor(user)) / 30), exercise, user);
    if (load && equipment === 'barbell') load = Math.max(load, Math.min(45, ref.weight));
    if (!load) return null;
    const result = {...base, load, target, text: `${load} lb × about ${target}`, confidence: 'From your strength check', detail: `Based on the ${STRENGTH_REF_LABELS[key]} you entered during setup (${ref.weight} lb${ref.equipment === 'dumbbell' ? ' per hand' : ''} × ${ref.reps}); your first sets here replace this estimate.`};
    return typeof applyTrainerMemory === 'function' ? applyTrainerMemory(user, exercise, result) : result;
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
      if (!sets.length) return relatedLiftBaseline(user, exercise, base) || strengthRefBaseline(user, exercise, base) || base;
      const newestDate = Math.max(...sets.map(set => Number(set._date) || 0));
      const newest = sets.filter(set => (Number(set._date) || 0) === newestDate);
      let rec = recommendationFromSet(user, exercise, representativeSet(newest), true);
      // After two or more weeks away, strength drops: start about 5% lighter per two weeks off,
      // never more than 20%, and don't add load on the first session back.
      const daysOff = (Date.now() - newestDate) / 864e5;
      // History dated before 2024 (imported without real timestamps) is never treated as a layoff.
      if (rec && daysOff >= 14 && newestDate >= Date.UTC(2024, 0, 1)) {
        const weight = loadValue(representativeSet(newest)?.weight) || rec.load;
        const factor = Math.max(0.8, 1 - 0.05 * Math.floor(daysOff / 14));
        const load = rounded(Math.min(rec.load, weight) * factor, exercise, user) || rec.load;
        rec = {...rec, load, direction: 'down', label: `Welcome back after ${Math.round(daysOff)} days — start lighter and rebuild`};
      }
      // A set that fell below the rep range means the load is not yet owned: hold, don't add.
      if (rec?.direction === 'up' && rec.load > (loadValue(representativeSet(newest)?.weight) || 0)) {
        const [lo] = rangeFor(exercise);
        const missed = newest.some(set => numeric(set?.reps) !== null && numeric(set.reps) < lo);
        if (missed) {
          const weight = loadValue(representativeSet(newest).weight);
          rec = {load: weight, reps: midpointFor(exercise), label: 'One set fell short of the range — repeat this load', direction: 'hold'};
        }
      }
      if (!rec || !rec.load) return base;
      const currentLoad = Number(base?.load) || 0;
      // The newest completed performance outranks older medians, including a manual
      // load reduction that was on target. Otherwise an old heavy set silently wins.
      const load = rec.load;
      const target = rec.reps || base.target;
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
      const result = originalSuggested(user, exercise, exerciseIndex);
      // Session adaptation marks deload and pain-affected exercises with a lighter load factor.
      const factor = Number(exercise?._loadFactor);
      if (result?.load && factor > 0 && factor < 1) {
        const load = rounded(result.load * factor, exercise, user);
        if (load && load < result.load) return {...result, load, text: `${load} lb × about ${result.target}`, detail: exercise._adaptReason || result.detail};
      }
      return result;
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

  window.IronSixLoadProgressionV2 = {recommendationFromSet, strengthRefBaseline};
})();
