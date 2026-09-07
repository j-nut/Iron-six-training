# Iron Six Training — Engineering Handoff

_Last updated: September 6, 2026 (America/Los_Angeles)_

This document is the canonical handoff for continuing Iron Six development in another coding agent/session. Read this file, `README.md`, `MUSIC.md`, and `EXERCISE_MEDIA.md` before making changes.

## 1. Project identity and source of truth

- Repository: `j-nut/Iron-six-training`
- Default branch: `main`
- App name: **Iron Six**
- Android package/app id: `com.ironsix.training`
- Production hosting: Vercel project `iron-six-training` under `jordman55-3386s-projects`
- Primary production aliases have included:
  - `https://iron-six-training.vercel.app`
  - `https://iron-six-training-jordman55-3386s-projects.vercel.app`
- Supabase project is the cloud auth/data backend.
- Groq is used for cloud AI Coach behavior where configured; local/deterministic fallbacks must continue to work if AI/network calls fail.
- The repository, not a chat transcript, is the source of truth for current code.

Do not assume a previously generated APK, Vercel deployment, or feature claim is current. Always inspect `main`, run tests, and verify the deployment/build you are actually shipping.

## 2. Product goal

Iron Six is intended to behave like an adaptive personal trainer, not merely a workout logger or generic AI chat app.

Core product principles:

1. **Every set matters.** Actual weight, reps, completion state, RIR and feedback should immediately affect future recommendations.
2. **Objective performance outranks estimates.** Once real data exist, they should override demographic starting estimates.
3. **Adapt within the workout.** The app should be able to adjust later sets and, conservatively, the remaining session based on what the user just did.
4. **Adapt between workouts.** Training load, exercise choice, progression, recovery, training-block state and future sessions should evolve from accumulated history.
5. **Never sacrifice persistence for cleverness.** Losing a set is worse than giving a mediocre recommendation.
6. **AI should explain and augment a deterministic training engine, not replace it.** Keep hard safety/consistency rules in code.
7. **Short workouts must remain useful.** 15–20 minute sessions should prioritize the highest-value movements instead of just truncating a longer workout.
8. **Traditional and circuit training are both first-class modes.** Circuit timing, sounds and guided transitions must remain reliable.

## 3. Current user-facing capabilities

At the time of this handoff, `main` includes or is intended to include the following:

### Profiles and equipment
- Multiple user profiles.
- Guest/device-only profiles and authenticated account-backed profiles.
- Body weight, age, height, training level and optional strength references.
- Equipment-aware programming and substitutions.
- Barbell, dumbbells, landmine, rack, bench, pull-up, bands, ab wheel, medicine ball and custom-equipment support.
- User can change workout duration and manually choose a workout/muscle focus.

### Workout programming
- Six-workout rotation with A/B/C variation logic.
- Progressive variation rather than random exercise churn.
- 15, 20, 30, 45, 60+ minute planning.
- Traditional set mode and timed circuit mode.
- Guided circuit warm-up/work/rest/round recovery/cool-down sequencing.
- Circuit exercise filtering to avoid inappropriate heavy/technical stations.
- RIR-aware suggestions.
- Next-set adaptation from actual reps/load/RIR.
- Post-set subjective feedback: Too easy / About right / Too hard / Pain-discomfort.
- Training-block states such as Learning, Build, Progress, Manage fatigue and Deload suggested.
- Load-aware recovery/readiness heuristics.
- Recovery/training-block logic can reduce session set volume conservatively.
- Recent pain feedback can choose an already-approved alternative when one exists.
- Adaptive logic must never reduce an exercise below one working set automatically.

### AI Coach
- Cloud Coach endpoint plus local/deterministic fallback behavior.
- Context should include workout state, history, training-block state, recovery/analytics and recent set feedback.
- Coach should be able to explain why an exercise, weight, rep target or volume changed.
- AI must not invent unrestricted exercises/URLs and bypass curated equipment/media rules.
- Coach failure must not break workout logging or the rest of the app.

### Persistence and cloud sync
- Immediate local persistence for set edits.
- IndexedDB/local storage recovery layer.
- Append-only workout journal semantics.
- Supabase-backed `workout_entries` authoritative journal for authenticated users.
- Retry/acknowledgement logic rather than trusting a write that was merely attempted.
- Account scoping to avoid cross-account uploads.
- Guest data should not silently merge into another account.
- Reset/mode/workout changes should archive rather than destructively delete logged data.
- JSON export exists and previously had a serious empty-export/crash bug; do not regress this.

