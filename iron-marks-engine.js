/* Iron Marks: achievements derived entirely from finished training history.
 *
 * Nothing here is a stored counter. Every mark is recomputed from the profile's history, so marks
 * survive sync, restore and reinstall, and a duplicated or replayed session cannot inflate them.
 * A session only counts if it passes the same successful-exposure test the program uses to move
 * a workout from Foundation to Momentum to Apex, so logging one set and pressing Finish earns
 * nothing. Consistency is counted in totals, never in streaks: missing a day never costs a mark.
 *
 * Pure logic: no DOM, storage or network. Loaded in the browser and required by Node tests.
 */
(() => {
  const ROTATION = ['push_a','lower_a','pull_a','push_b','lower_b','pull_b'];
  const LEGACY_ROTATION = ['chest','shoulders_arms','lower_strength','back','upper_specialization','lower_hypertrophy'];
  const LEG_KEYS = ['lower_a','lower_b','lower_strength','lower_hypertrophy'];
  const DAY = 864e5;

  // Ring tiers come from completed rotations. Colors are fixed metals, independent of accent theme.
  const RINGS = [
    {id:'iron',   label:'Iron',    rotations:3,  color:'#8f969e'},
    {id:'bronze', label:'Bronze',  rotations:6,  color:'#cd8a4d'},
    {id:'steel',  label:'Steel',   rotations:12, color:'#b9c8d8'},
    {id:'gold',   label:'Gold',    rotations:26, color:'#f2c14e'},
    {id:'emerald',label:'Emerald', rotations:52, color:'#2ee580'}
  ];

  const EMBLEMS = {
    spark:'Spark', hex:'Hex', hammer:'Hammer', anvil:'Anvil', crown:'Crown',
    kettlebell:'Kettlebell', compass:'Compass', sunrise:'Sunrise', gauge:'Gauge', sixsix:'Sixty-Six'
  };

  function exposureTest(h, blankIsUnlogged) {
    if (!h || !Array.isArray(h.details) || !h.details.length) return false;
    const planned = Number(h.plannedSets) || Number(h.sets) || 1, completed = Number(h.sets) || 0, completion = completed / Math.max(1, planned);
    const rirs = [];
    h.details.forEach(d => (d.sets || []).forEach(s => { const r = Number(s.rir); if (blankIsUnlogged && (s.rir === '' || s.rir == null)) return; if (Number.isFinite(r)) rirs.push(r); }));
    const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : 2;
    return completion >= 0.72 && avgRir >= 0.25 && avgRir <= 3.75;
  }
  // Exactly core.js successfulExposure, including its reading of a blank RIR as 0. The Forge marks
  // mirror the program's Foundation -> Momentum -> Apex ladder, so they must never run ahead of it.
  const successful = h => exposureTest(h, false);
  // Everything else counts a session on the same completion and effort thresholds, but treats a
  // blank RIR as "not logged" so people who skip the RIR field can still earn consistency marks.
  const qualifies = h => exposureTest(h, true);

  function sessionsOf(user) {
    const seen = new Set(), out = [];
    for (const h of Array.isArray(user?.history) ? user.history : []) {
      const ts = Number(h?.ts);
      if (!Number.isFinite(ts)) continue;
      const id = h.sessionId || String(ts);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(h);
    }
    return out.sort((a, b) => a.ts - b.ts);
  }

  const loggedSets = h => (h.details || []).flatMap(d => d.sets || []);
  const everySetHasRir = h => { const sets = loggedSets(h); return sets.length > 0 && sets.every(s => s.rir !== '' && s.rir != null && Number.isFinite(Number(s.rir))); };
  const lowRecovery = h => { const r = h.readiness || {}, e = Number(r.energy), s = Number(r.soreness); return (Number.isFinite(e) && e <= 2) || (Number.isFinite(s) && s >= 4); };
  function weekKey(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  const count = (list, key) => list.filter(h => h.workoutKey === key).length;
  const minOver = (list, keys) => Math.min(...keys.map(k => count(list, k)));
  // Workout level uses the program's own ladder: 4 successful exposures -> Momentum, 8 -> Apex.
  const level = n => n >= 8 ? 3 : n >= 4 ? 2 : 1;

  // Every mark reads one stats snapshot. value is progress toward target; unlocked when value >= target.
  function stats(sessions) {
    const good = sessions.filter(qualifies), forged = sessions.filter(successful);
    const perKey = Object.fromEntries(ROTATION.map(k => [k, count(good, k)]));
    const levels = ROTATION.map(k => level(count(forged, k)));
    let orderedRun = 0, bestRun = 0, prevKey = null, runKeys = new Set();
    for (const h of sessions) {
      const i = ROTATION.indexOf(h.workoutKey), follows = prevKey !== null && ROTATION[(ROTATION.indexOf(prevKey) + 1) % 6] === h.workoutKey;
      if (i < 0 || !qualifies(h)) { orderedRun = 0; runKeys = new Set(); prevKey = null; continue; }
      if (follows && !runKeys.has(h.workoutKey)) { orderedRun++; runKeys.add(h.workoutKey); }
      else { orderedRun = 1; runKeys = new Set([h.workoutKey]); }
      bestRun = Math.max(bestRun, orderedRun); prevKey = h.workoutKey;
    }
    let comebacks = 0;
    for (let i = 1; i < sessions.length; i++) if (qualifies(sessions[i]) && sessions[i].ts - sessions[i - 1].ts >= 14 * DAY) comebacks++;
    const weeks = new Map();
    for (const h of good) weeks.set(weekKey(h.ts), (weeks.get(weekKey(h.ts)) || 0) + 1);
    return {
      sessions: sessions.length,
      qualifying: good.length,
      rotations: minOver(good, ROTATION) + minOver(good, LEGACY_ROTATION),
      keysDone: ROTATION.filter(k => perKey[k] > 0).length,
      momentumKeys: levels.filter(l => l >= 2).length,
      apexKeys: levels.filter(l => l >= 3).length,
      bestExposures: Math.max(...ROTATION.map(k => count(forged, k))),
      blocks: ROTATION.reduce((n, k) => n + Math.floor(count(forged, k) / 4), 0),
      legDays: good.filter(h => LEG_KEYS.includes(h.workoutKey)).length,
      pushPull: Math.min(perKey.push_a, perKey.push_b, perKey.pull_a, perKey.pull_b),
      orderedRun: bestRun,
      honest: good.filter(everySetHasRir).length,
      complete: good.filter(h => (Number(h.sets) || 0) >= (Number(h.plannedSets) || Infinity)).length,
      comebacks,
      activeWeeks: [...weeks.values()].filter(n => n >= 2).length,
      listened: good.filter(lowRecovery).length
    };
  }

  const MARKS = [
    // The Six
    {id:'first_rep', group:'six', title:'First Rep', text:'Finish your first successful session.', target:1, value:s => s.qualifying, emblem:'spark'},
    {id:'full_six', group:'six', title:'Full Six', text:'Finish all six sessions of the rotation.', target:6, value:s => s.keysDone, emblem:'hex'},
    ...RINGS.map(r => ({id:`rotations_${r.rotations}`, group:'six', title:`${r.label} Ring`, text:`Complete ${r.rotations} full rotations.`, target:r.rotations, value:s => s.rotations, ring:r.id})),
    {id:'six_six', group:'six', title:'Sixty-Six', text:'Finish 66 successful sessions.', target:66, value:s => s.qualifying, emblem:'sixsix', hidden:true},
    // The Forge
    {id:'momentum', group:'forge', title:'Momentum', text:'Bring any session up to Momentum (4 successful sessions of it).', target:4, value:s => s.bestExposures, emblem:'hammer'},
    {id:'all_momentum', group:'forge', title:'Forged', text:'Bring all six sessions up to Momentum.', target:6, value:s => s.momentumKeys, emblem:'anvil'},
    {id:'apex', group:'forge', title:'Apex', text:'Bring any session up to Apex (8 successful sessions of it).', target:8, value:s => s.bestExposures},
    {id:'full_apex', group:'forge', title:'Full Apex', text:'Bring all six sessions up to Apex.', target:6, value:s => s.apexKeys, emblem:'crown'},
    {id:'benchmark_block', group:'forge', title:'Benchmark Block', text:'Complete a four-session benchmark block.', target:1, value:s => s.blocks},
    // Balance
    {id:'leg_day', group:'balance', title:'Never Skip Leg Day', text:'Finish 12 leg sessions.', target:12, value:s => s.legDays, emblem:'kettlebell'},
    {id:'push_pull', group:'balance', title:'Push–Pull Harmony', text:'Finish both Push and both Pull days five times.', target:5, value:s => s.pushPull},
    {id:'no_detours', group:'balance', title:'No Detours', text:'Finish a whole rotation in order, without changing workouts.', target:6, value:s => s.orderedRun, emblem:'compass'},
    // Showing up
    {id:'back_at_it', group:'consistency', title:'Back at It', text:'Return and finish a session after two weeks or more away.', target:1, value:s => s.comebacks, emblem:'sunrise'},
    ...[4, 12, 26, 52].map(n => ({id:`active_weeks_${n}`, group:'consistency', title:`${n} Active Weeks`, text:`Train at least twice in ${n} different weeks. Weeks never need to be in a row.`, target:n, value:s => s.activeWeeks})),
    // Honest training
    {id:'honest_effort', group:'honest', title:'Honest Effort', text:'Log RIR on every set in 10 sessions.', target:10, value:s => s.honest, emblem:'gauge'},
    {id:'listened', group:'honest', title:'Listened to Your Body', text:'Finish 3 sessions on low-recovery days, as the program adjusted them.', target:3, value:s => s.listened},
    {id:'complete_sessions', group:'honest', title:'Nothing Left Out', text:'Finish every planned set in 10 sessions.', target:10, value:s => s.complete}
  ];

  const GROUPS = [
    {id:'six', title:'The Six'},
    {id:'forge', title:'The Forge'},
    {id:'balance', title:'Balance'},
    {id:'consistency', title:'Showing Up'},
    {id:'honest', title:'Honest Training'}
  ];

  function evaluate(user) {
    const sessions = sessionsOf(user), final = stats(sessions);
    // unlockedAt: the finish time of the session that first crossed the target. Every mark's value
    // only grows as history grows, so a binary search over history prefixes finds it; prefix stats
    // are memoised because marks share most of their probes.
    const unlockedAt = {}, memo = new Map();
    const prefix = n => { if (!memo.has(n)) memo.set(n, stats(sessions.slice(0, n))); return memo.get(n); };
    for (const m of MARKS) {
      if (m.value(final) < m.target) continue;
      let lo = 1, hi = sessions.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (m.value(prefix(mid)) >= m.target) hi = mid; else lo = mid + 1; }
      unlockedAt[m.id] = sessions[lo - 1]?.ts || null;
    }
    const marks = MARKS.map(m => {
      const value = m.value(final), unlocked = value >= m.target;
      return {id:m.id, group:m.group, title:m.title, text:m.text, target:m.target, value:Math.min(value, m.target), unlocked, unlockedAt:unlocked ? unlockedAt[m.id] || null : null, emblem:m.emblem || null, ring:m.ring || null, hidden:!!m.hidden && !unlocked};
    });
    const ring = [...RINGS].reverse().find(r => final.rotations >= r.rotations) || null;
    const nextRing = RINGS.find(r => final.rotations < r.rotations) || null;
    return {version:1, stats:final, marks, emblems:marks.filter(m => m.unlocked && m.emblem).map(m => m.emblem), ring, nextRing};
  }

  // The worn emblem is honoured only while it is still earned (history can be deleted).
  function avatarFor(user, result = evaluate(user)) {
    const chosen = user?.trainerMemory?.achievements?.emblem || null;
    return {ring:result.ring, emblem:chosen && result.emblems.includes(chosen) ? chosen : null};
  }

  const api = {ROTATION, RINGS, EMBLEMS, MARKS, GROUPS, qualifies, successful, evaluate, avatarFor};
  if (typeof window !== 'undefined') window.IronSixMarksEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
