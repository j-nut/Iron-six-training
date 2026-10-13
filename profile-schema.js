/* What a profile must contain before Iron Six can program for it, and the one place that writes it.
 *
 * Two consumers share this file:
 *   - onboarding.js asks only for what is missing (a brand-new profile is missing everything, a
 *     two-year-old profile is typically missing goal / days / limits / strength references).
 *   - the profile editor (ui3.js saveProfile) writes the same fields through commit(), so an answer
 *     given in the wizard and an answer given later in the editor are validated identically.
 *
 * Data contract (field names are shared with the programming engine; do not rename):
 *   goal 'strength'|'muscle'|'general'      daysPerWeek 2..6
 *   strengthRefs {squat,bench,hinge,overhead_press,row: {weight,reps,equipment:'barbell'|'dumbbell'}}
 *   limitations  subset of LIMITATION_AREAS  preferences {music,camera,voice,sounds}
 *   onboarding   {version:1, completedAt:number|null, optionalSkipped:string[]}
 *   capacities   {dumbbellMax,barbellMax,dumbbellStep,barbellStep}
 * Wizard bookkeeping that is not part of the contract lives in u.onboardingDraft and is deleted
 * when the wizard is finished.
 *
 * Several defaults in this app are indistinguishable from answers (60 minutes, "balanced",
 * a 30 lb dumbbell cap). For a profile that has never trained those count as unanswered until the
 * wizard has confirmed them; for a profile with history they are real, long-standing settings.
 */