### Analytics/recovery
- 8-week training-volume trend.
- Recent weight, rep and estimated-strength/e1RM PR detection.
- 28-day session consistency.
- 8-week active-week tracking.
- 14-day muscle-volume balance.
- Muscle recovery/readiness heuristic using recency, set load, hard sets, RIR, too-hard feedback and pain feedback.
- These are training-planning heuristics, not medical measurements.

### Exercise media
- Exact-name media mapping in `exercise-media-catalog.js`.
- Current open-source image base is Everkinetic / Greg Priday under CC BY-SA 4.0. See `EXERCISE_MEDIA.md`.
- Exact two-position images can be shown as Start / Finish motion demos with an Auto Demo control.
- Missing exact media must remain clearly labeled as missing; do not show a misleading similar exercise.
- Supersets resolve each movement independently.
- Current coverage is incomplete, especially for landmine, band, kettlebell, suspension and some bodyweight variations.

### Music
- `Iron Six Radio` via Audius discovery/streaming.
- Current server-side policy filters out missing/unclear, All Rights Reserved and NonCommercial license metadata.
- Artist/title/license attribution remains visible.
- `Iron Six Originals` catalog hook exists in `music-originals.js`.
- Spotify is currently an optional external launch only, not a playback dependency.
- Music must never become coupled to circuit timer correctness or workout persistence.
- Current implementation is too limited in catalog depth/genre availability and should be expanded carefully. See roadmap below.

### Android
- Capacitor 8 Android wrapper.
- `capacitor.config.json` uses:
  - appId `com.ironsix.training`
  - appName `Iron Six`
  - webDir `www`
  - Android HTTPS scheme
  - CapacitorHttp enabled
- Native runtime/bridge files live under `native/`.
- Android includes a native workout-backup plugin.
- Web app files are packaged into `www/` before `cap sync android`.

## 4. Important file map

### Core app/runtime
- `index.html` — primary web entrypoint.
- `live.html` — alternate/static entrypoint used in tests/releases.
- `style.css` — app styles.
- `core.js` — core application/profile/program state.
- `engine.js` — recommendation/calibration logic.
- `session-planner.js` — time budgets, circuit suitability, session set allocation/timeline.
- `workout-store.js` — workout/set journal persistence interfaces.
- `workout-*.js` — individual workout definitions.
- `workout-dispatch.js` — workout dispatch/selection.
- `ui1.js`, `ui2.js`, `ui3.js` — primary UI and workout interactions.

### AI / trainer intelligence
- `coach.js` — Coach UI/client behavior.
- `local-ai-fallback.js` — non-cloud fallback.
- `trainer-intelligence-v2.js` — training-block/fatigue state and Coach context enrichment.
- `adaptive-insights.js` — base analytics/insights layer.
- `progress-analytics-v2.js` — deeper PR, consistency, muscle-balance and recovery analytics.
- `session-adaptation-v3.js` — current adaptive-session layer that uses recovery/training state to alter set volume and pain-aware substitutions.
- `api/coach.js` — Vercel Coach API.
- `supabase/functions/coach/index.ts` — Supabase Coach edge-function counterpart.

### Exercise media
- `exercise-media-catalog.js` — exact movement → approved media mapping and provenance.
- `exercise-media.js` — base gallery/media rendering.
- `media-experience-v2.js` — enhanced start/finish motion-demo experience and form cues.
- `exercise-guide.js`, `exercise-visuals.js` — exercise-guide integration and legacy visual behaviors.
- `assets/exercises/` — approved local image assets.
- `exercise-assets.json` — verified asset manifest/checksums.
- `EXERCISE_MEDIA.md` — licensing/provenance and coverage rules.

### Music
- `api/music.js` — Audius discovery endpoint and license filtering.
- `music.js` — in-app player/stations/UI.
- `music-originals.js` — first-party/separately licensed catalog hook.
- `MUSIC.md` — music rights/architecture rules.

### Auth/cloud
- `social-auth.js` — social/auth UI and provider behavior.
- `auth-hardening.js` — auth/recovery hardening.
- `account-polish.js` — account UX.
- `cloud-sync.js` — profile/runtime cloud sync.
- `cloud-history-sync.js` — runtime-script loader and workout-history sync startup.
- `coach-recovery.js` — Coach resilience/recovery runtime.
- `api/config.js` — public Supabase connection configuration only.
- `api/auth-status.js`, `api/verify-nomad-google.js` — auth-related endpoints.
- `supabase/functions/auth-bridge/` — auth-bridge edge function used by native/web flows.
- `supabase/schema.sql`, `supabase/workout-journal.sql` — database setup/migrations.

