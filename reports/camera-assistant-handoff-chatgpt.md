# Iron Six Camera Assistant — Handoff for ChatGPT

Self-contained handoff. Read this first, then `reports/camera-assistant-handoff-claude.md` (the
original handoff with the full physical-phone history) before changing anything.

## 1. Where things are

| Item | Value |
|---|---|
| Repo | https://github.com/j-nut/Iron-six-training |
| Working branch | `fix/camera-reliability-v6` |
| PR | https://github.com/j-nut/Iron-six-training/pull/37 — **draft, unmerged, keep it that way until physical-phone validation passes** |
| Production | `main` — untouched. Do not push to `main`. |
| Latest tested commit | `2234bbf` (on top of `e1db415`) |
| Preview (this commit) | https://iron-six-training-eh06nbake-jordman55-3386s-projects.vercel.app/?pose=1 |
| Preview (always newest build of the branch) | https://iron-six-training-git-fix-camer-667d60-jordman55-3386s-projects.vercel.app/?pose=1 |
| CI on `2234bbf` | `validate` pass, `apk` pass, Vercel preview ready |
| Tests | `npm test` → **341 / 341 pass** |

Notes:
- Previews are protected by Vercel SSO: be signed into Vercel on the phone, or create a share link
  in the Vercel dashboard and append `&pose=1`. The runtime already forwards `_vercel_share` to the
  scripts it loads.
- `?pose=1` turns the opt-in camera assistant on (it is off by default).
- Pushing to `fix/camera-reliability-v6` creates a Vercel **preview** only; production deploys from `main`.
- Test device used so far: Motorola Razr Ultra 2025, Android 16 (the browser UA may misreport Android 10).

## 2. Hard constraints (do not break)

1. **No second synchronous detector in the live per-frame loop.** An earlier build ran
   `ObjectDetector.detectForVideo` next to PoseLandmarker on the main thread and froze the camera and
   UI on the phone. The current runtime makes exactly one `detectForVideo` call per frame, and tests
   enforce this (`tests/pose-spike.test.js`, `tests/pose-assistant-v3.test.js`). Any heavier model
   must run in a Web Worker, at low frequency, or be trivially cheap.
2. **Preserve squat behaviour.** Squat is the only family validated on real footage (7 of 7 reps
   counted in a real set). Squat still runs through the original `createCounter` with identical
   inputs, and no camera view ever blocks it. A test checks frame-by-frame that squat counts the
   same through the new pipeline as through the raw counter.
3. **Preserve the multi-person lifter-lock tracker** (`createSubjectTracker` in
   `pose-form-coach.js`, `numPoses: 3`). Bystanders are candidates; ambiguous handoffs pause
   counting and never switch people.
4. **One architecture, not one algorithm per exercise:**
   `lifter tracker → view classifier → movement-family detector → exercise config → validated form rules`.
   Route by the canonical `pattern` in `exercise-registry.js`. Individual exercises get small
   overrides only.
5. **No strong form claims for unvalidated families.** Only squat shows form cues. Every other
   family says "Rep counting only — form cues … are not validated yet."
6. Keep PR #37 unmerged until real phone tests confirm the behaviour.

## 3. Architecture and files

| File | Role |
|---|---|
| `pose-spike.js` (v7) | Browser runtime: camera, MediaPipe PoseLandmarker (`pose_landmarker_lite`, GPU, falls back to CPU, `numPoses 3`), tracker, UI, diagnostics, trace capture, voice. Script loaded with `?v=7`. |
| `pose-rep-counter.js` | Original pure-logic counter state machine (`createCounter`), framing check, legacy rules. **Unchanged.** |
| `pose-form-coach.js` | Subject tracker (lifter lock) and form evaluators (squat rules, plus a generic evaluator). **Unchanged.** |
| `pose-view-classifier.js` (new) | Camera-view classification from existing landmarks. |
| `pose-movement-detectors.js` | Movement families, view policies, the vertical-press phase detector, the shared continuity gate, `createSession`, and trace encode/decode/replay. Overrides `IronSixRepCounter.ruleFor` and `createCounter`. |
| `exercise-registry.js` | Canonical exercises and `pattern` metadata. |
| `index.html` / `live.html` | Script order: `pose-rep-counter` → `pose-view-classifier` → `pose-movement-detectors` → (`pose-form-coach`, `pose-form-continuity`) → `pose-spike`. |
| `tests/helpers/pose-synth.js` | Deterministic 3D stick figure (standing, hinge, barbell and dumbbell press) rotated to any camera yaw and projected like MediaPipe output. Used by the view and press tests. |

