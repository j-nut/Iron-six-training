# Camera reliability v6

This change is based on current `main` (8abdf45) plus the existing `feature/pose-form-voice-v3` branch (5f31efc). It preserves the earlier cropped-ankle and elapsed-time fixes. Camera assistance remains opt-in with `?pose=1`.

## Problems fixed

- The browser replaced the pure counter's immediate interrupt with a 15-call debounce. A side change issued only one interrupt, then the next visible frame cleared that debounce. Rep geometry could therefore cross from one limb to another. The counter now owns time-based dropout tolerance; explicit interrupts take effect immediately and retain completed reps.
- No-frame camera stalls never entered dropout logic. The counter checks elapsed time before accepting a returning frame; the camera loop also clears the current measurement and displays a recovery instruction while video is frozen.
- A burst of good detections could outweigh long blind intervals because quality was averaged by frame count. The four-second quality window now weights elapsed time.
- Rep smoothing retained five frames regardless of frame rate. A 140 ms age cap prevents stale samples from dominating slower devices. Wrist and elbow landmarks now receive the shipping tracker's smoothing, and its interpolation accounts for elapsed time.
- Person-detector ambiguity was discarded by `sample()`, and the first raw pose result refreshed the person box before subject association. Ambiguity now persists until detector resolution, vetoes counting, and cannot be cleared by pose refresh. Only accepted, associated landmarks refresh the box. Expired person and pose tracks require re-lock even if the returning candidate resembles the previous subject.
- Pose association now requires its torso center to fall inside the independently tracked person's box, with a small tolerance.
- The ankle fallback used a frame-count delay, accumulated intermittent ankle loss and could show “Form watch is loading” indefinitely. It now requires two continuous seconds of ankle-only framing failure and explicitly labels form analysis as off.
- Missing form samples could look like a successful analysis. Squat observations now require bottom-phase evidence, at least eight clean samples and no sample gap over 250 ms. Otherwise the rep is labeled insufficient for form analysis. Clearly frontal footage prompts a side view. This is a heuristic view check, not camera calibration.
- Side changes and explicit re-locks clear form reference history. Partial descents do not contaminate the next completed rep. Paused tracking suppresses current cues. Non-squat rules explicitly report timing-only analysis.
- Repeated pose inference errors stop the stream and present a retry instruction. Diagnostics include failure count, last error, measurement mode and validity. Camera disconnection is handled explicitly.
- Person-isolation code loads before the camera shell, and modified camera assets have refreshed cache versions.

## Verification

- Baseline: 277 tests passed after incorporating the existing feature branch.
- Updated suite: 296 tests passed, including 19 added behavioral regressions.
- Added cases cover 10/15/30/60 fps, frozen video, silent timestamp gaps, duplicate timestamps, mixed-rate visibility, limb interrupts, expired locks, person-box disagreement, persisted ambiguity, wrist jitter, incomplete form evidence and frontal views.
- DOM integration tests drive the actual camera animation loop with deterministic camera/model results, checking visible freeze/failure messages and ambiguity vetoes.
- Android web packaging succeeds with all camera helpers. No APK build or physical Android camera test was performed.

## Scope and practical limits

These tests exercise synthetic landmarks and controlled model responses. They do not establish an accuracy percentage on real people. The existing model and exercise thresholds remain heuristic. Squat observations cover visible depth consistency, torso movement, hip/chest timing and tempo. Curls, push-ups and overhead presses have counting and timing checks, not full joint-alignment assessment. This does not validate every exercise variant (including unilateral and 1.5-rep variants).

Geometry-only association cannot guarantee identity if similar people overlap or replace each other in the same position. Keep one person in view. Brief occlusion can preserve an already observed rep, but unseen depth is not inferred. Camera roll/yaw, racks, loose clothing and extreme foreshortening still require real footage testing.

The current MediaPipe inference remains synchronous on the main thread. Google documents this behavior and recommends a worker for moving inference off the UI thread: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js . A worker migration or larger model should be compared against representative device recordings before adopting it as an accuracy improvement.

## Trainer validation before broad release

Use independently hand-counted sets, and label form cues before viewing the app's output. Include side-view bodyweight and loaded squats, good and dim lighting, portrait/landscape capture, cropped ankles, racks/occlusion, deliberate partials, varied tempo, close bystanders and crossings, and low-end Android/iOS devices. Compare exact-set count agreement, extra/missed reps, false cues per set, subject-switch events, unusable-time percentage and inference latency. Report failure cases separately rather than averaging them away. Do not label this a reliable form assessor for a movement until it has passed that footage review.

## Deployed browser check

The Vercel preview of commit 37629c8 loaded successfully. Browser verification opened a guest workout and its Barbell Back Squat camera assistant; controls and the camera modal rendered. This remote browser has no camera device, so actual inference could not be verified. Its no-device state exposed one remaining UI issue (form watch still said active), fixed in the follow-up along with clearer camera errors and a regression. No workout was logged. Local standalone browser installation was unavailable; deployed UI checks used the connected browser.
