# Iron Marks depth expansion — running handoff

## Current status — all five areas implemented and verified

- Final local verification: **403 / 403 tests pass**, web and Android web builds pass.
- Chromium checks on the actual app at 375×812: Begin workout stays visible, goal follows planned Legs B, no modal horizontal overflow, ring/detail/title selectors work, preferences survive reload, no page errors. Desktop screenshot also captured.
- 54 marks: original 24 unchanged + 6 personal-progress marks + 4 balanced-block marks + 20 emblem-detail unlocks. Ten emblem identities now have Original/Etched/Masterwork detail, five earned rings are selectable, six profile titles are earnable.
- Code checkpoint already on GitHub: `4697eddb147eef524fa3e10dec419add5ea0d415`. Final polish adds shortcuts, collapsible mark groups, archives, malformed-state validation and three more regression tests.
- Delivery target: the feature-branch preview only. Check Vercel for the latest commit when resuming; do not merge production without the owner's direction.
- No requested implementation feature remains intentionally deferred. Real-device feedback and real-user engagement measurement remain product validation, not something unit tests establish.

## User authorization / branch
User asked to implement all five proposed improvements and keep notes so Claude can resume if credits run out. Work on `feature/iron-marks`; do not merge production. This request expands beyond the earlier visuals-only handoff: engine additions are now authorized, while existing IDs/rules must remain compatible.

Starting commit: 5cde97b4278fdb21681196a89b1edd4bfd492b0b.

## Scope and design decisions
1. Personal progress: conservative, confirmed extra reps at the same external load, same exercise identity, same recorded RIR and units, on separate days. Do not claim better form or inferred strength. Missing RIR, bodyweight/assisted/ambiguous loads do not qualify. Existing participation marks remain available without RIR.
2. Today: one contextual, achievable participation goal beneath the main Begin workout action. Never encourage changing the plan, lifting heavier, ignoring recovery or chasing a max. Show evidence-based progress milestones in the case/review, not as a weight prescription.
3. Evolving favorite emblems: maintain existing ten IDs and worn choices. Add automatic higher visual tiers from each emblem's original achievement metric, with clear thresholds and selectable earned detail levels.
4. Training blocks: repeated balanced blocks of four qualifying sessions for each of the six current program days. Summaries state actual sessions and confirmed improvements; no unsupported claims about physiology. Historical benchmark-block mark stays unchanged.
5. Cosmetics: selectable earned ring tiers, emblem detail and profile titles. Defaults preserve existing behavior; no essential coaching/training capability is gated.

All achievement results are recomputed from deduplicated finished history. Only cosmetic preferences and seen IDs are synced. Old state must survive writes. New achievements arriving with existing history should be introduced quietly, not trigger a retroactive pile of celebrations.

## Progress log
- Inspected current engine, UI, session history schema, Today layout and existing tests.
- Current baseline: 24 marks, ten emblems, five rings; 392 tests passing in previous turn.
- History stores exercise name/base/seedKey and completed sets (weight/reps/RIR). Current app loads are pounds; explicitly labelled units must be kept separate. Bodyweight load ambiguity means progression recognition must stay conservative.
- Implementation next: pure progression analytics and tests, then UI and browser checks.

## Initial validation checklist (superseded by current status)
Pending: engine extensions; Today goal; customization; block summaries; migration tests; mobile/browser checks; full tests/builds; push preview and verify READY.

## Tooling notes for continuation
Repository is in /workspace/scratch/d2b61b38b09e/Iron-six-training. Normal git push has no credentials; use connected GitHub blob/tree/commit/ref tools (force:false). Fetch works. Match local tree SHA with API-created tree before updating ref.
Browser: agent-browser unavailable. Playwright at /opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright; extracted Chromium /tmp/iron-chromium; libraries /tmp; launch with LD_LIBRARY_PATH=/tmp and no-sandbox/disable-gpu flags. HTTP server must run in same command/process namespace as browser. Prior /tmp/check-marks.cjs demonstrates setup. Do not add browser packages to app dependencies.