### What the code does per frame
1. PoseLandmarker returns up to 3 people. The subject tracker picks the locked lifter, or holds and
   coasts when it can't tell.
2. `session.push()` (from `createSession` in `pose-movement-detectors.js`) runs:
   - the view classifier (torso yaw);
   - the family's view gate (`ok`, `degraded` or `blocked`);
   - the framing check;
   - the counter. A `blocked` view feeds the counter `framed: false`, so it pauses instead of
     counting from bad geometry.
3. The form evaluator runs (it only produces cues for squat). The UI updates, and the frame is
   appended to the trace buffer.

### View classifier (`pose-view-classifier.js`)
- Yaw is a weighted combination of:
  - shoulder width ÷ torso length (about 0.80 when square to the camera);
  - hip width ÷ torso length (about 0.55 when square);
  - MediaPipe `z` depth difference between the shoulders;
  - far-side occlusion (unequal left/right visibility).
- Plane boundaries: frontal below 32°, sagittal (side) at 58° or more, oblique in between.
- Stability: ±6° hysteresis, a 450 ms dwell before the label changes, EMA smoothing, and after
  1.5 s with no torso the view is forgotten and re-classified.
- Labels: `front`, `front-quarter`, `side`, `rear-quarter`, `rear`. A view that hasn't settled
  reads `unknown`, and `unknown` never blocks counting.
- Known weakness: front vs rear uses face visibility, and real MediaPipe often reports a confident
  face from behind. This only affects the label text, not gating.

### View policies (per family)
| Family | Frontal | Oblique | Side | Notes |
|---|---|---|---|---|
| squat (validated) | degraded (advice) | ok | ok | never blocked |
| hinge | **blocked** ("Turn side-on") | degraded | ok | real RDL: side view worked, face-on failed |
| horizontal_press | degraded | ok | ok | `chest_press` pattern now routed here |
| vertical_press | ok | ok | ok | phase detector works from any angle |
| row | degraded | ok | ok | |
| curl | ok | ok | ok | |

### Vertical press phase detector (`createVerticalPressCounter`)
Replaces the single elbow-angle rule, which counted 2 of 6 real barbell overhead-press reps.

**Signals**
- `h`: wrist height above the shoulder ÷ torso length. It uses whichever hand is higher, or the
  near arm when the far one is hidden.
- The elbow angle.
- Travel from this rep's own start position.
- Smoothing: a median over up to 5 samples within 140 ms.

**Phases:** `waiting → rack → pressing → lockout → lowering → rack` (the rep counts on return to the rack).

**Default thresholds** (torso units)

| Setting | Default | Meaning |
|---|---|---|
| `rackMin` | −0.6 | below this, the arms are down and the counter waits |
| `rackMax` | 0.55 | top of the start/rack position |
| `leaveRack` | 0.67 | height at which a press has started |
| `lockHeight` | 0.75 | minimum height for lockout |
| `lockElbow` | 145° | minimum elbow extension for lockout |
| `highLock` | 0.95 | height that counts as lockout on its own |
| `minTravel` | 0.4 | minimum rise from this rep's start |
| `partialTravel` | 0.25 | rise that makes a short press a rejected partial |
| `rackDwellMs` | 250 ms | how long the start position must be held before the first press arms |
| `rackSteady` | 0.2 | maximum movement during that hold |
| `adaptCap` | 0.9 | upper limit on the learned lockout height |

**Rules**
- **Lockout:** travel ≥ `minTravel` AND ((elbow ≥ `lockElbow` AND `h` ≥ lock height) OR `h` ≥
  max(`highLock`, lock height)).
- **Adaptive lock height:** after 3 or more counted reps it becomes
  max(`lockHeight`, min(`adaptCap`, 0.85 × median of the last 5 peaks)).
- **Short presses:** a press that rises at least `partialTravel` but never locks out is rejected,
  with a message shown for 1.5 s. Smaller movements near the shoulders are ignored.
- **Continuity:** `createContinuity` mirrors `createCounter`'s stall, dropout and quality-window
  rules exactly.