### Android/build
- `capacitor.config.json`
- `native/entry.mjs`
- `native/runtime.mjs`
- `scripts/build-android-web.mjs`
- `scripts/build-web.mjs`
- `android/`
- `.github/workflows/android.yml`

### Tests/CI
- `tests/*.test.js`
- `.github/workflows/validate.yml`
- `.github/workflows/android.yml`

## 5. Runtime loading architecture

The static app has direct scripts in `index.html`/`live.html`, then `cloud-history-sync.js` loads newer optional runtimes dynamically so older entrypoints remain compatible.

The current runtime-loaded feature set includes at least:

- `coach-recovery.js`
- `auth-hardening.js`
- `account-polish.js`
- `adaptive-insights.js`
- `trainer-intelligence-v2.js`
- `progress-analytics-v2.js`
- `music-originals.js`
- `music.js`
- `session-adaptation-v3.js`
- `media-experience-v2.js`

Whenever adding a new runtime module:

1. Add it to the loader in `cloud-history-sync.js` in dependency-safe order.
2. Add it to `scripts/build-web.mjs` runtime file list.
3. Add it to `scripts/build-android-web.mjs` runtime file list.
4. Update `tests/feature-entrypoints.test.js` so CI prevents future releases from silently omitting it.
5. Verify both web and Android packaging.

This exact pattern matters. Several prior bugs came from a feature existing in source but not actually being packaged/loaded in one entrypoint or the Android APK.

## 6. Data persistence rules — do not weaken these

Persistence is a critical requirement because users previously lost entire workouts.

### Required behavior
- Save each set edit as it is entered, not only when a workout is finished.
- Save done/unfinished/intentional blank revisions consistently.
- Local journal first; cloud confirmation when authenticated.
- Offline changes queue and retry.
- Only database acknowledgement or known duplicate lookup counts as confirmed cloud persistence.
- Do not use one giant final workout save as the only copy.
- Keep append-only revision semantics where practical.
- Keep profile/account ownership checks and RLS intact.
- Never add a Supabase service-role key to browser or Android client code.

### Supabase
For a fresh backend, apply:

1. `supabase/schema.sql`
2. `supabase/workout-journal.sql`

`workout_entries` is intended to be the authoritative immutable workout journal. `profiles.runtime_state` is a convenience snapshot, not the only source of workout history.

### Export
Workout JSON export previously produced an empty file and closed the app. Treat export as a regression-sensitive path and test it after persistence/native changes.

## 7. Auth/recovery history and rules

Auth has been a repeated problem area.

Previously observed failures:
- create account/sign-in not working correctly in Android
- password-reset email sent successfully but reset link opened an error page
- cloud sync/AI Coach disappeared from some builds
- Android/native redirects behaved differently from web

Current code includes an auth bridge and hardening runtimes. Before changing auth:

1. Understand web callback flow and Capacitor/native callback flow separately.
2. Verify Supabase Auth Site URL and Redirect URL allowlist.
3. Preserve email/password confirmation and password recovery.
4. Preserve account isolation and explicit guest import behavior.
5. Do not claim Google/social login works merely because a button renders; test the actual provider callback/deep-link path.
6. A real production SMTP configuration is required for dependable auth email delivery.

Do not place passwords or secret API keys in this repository or this handoff.

## 8. Environment/secrets

Public configuration may be committed only when it is genuinely publishable. `api/config.js` currently exposes a Supabase URL and publishable/anon-style key; that is expected client configuration, not a service-role secret.

Likely deployment secrets/configuration to inspect in Vercel/Supabase before changing AI/auth behavior include:

- Groq API credential used by Coach backend
- Supabase URL/config overrides if any
- Supabase publishable key override if any
- server-side auth bridge credentials/configuration
- OAuth provider settings and redirect URLs

Never guess secret values from old chats or commit them to Git.

## 9. AI Coach architecture and expectations

The desired hierarchy is:

**deterministic training engine → recommendation/constraints → AI explanation or constrained modification**

not:

**LLM invents everything → app blindly trusts it**

Coach context should have access to:
- active workout and current sets
- workout history
- recent objective performance
- RIR
- set feedback
- training-block phase/fatigue
- progress analytics
- recovery/readiness
- available equipment
- user goals/profile context where supported

