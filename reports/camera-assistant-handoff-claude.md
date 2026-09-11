# Iron Six Camera Assistant — Claude Handoff

## Scope
Continue the camera/form/voice work on branch `fix/camera-reliability-v6` in `j-nut/Iron-six-training` without changing production `main` until physical-phone validation is good enough to merge PR #37.

## Current branch / PR
- Repo: `https://github.com/j-nut/Iron-six-training`
- Branch: `fix/camera-reliability-v6`
- PR: #37 — Improve camera rep counting, person isolation and form evidence
- Base: `main` at `8abdf4517d09324ad603e424eae15047ef498597`
- Current branch head before this handoff file: `6d2dcb017fe4a169c620cf84a42a9889157edc84`
- Production must remain untouched until physical Android testing is complete.

## Physical test device / observed behavior
Physical testing has been on a Motorola Razr Ultra 2025 / Android 16. The browser UA may misleadingly report Android 10.

### What now works well
- Live camera is responsive; UI no longer freezes.
- Buttons and voice controls remain responsive while pose inference runs.
- Full-body portrait framing is restored.
- GPU MediaPipe PoseLandmarker works on this phone at usable frame rates (~19+ inference FPS in prior tests).
- Squat counting is now promising: one real test counted 7 reps correctly with no forced re-lock.
- Raw pose detection in successful tests is commonly around high-80s to mid-90s percent.
- Multi-person pose mode is enabled so bystanders are candidates instead of forcing MediaPipe to return only one person.
- Identity tracking is substantially more persistent than earlier builds.

### Critical architecture lesson
DO NOT reintroduce the old synchronous second person detector (`ObjectDetector.detectForVideo`) in the main browser thread. The old path ran both person detection and PoseLandmarker synchronously and froze the camera/UI on the physical phone. The recovery architecture intentionally uses one PoseLandmarker pipeline only.

`detectForVideo()` is synchronous on the web; any added per-frame expensive inference can block the UI thread. If later adding appearance/person-isolation inference, do it lower-frequency, in a worker/off-main-thread, or with a lightweight signature derived from the existing pose/camera frame.

## Important commits / history
- `08421b9` — replaced frozen camera loop with pose-only recovery runtime. First physical-phone build where tracking/UI/voice worked.
- `f3c8741` — restored full portrait camera framing.
- `3c9654d` — made pose-only tracking tolerant to confidence dips and added raw-vs-locked diagnostics.
- `b1e6aec` — multi-person tracking build: PoseLandmarker configured to return up to 3 poses; persistent lifter lock intended to reject bystanders instead of surrendering identity.
- `afcfd5d` / `6054495` / `2a5e842` / `6d2dcb0` — movement-family detector work and tests; first six families wired through registry patterns.
- `1e9c72f` — BAD hotfix. Do not resurrect. It monkeypatched media timing and did not solve the freeze.
- `360d0ba` — older multi-person/person-isolation line; useful as historical reference only, not as a known-good phone runtime.

## Current camera runtime
Main files:
- `pose-spike.js` — browser camera runtime, MediaPipe PoseLandmarker, tracker integration, diagnostics, voice controls.
- `pose-rep-counter.js` — pure rep-counting state machine and legacy rules.
- `pose-form-coach.js` — motion-aware subject tracker + form evaluator.
- `pose-movement-detectors.js` — new registry-aware movement-family compatibility layer.
- `exercise-registry.js` — canonical exercise names + `pattern` metadata.
- `index.html` — script load order.

The movement-family layer is loaded after `pose-rep-counter.js` and overrides `IronSixRepCounter.ruleFor()` while preserving the proven counter state machine.

## Current movement-family coverage
First six families are routed from `exercise-registry.js` patterns:
1. `squat`
2. `hinge`
3. `horizontal_press` (patterns include bench/pushup)
4. `vertical_press`
5. `row`
6. `curl`

Only squat should currently be considered meaningfully validated by real footage. The others are test-enabled but NOT production-validated.

The long-term architecture should be:
`universal lifter tracker -> view classifier -> movement-family detector -> exercise-specific config/form rules`

Do not create 85 independent algorithms. Tune shared movement families, then give individual exercises small overrides only where necessary.

## Latest real-world findings

### Squat
Best-performing family so far. Real footage showed:
- strong raw pose acquisition,
- persistent identity lock,
- no manual re-lock during a later successful set,
- correct 7-rep count in one test.

Keep squat behavior stable while generalizing. Do not regress it just to make other exercises easier.

### Romanian deadlift / hinge
Real test:
- SIDE VIEW: worked.
- FRONT VIEW: tracker stayed on the user, but the hinge rep detector did not work well.

Diagnosis: identity tracking is not the problem. Shoulder-hip-knee hinge geometry collapses in a frontal projection; depth motion is poorly observable.

Required next feature: a reusable VIEW CLASSIFIER / view suitability gate. For hinge/RDL/deadlift, side view should be required or strongly preferred. If the user is frontal, do not pretend to count; instruct them to turn sideways.

Suggested labels: `front`, `front-quarter`, `side`, `rear-quarter`, `rear` (exact granularity is flexible). Use shoulder/hip width relationships and left/right landmark separation to estimate orientation. Add hysteresis so view classification does not flicker.

