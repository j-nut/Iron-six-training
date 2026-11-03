# Progression and workout reliability — November 2026

This is the first implementation batch from the whole-app finalization audit. Camera implementation and camera/device testing are outside this batch. No account, database, billing, signing, or API configuration is changed.

## Changes

- Incorporates the unreleased fixes in PR #94: numeric-RIR hard feedback refreshes remaining rows, interrupted scrubbing is dismissed and saved once, and all-working-sets completion replaces further-set advice. Original PR remains open for provenance.
- Within a session, on-target performance preserves actual reps instead of resetting to the range midpoint. Too little reserve reduces reps if doing so can restore the target inside the prescribed range; otherwise it reduces load by an equipment increment. Explicit hard feedback wins before increases.
- General-goal and Light reserve targets govern these decisions. At the top of the range, subjective easy feedback without numeric RIR cannot alone increase weight.
- Between sessions, normal late-set fatigue stays distinct from immediate set adjustment. A missed set blocks increasing either weight or reps; explicit hard feedback can veto progression even when an earlier set was stronger.
- Backoff rows carry both load and reps from the backoff-specific recommendation. The visible Trainer uses that same next-row calculation. A subjective “right” label cannot hide a numeric recommendation to reduce effort.
- Bodyweight exercises hold on-target/missing-RIR sets, reduce reps or suggest easier variations when needed, respect Light reserve, and retain pain stop/reassessment wording. They never acquire invented external loads.
- Completed entries and manually entered future rows are preserved. Runtime and entrypoint cache versions advance on both web entrypoints. Android web packaging includes the same corrected modules.

## Verification

New checks include 3,240 combinations of goals, training levels, difficulty, performed reps, RIR and feedback; bodyweight reserve/pain behavior; next-session missed-set veto; and backoff row/Trainer agreement through reload with manual future rows preserved. Existing suites cover difficulty changes, routine switches, partial/completed edits, account isolation, equipment limits, session restoration, and native packaging.

See PR #98 for final exact-head full-suite, CodeQL and Android CI results. The local test suite itself rebuilds Android assets: do not run android:sync/build-android-web concurrently with npm test, or the shared www directory can be removed while a packaging assertion is reading it.

Rendered preview verification was blocked by automatic browser approval review when the preview redirected toward a private Vercel dashboard. No bypass was attempted. DOM interaction checks are not physical Android keyboard/touch or visual-viewport acceptance. No camera testing is requested from the user for this batch.

## Remaining release work

Keep physical Android acceptance (#49), real-account cross-device verification (#50), mobile/accessibility (#51/#78), and broader exercise/programming review (#76) open. A newly built APK is required before installed Android users have these changes. Do not call build 1023 updated.

AI route abuse protection remains a separate blocker. PR #84's in-memory guest/fallback counters are not durable across serverless instances; the proposed database check-then-increment needs concurrency review. Its headerless-test shortcut also means legacy handler tests do not exercise the real guard. No part of #84 was merged into this batch.

This improves reproducible programming behavior; it does not establish that the training policy is optimal for every individual. Preserve the whole-app completion scope and continue camera work as an additional workstream.
