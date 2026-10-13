# Iron Six — exercise programming quality audit
**Review date:** 2026-10-12
**Baseline:** `main` at `94d2006c0e02c4e67aaa742154890a8076c214b1`
**Scope:** Current templates, selector, planner, effort accounting, scheduling, equipment filtering, existing regression tests, and releases. Production and native APK have not been changed by this audit.

## Review method and limits
This is an evidence-informed multidisciplinary *lens*, not an assertion that licensed humans participated. I evaluated:
1. **Strength & conditioning:** movement patterns, split, exercise order, progression, recovery spacing.
2. **Hypertrophy programming:** direct vs indirect sets, exercise angles/grips, stable primary lifts vs accessory variety.
3. **Movement quality & safety:** tolerable alternatives, available equipment, unsupported spinal loading, RIR uncertainty.
4. **Software quality:** persistent rotation/drafts, short-duration truncation, deterministic selections, regression coverage.
Prior September reviews by two AI reviewers, recorded in `reports/training-program-review.md`, were considered as historical context. There has been **no human trainer, exercise physiologist, physical therapist, or clinician review** and no observed/form-checked user workouts.

### Evidence standard
The ACSM 2026 resistance-training position stand emphasizes individualized, consistent progressive training, regular exposure of major muscle groups, multi-set work, and roughly 10 sets/muscle/week as a common hypertrophy target rather than a universal minimum. It does not establish a single optimal split or demand maximal variation. Large comparative meta-analysis supports various loads for hypertrophy and sufficiently heavy loads for maximal strength. NSCA programming guidance and the exercise-variation literature favor an organized split, recovery capacity and planned—not random—exercise changes.

