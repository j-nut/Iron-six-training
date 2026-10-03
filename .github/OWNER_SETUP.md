# Owner-only setup (pending)

The managed GitHub connector cannot administer the repository or account Projects. The repository-scoped Actions token cannot grant itself those privileges. These steps are prepared but **have not been applied**. Do not report full GitHub setup complete until they are verified.

## Main protection

In Settings → Rules → Rulesets, create an active branch ruleset named `main protection`, targeting the default branch:

- Require a pull request before merging, resolve conversations, and require the `validate` check from **Validate Iron Six**.
- Require branches up to date before merging. After CodeQL has reported successfully, require both `analyze (javascript-typescript)` and `analyze (actions)` with their exact names as shown in the check picker.
- Block force pushes and deletion. Do not add a broad bypass list.
- This repository currently has one designated owner/reviewer. Do not require an approval from that same owner on their own PRs, which would deadlock normal work. Add one approval and required code-owner review when a second real maintainer is available.
- Do not globally require path-filtered `apk` or the post-merge `release` job.

Test with a temporary PR whose tests fail: merging must be blocked. Restore the branch and verify a passing PR can merge. Check the ruleset via the API/UI and record the result in the handoff.

## Real GitHub Project

From the owner's Projects page create **Iron Six delivery**, link this repository, and choose a board with Status options **Todo**, **In Progress**, **Done**. Add current open issues and PRs, including the four verification/setup issues created by repository bootstrap.

Enable built-in workflows for closed issues/merged PRs → Done and newly added items → Todo. Enable auto-add for `repo:j-nut/Iron-six-training is:open` if the account plan offers it. Add a table view grouped by milestone, plus board filters for `priority:P1`, `area:trainer`, `area:accounts` and `area:android`. Project Status is work progress; issue `status:*` labels describe readiness/verification. Keep them consistent during triage.

Record the Project URL in CONTRIBUTING.md and the handoff. A Markdown roadmap is not a substitute for this actual Project.

## Security and maintenance settings

In Settings → Code security enable dependency graph, Dependabot alerts/security updates, private vulnerability reporting, secret scanning and push protection wherever the repository plan supports them. Review any existing alerts; do not automatically dismiss them. The committed Dependabot configuration handles routine upgrades and CodeQL advanced setup handles JavaScript/Actions scans. Avoid also enabling a duplicate CodeQL default-setup workflow.

In Settings → General enable automatic deletion of merged branches and prefer squash merging. Leave unrelated open PRs intact. Do not enable unattended dependency auto-merges. Releases are published by the signed release workflow; no extra personal token is required for them.

## Completion evidence

Update `reports/claude-project-handoff.md` with the ruleset ID, Project URL, enabled security settings and the blocking/passing PR verification. Close the owner-setup issue only after all available settings have been applied and limitations recorded.
