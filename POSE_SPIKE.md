# Camera rep counting — spike

An off-by-default experiment that counts reps from the front camera using on-device pose
estimation. It exists to answer one question before any more is built on top of it:

> **Does landmark quality hold up on a real phone, propped on a real floor, in real gym light?**

If reps are reliable, form checks and coach integration are comparatively easy. If they are
not, no amount of work above this layer fixes it.

## Turning it on

Open the app with `?pose=1`. The flag is stored, so it survives navigation. `?pose=0` turns it
off again. With the flag off, `pose-spike.js` returns on its second line: no camera, no model
download, no DOM changes, no global.

```
https://<your-deployment>/index.html?pose=1
```

A **Count reps with camera** button then appears on the exercises that have a rule, inside the
set table. Everything else in the app is untouched.

## What it does

- Opens the front camera, runs MediaPipe Pose Landmarker on-device, and counts reps from a
  single joint angle with a hysteresis state machine.
- Draws what it is actually measuring — the tracked joint chain and the live angle — rather
  than a decorative skeleton, so a bad count is visibly a bad count.
- Reports fps, percentage of frames tracked, rejected reps, and per-rep duration and depth.
  **These diagnostics are the point of the spike**, not the rep count.
- Writes the count into the reps field via the same `input` event the keyboard fires, so the
  existing journal, save and cloud path runs untouched. It never marks a set done.

## What it deliberately does not do

- **No form feedback.** It measures depth and tempo but makes no judgment about them. Form
  advice is injury-adjacent and needs its own design pass and its own guardrails.
- **No uploading.** No frame, image or landmark leaves the device. The only thing that reaches
  storage is the rep number, and only when you press the button. There is no `fetch` in
  `pose-spike.js`, and a test asserts there is not.
- **No coach integration.** The AI coach does not receive any of this yet.

## Movements it will offer

| Rule | Matches | Notes |
|---|---|---|
| `squat` | anything named squat, or `base: 'squat'` | Primary validation target. Best case is a goblet or bodyweight squat |
| `curl` | biceps curls (leg/hamstring curls excluded) | Second target — different plane, different failure modes |
| `pushup` | push-up variants | Untested against a real camera |
| `press` | overhead / shoulder / military press | Untested against a real camera. The one rule where the angle comparison inverts |

Everything else gets no button. A movement that matches but is known to track badly (barbell
back squat, split squats) shows a caution before you film it rather than being silently
excluded — how bad "badly" is, is part of what the spike measures.

## Known limits, before you test

- **First load pulls ~17 MB** from a CDN: the wasm runtime (~11.7 MB) and the pose model
  (~5.7 MB). Both are cached afterwards. This means the spike needs a network connection the
  first time and **does not work in the packaged Android build** — the WASM would need
  vendoring, and `scripts/build-android-web.mjs` currently copies flat files only.
- **`getUserMedia` needs a secure context.** `https://` or `http://localhost`. On a plain
  `http://` LAN address the camera will not open and the sheet says so.
- **Android app support needs `CAMERA` in `AndroidManifest.xml`** — it currently declares only
  `INTERNET`. Not added yet, since the spike is web-only.
- **Battery and heat.** The camera and inference run only while the sheet is open, and stop on
  close, tab-hide and page-hide. Do not leave it open between sets.
- **A single 2D camera cannot see what a coach sees.** Depth is inferred from a projected
  skeleton; a bar, a rack or a bad angle removes information the count depends on.

## Testing it — what to actually look for

Run a real set and compare the count to what you actually did. The failure that matters is
**over-counting**, not under-counting: a missed rep is obvious, a phantom rep silently corrupts
the log the load recommendations are built from.

Watch the readout:

- **`% of frames tracked` below ~85** — framing or lighting is the problem, not the counter.
- **`fps` below ~15** — the phone is struggling; expect missed reps at speed.
- **rejections climbing** — reps are being seen but discarded as too fast or too slow. Check
  `minRepMs` for that rule in `pose-rep-counter.js`.
- **the angle readout not reaching the rule's `bottom`** — the thresholds are wrong for your
  build or camera angle, which is a tuning problem rather than a tracking one.

**Copy diagnostics** puts the whole run on the clipboard as JSON, including per-rep duration
and depth, resolution and user agent. That is the artefact worth keeping from a test session.

## Files

| File | Role |
|---|---|
| `pose-rep-counter.js` | Pure logic: angles, framing, the rep state machine. No DOM, no camera, no network. Testable headlessly |
| `pose-spike.js` | Camera, model loading, overlay, sheet, diagnostics. Flag-gated on line 20 |
| `tests/pose-rep-counter.test.js` | Rep counting against synthetic landmark streams — jitter, partials, bounces, occlusion, aspect correction |
| `tests/pose-spike.test.js` | Containment: off by default, only on movements with a rule, writes through the normal logging path, fails cleanly with no camera |

`renderExercises` is wrapped rather than edited, so **deleting these two files and their two
`<script>` tags removes the feature completely** with no changes to reverse in the logging path.

## If it works

The next steps, roughly in order of value:

1. Vendor the wasm and model so it works offline and in the Android build.
2. Feed the structured output — rep count, tempo, depth consistency — to the coach as another
   context block alongside `setFeedback` and `analytics`. The coach reasons about numbers, not
   video; per-frame calls to a vision model are too slow and expensive for live counting.
3. Only then consider form cues, with the same "cue, not correction" discipline the coach's
   system prompt already applies to technique.
