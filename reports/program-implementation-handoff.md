# Coordinated program implementation — checkpoint

User authorized implementation September 12; explicitly requests continual durable notes.
Branch fix/camera-reliability-v6, PR37 preview only per camera phone-validation handoff.
Baseline 2b4643b. No production merge.

In progress:
- New versioned PushA/LegsA/PullA/PushB/LegsB/PullB keys and templates reuse approved
  exercise options. Old keys/history remain readable; finish of legacy sessions transitions
  into complementary new session. New profiles start PushA. Draft plans remain frozen.
- Primary selections held4 exposures; accessory options use recent completed-history
  penalties, never elapsed date. Supported row pool excludes unsupported barbell rows.
- Single planner pass from full templates, all slots available at45/60m. Realistic longer
  compound rest and unilateral/superset work estimates. Need full regression tests.
- Accounting reviewer completed progress-analytics-v2/trainer-intelligence-v2 fixes and
  tests/muscle-accounting.test.js; focused tests pass. Completed per-exercise work only;
  direct +0.5 indirect estimate; missing RIR unknown; no all-session load duplication.
- Cardio agent owns cardio-companion.js + tests, still in progress. State in program.cardio
  for existing cloud sync. Main handles entrypoint packaging and end-to-end verification.

Remaining: validate/revise new-key legacy tests; add multi-cycle, draft/migration, short
workout and variety tests; finish cardio integration and UI gap explanations; verify all85
media IDs unchanged; web/Android bundles and full tests; GitHub publish and preview check.
Do not claim feature shipped until exact tested tree is pushed and preview READY.

## Implementation complete locally (September 12, 2026)

Supersedes the in-progress list above. Cardio module integrated in both entrypoints,
web and Android packaging. No database migration: settings and completed external
cardio live in the existing synced program.cardio object. Cardio opt-out retains logs;
recommendations consider current/next legs, baseline, time, intensity and recent activity.
Strength completion/draft/rotation state is never changed by cardio actions.

New program is Push A / Legs A / Pull A / Push B / Legs B / Pull B. Default complete
sessions have 6 direct chest sets on both push days; legs alternate squat/hinge emphasis;
pull days use supported rows. Four-exposure benchmark blocks; accessory choices penalize
recent exact repeats and rotate approved variants. Elapsed weeks cannot change a draft.
Restricted equipment gaps are displayed; bodyweight lat movement is a light fallback,
not equivalent to progressively loaded pulling. Do not promise every exercise is new.

Planner sees all template slots once, rotates overdue accessories in short sessions,
accounts for unilateral work and compound rests. History coverage counts actually
performed exercises. Muscle analytics use direct + 0.5 indirect set estimates; these
are workload estimates, not a validated individual recovery measurement.

Verification: full suite 357/357 passed before the final additional cardio DOM/reload
integration test; focused session suite with that additional test passed 15/15.
Web build: 64 public files and 85 verified first-party illustrations.
Android web build: 46 direct scripts + 15 runtime scripts succeeded.
Registry audit retains 85 canonical exercise IDs, all 85 approved visuals, zero broken
frame references or substituted movements. Broad audit still lists 109 equipment-library
names without exact media (existing expanded-library limitation, not new canonical IDs).
New tests: balanced-program (cycle/chest/equipment/benchmark stability), cardio-companion,
muscle-accounting; updated legacy transition fixtures and completed-set coverage fixtures.
Existing tests cover frozen drafts across dates/reloads, empty and partial Finish,
archive recovery, exactly-once advancement, all durations and both modes.

Publishing next: push exact tested tree to fix/camera-reliability-v6 and check Vercel
READY for that commit plus GitHub CI. PR37 remains draft; production camera phone gate
from Claude's handoff remains pending. No physical phone, live authenticated cloud-sync,
or real-browser visual validation has been performed for this program change.

## Published checkpoint

Feature commit: 8c1be6efe0735a012a7c50c1f18b283748ee0d25.
Local staged tree and remote tree both 8f5283411fe3a738a774410fdbcff4e2a02e1cb2.
Vercel deployment dpl_B6UKHMgEw9foYmXEA8mx4VSiX8FG confirmed READY for that
exact feature commit. Preview URL:
https://iron-six-training-44bof9pnb-jordman55-3386s-projects.vercel.app/?pose=1
Branch alias:
https://iron-six-training-git-fix-camer-667d60-jordman55-3386s-projects.vercel.app/?pose=1
Preview may require the owner's Vercel sign-in. This is deployment verification, not
physical-device validation. GitHub Validate Iron Six run34717917389 and Android test
build run34717917396 were still running at this checkpoint; check their final results
before merging. No merge or production deployment was performed.
