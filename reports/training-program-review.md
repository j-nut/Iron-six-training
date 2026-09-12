# Iron Six training-program review

Review completed September 12, 2026. Audited application code: `1fcfe34`.
Two independent AI reviews covered programming and implementation, supported by the
primary sources below. No human trainer consultation or approval is claimed.

**Conclusion:** the user's concern is substantiated. Reordering the current labels does
not resolve overlapping workloads, inaccurate muscle accounting, or omitted accessories.
The recommended replacement for their usual five, sometimes six, weekly strength sessions
is a rolling **Push A → Lower A → Pull A → Push B → Lower B → Pull B** sequence.
This is a proposed redesign, not implemented code. The existing completion-only progression
fix remains on the test branch. Production has not been changed by this review.

## Confirmed problems

| Finding | Evidence from the current application | Consequence |
|---|---|---|
| Consecutive pressing overlap | Chest includes seven press sets and three triceps sets; shoulders/arms then includes four overhead-press and three triceps sets | Front delts and triceps receive substantial work on adjacent sessions |
| Consecutive pulling overlap | Back is followed by upper specialization, which also contains rows, vertical pulls and an arm superset | Back and biceps are repeatedly loaded without deliberate separation |
| Lower-back overlap | Lower sessions contain RDLs; adjacent pull sessions may select unsupported barbell rows | Changing the primary muscle label does not remove spinal-erector or grip fatigue |
| Nearly duplicated lower days | Both use squat, hinge, unilateral, hip thrust, hamstring curl and calf slots with overlapping rep ranges | Excess volume and weak differentiation between emphases |
| Two separate truncation stages | `engine.js::tailorWorkout` caps sets before `session-planner.js::budgetSessionWorkout` selects exercises | Later stages cannot recover a muscle pattern already removed |
| Incorrect volume chart | `progress-analytics-v2.js::muscleBalance` splits all session sets equally among listed muscles | The chart cannot substantiate balanced programming |
| Incorrect recovery load | Recovery charges all session sets against every muscle listed in that session | A muscle with two direct sets can be charged for fifteen |
| Missing effort treated as maximal effort | Blank RIR converts to zero in recovery and `trainer-intelligence-v2.js::sessionLoad` | Fatigue and deload suggestions can be driven by missing information |
| Equipment fallback failure | `core.js::choose` returns the last original option when no available options remain | A no-equipment profile can still receive a band- or bench-dependent exercise |
| Excessive variation incentive | Recent exercises get large selection penalties; selection cache is per exposure | Main lifts may change before repeat performance can be meaningfully compared |
| Simplified time model | Sets always receive 45 seconds of work plus 60/90 seconds rest | Unilateral sides, supersets, holds and demanding compounds are not modeled accurately |

The general `exerciseMuscles` mapping also conflates direct and indirect work, groups all
deltoid heads together, attributes biceps to lat-isolation work, and treats hip thrusts as
hamstring coverage. Compound involvement is useful context but is not interchangeable
with direct work for a muscle.

## What the runtime simulations showed

The independent reviewer loaded the actual planner plus the runtime analytics/adaptation
modules. Fresh profiles had default equipment and no history; sequential simulations used
six completed sessions with recorded RIR 2, uniform placeholder loads/reps, and either
Monday–Saturday or Monday–Friday then the following Monday. These are reproducible code
scenarios, not the user's personal workout history or clinical measurements.

| Session | Fresh 45-minute setting: programmed sets | Fresh 60-minute setting: programmed sets | Sequential 60-minute setting: programmed sets |
|---|---:|---:|---:|
| Chest | 15 | 15 | 15 |
| Shoulders/arms | 15 | 18 | 14 |
| Lower strength | 15 | 20 | 20 |
| Back | 15 | 17 | 17 |
| Upper specialization | 15 | 18 | 15 |
| Lower hypertrophy | 15 | 20 | 20 |

At 45 minutes, **calves disappeared across the entire cycle** in these scenarios. Fresh
sessions were only 36–38 minutes according to the app's own estimator, yet the earlier
set cap had already removed the options. At 60 minutes, lower-strength core still
disappeared. Only two direct core sets remained across the fresh cycle.

One recovery reproduction used a chest session with four bench, three secondary-press,
three fly, three triceps and two core sets. The balance chart gave all four listed muscles
3.8 sets each. At 24 hours with blank RIR, recovery gave each muscle load 15, hard sets 15,
and score zero. This demonstrates an accounting bug, not proof the lifter was exhausted.

