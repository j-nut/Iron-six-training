# Adaptive workout flow repair

Updated September 25, 2026. Baseline: main 31496dfe2893cf1e12799f69eea913c2ae3eb7bf.

## Confirmed bugs repaired

- Manual workout changes discarded displaced sessions. A persistent pending sequence now retains them; explicit completion moves the selected session to the end.
- The next focus now considers actual completed movement families. Two or more completed sets in a family defer an immediate repeat when an alternative is pending. Completed sets in recently archived partial sessions contribute for 48 hours; unfinished rows do not. This is a conservative scheduling heuristic, not a complete recovery model.
- Finish journal events retain the selected next sequence and recovery applies completion idempotently. Rest days do not advance the sequence. The six-session forecast uses the same scheduler and updates as completed work changes.
- Manual changes/completion invalidate stale verified plans and accessory caches while retaining benchmark block selections.
- Historical load matching no longer transfers barbell totals to dumbbell per-hand weights or unrelated exercises sharing a pattern. Latest exact exercise performance outranks stale medians, including deliberate load reductions.
- Top sets and backoffs remain distinct in history and in the current session. Backoffs start from the actual top set and do not repeatedly compound the initial reduction. Completion preserves set index, prescription, feedback, and numeric zero.
- Editing a completed set recalculates remaining targets. Rerendering retains those targets and saved feedback. Progress and displayed prescriptions match planned rows.
- Late cloud recalibration/review responses cannot overwrite replacement sessions, newer edits, changed routines/accounts, or changed planning inputs. Review preserves unrelated trainer memory, including Iron Marks and appearance.
- Small AI load adjustments remain bounded after rounding. Pain alternatives retain equipment, circuit, and allocated time constraints.

## Verification and remaining delivery checks

Baseline suite: 409 passing tests. Added behavioral regression coverage for scheduler, journal recovery, DOM editing, backoff loads, cloud response races, load history, and substitution bounds. Final full suite: 434 tests passed, zero failures.

Both `node scripts/build-web.mjs` and `node scripts/build-android-web.mjs` passed. The Android result is a packaged web bundle, not a rebuilt native APK.

Local visual browser verification was blocked: agent-browser daemon failed to start and cloud browser refused the local URL with ERR_BLOCKED_BY_CLIENT. DOM tests exercise controls and persistence, but phone layout and production browser interactions still require a live preview check. No authenticated production workouts were created or modified.

The user explicitly authorized publishing branch `fix/adaptive-workout-flow` and opening a pull request on September 25, 2026. Production deployment and native APK delivery remain pending.

This change does not promise adaptation to unlogged activity. The scheduling heuristic operates on the app's recorded work; the existing recovery and programming layers continue to use their own history signals.
