# Iron Marks depth expansion — running handoff

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

## Validation / remaining
Pending: engine extensions; Today goal; customization; block summaries; migration tests; mobile/browser checks; full tests/builds; push preview and verify READY.

## Tooling notes for continuation
Repository is in /workspace/scratch/d2b61b38b09e/Iron-six-training. Normal git push has no credentials; use connected GitHub blob/tree/commit/ref tools (force:false). Fetch works. Match local tree SHA with API-created tree before updating ref.
Browser: agent-browser unavailable. Playwright at /opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright; extracted Chromium /tmp/iron-chromium; libraries /tmp; launch with LD_LIBRARY_PATH=/tmp and no-sandbox/disable-gpu flags. HTTP server must run in same command/process namespace as browser. Prior /tmp/check-marks.cjs demonstrates setup. Do not add browser packages to app dependencies.
