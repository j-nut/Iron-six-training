# Watch Data Integration — Running Handoff (Claude → ChatGPT)

Living notes, updated as work progresses. If you are picking this up, read **Current status** and
**Next steps** first, then the design sections. Keep appending to the progress log.

## Owner request (2026-09-15)
- Make data a user's smartwatch **already collects** available in Iron Six while they wear it during
  workouts, from any brand where technically possible.
- **Not wanted:** rep counting from wrist motion.
- **Future (do not build now):** an iPhone app (Capacitor iOS + Apple HealthKit). Design so iOS plugs
  in without a UI rewrite.
- Implement everything that can be implemented without owner accounts or payments. Take notes so
  ChatGPT can continue if credits run out.

## Current status
- **Branch:** `feature/watch-data`, from `main` at `8f8142c`. Nothing is merged; production is
  untouched.
- **Phase:** implementation in progress, split across three parallel workstreams (below).
- **Commits:** only this notes file until the workstreams are reviewed and integrated.

## Architecture
The data flows in this order:
`watch/strap/app → source adapter → wearable-core.js (pure normalisation) → wearables.js (UI, storage, session attach)`

1. **`wearable-core.js`** (pure; `window.IronSixWearableCore`, Node-testable)
   - BLE Heart Rate Measurement parser (GATT 0x2A37) and an in-memory heart-rate buffer.
   - Downsampling, session summary (avg/max/min/coverage) and per-set peak / recovery alignment
     using workout-journal set timestamps.
   - Daily sleep, resting heart rate and HRV series, compared with the user's own 28-day baseline.
     The comparison text is neutral and never medical.
   - TCX/GPX workout file parsing (FIT returns "unsupported, export TCX/GPX"), workout-to-session
     window matching, and a cardio mode mapper.
2. **Native bridge** (Android now, iOS later), in `native/entry.mjs` + `native/runtime.mjs` on
   `window.IronSixNative`:
   - `health.*` wraps `@capgo/capacitor-health@8.11.1` (MPL-2.0), which supports Health Connect on
     Android and **Apple HealthKit on iOS**. The same JS API is reused when the iPhone app is built.
   - `heartRateBle.*` wraps `@capacitor-community/bluetooth-le@8.3.0` (MIT), because the Android
     WebView has no Web Bluetooth. This plugin also supports iOS.
   - Read-only allowlist: heart rate, resting heart rate, HRV, sleep, calories, workouts. No writes.
3. **`wearables.js`** (runtime UI module; `window.IronSixWearables`)
   - Profile menu → **Watch & heart rate** modal with three sources:
     - live Bluetooth heart rate;
     - health platform (Health Connect / Apple Health);
     - TCX/GPX file import.
   - Plus a delete-data control.
   - Heart-rate chip on the active workout screen (`#sessionCardNav`).
   - Wraps `IronSixJournal.finish(u, session)` to add `session.startedAt` and, when live heart rate
     was recorded, `session.wearable = {v, source:'bluetooth', device, summary, series (5 s), sets}`.
     This syncs with the finished session through the workout journal (payload limit 200 KB).
   - Late health-platform heart rate (watches sync to Health Connect with a delay) is stored as
     summaries in `trainerMemory.wearables.sessions[sessionId]`. That lives in the profile's synced
     runtime state, retries for 48 h, and is capped at 60 sessions with 30 s series.
   - A "From your watch" block near the readiness inputs (sleep / resting HR / HRV vs. your usual).
     It **never changes** the energy or soreness answers.
   - Recent watch cardio workouts can be added to the cardio log (`IronSixCardio.logSession`,
     source 'watch').
   - History explorer shows a heart-rate summary line.