Each movement family should declare accepted/preferred views and camera instructions.

### Barbell overhead press / vertical press
Real test: only 2 of 6 valid reps were counted.

Current vertical press rule is too brittle because it relies primarily on a single shoulder-elbow-wrist angle threshold.

Required redesign: vertical press should use a multi-signal state model, for example:
- bottom/rack position detected,
- upward wrist travel relative to shoulder,
- elbow extension trend,
- lockout reached and held briefly,
- controlled return to bottom.

Use hysteresis and state transitions instead of one angle threshold. Avoid requiring exact textbook endpoints; real users vary in anthropometry, grip width, bar path, and camera angle.

Validate barbell OHP first, then reuse for dumbbell shoulder press / military press / Arnold press with exercise-specific tolerances.

## Tracker goal
User requirement is effectively:
- lock to the lifter quickly,
- never hand identity to a bystander,
- tolerate background people and people walking through frame,
- coast through short occlusions,
- automatically reacquire the original lifter,
- never count a stranger's reps.

Absolute "never lose tracking" is physically impossible under total occlusion or leaving frame, so correct behavior is: hold identity confidence, pause rep counting when evidence is insufficient, refuse ambiguous handoffs, then reacquire the same lifter.

### Current multi-person direction
PoseLandmarker should see several candidates at once (up to 3 currently). Association should prefer the already-locked lifter using:
- predicted center / velocity,
- torso scale,
- body proportions / keypoint geometry,
- pose continuity,
- bounding-box overlap or spatial consistency,
- stable working side.

If two candidates are ambiguous, DO NOT jump identities. Coast or pause counting instead.

A future enhancement may add a short-lived local appearance signature (e.g. coarse torso color histogram from the camera frame) solely for in-session association, but do not introduce heavy synchronous inference. No biometric identification is needed.

## Diagnostics worth preserving / expanding
Current diagnostics were intentionally designed to separate model failure from tracker rejection. Preserve at least:
- `rawPosePercent`
- `trackedPercent`
- FPS
- inference errors
- tracker accepted/rejected/coasted/loss counts if available
- camera settings / resolution
- reps / rejected reps
- max people seen / candidate count for multi-person testing
- current detector family
- current view classification (once implemented)
- current movement phase/state

Interpretation:
- raw high + tracked low = association/tracker issue
- raw low = model/input/framing issue
- raw & tracked high + reps low = movement detector/state machine issue

## Camera guidance per family
Suggested baseline:
- Squat/lunge: side view preferred for depth/form.
- Hinge/RDL/deadlift: side view required/preferred.
- Curl: front or front-quarter.
- Lateral raise/rear delt: front or slight front-quarter depending movement.
- Row: working-side or ~45 degrees.
- Vertical press: front-quarter / slightly side-on; keep wrists overhead in frame.
- Bench/push-up/horizontal press: side view near bench/body height.

The app should detect an unsuitable camera angle BEFORE a set and give concise setup guidance rather than missing reps silently.

## Form-analysis caution
Rep counting can generalize by movement family. Form coaching needs more exercise-specific validation. Do not enable strong form claims until each cue has been validated against real footage.

For unvalidated families, prefer:
- rep timing/counting only,
- camera-position guidance,
- "insufficient evidence" instead of speculative form criticism.

## Next implementation sequence
1. Add reusable view classifier + per-family accepted/preferred views.
2. Fix vertical press with multi-signal phase/state detection; validate against the reported 6-rep barbell OHP case.
3. Validate/tune curl.
4. Validate/tune row.
5. Validate/tune hinge side-view detector.
6. Validate horizontal press/bench/push-up.
7. Add remaining movement families: hip thrust, vertical pull, triceps/elbow extension, shoulder isolation, hamstring curl/knee flexion, calves, core/isometrics/holds.
8. Only after movement detection is robust, expand form cues family by family.
9. Run the existing tests plus new synthetic state-machine tests and preserve squat regressions.
10. Keep PR #37 draft/unmerged until physical-phone validation is convincing.

## Suggested test protocol for each family
Use one representative canonical exercise first. For each test capture:
- full set video/screen recording,
- actual rep count,
- app rep count,
- Copy diagnostics at end,
- camera view used,
- whether a second person entered frame.

Acceptance target before calling a family reliable:
- near-perfect identity retention,
- no stranger reps,
- no forced re-lock from normal movement,
- rep count within 0-1 of ground truth over ordinary sets, then tighten toward exact,
- no false reps from setup/reracking/standing still,
- clear prompt when camera angle is unsuitable.

## Existing preview / production caution
Production `main` remains unchanged. Test only preview deployments from `fix/camera-reliability-v6` until the branch is ready.

## What Claude should do first
Read `pose-spike.js`, `pose-rep-counter.js`, `pose-form-coach.js`, `pose-movement-detectors.js`, `exercise-registry.js`, existing pose tests, and PR #37 before editing.

Then implement the view-classifier layer and redesign vertical-press counting without disturbing the currently working squat and multi-person tracker. Add regression tests before deploying a preview. Do not merge PR #37 until a real phone test confirms the new behavior.