(() => {
  if (window.IronSixProfileSchema) return;

  const VERSION = 1;
  const GOALS = ['strength', 'muscle', 'general'];
  const LEVELS = ['beginner', 'intermediate', 'advanced'];
  const DIFFICULTIES = ['light', 'balanced', 'heavy'];
  const MODES = ['traditional', 'circuit'];
  const LIMITATION_AREAS = ['shoulder', 'elbow', 'wrist', 'lower_back', 'hip', 'knee'];
  const LIFTS = ['squat', 'bench', 'hinge', 'overhead_press', 'row'];
  const PREFERENCE_KEYS = ['music', 'camera', 'voice', 'sounds'];
  const PLACEHOLDER_NAME = 'My profile';
  const EQUIPMENT_KEYS = () => (typeof EQUIPMENT !== 'undefined' ? EQUIPMENT.map(item => item[0]) : []);

  const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const inRange = (value, min, max) => finite(value) && Number(value) >= min && Number(value) <= max;
  const hasToday = u => Object.keys((u && u.today) || {}).length > 0;
  const skipped = u => (Array.isArray(u?.onboarding?.optionalSkipped) ? u.onboarding.optionalSkipped : []);

  // A profile nobody has trained with, restored, or synced. Only these have unanswered defaults.
  function isFresh(u) {
    if (!u) return false;
    if (u.onboardingDraft && u.onboardingDraft.mode === 'full') return true;
    return !(u.history || []).length && !hasToday(u) && !u.workoutDraft
      && !u.onboarding?.completedAt && !u.cloudId && !u.importedBackupId;
  }
  function confirmedStrict(u, id) {
    return !!(u?.onboarding?.completedAt || u?.onboardingDraft?.confirmed?.[id]);
  }
  const confirmed = (u, id) => confirmedStrict(u, id) || !isFresh(u);

  function parseBench(text) {
    const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)?\s*(?:x|×|for)\s*(\d+)/i);
    if (!match) return null;
    const weight = Number(match[1]), reps = Number(match[2]);
    return weight > 0 && reps > 0 ? { weight, reps, equipment: 'barbell' } : null;
  }
  // The structured bench reference, falling back to a legacy free-text one.
  function benchRef(u) {
    const ref = u?.strengthRefs?.bench;
    if (ref && Number(ref.weight) > 0 && Number(ref.reps) > 0) return ref;
    return parseBench(u?.benchBest);
  }

  function equipmentCustomised(u) {
    if (typeof DEFAULT_EQUIPMENT === 'undefined') return false;
    const kit = u.equipment || {};
    const differs = Object.keys({ ...DEFAULT_EQUIPMENT, ...kit }).some(key => !!kit[key] !== !!DEFAULT_EQUIPMENT[key]);
    const cap = u.capacities || {};
    return differs || (u.customEquipment || []).length > 0
      || Number(cap.dumbbellMax) !== 30 || Number(cap.barbellMax) !== 300
      || Number(cap.dumbbellStep) === 2.5 || Number(cap.barbellStep) === 2.5;
  }

  // Required steps, in the order they are asked. present(u) is "this answer exists".
  const REQUIRED = [
    { id: 'name', title: 'Name', present: u => String(u.name || '').trim().length > 0 && (u.name !== PLACEHOLDER_NAME || confirmedStrict(u, 'name')) },
    { id: 'body', title: 'Body weight, age and height', present: u => inRange(u.weight, 50, 600) && inRange(u.age, 13, 100) && inRange(u.heightIn, 48, 90) },
    { id: 'level', title: 'Training level', present: u => LEVELS.includes(u.trainingLevel) },
    { id: 'goal', title: 'Goal', present: u => GOALS.includes(u.goal) },
    { id: 'days', title: 'Days per week', present: u => Number.isInteger(Number(u.daysPerWeek)) && inRange(u.daysPerWeek, 2, 6) },
    { id: 'session', title: 'Session length', present: u => inRange(u.workoutMinutes, 10, 120) && confirmed(u, 'session') },
    { id: 'style', title: 'Training style and difficulty', present: u => DIFFICULTIES.includes(u.workoutDifficulty) && (!u.trainingMode || MODES.includes(u.trainingMode)) && confirmed(u, 'style') },
    { id: 'equipment', title: 'Equipment', present: u => confirmedStrict(u, 'equipment') || equipmentCustomised(u) }
  ];
  const OPTIONAL_STEPS = [
    { id: 'strength', title: 'Strength check', present: u => !!(u.strengthRefs && Object.keys(u.strengthRefs).length) || !!benchRef(u) },
    { id: 'limits', title: 'Injuries and limits', present: u => Array.isArray(u.limitations) },
    { id: 'phone', title: 'Phone features', present: u => ['camera', 'voice', 'sounds'].some(key => typeof u.preferences?.[key] === 'boolean') },
    { id: 'music', title: 'Music', present: u => typeof u.preferences?.music === 'boolean' }
  ];

  const missingRequired = u => REQUIRED.filter(step => !step.present(u)).map(step => step.id);
  const missingOptional = u => OPTIONAL_STEPS.filter(step => !step.present(u) && !skipped(u).includes(step.id)).map(step => step.id);
  const isComplete = u => missingRequired(u).length === 0;
  // Required gaps always trigger it; unanswered optional steps only until the flow has been finished once.
  const needsWizard = u => missingRequired(u).length > 0 || (!u?.onboarding?.completedAt && missingOptional(u).length > 0);
  const pendingSteps = u => [...missingRequired(u), ...missingOptional(u)];
  const titleOf = id => [...REQUIRED, ...OPTIONAL_STEPS].find(step => step.id === id)?.title || id;

  // ---- validation of a patch (the same rules for the wizard and the editor) ----
  function cleanRefs(input) {
    const out = {};
    for (const lift of LIFTS) {
      const ref = input?.[lift];
      if (!ref) continue;
      const weight = Number(ref.weight), reps = Number(ref.reps);
      if (!(weight > 0 && weight <= 2000) || !Number.isInteger(reps) || reps < 1 || reps > 50) continue;
      out[lift] = { weight: Math.round(weight * 10) / 10, reps, equipment: ref.equipment === 'dumbbell' ? 'dumbbell' : 'barbell' };
    }
    return out;
  }
  // The legacy bench text feeds the existing bench e1RM estimate, which reads one total load.
  // A dumbbell bench is entered per hand, so the legacy text carries the pair.
  function benchText(ref) {
    if (!ref) return '';
    const total = ref.equipment === 'dumbbell' ? ref.weight * 2 : ref.weight;
    return `${total} lb × ${ref.reps} reps`;
  }

  function sanitize(patch) {
    const out = {};
    const fail = error => ({ error });
    const has = key => Object.hasOwn(patch, key);
    if (has('name')) {
      const name = String(patch.name || '').trim();
      if (!name || name.length > 60) return fail('Enter a name of 1–60 characters');
      out.name = name;
    }
    if (has('weight')) {
      if (!inRange(patch.weight, 50, 600)) return fail('Enter a valid weight');
      out.weight = Math.round(Number(patch.weight));
    }
    if (has('age')) {
      if (patch.age === null || patch.age === '') out.age = null;
      else if (!inRange(patch.age, 13, 100)) return fail('Age must be 13–100');
      else out.age = Math.round(Number(patch.age));
    }
    if (has('heightIn')) {
      if (patch.heightIn === null || patch.heightIn === '') out.heightIn = null;
      else if (!inRange(patch.heightIn, 48, 90)) return fail('Height must be 48–90 inches');
      else out.heightIn = Number(patch.heightIn);
    }
    if (has('trainingLevel')) {
      if (patch.trainingLevel !== 'unknown' && !LEVELS.includes(patch.trainingLevel)) return fail('Choose a training level');
      out.trainingLevel = patch.trainingLevel;
    }
    if (has('goal')) {
      if (patch.goal !== null && patch.goal !== '' && !GOALS.includes(patch.goal)) return fail('Choose a goal');
      out.goal = GOALS.includes(patch.goal) ? patch.goal : undefined;
    }
    if (has('daysPerWeek')) {
      if (patch.daysPerWeek === null || patch.daysPerWeek === '') out.daysPerWeek = undefined;
      else if (!Number.isInteger(Number(patch.daysPerWeek)) || !inRange(patch.daysPerWeek, 2, 6)) return fail('Days per week must be 2–6');
      else out.daysPerWeek = Number(patch.daysPerWeek);
    }
    if (has('workoutMinutes')) {
      if (!inRange(patch.workoutMinutes, 10, 120)) return fail('Enter a workout length from 10 to 120 minutes');
      out.workoutMinutes = Math.round(Number(patch.workoutMinutes));
    }
    if (has('trainingMode')) {
      if (!MODES.includes(patch.trainingMode)) return fail('Choose a training style');
      out.trainingMode = patch.trainingMode;
    }
    if (has('workoutDifficulty')) {
      if (!DIFFICULTIES.includes(patch.workoutDifficulty)) return fail('Choose a difficulty');
      out.workoutDifficulty = patch.workoutDifficulty;
    }
    if (has('equipment')) {
      const keys = EQUIPMENT_KEYS();
      out.equipment = Object.fromEntries(keys.map(key => [key, !!patch.equipment?.[key]]));
    }
    if (has('capacities')) {
      const c = patch.capacities || {};
      const cap = {};
      if (has_(c, 'dumbbellMax')) { if (!inRange(c.dumbbellMax, 5, 250)) return fail('Dumbbell maximum must be 5–250'); cap.dumbbellMax = Number(c.dumbbellMax); }
      if (has_(c, 'barbellMax')) { if (!inRange(c.barbellMax, 45, 1500)) return fail('Barbell maximum must be 45–1500'); cap.barbellMax = Number(c.barbellMax); }
      if (has_(c, 'dumbbellStep')) cap.dumbbellStep = Number(c.dumbbellStep) === 2.5 ? 2.5 : 5;
      if (has_(c, 'barbellStep')) cap.barbellStep = Number(c.barbellStep) === 2.5 ? 2.5 : 5;
      out.capacities = cap;
    }
    if (has('strengthRefs')) out.strengthRefs = cleanRefs(patch.strengthRefs);
    if (has('limitations')) {
      out.limitations = [...new Set((Array.isArray(patch.limitations) ? patch.limitations : []).filter(area => LIMITATION_AREAS.includes(area)))];
    }
    if (has('preferences')) {
      const prefs = {};
      for (const key of PREFERENCE_KEYS) if (typeof patch.preferences?.[key] === 'boolean') prefs[key] = patch.preferences[key];
      out.preferences = prefs;
    }
    return { values: out };
  }
  function has_(object, key) { return Object.hasOwn(object, key); }

  const sameKit = (a, b) => EQUIPMENT_KEYS().every(key => !!a?.[key] === !!b?.[key]);

  /* Validate and write a patch to profile u. Never touches history, today or workoutDraft.
   * Settings that change which workout gets built (equipment, length, style, difficulty) are
   * refused while a session is in progress, because rebuilding it would orphan logged sets; the
   * caller shows the returned error. Returns {ok, error?, planChanged?}. */
  function commit(u, patch) {
    const { values, error } = sanitize(patch || {});
    if (error) return { ok: false, error };

    const kitChanged = values.equipment && !sameKit(u.equipment, values.equipment);
    const settingsChanged = (values.workoutMinutes !== undefined && values.workoutMinutes !== Number(u.workoutMinutes))
      || (values.trainingMode !== undefined && values.trainingMode !== (u.trainingMode || 'traditional'))
      || (values.workoutDifficulty !== undefined && values.workoutDifficulty !== (u.workoutDifficulty || 'balanced'));
    const planChanged = !!(kitChanged || settingsChanged);
    if (planChanged) {
      if (hasToday(u)) {
        return { ok: false, error: kitChanged ? 'Finish or reset the current workout before changing equipment' : 'Finish or reset the current workout before changing session length, style or difficulty' };
      }
      if (u.workoutDraft && window.IronSixJournal && !window.IronSixJournal.archive(u, kitChanged ? 'Equipment changed' : 'Session settings changed')) {
        return { ok: false, error: 'The current workout could not be archived, so nothing was changed' };
      }
    }

    for (const key of ['name', 'weight', 'age', 'heightIn', 'trainingLevel', 'goal', 'daysPerWeek', 'workoutMinutes', 'trainingMode', 'workoutDifficulty', 'limitations']) {
      if (!Object.hasOwn(values, key)) continue;
      if (values[key] === undefined) delete u[key]; else u[key] = values[key];
    }
    if (values.equipment) u.equipment = { ...u.equipment, ...values.equipment };
    if (values.capacities) u.capacities = { ...(u.capacities || {}), ...values.capacities };
    if (values.preferences) u.preferences = { ...(u.preferences || {}), ...values.preferences };
    if (Object.hasOwn(values, 'strengthRefs')) {
      u.strengthRefs = values.strengthRefs;
      const bench = values.strengthRefs.bench;
      if (bench) u.benchBest = benchText(bench);
      else if (parseBench(u.benchBest)) u.benchBest = '';
    }

    if (planChanged && typeof clearSessionRecommendations === 'function') clearSessionRecommendations(u);
    else {
      u.sessionCalibration = null;
      if (typeof invalidateRoutineReview === 'function') invalidateRoutineReview(u);
    }
    return { ok: true, planChanged };
  }

  function ensureOnboarding(u) {
    const current = u.onboarding && typeof u.onboarding === 'object' ? u.onboarding : {};
    u.onboarding = {
      version: VERSION,
      completedAt: Number(current.completedAt) > 0 ? Number(current.completedAt) : null,
      optionalSkipped: Array.isArray(current.optionalSkipped) ? [...new Set(current.optionalSkipped)] : []
    };
    return u.onboarding;
  }

  window.IronSixProfileSchema = {
    VERSION, GOALS, LEVELS, DIFFICULTIES, MODES, LIMITATION_AREAS, LIFTS, PREFERENCE_KEYS,
    REQUIRED, OPTIONAL_STEPS,
    missingRequired, missingOptional, isComplete, needsWizard, pendingSteps, titleOf,
    isFresh, confirmed, confirmedStrict, equipmentCustomised, parseBench, benchRef, benchText,
    sanitize, commit, ensureOnboarding
  };
})();
