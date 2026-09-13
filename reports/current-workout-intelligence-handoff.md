# Iron Six — Current Workout Intelligence Handoff

_Last updated: September 13, 2026_

This note captures the latest production workout-programming and UI/auth work so another AI can resume without re-deriving recent changes. The repository and deployed code remain the source of truth.

## Production baseline
- Canonical production URL: `https://iron-six-training.vercel.app`
- Production aliases are redirected/canonicalized so auth state is not split across Vercel hostnames.
- Latest workout-programming work now includes the v4 dynamic registry variety change in `workout-dispatch.js` (commit `0294e36eb63de0ba3fd05d895e37026bce06909a`). Verify the newest Vercel production deployment before claiming it is live.

## Current six-session rotation
`Push A → Lower A → Pull A → Push B → Lower B → Pull B`

The week does not reset the sequence. Rest days do not advance it. Finished sessions advance it.

### Session identities
- **Push A — chest emphasis:** horizontal pressing strength, upper-chest support, side delts, triceps, core.
- **Lower A — squat emphasis:** squat/quad priority, unilateral leg strength, smaller hinge dose, hamstrings, calves.
- **Pull A — lat/width emphasis:** vertical pulling benchmark, direct lat work, lighter supported row, long-head-biased curl, core.
- **Push B — balanced pressing:** alternate chest angle, overhead press, chest isolation, side delts, triceps.
- **Lower B — hinge/posterior emphasis:** hinge strength, secondary squat work, direct hip extension/glutes, hamstrings, calves.
- **Pull B — mid-back/thickness emphasis:** supported-row benchmark, secondary vertical pull, rear-delt/scapular work, brachialis/forearm-biased curl.

A/B pairs must feel meaningfully different biomechanically, not merely reordered versions of the same exercise menu.

## Dynamic exercise variety v4
The user specifically said the workouts still felt too repetitive/limited and should feel "dynamic and alive." The key finding was that the approved exercise registry contains more exact-media movements than the legacy workout slot arrays expose.

`workout-dispatch.js` now:
- keeps the compact legacy workout definitions as the base programming templates,
- expands eligible slot options from `IronSixExerciseRegistry.exercises` when `base` or canonical movement `pattern` honestly matches,
- requires `mediaMatch === 'exact'`,
- converts registry equipment requirements into the existing deterministic `exerciseAvailable` gate,
- gives registry exercises conservative pattern-specific prescriptions,
- keeps benchmark/anchor exercises stable for four-exposure blocks,
- lets accessories refresh every completed exposure,
- heavily penalizes exact exercises used recently,
- adds an explicit penalty when the A/B counterpart recently used the same exact exercise,
- adds a smaller movement-pattern repetition penalty for accessories,
- preserves intentional session constraints (notably lower-back-friendly rows after lower-body sessions),
- keeps custom-equipment/Groq-generated allowlisted options in the same pool,
- exposes the enlarged pool through `_alternatives`, improving Swap choices without requiring the user to constantly repair the plan manually.

Important design rule: **variety is not randomness**. Exercise novelty must lose to session purpose, equipment, media correctness, recovery, and useful benchmark stability.

## Pull A / Pull B fix
`workout-dispatch.js` differentiates the pull sessions deliberately:
- Pull A favors Pull-Up / Chin-Up style vertical work, direct lat isolation, lighter unilateral/support row work, and long-head curl options.
- Pull B favors chest-supported or otherwise lower-back-friendly rows, secondary vertical pulling, more rear-delt/scapular work, and hammer curls.
- Pull-session selection cache was version-bumped so users see the new A/B identities rather than stale cached choices.
- Pull sessions continue to avoid unnecessary unsupported barbell-row fatigue after lower-body sessions.

## Lower A / Lower B fix
Lower B was changed because it still resembled Lower A too closely. The intended distinction is now:
- Lower A = stronger squat/knee-dominant + unilateral emphasis.
- Lower B = stronger hinge/posterior-chain + direct hip-extension/glute emphasis.

## Rolling program intelligence
New runtime: `program-intelligence-v3.js`.

It analyzes **completed work only** and does not rewrite an active draft. It currently tracks recent direct movement dose across:
- chest pressing
- overhead pressing
- lateral delts
- triceps
- vertical pulling / lat width
- rows / mid-back thickness
- direct lat work
- rear delts / scapular work
- biceps / brachialis
- squat / quad work
- hinge / posterior chain
- unilateral leg work
- direct glute / hip extension
- hamstring curls
- calves
- core

It also:
- examines the last ~6 completed sessions,
- identifies under-covered categories as priority signals,
- detects exact exercises repeated across adjacent completed sessions,
- looks ahead at the next three sessions and their purposes,
- exposes an `Upcoming training logic` section on the Plan screen,
- enriches Groq Coach and post-workout review requests with the same program-analysis context.

