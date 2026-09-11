# Training-program audit — running handoff

Status: audit in progress. User asked to keep notes so work survives credit exhaustion.
Working branch: `fix/camera-reliability-v6`, draft PR #37. Production `main` must remain
untouched per camera handoff until physical-phone validation passes. Do not merge this
branch just to publish a programming change. Starting commit: `1fcfe34`.

## User request and decisions

- Workout balance feels wrong, particularly chest followed by shoulders/arms.
- User requested a deep dive and multiple professional-informed reviews.
- Actual human trainers have NOT reviewed the app. Two independent AI reviewers are
  auditing programming and implementation, with primary research/NSCA/ACSM sources.
- Frequency clarified: varies, usually aims for **five strength workouts/week, six if
  recovery permits**. Preserve a rolling sequence; missed days never advance it.
- Earlier label swaps were insufficient. Analyze complete content and fatigue overlap,
  including cycle wraparound and actual short-duration plans.
- This turn is a deep review/design task. Do not silently deploy a wholesale program
  migration before the design and implementation consequences are evaluated.

## Current implementation already on preview before this audit

Sequence: Chest → Shoulders/arms → Lower strength → Back → Upper specialization →
Lower hypertrophy. Finishing advances the saved key; rest/skipped days do not.
Empty Finish is blocked; partial Finish requires confirmation. Archived journal recovery
no longer advances. Upper specialization has a chest-isolation slot instead of its extra
vertical press. 347 tests passed for that prior change. Current code is NOT proof that the
routine is balanced; that is the purpose of this audit.

## Findings so far (code inspection + simulation)

1. Chest → Shoulders/arms shares pressing muscles: chest has bench4 + secondary press3
   + triceps3; following shoulders has overhead4 + triceps3. Front delts/triceps are not
   fresh just because the title changes.
2. Back → Upper specialization repeats back/biceps; lower-strength RDL → unsupported
   barbell rows can also load spinal erectors on successive sessions.
3. Lower sessions are similar squat/hinge/split-squat/hip-thrust/ham-curl/calf menus,
   not clearly differentiated lower sessions.
4. `tailorWorkout` truncates by a set cap, then `budgetSessionWorkout` caps/sorts again.
   Default 60-minute lower strength loses core despite a ~47-minute modeled session;
   fresh 45-minute lower sessions can lose calves and core entirely. Need coverage
   across actual completed sessions, not just metadata on workout names.
5. `progress-analytics-v2.js::muscleBalance` divides ALL session sets equally among all
   listed muscles. Reproduction: chest's 15 sets (4 bench,3 press,3 fly,3 triceps,2 core)
   reports chest/shoulders/triceps/core each as 3.8. This is not muscle-specific volume.
6. `progress-analytics-v2.js::recovery` charges ALL those sets against EVERY listed
   muscle. At 24h with blank RIR, each becomes load15/hard15/score0, even core with2 sets.
7. Blank RIR becomes zero via Number(''), treated as hard/failure effort in both recovery
   and `trainer-intelligence-v2.js::sessionLoad`. Missing effort must remain unknown.
8. `choose` returns the final ORIGINAL option if no option is equipment-available.
   Thus bodyweight-only profiles can receive Band Row/Curl or bench-dependent options.
   Do not invent safe equivalent loading or silently imply unavailable equipment exists.
9. Session-time model gives each set 45s work plus90/60s rest regardless of unilateral
   sides, holds, or two-exercise supersets; full time budgets are estimates, not exact.
10. Standard session-recovery DOM harness excludes cloud-history-sync and therefore
    doesn't load runtime recovery/adaptation. Add runtime integration checks before
    claiming deployed planner behavior is covered.

## Candidate redesign (under review, not implemented)

Rolling Push A → Lower A → Pull A → Push B → Lower B → Pull B.
Pressing muscles share a day; pulling muscles share a day; two intervening workouts
between each prime-mover family, including wraparound. Rest can be inserted without
changing the sequence. Five workouts/week averages1.67 exposures per family/week;
six averages2. A six-session cycle is not automatically one calendar week.

Moderate starting template suggested by independent programming reviewer:
- Push A: bench3, incline3, lateral raise3, triceps2, core2 =13.
- Lower A: squat3, split squat3, RDL2, hamstring curl2, calves3 =13.
- Pull A: vertical pull3, supported row3, rear delts2, curl3, core2 =13.
- Push B: chest press3, overhead press3, fly3, lateral raise2, triceps2 =13.
- Lower B: RDL3, squat3, split squat3, hamstring curl3, calves3 =15.
- Pull B: supported row3, vertical pull3, rear delts2, curl3 =11.
Total78 ordinary working sets/cycle. Direct cycle totals: chest12, back12, quads12,
hamstrings10, calves6, biceps6, triceps4, lateral delts5, rear delts4, overhead press3,
core4. Indirect arm/delt work is additional; do not compare these direct-only numbers
as if each muscle gets equal physiological stimulus. Glutes get substantial compound
work; additional hip thrust need not be mandatory. These are a proposed starting dose,
not exact scientifically proven requirements or a completed personalized prescription.

Use supported rows after lower days to reduce additional lower-back fatigue. Equipment
fallbacks must stay honest. Full-body/upper-lower alternatives should be considered for
users consistently training only2–4 times/week; avoid a six-day requirement for everyone.

## Primary sources verified

- ACSM 2026 overview: https://acsm.org/resistance-training-guidelines-update-2026/
- NSCA programming/frequency: https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/
- Pelland et al. volume/frequency, direct vs indirect sets (2026 publication):
  https://pubmed.ncbi.nlm.nih.gov/41343037/
- Ramos-Campo et al. split vs full body, volume-equated results (2024):
  https://pubmed.ncbi.nlm.nih.gov/38595233/

Evidence interpretation: no unique split is inherently best; overlapping-day work is not
inherently harmful, but volume/effort/recovery must be deliberately managed. Do not imply
48/72h is a universal recovery deadline, or that more volume is always better. Fractional
indirect-set accounting is a useful estimate, not a precise per-person measurement.

## Remaining work

- Finish both independent review summaries and reproduce exact current-runtime tables.
- Audit exercise stability/progression and full-body fallback feasibility.
- Consolidate evidence and proposed template, time-budget rules, and implementation gates
  into a final report with clear tested/untested/not-implemented distinctions.
- Preserve current session identity, existing history, canonical media IDs and equipment
  definitions through any later program migration. Old keys must not silently change
  meaning for historical records.
- No new program or analytics fixes have been implemented during this audit yet.
