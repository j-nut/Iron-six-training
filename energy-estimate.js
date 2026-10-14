/* Rough energy estimate for a finished strength session, shown as a range.
 *
 * Strength training defeats precise calorie counting: effort comes in short bursts, heart rate lags,
 * and load × reps does not translate to energy across bodies and techniques. So this is an honest,
 * deliberately wide estimate built from what Iron Six actually knows: body weight, how long the
 * session took, how many sets were done, how hard each was (RIR), and the training mode. It is
 * display-only and never feeds programming decisions.
 *
 * Method: MET minutes (kcal/min = MET × 3.5 × kg / 200) for working time, rest and warm-up, plus a
 * small allowance for post-exercise recovery. MET values follow the Compendium of Physical Activities
 * (resistance training 3.5 light – 6 vigorous; circuit training is elevated between stations).
 */
(function (root) {
  const COMPOUND = new Set(['bench', 'chest_press', 'overhead_press', 'squat', 'hinge', 'split_squat', 'pullup', 'row']);
  const PACE_WORK = {steady: 30, balanced: 40, intense: 45};
  const WARMUP_MINUTES = 3, WARMUP_MET = 3.0, AFTERBURN = 1.08;
  const LB_TO_KG = 0.45359237;

  const num = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };
  const kcalPerMinute = (met, kg) => met * 3.5 * kg / 200;
  const round10 = value => Math.max(10, Math.round(value / 10) * 10);

  function rirOf(set) {
    const text = String(set?.rir ?? '').trim();
    return text === '' ? null : num(text);
  }

  // Harder sets (fewer reps in reserve) cost more; isolation work costs less than big compound lifts.
  function workMet(set, exercise, light) {
    const rir = rirOf(set);
    let met = rir === null ? (light ? 3.5 : 5) : rir <= 1 ? 6 : rir <= 3 ? 5 : 3.5;
    if (!COMPOUND.has(exercise?.seedKey)) met *= 0.8;
    return met;
  }

  function workSeconds(set, circuit, paceWork) {
    if (circuit) return paceWork;
    const hold = num(set?.seconds ?? set?.duration);
    if (hold > 0) return Math.min(hold, 180);
    const reps = num(set?.reps);
    return reps > 0 ? Math.min(reps * 3.5, 120) : 30;
  }

  // Typical time per set when the session's real length is unknown (logged after the fact, or old data).
  function typicalSetSeconds(exercise, circuit, paceWork) {
    if (circuit) return paceWork + 20;
    return 45 + (COMPOUND.has(exercise?.seedKey) ? 120 : 75);
  }

  /* Real elapsed minutes from set timestamps (the first to the last completed set, plus warm-up and the
   * first set itself). Returns null when the timestamps can't describe a real session: sets logged all
   * at once afterwards, or a workout resumed across days. */
  function elapsedFromSets(today) {
    const stamps = Object.values(today || {}).filter(s => s && s.done && num(s._updatedAt) > 0).map(s => Number(s._updatedAt)).sort((a, b) => a - b);
    if (stamps.length < 2) return null;
    const minutes = (stamps[stamps.length - 1] - stamps[0]) / 60000 + 1.5 + WARMUP_MINUTES;
    return minutes >= 8 && minutes <= 240 ? Math.round(minutes) : null;
  }

  /* session: a finished history entry ({details, trainingMode, circuitPace, workoutDifficulty, elapsedMinutes}).
   * Returns {low, high, mid, minutes, timeSource} in kcal, or null when it can't be estimated honestly. */
  function estimateSession(bodyWeightLb, session) {
    const kg = num(bodyWeightLb) * LB_TO_KG;
    const details = Array.isArray(session?.details) ? session.details : [];
    const sets = details.flatMap(exercise => (exercise.sets || []).filter(s => s && s.done !== false).map(set => ({set, exercise})));
    if (!(kg > 25) || !sets.length) return null;
    const circuit = session.trainingMode === 'circuit';
    const light = session.workoutDifficulty === 'light';
    const paceWork = PACE_WORK[session.circuitPace] || PACE_WORK.balanced;

    let workMinutes = 0, workKcal = 0;
    for (const {set, exercise} of sets) {
      const minutes = workSeconds(set, circuit, paceWork) / 60;
      workMinutes += minutes;
      workKcal += kcalPerMinute(workMet(set, exercise, light), kg) * minutes;
    }

    const recorded = num(session.elapsedMinutes);
    const estimatedMinutes = WARMUP_MINUTES + sets.reduce((sum, {exercise}) => sum + typicalSetSeconds(exercise, circuit, paceWork), 0) / 60;
    const totalMinutes = recorded > 0 ? recorded : estimatedMinutes;
    const restMinutes = Math.max(0, totalMinutes - workMinutes - WARMUP_MINUTES);
    // Breathing and heart rate stay up between sets (more so between circuit stations), so rest is
    // costed above standing. Calibrated so a typical 45-minute session lands in the range indirect
    // calorimetry studies measure (~4–5 kcal/min for an 80 kg lifter).
    const restKcal = kcalPerMinute(circuit ? 3.5 : 2.5, kg) * restMinutes;
    const warmupKcal = kcalPerMinute(WARMUP_MET, kg) * Math.min(WARMUP_MINUTES, totalMinutes);

    const mid = (workKcal + restKcal + warmupKcal) * AFTERBURN;
    const spread = recorded > 0 ? (circuit ? 0.25 : 0.3) : 0.4;
    return {
      low: round10(mid * (1 - spread)),
      high: round10(mid * (1 + spread)),
      mid: Math.round(mid),
      minutes: Math.round(totalMinutes),
      timeSource: recorded > 0 ? 'recorded' : 'estimated',
    };
  }

  function label(estimate) {
    return estimate ? `~${estimate.low}–${estimate.high} kcal` : '';
  }

  const api = {estimateSession, elapsedFromSets, label};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.IronSixEnergy = api;
})(typeof window !== 'undefined' ? window : null);