Important rule: deficits are a **priority signal**, not a mandate to force catch-up volume into the next workout.

## Deterministic planner integration
`session-planner.js` uses rolling-program deficits when deciding which accessories survive a shortened session or deserve extra volume.

The deterministic planner remains authoritative for:
- time budget,
- equipment availability,
- exercise allowlists,
- active workout stability,
- safe set caps,
- not inventing unavailable exercises.

Groq augments this logic; it does not replace it.

## Groq / AI role
After `Finish workout`, Iron Six sends the completed session, recent history, and next deterministic workout to `/api/review-workout`.

That review also receives rolling-program analysis and is instructed to evaluate:
- exact-exercise repetition,
- repeated joint/movement stress,
- neglected muscle/movement categories,
- poor sequence complementarity,
- A/B sessions that are not meaningfully different,
- readiness/performance trends,
- whether modest set/load/emphasis changes are justified.

Guardrails:
- Groq cannot invent unrestricted exercises.
- It cannot choose unavailable equipment.
- It cannot reorder the saved rotation arbitrarily.
- It cannot rewrite a workout already in progress.
- It cannot increase volume/load aggressively.
- Deterministic fallbacks must still work if Groq/network is unavailable.

## Time-based workout behavior
- 45-minute and 60-minute traditional sessions should not be identical by design.
- 60-minute sessions may add controlled accessory/hypertrophy sets when time allows.
- Main compounds remain conservative rather than simply adding heavy sets because time exists.
- Planner should use under-covered accessory signals when deciding where extra time goes.

## Bodyweight load fix
`bodyweight-load-fix.js` prevents bodyweight exercises such as push-ups from receiving fake external loads (e.g. 30 lb).
- Bodyweight movements display `Bodyweight` instead of an editable pound target.
- Progression uses reps/RIR/control/harder variation.
- Explicit weighted/loaded variants can still track load normally.

## Top-set / backoff-set fix
Structured prescriptions such as bench `1 top set × 4–6, then 3 × 6–8` are preserved when adaptive recovery reduces set count.
Example reduced session:
- Set 1 = top set target
- Set 2 = lower-load backoff target
The UI should never show a 4-set sentence while rendering only two identical top-set rows.

## Active workout UI direction
Current design intent:
- large, easy-to-use set inputs,
- exercise illustration remains visible by default,
- secondary actions stay compact,
- forward navigation is prominent (`Next ›`, `Review ›`),
- completed exercise can trigger a subtle forward-action glow/pulse,
- reduced-motion preferences are respected,
- cardio belongs in Session setup, not as a disconnected panel at the bottom,
- Begin workout should be visible in the initial phone viewport without requiring scroll,
- premium visual polish uses subtle depth, transitions, button feedback, panel motion, and bottom-nav refinement without distracting animation.

Do **not** reintroduce a broad `MutationObserver` over the workout DOM; a previous observer-based clean-UI implementation caused the app to freeze when buttons changed the UI.

## Auth fix
The inconsistent sign-in behavior was traced mainly to multiple Vercel hostnames creating separate browser-storage origins.
Current rule:
- canonical production origin is `iron-six-training.vercel.app`,
- production aliases route/canonicalize to that origin before auth initialization,
- OAuth launch uses history replacement behavior so accidental Back is less likely to reopen the Google chooser.

Reload, reopening the canonical direct URL, and normal back navigation should preserve auth much more consistently.

## Premium UI polish
`premium-ui.css` is a visual-only layer. It adds:
- softer layered surfaces,
- subtle edge highlights/shadows,
- tactile button press states,
- smoother view/panel/modal/toast transitions,
- completed-set confirmation animation,
- cleaner glass bottom nav,
- reduced-motion fallback.

No workout/auth/state behavior should live in this stylesheet.

## Next major programming step
Extend the current 3-workout lookahead into a persistent **6-session forecast** that evaluates the entire upcoming cycle before exercise selection. It should proactively catch:
- redundant pressing/pulling angles,
- recurring exact-exercise overlap,
- underdosed rear/lateral delts, calves, core, hamstring knee-flexion, etc.,
- too much hinge stress / lower-back stress,
- poor distribution of direct vs indirect work,
- accessory omissions caused by repeated short sessions.

Then make the forecast influence future unstarted accessory selection directly. Groq may propose emphasis changes inside deterministic bounds, but the app should compute and enforce the final safe plan.

The forecast should evolve from completed training, readiness, time available, equipment, and performance. It should preserve useful benchmark lifts while deliberately varying accessory angles and exercises.

## Verification caution
Do not claim a feature is fixed merely because Vercel reports READY. Verify the actual production asset/runtime when the issue is browser-visible. This has already caught shipping problems where a source file existed but was not packaged into `web-dist`.