The 108 fresh 60-minute programmed set blocks include three arm supersets; therefore they
are not 108 individual exercise sets and cannot be directly compared to ordinary-set totals.
Standard planner tests exclude the loader that adds the adaptation modules, so existing
passing tests do not prove these runtime calculations are correct.

## Recommended six-session content

Starting working-set allocations, excluding warmups; exercise choices must respect actual
equipment and preserve the approved canonical movements. These exact counts are design
judgments for a moderate initial program, not universal research requirements.

| Session | Ordered movement slots and working sets | Total |
|---|---|---:|
| Push A — chest emphasis | Bench press 3; incline press 3; lateral raise 3; triceps isolation 2; core 2 | 13 |
| Lower A — squat emphasis | Squat 3; RDL 2; split squat 3; hamstring curl 2; calves 3 | 13 |
| Pull A — vertical-pull emphasis | Vertical pull 3; supported row 3; rear delts 2; curl 3; core 2 | 13 |
| Push B — balanced pressing | Chest press 3; overhead press 3; fly 3; lateral raise 2; triceps isolation 2 | 13 |
| Lower B — hinge emphasis | RDL 3; squat 3; split squat 3; hamstring curl 3; calves 3 | 15 |
| Pull B — row emphasis | Supported row 3; vertical pull 3; rear delts 2; curl 3 | 11 |

This groups chest/front-deltoid/triceps work on push sessions and back/rear-deltoid/biceps
work on pull sessions. Supported rows reduce additional lower-back work after leg sessions;
the selector must enforce that constraint rather than rotate away from it next exposure.
The two lower sessions change the lead lift and relative hinge/curl dose. Glutes already
receive compound work; hip thrusts can be an optional emphasis rather than a mandatory
extra slot on both days.

A repeated category has two intervening workouts, including wraparound. That is not a
promise of complete physiological recovery. Insert rest according to performance, fatigue,
other exercise and life demands; a rest suggestion must never replace or advance the
saved workout. NSCA describes this push/lower/pull organization as one workable split.
[NSCA programming guidance](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/).

| Direct work | Sets per six-session cycle | Average per week at five sessions |
|---|---:|---:|
| Chest | 12 | 10 |
| Back, rows and vertical pulls | 12 | 10 |
| Quadriceps | 12 | 10 |
| Hamstrings, hinges and curls | 10 | 8.3 |
| Calves | 6 | 5 |
| Biceps isolation | 6 | 5 |
| Triceps isolation | 4 | 3.3 |
| Lateral delts | 5 | 4.2 |
| Rear delts | 4 | 3.3 |
| Overhead pressing | 3 | 2.5 |
| Core | 4 | 3.3 |

