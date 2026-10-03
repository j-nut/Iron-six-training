# Iron Six visual and reward refinement

Updated October 2, 2026, America/Los_Angeles (October 3 UTC). User requested an improved overall look/feel and a more refined reward system. Tracked in issue #61.

## Changes

`premium-ui.css` now supplies coherent charcoal surfaces, readable type, consistent spacing, calmer accent use, larger secondary actions and feedback targets, clearer inputs/metrics, and consistent navigation/Coach/profile/reward presentation. Specific selectors deliberately override older runtime compact styles. Profile-specific accent colors are preserved. Reduced motion and visible keyboard focus are supported. Logging remains ahead of exercise media.

Iron Marks has Overview, Collection and Style tabs instead of a long undifferentiated sheet. Overview presents earned marks, successful sessions, confirmed progress, current goal, attainable rewards, recent marks and the training story. Collection filters All/Earned/In progress with useful empty states; hidden rewards remain concealed. Style holds emblems, rings, detail levels and titles, retains saved preferences and preserves keyboard focus after changes.

`iron-marks-engine.js` exports `closestMarks` with prerequisite-aware recommendations. Unearned emblem evolutions, hidden/earned rewards, fixed-order and low-recovery achievements are excluded from promoted targets, while all remain in the full collection under their existing rules. `nextGoal` distinguishes **Next unlock**, **Current block**, and **Your progress**. No existing mark IDs, thresholds, qualification rules or unlock results changed; earned cosmetics and history stay compatible.

`iron-marks.js` captures dialog profile/account scope and rejects stale collection/celebration callbacks after switches. It closes stale dialogs, isolates the background with inert, traps keyboard focus, supports arrow/Home/End tab navigation, restores focus to the opener, and keeps style-control focus after rerender. No DOM observer or additional polling was added.

Runtime cache versions are bumped in `cloud-history-sync.js`, index and live entrypoints. Both web and Android builders already package the same stylesheet/reward modules. Vercel preview builds additionally include `/__qa/frame.html`, an iframe review surface with real 320/375/430/768/1200 pixel viewports. It is omitted from production and Android; use it for repeatable UI checks without a device-emulation dependency.

## Verification

The focused reward suite passed 44 tests, including ten new regressions covering recommendation prerequisites, goal labels, unchanged unlock results, collection filters/empty states, stale profile/account callbacks, focus containment/restoration and style persistence. The full suite passed 481 tests with zero failures; final CI/browser results are recorded in the delivery PR. Web and Android web bundles built successfully.

Browser verification must check launch-screen reachability, current workout input/Done behavior, reward tabs/filters/style/focus, all app views, profile accent changes, errors and narrow layouts before merging. Physical-device execution and real authenticated account verification remain separate outstanding issues #49/#50; broader mobile/accessibility coverage is #51.

## Files and continuation

Primary files: `premium-ui.css`, `iron-marks-engine.js`, `iron-marks.js`, `cloud-history-sync.js`, `index.html`, `live.html`; regression files: `tests/iron-marks-goals.test.js`, `tests/iron-marks.test.js`, `tests/feature-entrypoints.test.js`.

Avoid adding more shadow/glow or shrinking labels to fit: resolve density through hierarchy and spacing. Keep reward recommendations subordinate to the adaptive training plan. Do not turn low recovery into a goal or encourage overriding manually chosen routines for an ordered reward. Future useful work: dedicated cross-browser end-to-end tests, accessible achievement evidence navigation, and evidence-backed explanations of what counts toward each mark.
