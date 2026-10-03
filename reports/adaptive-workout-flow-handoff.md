# Adaptive workout flow repair

Updated October 2, 2026 (America/Los_Angeles). Baseline: main 31496dfe2893cf1e12799f69eea913c2ae3eb7bf.

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

## Release verification

Baseline suite: 409 passing tests. Initial repair: 434. Final combined suite: 470 passing tests, zero failures, including the live-preview Coach shortcut repair. Behavioral coverage includes scheduler, journal recovery, DOM editing, backoff loads, cloud races, profiles, account sync simulations, backup/restore, circuit timer, exercise media, voice logging, music, pose analysis, and Android source checks.

The planner matrix checks 672 combinations of routines, equipment, durations, and modes for nonempty available distinct exercises, time budgets, and agreement between circuit rounds and timeline steps.

Both `node scripts/build-web.mjs` and `node scripts/build-android-web.mjs` passed. The Android result is a packaged web bundle, not a rebuilt native APK.

The current hosted preview verified guest Done/undo progress, invalid completed-row editing, persistence after reload, the first-exercise demo guide, manual routine switching with journal archive, preserved displaced routines in the forecast, duration/mode rebuilding, and circuit start/skip/pause. Skipping did not complete a set. That check found excessive Goblet Squat load estimates and invented loads on unloaded hip hinges; equipment-aware caps and bodyweight handling now repair both, with four additional regression tests. Repeated bodyweight refreshes also no longer duplicate load labels.

Production cloud Coach successfully returned an openai/gpt-oss-20b response on October 2. Preview endpoints lack cloud configuration and returned 503; deterministic fallback and exercise guides remain usable. GitHub Actions on the prior candidate passed validation and built a native debug APK plus unsigned release bundle. Physical Android execution and phone viewport checks remain unverified. Automated account tests use simulated services; no authenticated production workouts were created or modified.

Cross-session audit: remote main still matched baseline 31496df, and the published repair tree exactly matched the clean local checkout. No other session merged this repair. Separate open landmine-illustration and watch PRs were excluded from this release.

The user authorized finishing the release on October 2 after checking other sessions. This report captures the release candidate; PR #47 and the Vercel deployment are the authoritative sources for final merge/deployment state. Native device execution and a stable-key signed Android release remain separate delivery checks.

Adaptation uses recorded work and does not account for unlogged activity. These checks provide regression coverage, not a guarantee that every possible device or service behavior is bug-free.

## Final shipped state (October 2, 2026)

PR #47 was subsequently squash-merged to main as `4ced98dc358c29be2c691634662ce25972b19ce5`. Vercel production was READY and served that commit. Main validation and native test builds passed, and the stable-key signed APK/AAB workflow succeeded at https://github.com/j-nut/Iron-six-training/actions/runs/37098369429, including signature verification and debug-key rejection. These results supersede the candidate-only status above. Physical-device installation and real authenticated end-to-end verification remain outstanding. See `reports/claude-project-handoff.md` for current delivery workflow and remaining work.