At five sessions weekly, a cycle averages 8.4 days and each primary category averages 1.67
exposures/week; at six it averages two. The week must not reset the cycle. Lower isolation
counts for arms are intentional because presses and pulls also involve them. Do not count
indirect work one-for-one as isolation: fractional accounting can help estimate exposure,
but is not an exact measurement for an individual.
[Pelland et al., direct/indirect volume and frequency](https://pubmed.ncbi.nlm.nih.gov/41343037/).

## Design rules beyond the split

- Use one time-budgeting pass over the complete candidate plan. Reserve meaningful work
  for the session's primary patterns, and track accessory omissions across completed
  sessions. A 15-minute plan cannot promise the full plan's weekly dose.
- At 15–20 minutes keep the principal movements and an intentional accessory slot; at
  30–45 minutes preserve recurring calves/core rather than always adding extra big-lift
  sets first. Do not compensate for missed days with automatic catch-up volume.
- Keep main lift choices stable across a useful block of repeated exposures, while
  allowing explicit swaps, equipment changes and pain-aware alternatives. Keep variation
  purposeful. Evidence favors systematic rather than excessive random variation.
  [Exercise-variation systematic review](https://pubmed.ncbi.nlm.nih.gov/35438660/).
- Record direct, indirect and unknown muscle contributions separately. Recover muscle
  load from performed exercise sets, never from the workout title or all session sets.
  Blank RIR stays unknown. Explicitly unfinished edits must not count as completed work.
- Treat recovery numbers as estimates. A fixed 72-hour curve cannot certify readiness.
  Review performance and reported effort before increasing volume or declaring a deload.
- For users consistently training fewer days, evaluate full-body or upper/lower options.
  A volume-equated meta-analysis found no clear overall advantage of split versus full-body
  routines. The choice should fit adherence and workload.
  [Split/full-body meta-analysis](https://pubmed.ncbi.nlm.nih.gov/38595233/).
- Broad ACSM guidance supports regular training of major muscles, individualized loading,
  and roughly ten weekly sets per muscle as a hypertrophy target, not a hard minimum
  below which exercise is ineffective. More complicated programming is not automatically
  better. [ACSM 2026 guidance](https://acsm.org/resistance-training-guidelines-update-2026/).

## Implementation order and acceptance criteria

1. Fix muscle accounting and missing-RIR handling; add realistic runtime integration tests.
2. Replace double truncation with one planner; test 15/20/30/45/60-minute cycles and all
   equipment profiles, including genuine unavailable-pattern handling.
3. Add new versioned program keys/templates. Do not repurpose old keys in historical
   records. Preserve active draft plans and offer the redesigned cycle after completion;
   never relabel or replace an unfinished workout mid-session.
4. Keep approved exercise/media identities, load history, explicit swaps, immediate set
   persistence, account scoping, and offline recovery intact.
5. Verify program progression, cycle wraparound, five-day weeks, rest days, same-day
   reopening, and duplicate Finish actions. Calendar changes cannot advance a workout.
6. Test the proposed program end-to-end before a preview release; get real training
   feedback. Existing camera PR #37 remains unmerged until its phone-validation gate is met.

**Handoff status:** research and review complete; redesigned programming and accounting
fixes are pending implementation. Previous 347 passing tests apply to the earlier rotation
patch, not to this proposed redesign. No unsupported claim of professional approval,
physiological validation, or completed implementation should be made.


## User clarification — planned variety, whole-body development, optional cardio

These requirements refine the proposed templates above. The template tables describe
movement slots and an initial workload, NOT six immutable workouts to repeat indefinitely.

- The app must coordinate the entire rolling program. Users should not need repeated
  manual swaps to correct duplicate exercises or overlapping muscle loads.
- Provide meaningful A/B exercise differences and planned accessory variety across
  successive exposures. Evaluate exact exercise identity, movement pattern, direct and
  indirect muscle involvement, lower-back/grip demands, and recent completed work.
- Repeated primary lifts are allowed when needed for measurable progression, but avoid
  redundant exact exercises across adjacent or closely spaced sessions when appropriate,
  equipment-compatible alternatives exist. Preserve stable benchmarks while rotating
  accessories/angles/rep emphases deliberately; do not make every movement unfamiliar.
- Review and evolve the program each week from completed performance, fatigue, available
  equipment, time and preference. Evolution can mean changed exercise choices, reps,
  loads, sets or emphasis; it must not automatically mean more volume or a compulsory
  new exercise. Explain meaningful changes briefly.
- Weekly planning never regenerates an active unfinished session or moves the saved
  sequence forward. Missed weeks do not unlock harder workouts by elapsed time alone.
- Reconcile variety with limited equipment, skill and recovery. Do not invent movements
  or select unavailable equipment merely to satisfy a novelty quota. When repetition
  is justified, give a concise training reason instead of requiring the user to fix it.
- Track adequate coverage and progress across all major muscle groups and movement
  patterns, including lateral/rear shoulders, calves and core. Track smaller support
  muscles through relevant compounds and targeted work where appropriate. Do not claim
  every anatomical muscle is individually trained or guarantee strength gains.
- Test multiple complete cycles, variable five/six-day attendance, 15–60-minute sessions,
  equipment restrictions and recovery adjustments. Check exact-exercise repetition,
  recurring omissions, distribution of direct/indirect sets and benchmark progression.
  Automatic corrections affect future unstarted sessions, never overwrite performed work.

### Optional cardio

Add a clear opt-in/out preference, available to change at any time. Cardio is a companion
plan, not a compulsory seventh step in the strength rotation.

When enabled, obtain the user's activity baseline, preferred modes, available equipment,
time and goals. Suggest appropriate duration/intensity using both existing activity and
upcoming strength demands. Account for logged walking, cycling, running, swimming or
classes so recommendations do not silently stack on top of activity already performed.
Hard intervals or demanding leg cardio must not be the automatic default around heavy
lower sessions. Increase gradually from baseline; do not impose a full population target
as an immediate starting prescription.

Completing, skipping or disabling cardio never advances, blocks or resets strength
workouts; opting out produces no missed-workout penalty. If the user chooses to log
external cardio while recommendations are off, the logged workload can still inform
recovery. No activity-tracking integration or automated data collection is implied.

Evidence basis for deliberate variety:
[Exercise variation systematic review](https://pubmed.ncbi.nlm.nih.gov/35438660/).
General aerobic health targets should be individualized rather than used as a mandatory
app quota; see [U.S. Physical Activity Guidelines](https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines/current-guidelines).

Status: recorded requirements for implementation; no cardio feature or new program
behavior has been shipped by this documentation update.