The Coach should be able to answer questions such as:

> Why am I doing incline press again?

with a response grounded in the user's own recent training and the engine decision, not generic exercise trivia.

AI failures/timeouts must degrade gracefully to local/deterministic guidance.

## 10. Current adaptive-session behavior

`session-planner.js` first creates a budgeted plan based on time/mode/equipment/coverage.

`session-adaptation-v3.js` then wraps/adapts that plan using:
- training-block phase/fatigue from `trainer-intelligence-v2.js`
- muscle recovery scores from `progress-analytics-v2.js`
- current energy/soreness
- recent pain feedback

Current intended behavior:
- `Deload suggested`: approximately 25–35% set reduction.
- `Manage fatigue`: approximately 10–20% set reduction.
- low muscle readiness can trim additional volume.
- low energy/high soreness can trim volume.
- never reduce an exercise below one set automatically.
- if recent pain is tied to an exercise and an approved `_alternatives` option exists/available, swap to that alternative.
- annotate adaptive changes so the UI can explain them.

This is a training heuristic, not diagnosis or medical injury handling.

## 11. Circuit mode invariants

Do not regress these:
- deterministic time budget
- warm-up included in budget
- work/rest transition timing
- 45-second round recovery
- circuit filters for unsafe/inappropriate heavy/technical movements
- lower energy selects steadier pacing
- timer uses elapsed/deadline timing rather than accumulating UI interval drift
- timer pauses/reloads safely
- circuit completion must never fabricate reps or mark skipped sets done
- music playback must be independent from timer state

## 12. Exercise media — current state and recommended redesign

### Current state
Current approved art is primarily Everkinetic imagery distributed under CC BY-SA 4.0. Existing exact mappings and attribution are documented in `EXERCISE_MEDIA.md`.

The latest media layer can convert two exact position frames into a Start/Finish Auto Demo. This improves clarity but does not solve the coverage problem.

### Important rule
Never map an exercise to a merely similar-looking image. A dumbbell RDL is not automatically the same visual as a barbell RDL, etc.

### Recommended next architecture: Iron Six Exercise Media v2

The strongest long-term direction is to own a consistent in-house exercise media pipeline rather than depending indefinitely on scattered open-source images.

Preferred production approach:

1. **Rigged 3D mannequin/model pipeline**
   - one consistent model/body style
   - consistent camera presets: side, front, 3/4
   - reusable equipment models
   - pose exact start/end/key positions
   - render transparent/background-neutral PNG/WebP frames
   - optionally render short loop/video/WebM/GIF-like motion asset
2. Store metadata for each canonical movement:
   - canonical name/id
   - aliases
   - equipment
   - stance/grip
   - unilateral/bilateral
   - start/end/key poses
   - camera angle
   - target muscles
   - form cues
   - common mistakes
   - source/ownership/license
3. Require human review before an asset becomes an approved exact mapping.
4. Keep AI-generation optional as a drafting aid only; do not blindly ship one-shot AI anatomy/movement outputs.
5. Prioritize the top 50–100 exercises first.

Ideal per-exercise outputs:
- workout-card thumbnail
- Start frame
- Finish frame
- optional looping demo
- primary muscle highlight
- 2–4 form cues
- one common mistake warning

If replacing/adapting existing Everkinetic images, respect CC BY-SA attribution/share-alike terms. Cleanest proprietary future library is newly created Iron Six-owned content, not edits of CC BY-SA source art.

## 13. Music — current state, limitation and recommended v2

### Current state
`api/music.js` + `music.js` implement Audius-powered workout radio with conservative rights filtering. Current UX has too little usable music in several genres/stations — sometimes only one or two tracks.

### Why
The combination of narrow genre searches and strict licensing filters drastically shrinks the returned pool. Do not solve this by simply allowing All Rights Reserved, unclear, or NonCommercial tracks.

### Recommended Iron Six Music v2

#### A. Improve Audius discovery before abandoning it
Audius is still useful because its SDK/API is designed for third-party search/streaming and offers a free API tier. Expand station generation using:
- multiple fallback search terms per station
- genre + mood + activity keywords
- BPM ranges where metadata are available
- training mode (circuit vs traditional)
- intensity/energy
- trending/discovery endpoints in addition to a single genre search
- deduplication across searches
- larger rotating candidate pool
- fallback station families if an exact genre yields too few rights-compatible tracks

