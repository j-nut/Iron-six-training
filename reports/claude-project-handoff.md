# Iron Six — Claude project handoff

Updated October 3, 2026 UTC. This is the entry point for the next agent. Read the current remote main and open PRs before editing; this document describes verified work and explicitly separates pending checks.

## Project and release state

- Repository: https://github.com/j-nut/Iron-six-training
- Production: https://iron-six-training.vercel.app/
- App repair merged in PR #47: https://github.com/j-nut/Iron-six-training/pull/47
- App repair main commit: `4ced98dc358c29be2c691634662ce25972b19ce5`, tree `a0ec07a6eb1fdfc9f69fe116d333f51419e2d4de`.
- Production Vercel deployment `dpl_BZmJ6LJrarLx5FKAzD9VsEBNe9aq` was READY and the production alias resolved to the merged app commit.
- Signed Android build passed at https://github.com/j-nut/Iron-six-training/actions/runs/37098369429. Existing stable signing secrets were used; signature verification and debug-key rejection passed. This historical build is an Actions artifact; new release automation below publishes permanent downloads.
- Other sessions' open PRs #46 (landmine illustrations), #42 (watch integration) and #11 (exercise library) were not merged, rewritten or closed by this work. Open issue #28 concerns e1RM calibration. Assess current diffs before treating these proposals as implemented.

## App repairs already shipped

Read `reports/adaptive-workout-flow-handoff.md` for detailed behavior and `git show 4ced98d` for the complete patch. Main modules: `session-planner.js`, `workout-store.js`, `engine.js`, session UI files, `coach.js`, `local-ai-fallback.js`, `circuit-player.js` and their tests.

Manual routine changes preserve displaced sessions in a durable pending sequence. Completion advances the selected session once; rest does not advance it. The forecast uses the same scheduler. Actual completed movement families, including recent archived partial work, can defer immediate repetition. This is a bounded heuristic, not a complete physiological recovery model, and it cannot account for unlogged exercise.

History matches exact exercises before compatible load families, distinguishing barbell totals from dumbbell per-hand loads. Top sets/backoffs stay separate, deliberate load reductions survive, and equipment caps/bodyweight exercises prevent invented or excessive loads. Completed-row edits recalculate remaining targets and survive rerender/reload. Invalid reps/loads cannot remain marked done; numeric zero and unloaded work remain supported.

Late Coach/recalibration responses cannot apply to replacement sessions, changed accounts or newer edits. Swaps preserve role, volume and time constraints and retain performed work in the journal. Duration/mode/readiness/equipment changes invalidate stale plans. Coach requests have a body-inclusive deadline, duplicates are blocked, and exercise demo shortcuts resolve against the current workout. Circuit prescriptions agree with timeline rounds; skip does not log completion.

Do not collapse immutable performed history into the current exercise prescription. Do not reuse another exercise's historical load just because it shares a movement pattern. Preserve account isolation, durable saves, RLS and the stable Android signing key.

## Verification and limits

- App repair suite: 470 tests passed with zero failures; planner matrix covered 672 combinations of routines, equipment, durations and modes. Repository onboarding adds one behavioral regression test (471 total expected).
- Web and Android web bundle builds passed. Native debug APK and release AAB build passed CI; subsequent stable-key signed APK/AAB passed CI.
- Live guest UI checked Done/undo counters, invalid completed edits, reload persistence, first-exercise demos, manual routine changes/archive/forecast, duration/mode rebuilds and circuit start/skip/pause.
- Production cloud Coach returned a successful `openai/gpt-oss-20b` response and recalibration HTTP 200. Preview lacked cloud configuration, so fallback was checked there.
- Physical Android execution/update install, narrow phone viewport/browser matrix and a real authenticated cross-device workout flow remain unverified. Account tests use simulated services. No production user's workout records were modified.
- A green suite is regression evidence, not a claim that every bug or device scenario has been eliminated. Track new defects with exact reproduction evidence.

## GitHub workflow implemented in this change

