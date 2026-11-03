# Focused workspaces, Plan and History

## Product direction

Keep the main action and the information needed for it together. Expanded guides,
long workout lists and accessibility text enlargement may still require scrolling;
do not force a fixed-height screen or clip content to claim a one-screen layout.
The electric athletic design concept remains a visual direction. This change improves
the existing app layout and information hierarchy, rather than applying that entire concept.

## Implemented

- Traditional workouts show one selected working set at a time. Set buttons keep
  previous and upcoming sets accessible; Next set moves through them. The selected
  completed set remains visible for effort feedback and corrections. Input elements,
  saved values, RIR, progression and undo keep their existing implementations.
  Full-workout overview restores all rows; circuit mode keeps its existing flow.
- Compact active-workout chrome removes the duplicate hero. Touch controls remain
  at least 44px rather than shrinking fields to fit. Optional guides remain expandable.
- Plan leads with the actual current workout, available time, exercise/set count,
  completion progress and a direct route to Today. An expandable exercise agenda uses
  the same frozen workout and prescription formatter as the working cards. The next
  workout comes from the existing scheduler. Rest days do not imply missed calendar dates.
- The explanation of progression uses plain language and names the inputs: actual
  weight, completed reps, reserve and hard feedback. Coach-generated notes remain
  available under a clearly labeled disclosure.
- History leads with workouts and sets completed, records in the last 30 days,
  workouts in the last seven days, weekly consistency and the latest named record.
  Lifetime reps, load-volume, available session time and additional recent records
  live under More of your progress. Search, lift comparisons, ranges, mode and CSV
  remain available in Find a workout or check a lift. Raw session logs are unchanged.

## Metric definitions and safeguards

- A record beats an earlier workout for the same named exercise: a heavier completed
  load or more reps at a previously used load. One record per exercise per workout;
  the first workout establishes a baseline, ties do not count, and weight/reps always
  come from a single actual set. These are load/rep records, not measured strength gains.
- Explicitly unfinished sets do not count. Timed holds, including seconds stored in the
  legacy reps field, do not become rep records, rep totals or load-volume.
- Lifetime counts include undated legacy summaries when available. Future-dated entries
  are excluded. Undated logs cannot earn recent records or weekly consistency.
- Weekly consistency means one or more sessions in each consecutive Monday-based local
  calendar week, allowing rest days. It remains active if the latest training week was
  the previous week. Filters do not alter the profile's accomplishment totals.
- Session time uses saved elapsedMinutes only, reports how many sessions have that
  value, and excludes planned duration. Existing elapsed minutes include a warm-up
  allowance, so they are not a stopwatch measurement. Calories remain labeled estimates
  in individual sessions rather than being promoted as a precise accomplishment.
- Volume is load as entered times completed reps. It does not double dumbbells or
  invent external loads for bodyweight movements. All-time volume is workload, not
  evidence of improved strength by itself.
- Profile changes replace the summary; no analytics write back into workout history.

## Validation

- Full automated suite: 717 tests passed, zero failures (final run below).
- Regression coverage includes first-entry and same-session PR suppression, rep/load
  matching, future/undated entries, timed holds, incomplete sets, missing elapsed time,
  weekly gaps/rest days, filter independence and profile isolation. Working-set tests
  cover selection, logging, revisiting, undo, unchanged input identity and overview.
- Web release build and Android web bundle/Capacitor sync checked after source changes.
- Browser visual verification is pending: local Playwright is installed but its Chromium
  executable is unavailable. No claim is made that every viewport, text scale or Android
  keyboard state has passed rendered layout acceptance. No camera testing is needed here.

## Remaining acceptance work

Check active sets, post-set effort feedback, Plan and a populated History at 320/360/390px,
larger system text, keyboard open and Android insets. Keep logging, next actions and the
History highlight visible by default wherever they fit at readable sizes. Retain natural
scrolling when required for accessibility. Check bodyweight/timed exercise presentation in
the older exercise comparison tables, which still use the legacy weight/reps column labels.
Broader accounts, sync, release, monetization and camera work remain in the finalization plan.