Example concept:
- Circuit / Hype: electronic + house + trap + workout + energetic + 130–175 BPM
- Heavy / Strength: rock + metal + hip-hop instrumental + hard electronic + 100–160 BPM
- Focus: instrumental + synth + progressive + low-vocal
- Cooldown: ambient + chill + downtempo + 65–105 BPM

#### B. Add a rights-aware multi-source aggregator
Potential sources to evaluate and integrate only where each track's license permits app/commercial use:
- **ccMixter**: substantial Creative Commons catalog, public query API, CC BY tracks can be used commercially with attribution. Keep attribution visible and skip NC/restricted tracks.
- **Free Music Archive**: use only clearly compatible licenses such as CC0/public-domain/CC BY after verifying the specific track. Do not treat the whole catalog as commercially free.
- **Pixabay Music**: license permits use in larger creative works but has restrictions against standalone redistribution. Use only after confirming the planned in-app playback model fits their current license terms; do not expose raw downloads/repackaging.

Do not scrape random websites or assume "free to listen" means "free to include in a commercial app."

#### C. Iron Six Originals
Build a first-party catalog of workout music:
- warm-up
- heavy strength
- high-intensity circuit
- focus
- cooldown

For AI-generated music, keep a rights ledger. For example, Suno's current free tier is non-commercial; tracks generated/downloaded under an eligible paid plan may receive commercial-use rights, but that does not guarantee copyright protection. Only add tracks whose sound-recording/composition rights are documented for the app's use.

`music-originals.js` exists specifically for this first-party/separately-licensed catalog.

#### D. Spotify
Keep Spotify optional unless Spotify explicitly approves the commercial integration you want. Current app should not depend on Spotify playback APIs for core music.

### Music architecture requirement
Music failure/unavailability must never block:
- starting a workout
- set logging
- circuit timer
- pause/resume
- cloud persistence

## 14. Web build / Vercel deployment workflow

### Validation before merge
Run:

```bash
npm ci --ignore-scripts
npm test
```

CI additionally runs:
- `node --check` on browser/Vercel JS
- Deno type-check for Supabase Coach and auth-bridge functions
- required-module existence checks
- Coach fallback test
- feature-entrypoint packaging test

The canonical CI workflow is `.github/workflows/validate.yml`.

### Branch workflow
Preferred approach for substantive changes:

1. Start from current `main`.
2. Create a focused feature/fix branch.
3. Commit coherent changes.
4. Open a PR to `main`.
5. Wait for `Validate Iron Six` CI.
6. Verify Vercel preview actually renders/works; do not rely only on a successful build.
7. Merge only when green.
8. Confirm the post-merge production deployment reaches `READY` and is on the expected commit SHA.

If another session changes `main` while a branch has no unique work, reset/recreate the branch from new `main` instead of creating unnecessary merge noise.

### Vercel
Git integration deploys previews for branches/PRs and production for `main`.

When verifying, check:
- deployment state `READY`
- target `production` after merge
- expected Git commit SHA
- production aliases
- page actually returns meaningful app HTML
- relevant API routes return expected responses

Do not say a change is "live" until the production deployment for that commit is `READY`.

## 15. Android build/update workflow

### Local commands

```bash
npm ci
npm test
npm run android:sync
npm run android:apk
```

`npm run android:apk` runs the Android web-bundle step, Capacitor sync and `assembleDebug`.

Useful package scripts:
- `npm test`
- `npm run android:sync`
- `npm run android:open`
- `npm run android:apk`
- `npm run android:bundle`

### CI Android workflow
`.github/workflows/android.yml`:
- runs on relevant changes to `main` or manual dispatch
- Node 22
- Android API/build tools 36
- Java 21
- `npm ci`
- `npm test`
- `npm run android:sync`
- builds debug APK and unsigned release AAB
- verifies APK signature/package
- uploads artifact named `iron-six-android-test`
- artifact retention: 30 days

Expected CI outputs:
- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

### Android packaging warning
If adding a new browser/runtime JS file, adding it to the repository is not enough. It must be copied into `www/` by `scripts/build-android-web.mjs`, and entrypoint/runtime tests should enforce its presence.

### Android UI warning
There was a prior bug where content was cut off under the Android status/header area. Preserve safe-area/window-inset behavior and test on a real/native-like viewport after substantial layout changes.

## 16. Testing philosophy

Do not delete tests to make a feature pass.