- [ACSM 2026 Position Stand](https://doi.org/10.1249/MSS.0000000000003897)
- [ACSM practical summary](https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf)
- [2023 network meta-analysis](https://doi.org/10.1136/bjsports-2023-106807)
- [Exercise variation review](https://pubmed.ncbi.nlm.nih.gov/35438660/)
- [Split vs full-body meta-analysis](https://pubmed.ncbi.nlm.nih.gov/38595233/)

## What is already strong in the checked-in implementation
- `core.js` has a rolling `Push A → Lower A → Pull A → Push B → Lower B → Pull B` sequence, not a date-based auto-advance; independent tests cover manual choices and unfinished sessions.
- `workout-dispatch.js` builds an A/B program with two complementary pressing days, squat- and hinge-biased lower days, and width/thickness pull days. Primary selections are block-stable for four exposures while accessories can change with completed history.
- Pull days restrict programmed rows to supported one-arm/chest-supported dumbbell or band choices after lower-body days. Note that one-arm dumbbell rows still require trunk bracing; `supported` does not mean zero lumbar loading.
- Selection respects declared equipment, tolerates genuine missing-pattern gaps, uses muscle coverage based on *performed sets*, and provides specific alternatives rather than silently substituting unavailable equipment.
- `progress-analytics-v2.js` and `trainer-intelligence-v2.js` distinguish completed direct and indirect sets and keep missing RIR unknown.
- Program has conventional and circuit modes, time budgets, configurable difficulty, optional cardio, manual swaps, and ongoing load estimates.

## Key source-level finding: pull accessories can crowd out curl angles
The intended full-length workout contains **supinated curls on Pull A** (`curl_long`) and **neutral-grip/hammer curls on Pull B** (`hammer`). This is a useful complement; the code does **not** intentionally call for hammer curls on both days.

However, `session-planner.js` sorts accessories based on historical deficits and then truncates exercise count to 3 for 15–20 minutes and 4 for 30–45 minutes. Because the curl slots were ordinary accessories, the priority list could favor a lat-isolation or other accessory and repeatedly omit a direct curl angle. This makes the planned A/B difference less reliable in real short-session workouts. The user's observed hammer-only pattern is credible but cannot be assigned to an exact cause without the actual installed build, profile and workout history.

**Change on audit branch:** for pull-day plans of 15+ minutes, keep vertical *and* horizontal pulls plus the day's prescribed biceps angle ahead of lower-priority accessory slots; allow honest omissions when equipment or time cannot support them. Ten-minute micro sessions still prioritize large pulling patterns. No forced substitution, load-history reset, calendar advancement, or modification to saved active drafts.

## Full-length program pattern accounting
Starting template sets, before the planner's time- and difficulty-dependent changes, per **six-session cycle** (not necessarily one calendar week):

| Programming target | Template sets/cycle | Notes |
|---|---:|---|
| Chest press + fly | 12 | 6 on each push day |
| Back vertical pulls | 5 | Pull A/B combined |
| Back rows | 5 | Pull A/B combined |
| Lat isolation | 5 | Supplemental, not another row |
| Direct biceps | 6 | 3 supinated + 3 neutral |
| Direct triceps | 4 | Additional pressing stimulus indirect |
| Side delts | 5 | Front delts also assist pressing |
| Rear delts | 3 | Add more if recovery/goal supports |
| Overhead press | 3 | Push B emphasis |
| Squats | 6 | 3 lower A + 3 lower B |
| Unilateral legs | 3 | Lower A |
| Hip hinges | 5 | Lower A/B |
| Hip extensions | 3 | Lower B; glutes also compound trained |
| Knee-flexion hamstrings | 5 | Lower A/B |
| Calves | 6 | 3 on each lower day |
| Core | 4 | Push A + Pull A |

At five completed strength sessions/week, a six-session cycle averages 8.4 days and the primary movement families average 1.67 sessions/week. Direct biceps volume thus averages ~5 sets/week plus indirect pulling; whether that is adequate depends on training age, execution, proximity to failure and specific arm priorities. More exercise *variety* alone is not the same as better growth.

## Remaining limitations to address before claiming premium-coach equivalence
**High priority**
1. **Goal-specific programming:** available difficulty (light/balanced/heavy) is not the same as choosing hypertrophy, maximal strength, general health, muscle priority, joint comfort, or skill-learning goals. Provide individual volume/progression starting points, not simply more/less difficulty.
2. **Minimum effective patterns for restricted/short sessions:** a 10–20 minute workout cannot promise the complete full-length cycle. Communicate what was deferred and evaluate coverage across several completed cycles, not only today's label.
3. **Recovery-aware progression:** actual pain, persistent performance decline, soreness and disrupted recovery must trigger controlled volume/intensity choices, not simplistic elapsed-hours clearance or automatic volume escalation.
4. **Exercise-catalog quality:** check setup, cues, alternatives and first-party images before expanding a movement into automation. A movement with mismatched imagery is not trainer-grade.
5. **Real-device/end-to-end validation:** validate the APK version installed, persisted settings, logged sets, offline/cloud consistency, and exercise rendering. A GitHub green test alone does not prove a phone session works.

**Medium priority**
6. **Accessory balance:** side/rear delt, calves, hamstring knee-flexion and core work can still be under-dosed for users repeatedly choosing short sessions. A per-pattern rolling adequacy score should explain this without invented catch-up volume.
7. **Session-duration accuracy:** current time model uses fixed set-work/rest constants and is an approximation, especially with unilateral movements, setup changes and real rest. Personal actual durations should calibrate it.
8. **Biceps and long-muscle-length stimulus:** Pull A can choose incline dumbbell, barbell, dumbbell or band curls; only incline places shoulder notably behind torso. Avoid asserting every alternative biases the biceps long head equally. Pull B includes hammer/grip options. Explain the complement rather than changing exercises for novelty's sake.
9. **Training progression:** primary exercise anchors are stable four exposures, which is valuable. Future upgrades should compare *completed* performance, useful rep-range progression and tolerance rather than replacing hard but effective exercises.
10. **2–4 day participants:** a six-session split is tailored for roughly five–six strength sessions/week; users frequently training fewer days should have an honest upper/lower or full-body program option with comparable workload distribution.

## Regression acceptance gates
- Preserve 6-workout cycle and all manually postponed keys across days and finishes.
- Preserve benchmark identities across four exposures unless equipment/pain/user choice dictates a swap.
- In 15–60 minute Pull A, program a supinated curl; in Pull B, a hammer/neutral-grip curl; each includes complementary horizontal/vertical pulling when available. At 10 minutes, don't promise direct curls.
- Check default, dumbbell-only, band-only, bodyweight-only setups; never inject unavailable equipment to fill a pattern.
- Check conventional and circuit variants for 15/20/30/45/60-minute budgets and all three levels.
- Verify 3+ complete cycles, no duplicate exercise within a session, no unapproved unsupported heavy row following lower sessions, and program dose of calves/hamstrings in full-length lower sessions.
- Preserve active drafts, logged loads/reps, effort, history identities, and offline sync; no automatic production release until validated.
- Audit against actual phone behavior before declaring the whole system at trainer-grade parity.

## Change log for this review
- `session-planner.js`: protect Pull A/Pull B pulling patterns and planned complementary biceps slots for sessions >=15 min, including the later neglected-muscle rebalance stage.
- `core.js`: invalidate current-version accessory cache entries when the session is replanned, while preserving stable benchmark-lift anchors.
- `tests/expert-program-guardrails.test.js`: multi-mode, multi-duration, multi-equipment, three-cycle checks.
- This report. Changes are held on a separate review branch and **not** a production deployment.
