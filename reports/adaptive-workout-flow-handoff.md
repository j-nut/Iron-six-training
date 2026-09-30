# Adaptive workout flow repair

Updated September 30, 2026. Baseline: main 31496dfe2893cf1e12799f69eea913c2ae3eb7bf.

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

## Follow-up audit repairs

- Session navigation resets across profiles, workout changes, resets, and completion. Done/undo updates both overall and exercise progress without replacing focused inputs. Circuit and single-exercise views avoid hidden overview traps.
- Completion rejects invalid loads and nonpositive or fractional reps. Bodyweight, blank loads, and zero remain supported. Invalid edits unmark previously completed rows and recalculate remaining targets.
- Coach requests are isolated by account/profile, duplicate submissions are blocked, and a 30-second deadline covers response bodies. Hidden chats do not steal focus. Old actions and swap dialogs cannot apply to changed workouts; cancelled or invalid duration changes are not labeled Applied.
- Swaps preserve session volume, programming role, and circuit timing. Performed work remains in the immutable journal and contributes interrupted training dose; replacement history does not inherit the old exercise load.
- Duration, mode, circuit pace, readiness, and equipment rebuilds clear old overrides, calibration, and verified plans. Blank frozen drafts rebuild when equipment changes; logged drafts retain their equipment guard.
- Pain and circuit substitutions avoid duplicate exercises and use the replacement muscles' readiness. Reduced circuit rounds agree with station prescriptions and timer steps.

- Built-in Coach resolves ordinal demo shortcuts against the live workout, ignores stale selected exercises, and locates the next incomplete exercise using each exercise’s actual completed rows and set count. Fully completed sessions receive finish guidance.

## Verification and remaining delivery checks

Baseline suite: 409 passing tests. Initial repair: 434. Final combined suite: 466 passing tests, zero failures, including the live-preview Coach shortcut repair. Behavioral coverage includes scheduler, journal recovery, DOM editing, backoff loads, cloud races, profiles, account sync simulations, backup/restore, circuit timer, exercise media, voice logging, music, pose analysis, and Android source checks.

The planner matrix checks 672 combinations of routines, equipment, durations, and modes for nonempty available distinct exercises, time budgets, and agreement between circuit rounds and timeline steps.

Both `node scripts/build-web.mjs` and `node scripts/build-android-web.mjs` passed. The Android result is a packaged web bundle, not a rebuilt native APK.

A hosted preview is accessible in the cloud browser. Guest workout logging reproduced the stale exercise-progress counter, and the first-exercise demo shortcut exposed an additional local Coach matching defect. The preview returned HTTP 503 from /api/coach and /api/recalculate; successful cloud generation has not been verified. Local browser installation failed, so phone viewport checks and native Android execution remain unverified. Automated account tests use simulated services; no authenticated production workouts were created or modified.

The user explicitly authorized publishing branch `fix/adaptive-workout-flow` and opening a pull request on September 25, 2026. PR #47 remains a draft, unmerged. Production deployment and native APK delivery remain pending.

Adaptation uses recorded work and does not account for unlogged activity. These checks provide regression coverage, not a guarantee that every possible device or service behavior is bug-free.