| Feature | Files / behavior | How to use |
| --- | --- | --- |
| Bug and feature intake | `.github/ISSUE_TEMPLATE/*.yml` | New Issue collects reproducible behavior, environment, account mode and acceptance criteria. Avoid private records/secrets. |
| PR review and ownership | PR template, `.github/CODEOWNERS`, `CONTRIBUTING.md` | Link issues; record tests, UI checks, data/release effects and unverified cases. Ownership enforcement still requires owner protection setup. |
| Labels, milestones, backlog | `repository-setup.yml`, `scripts/github/repository-setup.cjs` | Runs after merge on setup-file changes or manually from Actions. Creates missing metadata and four verification/setup issues. Reruns preserve custom labels, existing milestones and completed issues. |
| Issue triage | `issue-triage.yml` | Open/reopened issues without an existing `status:*` get `status:triage`. Maintainers set priority, area, readiness and milestone. |
| Dependency maintenance | `.github/dependabot.yml` | Weekly npm, Actions and Gradle upgrade PRs; Capacitor grouped. Review and test before merging. No automatic merge. |
| Security scans | `codeql.yml`, `SECURITY.md` | JavaScript/TypeScript and Actions scans on PRs, main and weekly. Investigate findings in Security; keep private vulnerability reports private. |
| Permanent Android releases | `android-release.yml` publish job | After tests/signing checks pass, publishes `android-build-<versionCode>` containing `iron-six.apk`, `iron-six.aab`, SHA256SUMS and source/build evidence. Existing tags/assets are preserved on rerun. |
| Owner-only configuration | `.github/OWNER_SETUP.md` | Actual account Project, main ruleset, private reporting/secret scanning and security settings require owner access. Prepared; not applied by the managed connector. |

Labels: `priority:P0` data/account/core failure, P1 major regression, P2 normal, P3 optional. `area:*` selects UI/trainer/routines/Coach/accounts/Android/GitHub. Choose one `status:*` label (`triage`, `ready`, `blocked`, `verification`) rather than accumulating contradictory statuses. Milestones are **Reliability and release readiness** and **Future enhancements**, without speculative deadlines.

The bootstrap adds real issues for physical-device updates, authenticated sync, mobile/accessibility verification and owner setup. Existing issue #28 and watch/library work are placed in Future enhancements only if no milestone already exists. Other PR descriptions/diffs remain unchanged.

## Running and releasing changes

1. Fetch remote main, inspect `git status`, open PRs and latest Actions. Create an isolated branch; never overwrite other sessions' uncommitted changes.
2. `npm ci --ignore-scripts`; `npm test`. Node 22 is the CI baseline. `node scripts/build-web.mjs` builds the web bundle; `npm run android:sync` builds the native web bundle and syncs Capacitor.
3. Verify the actual changed user flow, including console/network errors, reload, offline/account transitions and following-day plans when relevant. Add targeted regressions for reproduced failures.
4. Open a PR with issue links and evidence. `validate` tests/syntax/Edge typechecks; CodeQL scans. Native `apk` is path filtered; do not make it a blanket required check.
5. Merge only after relevant checks pass. App/workflow changes on main trigger signed Android builds using existing repository secrets. The publisher has `contents:write`; the signing build retains read-only contents permission. No personal token is needed for releases.
6. Download APK from Releases to install; AAB is for Play. Verify SHA256SUMS. Never rotate signing key casually or reset version codes (`1000 + GITHUB_RUN_NUMBER`). Rerunning an old release preserves existing assets. Do not delete/recreate its workflow to reset numbering.
7. Check Vercel production separately; a successful GitHub workflow is not proof that the production alias has deployed the same commit.

## Remaining owner setup

At the initial GitHub audit, main was unprotected, repository rulesets were empty and Releases were empty. Account Projects could not be managed by this connector, and the browser was not signed in. Do not claim these admin settings have been enabled without fresh evidence.

Follow `.github/OWNER_SETUP.md` to create/link **Iron Six delivery**, enable its Status and auto-add workflows, require `validate` (and exact CodeQL names after they succeed), block force pushes/deletion, and enable available security settings. Avoid requiring the sole owner to approve their own PR. Record the Project URL, ruleset ID and a demonstrated failing-PR merge block here before closing the setup issue.

## Recommended next work

Prioritize the three verification issues before adding more Coach complexity. Reproduce and fix specific failures found on real accounts/devices, then capture each as a regression. Add durable end-to-end browser coverage for manual routine changes → interrupted logging → reload → next-day forecast. Expand offline conflict and profile-switch coverage with dedicated test accounts. Establish an accessibility and device matrix.

For features, assess issue #28 e1RM calibration (optional max testing and transparent estimates), the watch integration PR's permissions/offline/battery behavior, and equipment-aware library expansion. Show why a recommendation changed and let the user correct recorded work; do not promise the app can infer unlogged activity. Consider explicit training-dose explanations and user-controlled schedule constraints before replacing the current bounded scheduler with more complex recovery logic.

## Latest delivery evidence