- **Overrides:**
  - Pike Push-Up switches to the elbow-angle detector (top 155°, bottom 95°).
  - Landmine Press lowers the whole ladder: rack max 0.3, leave-rack 0.38, lock 0.45, high lock 0.8.

### Runtime additions (`pose-spike.js` v7)
- A "Camera view" line with the gate advice, and the caution line (`cautionFor`) restored.
- **Stall detection:** a repeated video media timestamp for 700 ms or more shows "Camera frames
  paused", backed by a cheap `setInterval` watchdog. A timestamp that jumps backwards is treated as
  a stream restart, not a stall. The check only engages once media timestamps have been seen to
  advance.
- The camera stops after 8 consecutive inference failures, with a retry message.
- A camera start failure shows "Form watch unavailable" (it previously claimed form watch was
  active).
- A tracker side flip no longer interrupts the press counter, because the press reads both arms.
- **Diagnostics v7 adds:**
  - exercise (family, detector, validated, override);
  - `movement` (view, histogram, gate, blocked and degraded frame counts, framing misses);
  - `phase`, `signal` (press height, elbow, rack level, peak, locked);
  - `repLog`, `stalls`, `consecutiveInferenceErrors`, `traceFrames`.
  - Still present: `rawPosePercent`, `trackedPercent`, FPS, tracker stats, `maxPeopleSeen`.
- **Copy trace** exports the last ~480 tracked frames. Format:
  `{version, kind:'iron-six-pose-trace', exercise, family, aspect, points, frames:[[t, side, flags, data, poseCount]]}`.
  `data` holds integer x/y (thousandths of the frame) and visibility (hundredths) for landmarks
  0, 11–16 and 23–28, plus torso `z`.
  - Replay with:
    `node -e "const d=require('./pose-movement-detectors.js');console.log(d.replayTrace(require('./trace.json')).state)"`
  - Replay runs the same `createSession` pipeline the phone runs, so every phone test can become a
    regression fixture.

### How to read diagnostics
- High raw pose % but low tracked % → a tracker/association problem.
- Low raw pose % → a model, input or framing problem.
- Both high but reps low → a detector or state-machine problem.
- `movement.viewBlockedFrames` high → the camera angle, not tracking.

## 4. Test suite changes

- **Before this work:** 289 of 301 passing. The 12 failures were stale assertions for the removed
  synchronous person-detector runtime (ObjectDetector strings, `requestAnimationFrame`-driven fake
  loops), plus one movement fixture whose ramps stopped exactly on the thresholds, which the median
  filter never reaches. They were rewritten to assert the same safety intent against the current
  architecture; none were deleted.
- **New test files:** `tests/pose-view-classifier.test.js`, `tests/pose-vertical-press.test.js`,
  and additions to `pose-movement-detectors.test.js` and `pose-spike.test.js`.
- **Covered:**
  - view labels, hysteresis, dwell and dropout;
  - face-on RDL blocked, side-on RDL counts 5 of 5, front-quarter RDL degraded;
  - squat parity side-on and face-on;
  - press face-on, side-on and angled; far arm hidden; dumbbell press;
  - rack standing, partial presses, three-quarter press, high early reps, arms swept overhead,
    cleaning to the rack;
  - 10/15/30/60 fps; stall mid-press; starting at lockout; interrupt;
  - press configuration threshold order;
  - trace round-trip;
  - live-loop DOM tests: one inference per frame, stall and resume, backwards timestamp,
    inference-failure stop, multi-person ambiguity pause, 3-rep squat through the real loop,
    face-on hinge blocked.
- **An independent review** found and fixed:
  - arming on an overhead sweep;
  - the adaptive lockout getting stuck after a high first rep;
  - the landmine ladder being unreachable;
  - a backwards timestamp stalling analysis.

**Honest limits**
- The "2 of 6 OHP" regression is synthetic (soft face-on lockouts at 150–160° projected that the
  old ≥160° rule misses). It is not the recorded footage.
- Curl, row, hinge and horizontal press are **not validated on real footage**; they only got view
  gating and advice.
- The view classifier's thresholds come from anthropometric reasoning and synthetic tests. The
  blocking policy for hinges should be confirmed by replaying real side-on RDL traces, since
  MediaPipe noise pulling yaw below ~38° would wrongly block.

## 5. Why form analysis looks "not working" (user question)

