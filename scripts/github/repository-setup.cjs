// Repository-only bootstrap. Never evaluates issue text or checks out contributor code.
module.exports = async ({github, context, core}) => {
  const repo = context.repo;
  const labels = {
    bug: ['d73a4a', 'Incorrect app behavior'], enhancement: ['a2eeef', 'New user-facing capability'],
    dependencies: ['0366d6', 'Dependency maintenance'], documentation: ['0075ca', 'Documentation'],
    'status:triage': ['ededed', 'Needs reproduction and prioritization'],
    'status:ready': ['0e8a16', 'Acceptance criteria ready for implementation'],
    'status:blocked': ['b60205', 'Blocked by a recorded dependency'],
    'status:verification': ['1d76db', 'Needs independent verification'],
    'priority:P0': ['b60205', 'Data loss, account exposure or unusable core workflow'],
    'priority:P1': ['d93f0b', 'Major routine, logging or Coach regression'],
    'priority:P2': ['fbca04', 'Normal priority'], 'priority:P3': ['c2e0c6', 'Optional improvement'],
    'area:ui': ['5319e7', 'UI and accessibility'], 'area:trainer': ['5319e7', 'Sets, reps, loads and exercise selection'],
    'area:routines': ['5319e7', 'Schedule, manual routine changes and history'],
    'area:coach': ['5319e7', 'Cloud Coach and local fallback'], 'area:accounts': ['5319e7', 'Auth, sync and account isolation'],
    'area:android': ['5319e7', 'Native app, signing and device behavior'], 'area:github': ['5319e7', 'Repository process and automation']
  };
  const existing = await github.paginate(github.rest.issues.listLabelsForRepo, {...repo, per_page:100});
  for (const [name, [color, description]] of Object.entries(labels)) {
    if (!existing.some(x => x.name === name)) await github.rest.issues.createLabel({...repo, name, color, description});
  }
  const milestones = await github.paginate(github.rest.issues.listMilestones, {...repo, state:'all', per_page:100});
  const ensureMilestone = async (title, description) => {
    const found = milestones.find(x => x.title === title);
    return found || (await github.rest.issues.createMilestone({...repo, title, description})).data;
  };
  const reliability = await ensureMilestone('Reliability and release readiness', 'Reproduce and verify remaining real-account, browser and physical-device gaps. No target date until scope is confirmed.');
  const future = await ensureMilestone('Future enhancements', 'Proposals requiring design, acceptance criteria and compatibility review.');
  const all = await github.paginate(github.rest.issues.listForRepo, {...repo, state:'all', per_page:100});
  const backlog = [
    ['Verify signed Android updates on a physical device', ['area:android','status:ready','priority:P1'], 'Install the signed release over the existing signed app on a physical Android device. Verify the signing fingerprint remains stable, version code rises, workout/history/account data survives, offline logging survives restart, permissions work, and foreground/background workout behavior is correct. Record device/OS/build and sanitized evidence. Native CI builds passed; physical-device verification is still outstanding.'],
    ['Verify authenticated workout edits and cross-device sync end to end', ['area:accounts','status:ready','priority:P1'], 'Use dedicated test accounts. Verify manual routine switches, edited/completed/skipped sets and following-day plans persist after reload and across devices. Verify offline/online conflict handling, logout/login and account isolation. Simulated account tests passed; a real authenticated account flow has not been independently verified. Never use another user’s records.'],
    ['Add mobile browser and accessibility regression coverage', ['area:ui','status:ready','priority:P2'], 'Exercise Today, routine changes, Coach recommendations, circuit controls and exercise guides at narrow phone widths in Chromium/WebKit/Firefox. Verify keyboard navigation, focus after dialogs, accessible labels, touch targets, error states, horizontal overflow and reload persistence. Add targeted automated regressions for reproduced defects; record remaining device gaps.'],
    ['Complete owner-only GitHub Project and protection setup', ['area:github','status:blocked','priority:P1'], 'Apply .github/OWNER_SETUP.md using owner access. Create/link the real GitHub Project, add open issues/PRs and configure Status/priority/area/milestone views. Apply the main ruleset and enable available security settings. Verify a failing PR cannot merge and force pushes/deletion are blocked. The managed connector cannot administer repository settings or account Projects; these are explicitly pending, not implemented by the repository bootstrap.']
  ];
  for (const [title, names, body] of backlog) {
    if (!all.some(x => !x.pull_request && x.title === title)) {
      await github.rest.issues.create({...repo, title, body, labels:names, milestone:reliability.number});
    }
  }
  // Explicitly include PRs: installations with issue-only permission can omit
  // them from listForRepo even though labels/milestones use the issues API.
  const pulls = await github.paginate(github.rest.pulls.list, {...repo, state:'open', per_page:100});
  const open = new Map(all.filter(x => x.state === 'open').map(x => [x.number, x]));
  for (const pull of pulls) if (!open.has(pull.number)) open.set(pull.number, pull);
  for (const issue of open.values()) {
    const names = [];
    if (!issue.labels.some(x => x.name.startsWith('status:'))) names.push('status:triage');
    if (issue.number === 28) names.push('enhancement','area:trainer');
    if (issue.number === 46) names.push('area:ui');
    if (issue.number === 42) names.push('enhancement','area:android');
    if (names.length) await github.rest.issues.addLabels({...repo, issue_number:issue.number, labels:names});
    if (!issue.milestone && [28,42,11].includes(issue.number)) {
      await github.rest.issues.update({...repo, issue_number:issue.number, milestone:future.number});
    }
  }
  await core.summary.addHeading('Repository setup complete').addRaw('Labels and milestones ensured without replacing existing metadata. Verification gaps tracked as issues. Owner-only settings remain pending; see .github/OWNER_SETUP.md.').write();
};