### Why these sources
| Source | Covers | Limits |
|---|---|---|
| Bluetooth heart-rate broadcast (standard 0x180D) | Polar, Garmin (broadcast mode), Coros, Wahoo, Suunto, many Amazfit, chest straps | Apple Watch and most Wear OS watches don't broadcast. Web Bluetooth works in Chrome/Android only, not iPhone browsers. |
| Health Connect (Android) | Samsung Health, Fitbit, Oura, Withings, Polar, many others | Android app only. Watch apps sync with a delay. Verify Garmin's Health Connect coverage. |
| Apple HealthKit (future iPhone app) | Apple Watch and most iPhone-paired devices | Needs a native iOS app: Capacitor iOS, Apple developer account, review. |
| TCX/GPX file import | Nearly any device or app that exports files (Garmin Connect, Strava, Coros, Polar Flow…) | Manual. FIT binary not parsed yet. |
| Cloud APIs / aggregators (Terra, Rook, Garmin Health API, Polar AccessLink, Oura, Whoop, Withings) | Broadest coverage without native apps | **Owner-gated:** accounts, approval, keys, often per-user pricing. Not implemented. |

## Decisions
- **Android minSdk raised from 24 to 26 (Android 8.0).** Health Connect and the plugin require it.
- **Remove every health permission the plugin merges in except the reads we use.** This lowers Google
  Play health-permission review risk.
- **Bluetooth scanning uses `neverForLocation`.** Location permission is limited to Android ≤ 11
  (API 30).
- **Health Connect needs a privacy policy URL.** The resource string points at
  `https://iron-six-training.vercel.app/privacy`. The app had **no privacy policy page**; Claude is
  drafting `privacy.html`, which **needs owner review** before publishing or Play submission.
- **Watch data only adds context.** It never silently changes user-entered data (readiness, sets)
  and is never used for load prescriptions.
- **Heart-rate zones are not computed.** That would need age or max-HR assumptions; revisit later.

## Workstreams (in progress)
| Owner | Files | Status |
|---|---|---|
| Agent A (core) | `wearable-core.js`, `tests/wearable-core.test.js` | in progress |
| Agent B (native) | `package.json/lock`, `android/**`, `native/**`, `capacitor.config.json`, `tests/native-wearables.test.js` | in progress |
| Agent C (UI) | `wearables.js`, `tests/wearables.test.js`, small edits: `profile-menu.js`, `ui3.js` (trainer review keeps `trainerMemory.wearables`), `cloud-history-sync.js`, `scripts/build-web.mjs`, `scripts/build-android-web.mjs`, `cardio-companion.js` (accept source 'watch'/'file'), `history-explorer.js` | in progress |
| Claude | review, integration, `privacy.html`, this document | in progress |

## Constraints (from earlier incidents; must keep)
- No MutationObserver or per-frame work on the workout screen: an observer froze real phones.
  Intervals of 1 s or more with early exits only.
- Finishing a workout must never fail because of wearables (try/catch).
- `trainerMemory` is rebuilt by the post-workout trainer review in `ui3.js`. Any new field under
  `trainerMemory` must be added to its preserve list (`appearance`, `achievements`, now `wearables`).
- Don't merge to `main` without the owner. Android native changes compile only in CI (the local
  machine has JDK 8 and no Gradle-capable toolchain).

## Next steps
1. Review the agent outputs, reconcile API names (health data types especially), and run
   `npm test` plus both builds.
2. Draft `privacy.html` (data practices: Supabase auth/sync, Vercel hosting, Groq coach, on-device
   camera and voice, watch data) and add it to the `scripts/build-web.mjs` public files list.
3. Local browser check at 375×812 with a fake Bluetooth device.
4. Push, open a PR, and let CI compile the Android build. Fix any Gradle or manifest merge errors.
5. **Owner device tests:**
   - Android app with a Bluetooth heart-rate device;
   - Android app with Health Connect (Samsung / Fitbit / Garmin);
   - TCX/GPX import on the web.
6. **Later (owner-gated):**
   - iPhone app: Capacitor iOS project; HealthKit capability; Info.plist `NSHealthShareUsageDescription`
     and `NSBluetoothAlwaysUsageDescription`.
   - FIT file parsing.
   - Evaluate an aggregator (Terra, Rook) for brands with no Health Connect path.

## Progress log
- 2026-09-15: Researched the app structure and chose the plugins after inspecting their packages
  (APIs, licenses, manifests). Created the branch and dispatched three parallel workstreams with
  fixed file ownership and API contracts.