- GitHub workflow PR #48 merged: https://github.com/j-nut/Iron-six-training/pull/48 ; main commit `a6b45e3c78ae95f144c02095aa15cabf1029b017`.
- PR validation, both CodeQL languages and native APK build passed on final head `1f26c83594f005b4119eebc5b09d304ae46dc1e0`. Main validation and CodeQL passed after merge. The combined suite is 471 passing tests.
- Bootstrap succeeded: https://github.com/j-nut/Iron-six-training/actions/runs/37099601976 . Created verification issues #49 (physical Android update), #50 (authenticated sync), #51 (mobile/accessibility), and #52 (owner-only setup). Labels/milestones are live; issue #28 is in Future enhancements.
- Signed build and publication succeeded: https://github.com/j-nut/Iron-six-training/actions/runs/37099601974 . Permanent Release: https://github.com/j-nut/Iron-six-training/releases/tag/android-build-1007 . Assets verified present: `iron-six.apk` (23,104,590 bytes), `iron-six.aab` (22,355,315 bytes) and `SHA256SUMS.txt` (158 bytes). Source target is the workflow merge commit above.
- Dependabot successfully ran all three ecosystems and opened upgrade PRs #53–58. They are proposals, not merged compatibility fixes. Review major Gradle/jsdom changes especially carefully.
- Follow-ups #59/#60 explicitly grant pull-request metadata write access to onboarding and lists open PRs separately, so their additive labels/milestones are not dependent on the issue-list endpoint returning PRs. The live run confirmed PR label updates require `pull-requests:write` as well as `issues:write`; read-only PR access failed with HTTP 403. Contents remains read-only and the script does not merge PRs or alter code, descriptions or state.
- Owner authentication was offered securely. The first Google step remained on the identifier screen after manual takeover. A user-requested retry reached the password step, but Google reported “Wrong password.” No signed-in GitHub owner state was verified; a manual sign-in continuation was offered. Actual Project creation, main protection and security toggles remain blocked in issue #52. Do not claim full GitHub setup is complete.

Next agent: inspect the merged follow-up PR, newest main Actions and repository issue metadata. Continue owner setup only after a positive signed-in signal; never request secrets in chat. If owner setup is completed later, append the Project URL, ruleset ID, enabled security settings and demonstrated failing-PR merge block here before closing #52.

## Follow-up: visual and reward refinement

The user subsequently requested a more polished app and refined rewards. Read `reports/ui-reward-refinement-handoff.md` for its design changes, profile-safe reward controls, targeted tests and delivery evidence. Existing reward IDs and earning rules are retained; this is not a new point economy or a training-load change.

GitHub permission correction PR #60 merged as `144b49e6966ad1aa6c9eeaaca850fb89100f337f`. Bootstrap run https://github.com/j-nut/Iron-six-training/actions/runs/37100493387 succeeded: PR #46 has area/UI triage labels, and #42/#11 have triage labels and Future enhancements milestones. Issue #52 remains the explicit owner-access blocker.


### October 3 UI redesign continuation

PR #62 is merged and the substantial redesign is **live**. The user reviewed its preview, said it was looking better, and authorized publication. Source `da8e53b3df597b1c433e81d9619df2385f1dbaf9` is the current verified production source. Deployment `dpl_9nvsN2NQgx6jjjvGBTBF1THtQd5b` is READY with the canonical production alias. Signed Android release `android-build-1008` has permanent APK/AAB/checksum assets and the same source; release run `37148454037` succeeded. Final validate, CodeQL and APK checks passed; 488 local tests passed.

The delivered redesign covers all five tabs, navigation, grouped profile fields, log-first History, scheduler-based current/next cards, readable Coach choices, and earned-reward identity/collection/style. Read `reports/ui-reward-refinement-handoff.md`. Independent browser viewport checks were blocked by repeated navigation timeouts. User visual acceptance does not replace physical-device or authenticated cross-device verification; #49/#50/#51 remain open. Owner-only GitHub setup remains #52.

### Saved workout difficulty — current feature branch

The user requested Light/Balanced/Heavy defaults and day-specific adjustments after publishing the design. Read `reports/workout-difficulty-handoff.md` for implementation, APIs, usage, regression evidence and release status. Draft PR #64: https://github.com/j-nut/Iron-six-training/pull/64 . The functional feature commit is `79c31e3a6bf87cab7c7857be6b517a78662aeb72`; 531 local tests pass, both bundles build, and its Vercel preview is READY. Feature issue #63 is separate from the completed design issue #61. Check the difficulty PR and deployment before saying this feature is on production; the shipped redesign does not contain the new controls until that PR is merged.