- **Non-squat exercises:** form cues were intentionally switched off, per the requirement not to
  make unvalidated claims. Previously the only cue was a timing-only "That rep was very quick".
- **Squat:** cues appear only when all of these hold:
  - the view is side-on (shoulders not wide to the camera; otherwise "Turn side-on for squat form
    analysis");
  - the near-side shoulder, hip, knee and ankle are visible at ≥ 0.42 (stricter than counting's 0.32);
  - the rep is fully observed: ≥ 8 frames, the bottom seen, and no gap over 250 ms (otherwise
    "form analysis was skipped");
  - an issue crosses its threshold (depth inconsistency, torso-lean change, hips rising first, fast
    descent). Otherwise it shows "no camera-visible issue crossed the cue threshold".
- The "Coach cue" line needs the same issue in 2 of the last 3 reps.
- The 250 ms gap rule is the first suspect if side-on squats keep saying "skipped" on the phone;
  confirm with a trace.
- **Open question for the user:** which exercise, and what exact Form watch text? Also whether to
  restore a clearly labelled timing-only cue for unvalidated families.

## 6. Research: is this the best way? (literature and product review)

**Verdict:** the core approach is sound. Our pipeline is the same pattern as Google's shipped ML
Kit repetition counter: a per-frame pose model, pose features, and a state machine with enter/exit
hysteresis. The gains left are better inputs, data-driven thresholds, and form rules limited to
what one camera can measure.

**Findings (sources gathered by a research pass; spot-check before relying on them)**

1. **Rep counting**
   - Google ML Kit pose classification + repetition counter: torso-normalised pairwise-distance
     embeddings, kNN (~100 samples per class), enter/exit thresholds.
     https://developers.google.com/ml-kit/vision/pose-detection/classifying-poses
   - PoseRAC (2023): pose-level counter built on BlazePose keypoints, learning two "salient poses"
     per rep. It reports OBO 0.56 on RepCount vs TransRAC's 0.29, and is lightweight.
     https://arxiv.org/abs/2303.08450 · https://github.com/MiracleDance/PoseRAC
   - RepNet (CVPR 2020) and TransRAC (CVPR 2022) are video models that don't count, or are too
     heavy to count, live on a phone. Not suitable here.
     https://sites.google.com/view/repnet · https://arxiv.org/pdf/2204.01018
   - DTW template matching on 1D joint signals: a cheap, class-specific cross-check.
2. **3D landmarks**
   - `worldLandmarks` (metres, hip-centred) are returned by the same `@mediapipe/tasks-vision`
     PoseLandmarker call; the app currently ignores them.
     https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
   - Joint angles computed in 3D don't depend on camera rotation. That is exactly our face-on
     hinge and press-elbow problem.
   - Caveat: `z` is the noisiest axis (MediaPipe GitHub issues #3818, #5822).
   - **Correction to the research output:** using only the x/y of `worldLandmarks` is just another
     projection and gains nothing. Use full 3D angles and cross-check them against 2D.
3. **Model size:** we use `pose_landmarker_lite`. Third-party numbers suggest `full` is about
   5–10% more accurate and roughly 1.5× slower. Worth an on-phone A/B (the phone does ~19 fps on
   lite).
4. **Filtering:** One Euro is standard (MediaPipe's native pipeline uses it). **Correction:** our
   tracker already has speed-adaptive smoothing plus a median filter, so the expected gain is small.
5. **Form accuracy ceiling**
   - A study found by the research pass (not independently checked) reports roughly 2–11° RMSE for
     single-camera joint angles against motion capture, with good range-of-motion reliability
     (ICC > 0.93).
   - Only coarse errors are reliable from a phone: depth, large lean change, hips rising first,
     tempo. Compare each rep to the lifter's own earlier reps rather than to absolute thresholds.
   - Fitness-AQA (Parmar, ECCV 2022) covers back squat, barbell row and overhead press with
     expert-labelled errors (squat: knees forward, knees inward; OHP: elbow and knee errors). Use
     it as the target cue list. https://github.com/ParitoshParmar/Fitness-AQA
6. **Bar tracking (velocity-based-training apps)**
   - The most accurate approach for barbell lifts. RepOne and Qwik VBT were valid against a linear
     position transducer; Metric VBT and MyLift mostly were not.
     https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11575817/
   - It needs an object detector, so it would have to run in a Worker at low frequency. A later
     option only.
7. **Commercial pose apps** (Kemtai, Zenia, Tempo, Onyx) publish no verifiable accuracy or method
   details.

## 7. Recommended next steps (in order)

1. **Phone-validate the current preview** using the protocol below, and collect a diagnostics and
   trace pair per set.
2. **Cheap instrumentation, no behaviour change:** add `worldLandmarks` to the trace capture (and
   optionally to diagnostics), plus a URL flag to switch `pose_landmarker_lite` / `full` for an
   on-phone A/B. Keep one inference per frame.
3. **Compare offline:** replay real traces to compare 2D vs 3D angles and lite vs full against
   ground-truth rep counts. Adopt a change only if it wins on real data.
4. **Validate the remaining families one at a time** (curl → row → hinge → horizontal press), each
   with a recorded trace committed as a regression fixture.
5. **Learned counting:** once there are ~20–30 labelled sets per family, add a small
   ML Kit/PoseRAC-style pose classifier trained from traces. Keep the state machine for timing and
   continuity.
6. **Add the remaining families:** hip thrust, vertical pull, elbow extension, shoulder isolation,
   knee flexion, calves, isometric holds.
7. **Form cues:** add them one family at a time from the Fitness-AQA list, each shown only after it
   is validated on real footage.

## 8. Phone test protocol (preview, `?pose=1`)

1. Barbell overhead press, 6 reps, face-on or angled. Expect 6.
2. Overhead press, side-on. Expect 6.
3. Romanian deadlift, face-on: expect "Turn side-on" and no counting. Then turn side-on: reps count.
4. Squat, side-on: a regression check against the earlier result.
5. Optional: dumbbell shoulder press.

For each set, record the real reps, the app reps, the camera angle, and any bystanders, then tap
**Copy diagnostics** and **Copy trace**.

**Acceptance per family:**
- the identity lock holds and no stranger's reps are counted;
- no forced re-lock during normal movement;
- the count is within 0–1 of the real count, then tightened toward exact;
- no false reps from setup, reracking or standing still;
- a clear prompt appears when the camera angle is unsuitable.

## 9. Conventions

- Code style: compact, dense one-line JavaScript with explanatory comments only where the reasoning
  isn't obvious. Plain browser scripts with a `module.exports` guard so Node tests can `require` them.
- Tests: `npm test` (`node --test tests/*.test.js`); jsdom for the live-loop DOM tests. CI runs
  `node --check` on every root `.js` file.
- Bump script `?v=` query strings in `index.html` / `live.html` when a pose script changes.
- Commit only to `fix/camera-reliability-v6`. Do not merge PR #37 or touch `main`.

## Workout sequence follow-up (Codex)

User requested a stable completion-based rotation and more chest work, then requested
swapping the lower-hypertrophy and upper-specialization positions. Final sequence:
**Chest → Shoulders/arms → Lower strength → Back → Upper specialization → Lower hypertrophy**.
The two leg sessions have two intervening workouts. This does not guarantee that spacing
for upper-body muscles: upper specialization overlaps back, chest, shoulders and arms.
A further shoulders/upper swap was discussed but not applied because it places chest and
upper specialization adjacent.

- Replaced coverage-scored scheduling with the fixed cyclic successor. Existing saved
  current keys and draft plans remain in place; elapsed days never select a new session.
- An empty Finish action cannot advance. Every partial Finish requires confirmation;
  cancelling leaves the workout in place. Fully marked sets wait for Finish too.
- Journal recovery only advances finished sessions, not archived ones, and derives the
  successor from the finished session key so stale snapshots cannot double-advance.
- Upper specialization replaces its extra overhead-press slot with chest isolation
  (existing band fly / dumbbell fly / wide push-up options). Full 60-minute baseline
  sessions provide six direct chest sets; shorter/adapted sessions remain budgeted.
  Saved in-progress plans are retained. All 85 canonical media IDs remain unchanged.
- Validation: 347/347 tests; web and Android web packaging succeed; media audit has
  85 exact canonical illustrations and zero broken references. New regressions cover
  fixed sequence, elapsed time/reload, explicit completion, archive/finish recovery,
  duplicate completion prevention and chest coverage.
- Keep this branch preview-only under the existing physical-phone validation requirement.
