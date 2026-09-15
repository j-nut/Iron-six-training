/* Iron Marks: achievements derived entirely from finished training history.
 *
 * Nothing here is a stored counter. Every mark is recomputed from the profile's history, so marks
 * survive sync, restore and reinstall, and a duplicated or replayed session cannot inflate them.
 * A session only counts if it passes the program's successful-exposure test (core.js
 * successfulExposure): most planned sets done at a sensible average effort, with a blank RIR
 * treated as not logged. Logging one set and pressing Finish earns nothing. Consistency is
 * counted in totals, never in streaks: missing a day never costs a mark.
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

  // Same rule as core.js successfulExposure (a parity test holds them together).
  function qualifies(h) {
    if (!h || !Array.isArray(h.details) || !h.details.length) return false;
    const planned = Number(h.plannedSets) || Number(h.sets) || 1, completed = Number(h.sets) || 0, completion = completed / Math.max(1, planned);
    const rirs = [];
    h.details.forEach(d => (d.sets || []).forEach(s => { if (s.rir === '' || s.rir == null) return; const r = Number(s.rir); if (Number.isFinite(r)) rirs.push(r); }));
    const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : 2;
    return completion >= 0.72 && avgRir >= 0.25 && avgRir <= 3.75;
  }

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
  // Forge levels: 4 successful sessions of a workout -> Momentum, 8 -> Apex. The current program
  // cycles its Foundation/Momentum/Apex blocks every 4 finished sessions; marks require successful
  // ones, so a mark can trail the app's block label but never claim more than was trained.
  const level = n => n >= 8 ? 3 : n >= 4 ? 2 : 1;

  // Every mark reads one stats snapshot. value is progress toward target; unlocked when value >= target.
  function stats(sessions) {
    const good = sessions.filter(qualifies), forged = good;
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

  // Progress recognition is deliberately separate from programming and load recommendations.
  // One best comparable set per exercise/load/RIR/day; repeat an improvement on another day.
  function performanceOf(sessions) {
    const records = new Map(), events = [];
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    for (const h of sessions) {
      if (!qualifies(h)) continue;
      const day = Math.floor(Number(h.ts) / DAY), best = new Map();
      for (const d of h.details || []) {
        const name = norm(d.name);
        if (!name || /bodyweight|assisted|band\b|plank|carry|walk|run|hold|isometric/.test(name)) continue;
        for (const set of d.sets || []) {
          if (set.done === false || set.rir == null || String(set.rir).trim() === '') continue;
          const load = String(set.weight ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(lb|lbs|kg)?$/i);
          const weight = load ? Number(load[1]) : 0, reps = Number(set.reps), rir = Number(set.rir);
          const unit = norm(load?.[2] || set.unit || d.unit || h.unit || 'lb').replace(/^lbs$/, 'lb');
          if (!['lb','kg'].includes(unit) || !(weight > 0 && weight <= 1500) || !Number.isInteger(reps) || reps < 3 || reps > 20 || !Number.isFinite(rir) || rir < 1 || rir > 4) continue;
          const exercise = [name,norm(d.base),norm(d.seedKey)].join('|');
          const key = [exercise,weight,unit,rir,h.trainingMode || 'traditional'].join('|');
          if (!best.has(key) || reps > best.get(key).reps) best.set(key, {exercise,name:d.name,weight,unit,rir,reps,day,ts:h.ts});
        }
      }
      for (const [key, point] of best) {
        const record = records.get(key);
        if (!record) { records.set(key, {best:point.reps,day,ts:Number(h.ts),pending:null}); continue; }
        // Two saves on one date cannot supply a baseline and confirmation.
        if (Number(h.ts) - record.ts < DAY) continue;
        record.day = day;record.ts = Number(h.ts);
        if (record.pending && point.reps >= record.pending.reps && Number(h.ts) - Number(record.pending.ts) >= DAY) {
          // A single session/exercise earns at most one progress event, even with many loads.
          if (!events.some(e => e.exercise === point.exercise && Number(h.ts)-Number(e.ts)<DAY)) {
            events.push({...point,from:record.best,to:record.pending.reps,firstImprovedAt:record.pending.ts});
          }
          record.best = record.pending.reps;
          record.pending = null;
        } else if (point.reps > record.best) {
          record.pending = point;
        } else record.pending = null;
      }
    }
    return events;
  }

  function blocksOf(sessions, improvements) {
    const completed = [], counts = Object.fromEntries(ROTATION.map(k => [k,0]));
    let start = null, total = 0;
    for (const h of sessions) {
      if (!qualifies(h) || !ROTATION.includes(h.workoutKey)) continue;
      if (start == null) start = h.ts;
      counts[h.workoutKey]++; total++;
      if (ROTATION.every(k => counts[k] >= 4)) {
        const progress = improvements.filter(e => e.ts >= start && e.ts <= h.ts);
        completed.push({number:completed.length + 1,start,end:h.ts,sessions:total,counts:{...counts},improvements:progress});
        ROTATION.forEach(k => { counts[k] = 0; });start = null;total = 0;
      }
    }
    return {completed,current:{number:completed.length+1,start,sessions:total,counts,done:ROTATION.reduce((n,k)=>n+Math.min(4,counts[k]),0),target:24}};
  }

  const PROGRESS_MARKS = [
    ...[1,5,12,25].map((n,i)=>({id:`progress_confirmed_${n}`,group:'progress',title:['Progress, Repeated','Building on Better','Lasting Progress','Progress Practice'][i],text:`Confirm ${n} rep improvement${n===1?'':'s'} on another day at the same load and logged RIR.`,target:n,metric:'improvements'})),
    ...[3,6].map(n=>({id:`progress_variety_${n}`,group:'progress',title:n===3?'Across the Board':'Growing Your Range',text:`Confirm rep improvements in ${n} different exercises.`,target:n,metric:'exercises'})),
    ...[1,3,6,12].map((n,i)=>({id:`balanced_blocks_${n}`,group:'blocks',title:['Built in Balance','Balance Builder','Seasoned Practice','A Body of Work'][i],text:`Finish ${n} balanced block${n===1?'':'s'}: four successful sessions of each of the six program days per block.`,target:n,metric:'blocks'}))
  ];
  const TITLES = [
    {id:'none',label:'No title',mark:null},
    {id:'in_motion',label:'In Motion',mark:'full_six'},
    {id:'steady_hand',label:'Steady Hand',mark:'honest_effort'},
    {id:'progress_maker',label:'Progress Maker',mark:'progress_confirmed_1'},
    {id:'balanced_builder',label:'Balanced Builder',mark:'balanced_blocks_1'},
    {id:'forged',label:'Forged',mark:'full_apex'},
    {id:'seasoned',label:'Seasoned',mark:'balanced_blocks_6'}
  ];
  const EVOLUTIONS = [{level:1,label:'Original',factor:1},{level:2,label:'Etched',factor:2},{level:3,label:'Masterwork',factor:4}];

  function depthOf(sessions) {
    const improvements = performanceOf(sessions), blocks = blocksOf(sessions, improvements);
    const unique = [];const names = new Set();
    for (const e of improvements) if (!names.has(e.exercise)) { names.add(e.exercise);unique.push(e); }
    const metrics = {improvements,exercises:unique,blocks:blocks.completed.map(b=>({ts:b.end}))};
    const marks = PROGRESS_MARKS.map(m=>{
      const list = metrics[m.metric], unlocked = list.length >= m.target;
      return {...m,value:Math.min(m.target,list.length),unlocked,unlockedAt:unlocked?list[m.target-1].ts:null,emblem:null,ring:null,hidden:false};
    });
    return {improvements,blocks,marks};
  }

  const DAY_NAMES = {push_a:'Push A',lower_a:'Legs A',pull_a:'Pull A',push_b:'Push B',lower_b:'Legs B',pull_b:'Pull B'};
  function nextGoal(user, result = evaluate(user)) {
    const key = user?.program?.currentWorkoutKey;
    const done = result.stats.qualifying;
    if (!done) return {id:'first_rep',title:'Your first Iron Mark',text:'Finish your planned session at the effort that suits today. First Rep starts your collection.',value:0,target:1};
    const current = result.depth.blocks.current;
    if (ROTATION.includes(key) && current.counts[key] < 4) {
      const value=current.counts[key];
      return {id:`block_${current.number}_${key}`,title:`Block ${current.number} · ${DAY_NAMES[key]}`,text:`Today's planned session can bring ${DAY_NAMES[key]} to ${value+1} of 4. Every program day contributes to this balanced block.`,value:current.done,target:24};
    }
    const next = result.marks.find(m=>m.id==='full_six'&&!m.unlocked) || result.marks.find(m=>m.id==='six_six'&&!m.unlocked);
    if (next && !next.hidden) return {id:next.id,title:next.title,text:next.text,value:next.value,target:next.target};
    return {id:'steady',title:'Keep building at your pace',text:'Follow today’s plan. Your completed sessions and repeatable progress keep building your collection.',value:current.done,target:24};
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
    {id:'honest', title:'Honest Training'},
    {id:'progress', title:'Personal Progress'},
    {id:'blocks', title:'Training Blocks'},
    {id:'evolution', title:'Emblem Evolution'}
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
    const depth = depthOf(sessions);
    const allMarks = [...marks,...depth.marks];
    const comeback = marks.find(m=>m.id==='back_at_it');
    const growthAt = (state,list) => ({
      spark:[state.qualifying,1,'successful sessions'],hex:[state.rotations,1,'full rotations'],
      hammer:[state.bestExposures,4,'successful sessions of one program day'],anvil:[state.rotations,4,'full rotations'],
      crown:[state.rotations,8,'full rotations'],kettlebell:[state.legDays,12,'leg sessions'],
      compass:[state.rotations,1,'full rotations'],
      // This emblem grows through training after returning, never through more absences.
      sunrise:[comeback?.unlocked?list.filter(h=>h.ts>=comeback.unlockedAt&&qualifies(h)).length:0,1,'successful sessions after the emblem unlock'],
      gauge:[state.honest,10,'sessions with every RIR logged'],sixsix:[state.qualifying,66,'successful sessions']
    });
    const growth=growthAt(final,sessions);
    const evolutions = Object.fromEntries(MARKS.filter(m=>m.emblem).map(m=>{
      const [value,base,unit]=growth[m.emblem],owned=marks.some(x=>x.id===m.id&&x.unlocked);
      const tiers=EVOLUTIONS.map(t=>({...t,target:base*t.factor,unlocked:owned&&value>=base*t.factor}));
      return [m.emblem,{value,tiers,level:owned?Math.max(1,tiers.filter(t=>t.unlocked).length):0,requirement:unit}];
    }));
    for (const original of MARKS.filter(m=>m.emblem)) {
      const evolution=evolutions[original.emblem];
      for(const tier of evolution.tiers.slice(1)) {
        let ts=null;
        if(tier.unlocked) {
          let lo=1,hi=sessions.length;
          while(lo<hi){const mid=(lo+hi)>>1,st=prefix(mid);if(original.value(st)>=original.target&&growthAt(st,sessions.slice(0,mid))[original.emblem][0]>=tier.target)hi=mid;else lo=mid+1;}
          ts=sessions[lo-1]?.ts||null;
        }
        allMarks.push({id:`emblem_${original.emblem}_${tier.level}`,group:'evolution',title:`${EMBLEMS[original.emblem]} · ${tier.label}`,text:`Earn the ${EMBLEMS[original.emblem]} emblem, then reach ${tier.target} ${evolution.requirement}.`,target:tier.target,value:Math.min(evolution.value,tier.target),unlocked:tier.unlocked,unlockedAt:ts,emblem:null,evolvedEmblem:original.emblem,detail:tier.level,ring:null,hidden:original.hidden&&!marks.find(m=>m.id===original.id).unlocked});
      }
    }
    return {version:2, stats:final, marks:allMarks, depth, evolutions, titles:TITLES.map(t=>({...t,unlocked:!t.mark||allMarks.some(m=>m.id===t.mark&&m.unlocked)})), emblems:marks.filter(m => m.unlocked && m.emblem).map(m => m.emblem), ring, nextRing};
  }

  // The worn emblem is honoured only while it is still earned (history can be deleted).
  function avatarFor(user, result = evaluate(user)) {
    const chosen = user?.trainerMemory?.achievements?.emblem || null;
    const state=user?.trainerMemory?.achievements || {};
    const requested=RINGS.find(r=>r.id===state.ring);
    const ring=state.ring==='none'?null:requested&&result.stats.rotations>=requested.rotations?requested:result.ring;
    const emblem=chosen&&result.emblems.includes(chosen)?chosen:null;
    const earnedLevel=emblem?result.evolutions[emblem].level:0;
    const selectedLevel=Number(state.detail)||earnedLevel;
    const detail=Math.min(earnedLevel,Math.max(1,selectedLevel));
    const title=result.titles.find(t=>t.id===state.title&&t.unlocked)?.label;
    return {ring,emblem,detail:emblem?detail:0,title:state.title==='none'?null:title||null};
  }

  const api = {ROTATION, RINGS, EMBLEMS, MARKS, GROUPS, qualifies, evaluate, avatarFor, performanceOf, blocksOf, nextGoal, DAY_NAMES, EVOLUTIONS, TITLES};
  if (typeof window !== 'undefined') window.IronSixMarksEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