### Implementation checkpoint (local, verification in progress)
- Added pure performanceOf/blocksOf/depthOf analytics, ten new progress/block marks, 20 emblem evolution marks, six earned profile titles, selectable ring/detail/title preferences.
- Current total is 54 marks, retaining original 24 IDs and rules. Emblem IDs remain unchanged. Evolution marks use `emblem_<id>_<level>`.
- Added Today goal beneath Begin workout; current balanced-block grid, completed-block archive, evidence descriptions and cosmetic selectors in trophy case. New milestones include context in the earned dialog.
- Existing introduced version-1 state migrates quietly to version 2, retaining unknown fields. Save invalidation now refreshes analytics for same-length, same-timestamp history corrections. Avatar node reuse includes detail level.
- Corrected an edge case found by tests: UTC midnight is not a separate training exposure. Comparable observations require at least 24 hours separation, including baseline/improvement/confirmation.
- Added targeted tests for confirmation, missing/mismatched data, duplicate/same-day saves, balance, evolution thresholds, goal context, migration and edited-history invalidation.
- Next: targeted/full tests, mobile visual checks with real runtime, publish code checkpoint/preview and verify READY. No production merge.


## Final implementation and continuation details

### Rules and data
- Rep evidence requires at least 24 hours between baseline, increased reps, and confirmation. Only finite positive unambiguous external loads, integer 3–20 reps and recorded RIR 1–4 participate. Exercise normalized name/base/seedKey, load, unit, RIR and training mode must match exactly. One improvement event per exercise per 24 hours. Improvement must be repeated; a failed repeat resets the pending improvement.
- Unlabelled old logs use pounds, the existing app convention. Explicit kg stays separate. No unit conversion or claim of better form. Assisted/band/bodyweight/isometric/timed movements are conservatively omitted. Their workouts still contribute to existing session/balance achievements.
- Balanced blocks consume qualifying current-program sessions until each of six days has four, then start the next block. Extra sessions before balance is reached are recorded, not carried into the next block. Rest days have no deadline or reset.
- Evolution requirements are shown in the UI. They use unbounded session/rotation metrics, avoiding impossible thresholds on bounded six-key counters. Sunrise grows through completed sessions after returning, not repeated absences.
- Original achievement definitions stay in MARKS. Added marks are in evaluate().marks alongside original marks. GROUPS includes the new groups. Do not assume MARKS.length is the full collection size.
- Only selections and seen IDs are stored in trainerMemory.achievements: emblem, ring ('auto'/'none'/earned ring ID), detail ('auto'/'1'/'2'/'3'), title (earned ID/'none'), version:2. Unknown fields survive updates. Existing choices are revalidated against history.
- Introduced version-1 users migrate quietly even if they customize before the next check. Existing and new seen IDs are retained. Same-size history corrections invalidate cached results on save; reference replacement is also detected.

### Files
- iron-marks-engine.js: deterministic analytics, additive achievements, evolution/title metadata, avatar choice validation and nextGoal.
- iron-marks.js: goal card, evidence/block archive, selection controls, quiet state upgrade and earned explanations. No workout programming/auth/camera changes.
- tests/iron-marks.test.js: 11 added regressions; 32 Iron Marks tests total.
- scripts/verify-iron-marks-depth.cjs: optional reproducible Chromium check with synthetic history. Install/use Playwright externally, not as a new application dependency. Set NODE_PATH and optionally IRON_MARKS_CHROMIUM when using the Work runtime.
- reports/iron-marks-depth/: browser screenshots. Report assets are excluded from release bundles.

### Validation
- npm test: 403 pass / 0 fail.
- node scripts/build-web.mjs: pass.
- node scripts/build-android-web.mjs: pass.
- git diff --check: pass.
- Performance smoke check: 1,000 synthetic sessions evaluated in ~56 ms on this host; not a phone performance guarantee. No observers or per-frame logic were introduced.
- Browser verifies Today goal context and visible launch button, selection/reload persistence, progress evidence and mobile layout. Existing reduced-motion reveal from the previous visual release remains unchanged.

### Screenshots / review
[Today on mobile](iron-marks-depth/today-mobile.png) · [Collection](iron-marks-depth/collection-mobile.png) · [Customization](iron-marks-depth/customization-mobile.png) · [Balanced block](iron-marks-depth/block-mobile.png) · [Evidence](iron-marks-depth/evidence-mobile.png) · [Desktop](iron-marks-depth/collection-desktop.png)

Preview alias: https://iron-six-training-git-feature-i-648168-jordman55-3386s-projects.vercel.app/

Claude should read this file and the final branch diff before making additional changes. If the owner asks to release, review the feature preview and merge only with authorization. Do not redo the implemented five features or overwrite these IDs.
