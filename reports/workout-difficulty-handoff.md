# Iron Six — saved workout difficulty

Updated October 3, 2026 UTC. Feature issue: https://github.com/j-nut/Iron-six-training/issues/63 . This work follows the completed UI/reward redesign in PR #62. The redesign is live at https://iron-six-training.vercel.app/ from `da8e53b3df597b1c433e81d9619df2385f1dbaf9`, with signed Android release `android-build-1008`. Difficulty is on the feature branch `feat/workout-difficulty`; check its PR/deployment before describing it as production behavior.

## How to use

Profiles → Default workout difficulty saves automatically for that profile. Today → Today’s difficulty changes the current session. “Make this my default” explicitly saves the chosen level for future sessions; “Use saved default” returns the current session to that preference. A default change during an already pinned session keeps that session's level; use Today to change it immediately. The selector remains in the Today header during active training.

| Level | Workout behavior |
| --- | --- |
| Light | Prefers suitable bodyweight/band/lighter-resistance alternatives in the same movement slot. Reduces unentered dose and numeric working suggestions, with about 4 reps in reserve. Timed/bodyweight movements do not receive invented pound targets. |
| Balanced | Retains the existing mix, selection cache keys and performance rules for existing profiles. |
| Heavy | Prefers owned machines/barbells, then other available equipment. Working weights still come from actual ability and configured equipment limits; this is not maximal lifting. Circuit suitability still excludes unsuitable heavy technical stations. |

Only available equipment is eligible. Readiness, pain feedback, movement coverage, routine sequencing and session budgets remain authoritative. All-bodyweight users still have workouts at every level. Changing level does not invent access to Olympic equipment.

## Implementation and invariants

- `core.js`: `workoutDifficulty` defaults to `balanced`; `sessionDifficulty` is optional `{level, workoutKey, exposure}`. Old profiles remain compatible. Non-Balanced choices have distinct cache keys.
- `workout-difficulty.js`: `effectiveFor`, `validOverride`, `selectionPenalty`, `transformWorkout`, `replanRemaining`, `adjustSuggestion`, `installLoadAdjustment`. Resolve valid session override, then pinned draft difficulty, then saved default. Load early after core; install suggestion wrappers only after load-progression/bodyweight runtime wrappers.
- `workout-difficulty-ui.js`: scoped, labeled Today/Profile controls, current-profile/account callback guards, readable descriptions, status announcements and accurate failure messages. Default saves and day-only changes are distinct actions.
- `engine.js`, `workout-dispatch.js`, `session-planner.js`: slot-equivalent equipment preferences, Light effort/dose, performance/capacity limits, deterministic duration budgets and circuit rounds. Existing Balanced selection and dose are unchanged except a real readiness bug fix: low energy no longer skips the high-soreness hinge filter.
- `workout-store.js`: draft and plan-event snapshots include session difficulty. `replacePlan` records one recoverable revision before applying it, rejects nondurable revisions, and preserves session ID, entered rows and exercise indices. Recovery restores the session's level, but deliberately does not replay old journal events into the global default. Restored copies retain their own level.
- `cloud-sync.js`: both fields fit the existing JSON runtime state. No database schema, auth provider or RLS migration. Local pinned plans/overrides stay intact when cloud settings are accepted; the global default can follow the explicitly chosen cloud profile settings.
- `ui2.js`, `ui3.js`, `coach.js`: effective level enters recalculation, Coach and review context; level changes invalidate stale calibration/actions/reviews. Finished history records the chosen level and clears the temporary override. Manual routine changes clear it as well.
- Cloud/offline Coach and trainer guidance explain the same effort preference. Both client and `/api/recalculate` cap Light calibration at 1.0. Heavy never raises an inferred working load simply because of its label.
- Circuit rebuild maps logical interval kind/exercise/set/round into the new timeline, rather than reusing an obsolete ordinal index. Changes pause the timer, retain the current surviving station or move forward to the next surviving interval, and checkpoint that position for reload. Timer progress never marks a set done.
- Both HTML entrypoints and web/Android builders include the helper/UI with cache-version bumps. No new dependency.

Every exercise with any stored row is protected, including an incomplete entry or a deliberate blank. Its name, index and prescribed set count stay fixed so entered data cannot move onto a substitute. Untouched slots may change equipment and reduce sets. Recommendations for later unentered sets of an already touched exercise can become lighter, using a fixed anchor instead of repeatedly subtracting 20% on each render/set. Repeated Light selection is idempotent. A live session is not lengthened when switching back to Balanced/Heavy; fresh future sessions use the saved level and normal dose.

Set failures keep the existing plan. If the journal saved today's change but saving the global profile preference fails, the day change remains recoverable while the default is rolled back and the UI reports that distinction. Never claim “default saved” from the journal alone.

## Verification and remaining acceptance

Engine regressions include 2,016 fresh equipment × routine × level × mode × duration combinations and 1,728 live level switches. They check owned equipment, distinct movements, preserved entered work, duration ceilings and timer/prescription agreement. UI tests exercise actual selectors, complete/partial/blank rows, reload, saved-default changes, profile isolation, failed writes, later circuit stations and cooldown. Account tests cover cloud payloads, account switches, explicitly accepted cloud conflicts, and explicit guest import before/after logging with different pinned/future levels. Backend tests verify Light cannot receive a positive calibration factor even when the provider requests one. Review tests reject responses after level/default changes. Offline Coach/trainer tests check Light effort guidance.

Run `npm test`, `node scripts/build-web.mjs`, `node scripts/build-android-web.mjs`, JavaScript syntax checks and the PR's validate/CodeQL/native APK checks. Local Deno is unavailable; Edge type checking is performed by validate CI. Final local verification: **530/530 tests passed**, JavaScript syntax checks passed, and web/Android web bundles built successfully (75 public files, 48 direct native scripts and 22 shared runtimes). The matrix tests are included in those 530 tests; 3,744 combinations are not separate test-file counts. PR/deployment delivery evidence is recorded below.

Independent rendered visual checks remain blocked by the provided browser navigation timing out. Automated DOM tests are not screenshots or real browser/device acceptance. Real authenticated cross-device behavior and physical Android installation remain #50/#49; mobile/accessibility checks remain #51. No real user's workout records were edited in testing.

## Recommendations for future work

1. Validate three representative owned-equipment profiles on actual phones; change Today midway through a logged workout, reload, finish, and confirm the following session uses the saved default.
2. Add examples explaining why a movement changed, using the actual slot/equipment/readiness reason. Keep the selected level separate from training experience and circuit interval pace.
3. Consider an explicit future-session preview generated from a clone with `workoutDraft:null`, `sessionDifficulty:null`, `today:{}` and cloned program/cache state. Never forecast from today's pinned plan or write forecasting mutations back to the real user.
4. Evaluate user feedback on exercise effort before adding more levels or numerical sliders. Bodyweight can still be difficult; assistance/regressions require actual supported alternatives, not a promise that all bodyweight choices are easy.
5. Continue the existing device/sync/accessibility and owner GitHub setup issues before claiming every scenario is verified. Treat future workout-duration or equipment requests as separate changes; do not rewrite performed work to satisfy them.