High-risk regression areas:
- workout set persistence
- account isolation
- offline retry
- archived session recovery
- password reset/auth callback
- guest-to-account behavior
- JSON export
- next-set adaptation
- session planning/time budget
- circuit timers
- feature runtime packaging
- Android API routing
- exercise exact-media mapping
- music rights filtering

Tests already exist for many of these in `tests/`.

When adding a new feature, add a regression test that fails if the feature is accidentally omitted from web or Android packaging.

## 17. Known current weaknesses / open work

### Priority 1 — exercise media coverage
The presentation is improved, but coverage remains much weaker than category leaders such as Fitbod/Alpha Progression. Build the Iron Six-owned media pipeline described above and systematically cover the exercise library.

### Priority 2 — music catalog depth
Current Audius implementation is technically functional but too sparse. Implement better multi-query/mood/BPM/training-mode discovery, then add rights-compatible sources and Originals.

### Priority 3 — smarter explanation of adaptation
When the engine modifies sets/exercises, Coach and Today UI should clearly explain the reason using user-specific data (fatigue, muscle readiness, recent performance, pain feedback, time budget).

### Priority 4 — more explicit periodization
Current training-block/fatigue layer is useful but still heuristic. Continue toward clear accumulation/progression/deload/new-block behavior without blindly increasing weight every session.

### Priority 5 — deeper analytics
Useful analytics now exist, but future improvements can include:
- exercise-specific chart drilldowns
- e1RM curves
- weekly/monthly volume by muscle
- PR history
- adherence/consistency trends
- block-to-block comparison
- AI-generated insight tied directly to programming changes

### Priority 6 — wearable/health ecosystem
Future, not immediate:
- Android Health Connect
- Wear OS
- Apple Health / Apple Watch if iOS is added

Do not prioritize social-network features over adaptive training quality.

## 18. Commercial positioning / product comparison guidance

The app should not be marketed as merely an "AI workout generator." The stronger position is:

> **A trainer that watches every set.**

Desired experience:

User logs:

> 185 lb × 8, 2 RIR

Iron Six can react by changing:
- the next set
- later sets
- the remaining workout when warranted
- future programming

and can explain why.

The competitive benchmark is roughly:
- Fitbod / Alpha Progression for adaptive programming
- Hevy for frictionless logging/analytics polish
- guided workout apps for circuit/timer experience

Iron Six's differentiation should be the tight feedback loop between every completed set and both the deterministic engine and conversational Coach.

## 19. Safety / product constraints

- Do not present recovery scores as medical measurements.
- Pain feedback should favor stopping/substituting a pain-free option and should not diagnose injury.
- Do not let an LLM invent unsafe progression or ignore hard engine constraints.
- Do not silently use improperly licensed exercise art or music.
- Do not expose secrets in client code or Git.
- Do not weaken database RLS/account ownership for convenience.

## 20. Before taking over — checklist for Claude/another agent

1. Pull/read current `main`.
2. Read:
   - `HANDOFF.md`
   - `README.md`
   - `MUSIC.md`
   - `EXERCISE_MEDIA.md`
3. Inspect latest commits/PRs because this document may lag future code.
4. Run `npm ci --ignore-scripts && npm test`.
5. Inspect `.github/workflows/validate.yml` and `.github/workflows/android.yml`.
6. Inspect Vercel project/deployment state before claiming anything is live.
7. Inspect Supabase schema/functions before modifying persistence/auth.
8. Preserve all durability tests and account isolation.
9. Use feature branches for substantive work.
10. Verify web preview and Android packaging before merge.
11. After merge, verify the exact production commit is `READY`.

## 21. Immediate recommended next task

If continuing directly from this handoff, the recommended next package is:

### `upgrade/media-music-v2`

**Exercise Media v2**
- define canonical asset/metadata schema for an Iron Six-owned library
- produce a small proof-of-concept set for 10 high-frequency exercises
- add target-muscle/form-cue/common-mistake metadata
- keep current exact-media fallback and attribution system

**Music v2**
- expand Audius discovery with broad fallback queries and station candidate pooling
- add mood/intensity/BPM-aware station logic
- add ccMixter CC BY source support with correct attribution
- keep a single normalized rights-aware track model regardless of source
- add strong regression tests for license filtering and graceful provider failure
- leave Spotify optional/external
- keep `music-originals.js` as the first-party catalog

Do not merge either track until the full persistence/auth/workout test suite remains green.

---

If code conflicts with this document, trust the current code and tests first, then update this document as part of the same PR so the handoff remains accurate.