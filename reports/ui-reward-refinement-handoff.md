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


## Substantial page redesign — October 3, 2026

The user rejected the first styling pass as too subtle and clarified that every tab/page must be readable, usable, coherent and easy to navigate. This revision changes information architecture and visible page structure, rather than just adjusting glow and spacing.

- **Shared chrome:** larger borderless page headers, charcoal/slate surfaces, readable body copy, a labeled SVG icon for each of the five navigation destinations, a floating navigation dock, and accessible current-page announcements. Accent preferences remain supported. The design stylesheet loads directly in both entrypoint heads, before scripts, and the guarded runtime loader remains as a fallback.
- **Today:** real minutes/exercises/working-set summary derived from the active prescription. The start action remains prominent; setup stays expandable. Active training keeps the compact header and working inputs before media, with legible labels and effort feedback.
- **Plan:** current/next cards use the same scheduler as the engine. A manual change updates the outlook. Long coach notes, fatigue estimates/planning signals, and static explanations are expandable, retaining their actual content and engine ownership.
- **History:** saved sessions and search/filter/export controls come first. Progress and freshness sections become native disclosures that retain their open state across updates. Analytics and historical data remain intact.
- **Profiles:** semantic groups for personal details, training experience and equipment, responsive field grids, connected labels and one save action. Existing save/rebuild behavior is preserved.
- **Coach:** matching header, visible question choices instead of a hidden horizontal scroll strip, calmer conversation styling, readable guidance and clear send action.
- **Rewards:** earned identity with direct customization, one featured milestone with explicit progress units/no deadline, recent achievements and direct collection access, live style preview, earned cosmetics first, and locked emblems/training evidence expandable. Hidden rewards stay concealed; qualification/unlock rules stay unchanged.
- **Supporting surfaces:** account, equipment, movement guides, camera guidance, music, circuit controls and the welcome page use the shared type/material conventions. No new dependencies.

Verification for this revision: **488 full-suite tests passed**, including five new regressions for destination navigation/current-page announcements, scheduler-based outlook after manual changes, history log-first hierarchy/disclosure preservation, and labeled profile fields/save behavior. The focused session/reward/entrypoint suite passed 66 tests; reward suite passed 46. Web and Android web bundles built. esbuild parsed the stylesheet without warnings for Chrome 108 and Safari 16.4. These are functional/static checks, not proof of rendered layout.

**Visual QA remains outstanding:** the provided cloud browser repeatedly timed out during navigation, even with explicit short invocation timeouts. Do not claim 320/375/430/768/1200 screenshots, real-device usability, native installation or authenticated cross-device acceptance passed. The draft PR is the review artifact; inspect its newest Vercel preview, especially 320px input grids, session-start reachability, reward density, and all modal focus/scroll behavior before merging. The initial preview URL points to the older polish commit; use the newest deployment/check on the PR.

Additional modified files in this revision: `ui-shell.js`, `ui1.js`, `coach.js`, `welcome.html`, and `tests/page-navigation.test.js`. Browser runtime state must still be driven by the existing modules. Avoid introducing independent counters or copying the scheduler into the UI.


Security follow-up: GitHub CodeQL flagged one new high-severity alert on the first substantial redesign commit (`84da5c3`). Navigation had interpolated label text into HTML. The corrected implementation creates the label with `textContent` and constructs its SVG separately from fixed geometry. A regression checks that markup-shaped label text stays literal and produces no image/handler element. Final local full suite: 488/488; focused navigation/session regression suite: 24/24. The old commit had successful validate/APK/analyzer jobs, but the CodeQL aggregate failed, so it was not merged. Check the newest commit's CodeQL result, not the old alerting commit, before merging.
