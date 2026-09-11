/* Iron Six movement-family camera rules.
   This layer extends the proven pose rep counter without changing its state machine.
   Exercise selection is driven by canonical registry pattern first, then conservative name fallbacks. */
(() => {
  const counter = typeof window !== 'undefined' ? window.IronSixRepCounter : null;
  if (!counter) return;
  const P = counter.POINTS;
  const registry = typeof window !== 'undefined' ? window.IronSixExerciseRegistry : null;
  const clean = v => String(v || '').trim().toLowerCase();

  function registryEntry(exercise) {
    const x = exercise || {};
    const id = clean(x.id), name = clean(x.name);
    const entries = registry?.exercises || registry?.EXERCISES || [];
    if (!Array.isArray(entries)) return null;
    return entries.find(e => clean(e.id) === id || clean(e.name) === name || (e.aliases || []).some(a => clean(a) === name)) || null;
  }

  function canonical(exercise) {
    const entry = registryEntry(exercise);
    return { ...(entry || {}), ...(exercise || {}), pattern: (exercise || {}).pattern || entry?.pattern || null };
  }

  const FAMILIES = [
    {
      id: 'squat', label: 'Squat', patterns: ['squat'],
      match: x => /squat|lunge|split squat|step[- ]?up/i.test(x.name || ''),
      joint: [[P.LHIP,P.LKNEE,P.LANKLE],[P.RHIP,P.RKNEE,P.RANKLE]],
      framing: [P.LSHOULDER,P.RSHOULDER,P.LHIP,P.RHIP,P.LKNEE,P.RKNEE,P.LANKLE,P.RANKLE],
      top: 160, bottom: 100, minActiveMs: 500, maxActiveMs: 15000,
      setup: 'Place the phone around hip height, roughly level and side-on, far enough back to keep your full body in frame.',
      preferredView: 'side', detectorFamily: 'squat', formProfile: 'squat', validated: true,
      fallback: {
        joint: [[P.LHIP,P.LKNEE],[P.RHIP,P.RKNEE]],
        framing: [P.LSHOULDER,P.RSHOULDER,P.LHIP,P.RHIP,P.LKNEE,P.RKNEE],
        top: 30, bottom: 75,
        note: 'Ankles are out of frame, so reps are counted from your hips and knees. Depth is approximate and form watch is off.'
      }
    },
    {
      id: 'hinge', label: 'Hip hinge', patterns: ['hinge'],
      match: x => /deadlift|romanian|rdl|good morning|hip hinge/i.test(x.name || ''),
      joint: [[P.LSHOULDER,P.LHIP,P.LKNEE],[P.RSHOULDER,P.RHIP,P.RKNEE]],
      framing: [P.LSHOULDER,P.RSHOULDER,P.LHIP,P.RHIP,P.LKNEE,P.RKNEE],
      top: 160, bottom: 105, minActiveMs: 500, maxActiveMs: 15000,
      setup: 'Place the phone side-on around hip height. Keep shoulders, hips, and knees visible through the full hinge.',
      preferredView: 'side', detectorFamily: 'hinge', formProfile: 'hinge', validated: false
    },
    {
      id: 'horizontal_press', label: 'Horizontal press', patterns: ['bench','pushup','horizontal_press'],
      match: x => /bench press|floor press|chest press|push[- ]?up/i.test(x.name || ''),
      joint: [[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],
      framing: [P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],
      top: 155, bottom: 90, minActiveMs: 400, maxActiveMs: 12000,
      setup: 'Place the phone side-on near bench height so your shoulder, elbow, and wrist stay visible for the entire rep.',
      preferredView: 'side', detectorFamily: 'horizontal_press', formProfile: 'horizontal_press', validated: false
    },
    {
      id: 'vertical_press', label: 'Vertical press', patterns: ['overhead_press','vertical_press'],
      match: x => /overhead press|shoulder press|military press|arnold press/i.test(x.name || ''),
      joint: [[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],
      framing: [P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],
      top: 75, bottom: 160, minActiveMs: 450, maxActiveMs: 12000,
      setup: 'Face the phone or turn slightly side-on, far enough back that both hands remain visible overhead.',
      preferredView: 'front-quarter', detectorFamily: 'vertical_press', formProfile: 'vertical_press', validated: false
    },
    {
      id: 'row', label: 'Row', patterns: ['row'],
      match: x => /\brow\b|meadows row/i.test(x.name || ''),
      joint: [[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.RWRIST]],
      framing: [P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST,P.LHIP,P.RHIP],
      top: 150, bottom: 80, minActiveMs: 400, maxActiveMs: 12000,
      setup: 'Place the phone on your working side at torso height so shoulder, elbow, wrist, and torso stay visible.',
      preferredView: 'working-side', detectorFamily: 'row', formProfile: 'row', validated: false
    },
    {
      id: 'curl', label: 'Curl', patterns: ['curl','hammer_curl'],
      match: x => /curl/i.test(x.name || '') && !/leg|hamstring|nordic/i.test(x.name || ''),
      joint: [[P.LSHOULDER,P.LELBOW,P.LWRIST],[P.RSHOULDER,P.RELBOW,P.LWRIST+1]],
      framing: [P.LSHOULDER,P.RSHOULDER,P.LELBOW,P.RELBOW,P.LWRIST,P.RWRIST],
      top: 150, bottom: 70, minActiveMs: 400, maxActiveMs: 12000,
      setup: 'Face the phone from about 6 feet back with shoulders, elbows, and wrists visible.',
      preferredView: 'front', detectorFamily: 'curl', formProfile: 'curl', validated: false
    }
  ];
  // Correct the right curl chain explicitly; written separately to keep the catalog easy to audit.
  FAMILIES.find(f => f.id === 'curl').joint[1] = [P.RSHOULDER,P.RELBOW,P.RWRIST];

  const originalRuleFor = counter.ruleFor.bind(counter);
  function ruleFor(exercise) {
    const x = canonical(exercise);
    const pattern = clean(x.pattern);
    const family = FAMILIES.find(f => f.patterns.includes(pattern)) || FAMILIES.find(f => { try { return f.match(x); } catch (_) { return false; } });
    if (family) return { ...family, sourcePattern: pattern || null, exerciseId: x.id || null, exerciseName: x.name || null };
    return originalRuleFor(exercise);
  }

  function familyFor(exercise) { const r = ruleFor(exercise); return r?.detectorFamily || r?.id || null; }
  function supported(exercise) { return !!ruleFor(exercise); }
  function coverage() {
    const entries = registry?.exercises || registry?.EXERCISES || [];
    if (!Array.isArray(entries)) return { total:0, supported:0, byFamily:{} };
    const byFamily = {}; let count = 0;
    for (const e of entries) { const family = familyFor(e); if (!family) continue; count++; byFamily[family] = (byFamily[family] || 0) + 1; }
    return { total: entries.length, supported: count, byFamily };
  }

  counter.ruleFor = ruleFor;
  counter.MOVEMENT_FAMILIES = FAMILIES;
  counter.familyFor = familyFor;
  counter.cameraSupported = supported;
  counter.cameraCoverage = coverage;
  counter.__ironSixMovementFamiliesV1 = true;

  const api = { FAMILIES, ruleFor, familyFor, supported, coverage, canonical };
  if (typeof window !== 'undefined') window.IronSixMovementDetectors = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();