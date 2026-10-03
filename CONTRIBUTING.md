# Working on Iron Six

Start from current `main`, inspect open issues/PRs and `reports/claude-project-handoff.md`, and use a separate branch. Preserve other sessions' work; never force-push shared branches.

Report defects using the bug form with exact steps, environment and expected behavior. Keep one defect or acceptance goal per issue. Maintainers choose `priority:P0` through `priority:P3`, an `area:*` label, one `status:*` label and a milestone. Labels are additive during onboarding; automated setup does not overwrite existing metadata.

Use **Reliability and release readiness** for verified regressions and test gaps, and **Future enhancements** for proposals. No promised release dates are encoded in those milestones.

Before a PR, run `npm ci --ignore-scripts` and `npm test`; verify changed UI behavior, console/network errors and persistence after reload. Workout changes must cover manual routine switches, edited/completed/skipped sets, equipment limits and the next scheduled days. Record checks that need a device or real account instead of calling them passed.

CI validates tests and Edge Function types. CodeQL scans source and workflows. Android test builds are path-filtered and should not be globally required on documentation-only PRs. Signed Android release builds run after app/workflow changes reach main; Releases contain permanent APK/AAB downloads and checksums. Keep the existing signing key and rising version codes.

Close issues only after acceptance criteria are verified. Link fixes using `Closes #N`; use ordinary references for partial work. Do not enable automatic merging of dependency upgrades without reviewing native and account compatibility.

For owner-only Projects, main ruleset and security settings, see `.github/OWNER_SETUP.md`. These settings cannot be enabled by the repository-scoped Actions token.
