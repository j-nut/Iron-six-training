# Exercise Illustration Library — Handoff for a New Session

Self-contained brief. Read it all before changing anything. Owner decisions are marked **(owner)**.

## 1. The goal

Every exercise in Iron Six needs a **decent, real illustration**, including the ones generated
when users add their own equipment (kettlebell, cable, machines…).

The owner explicitly **rejected** showing a different exercise's picture as a labelled stand-in
("same movement pattern, different equipment"). Every exercise needs its own correct
illustration, drawn in the house style. The owner is open to building a proper library covering
the most popular gym machines and wants a feasibility-tested plan, not a leap of faith.

## 2. Where things are

| Item | Value |
| --- | --- |
| Repo | https://github.com/j-nut/Iron-six-training (public) |
| Production | `main` → https://iron-six-training.vercel.app (auto-deploys on merge) |
| `main` at handoff | `31496df` |
| Workflow | branch → PR → CI green (`Validate Iron Six`, `Android test build`) → owner approves → merge. **Never push to `main` directly.** |
| Tests | `npm test` (Node test runner + jsdom); 409 passing at handoff |
| Local clones | `C:\Users\jordm\Documents\GitHub\Iron-six-training` (older `main`, holds the **uncommitted art tooling**) and `C:\Users\jordm\Documents\GitHub\Iron-six-main` (worktree used for recent work) |
| Android | Capacitor 8. Signed releases come from the **Android signed release** workflow (`gh workflow run "Android signed release" -f version_name=X.Y.Z`); they install over the previous version. The signing key is the owner's at `C:\Users\jordm\keys\` — never touch or print it. |

## 3. Current illustration state (measured 2026-09-16)

### Approved library
- **85 illustrations**, one per canonical exercise in `exercise-registry.js`.
- Files: `assets/exercise-illustrations/*.webp`, 960×640 or 960×480, ~25 KB each, 2.1 MB total.
- Style: a grey mannequin figure on a dark background, composite of **start · midpoint · top**
  panels, titled "<EXERCISE NAME> — IRON SIX FORM GUIDE", credited "Iron Six original".
  Look at `assets/exercise-illustrations/barbell-bench-press.webp` before drawing anything.
- `assets/exercise-illustrations/manifest.json`: one row per image,
  `{canonicalName, filename, width, height, bytes, sha256}`.
  - `scripts/build-web.mjs` **verifies every checksum** and fails the build on a mismatch.
  - `scripts/build-android-web.mjs` copies all of `assets/`.

### Resolution tiers (`exercise-media-resolver.js` `resolveOne(name)`)
| Tier | Meaning |
| --- | --- |
| 1 | Exact approved illustration |
| 2–3 | Legacy Creative Commons image (everkinetic, CC BY-SA 4.0), matched by name or alias |
| 4 | "Closest approved variation shown: …" (stand-in) |
| 5 | "Movement-pattern reference shown: …" (stand-in) |
| 6 | "Demo coming soon" (nothing) |

### The gap
Across the equipment library (`equipment-exercise-library.js` → `curated`, keyed by equipment):
- **122 unique exercises, none canonical, none with approved art.**
- 109 show **"Demo coming soon"**; 13 show an old legacy CC image.
- The full per-equipment inventory is in the appendix.

The equipment keys are: kettlebell, cable, suspension, machine, smith, sandbag, trap_bar, ez_bar,
dip, lat_machine, leg_press, leg_machine, calf_machine, hip_thrust_machine, assist_machine,
mini_band, ghd, box, parallettes, dip_belt, plates, slam_ball, weight_vest.

Generated exercises are created by `api/equipment-exercises.js` (Groq, bounded by
`equipment-exercise-library.js` and `equipment-catalog.js`). Their names come from the curated
list, so art keyed by exact name will resolve.

## 4. Existing art tooling — uncommitted, not yet evaluated

In `C:\Users\jordm\Documents\GitHub\Iron-six-training\tools\exercise-art\` (untracked, last
edited 2026-09-09):

| File | What it is |
| --- | --- |
| `ANATOMY.md` | Proportion and joint-limit reference, written to stop anatomically impossible poses. It mentions a Blender/Rigify pipeline; no Blender scripts are present. |
| `figure.mjs` | Rigged 2D skeleton (`skeleton`, `RIG`) |
| `scene.mjs` | SVG scene: `VIEWBOX`, `floor`, `plateStack`, `barbell`, `dumbbell`, `bench`, `pullupBar`, `band`, `muscleOverlay`, `frame` |
| `poses.mjs` + `poses/{push,pull,lower,arms-core,core-lifts,_shared}.mjs` | ~80 start/finish poses |
| `lint.mjs` | Geometry linter: limbs through torso, equipment through skull, foot below floor, joints bent the wrong way, start/finish too similar |
| `preview.mjs` | Writes `.art-preview/preview.html` contact sheet |
| `cues.json`, `_audit_tmp.mjs` | Cue data and a scratch audit script |

**Unknowns you must resolve first:**
1. Whether this SVG system produced the 85 approved WebPs, or those came from another process
   (the ANATOMY notes mention Blender). Compare the preview output with an approved WebP.
2. Its visual quality relative to the approved set.
3. There is **no cable tower, pulldown, row station, leg press, pec deck, leg extension/curl, Smith
   machine, kettlebell or machine-seat prop** yet.

## 5. Options assessed (for context; pilot before committing)

| Approach | Quality | Cost | Main risk |
| --- | --- | --- | --- |
| **Extend the in-house pipeline** with ~15 equipment props | Matches the house style | Time | Machines are fiddly; needs a strict review loop |
| Commission an illustrator | Best | ~$20–60 each ≈ $4k–15k for ~250 | Slow; style must be specified tightly |
| Licensed stock vector packs | Mixed | $100s | Style clash; per-asset licences |
| CC sets (e.g. everkinetic) | Varies | Free | Share-alike terms; different look |
| Local Stable Diffusion (installed on this PC) | Poor for gym equipment | Free | Wrong barbells and machines, style drift, heavy culling |

The recommendation so far is to **extend the in-house pipeline, pilot-first**. **(owner)** decides
after seeing the pilot.

## 6. Plan

### Step 0 — Bring the tooling under version control
Branch from `main` (e.g. `feature/illustration-library`). Copy `tools/exercise-art/` from the other
clone into the repo (exclude `_audit_tmp.mjs` scratch unless useful). Fix the hard-coded
`C:/Users/jordm/Documents/GitHub/Iron-six-training/.art-preview` output path in `preview.mjs` to a
repo-relative, git-ignored folder. Add an `npm` script to render previews. Commit with no app
changes.

### Step 1 — Establish the baseline
Render the existing poses with `preview.mjs` and compare side by side with 3–4 approved WebPs.
Answer the "unknowns" above in the running notes before building anything new.

### Step 2 — Pilot: 10 illustrations, one new prop
- Build the **cable tower** prop (adjustable pulley height, single and dual handles, rope and bar
  attachments).
- Pose 10 cable exercises from the inventory, e.g. Cable Chest Press, Cable Face Pull, Cable Rear
  Delt Fly, Cable Lateral Raise, Cable Hammer Curl, Cable Overhead Triceps Extension, Cable
  Straight-Arm Pulldown, Cable Chest Fly, Seated Cable Row, Cable Triceps Pressdown.
- Every pose passes `lint.mjs` and `ANATOMY.md` limits.
- Export in the house format: composite panels, 960 px wide WebP, title and credit, ≤ ~40 KB.
- Produce a **contact sheet** (HTML, or PNG via the browser tool) placing the 10 pilots next to 4
  approved illustrations, and send it to the owner (`SendUserFile`). **(owner)** approves or
  rejects per image and decides go / no-go on the approach.

### Step 3 — If go: build the prop kit, then batch by prop
Roughly 15 props unlock most of the list: cable tower, lat pulldown station, seated row, leg press
sled, plate-loaded/selectorized press seat, pec deck, leg extension, lying/seated leg curl, Smith
rack, hack squat, calf machine, hip thrust machine, assisted pull-up/dip, GHD, kettlebell,
sandbag, trap bar, EZ bar, parallettes, plyo box, slam ball, suspension straps.
**(owner)** confirms the list of "most popular machines" to add beyond the equipment library.

Batch order by usage: kettlebell (16) → cable (17) → lat machine / row / machine presses →
leg press / leg machines → the rest.

### Step 4 — Wire approved art into the app, batch by batch
- Add files and manifest rows (with correct `sha256`, `bytes`, dimensions) to
  `assets/exercise-illustrations/`.
- Make the resolver return **tier 1 for these names**. Today the approved library is keyed to
  `exercise-registry.js` canonical names. The cleanest route is an approved-media entry keyed by
  exact name for equipment exercises. Read `exercise-media-resolver.js`,
  `exercise-media-manifest.js` and `exercise-media-catalog.js` fully first.
- **Test impact:** `tests/exercise-visuals.test.js` line 21 asserts
  `approved.length === registry.exercises.length` (every manifest row is canonical). Update it
  deliberately, for example "every canonical exercise has exactly one illustration, and extra rows
  belong to equipment-library exercises", and keep the checksum, WebP-magic and "no substitution
  label for exact" assertions for the new rows.
- Add a coverage test that fails if any equipment-library exercise resolves to a tier other than
  1 once its batch has shipped, so coverage can only go up.
- Size budget: ~250 × ~25–40 KB ≈ 6–10 MB added to the web build and APK. Acceptable, but report
  it, and consider lazy loading (images are already `loading="lazy"`).

### Step 5 — Ship
One PR per batch, with a contact sheet in the PR description, CI green and **(owner)** approval
before merge. After merging, a signed Android release carries the art to phones.

## 7. Constraints (from past incidents)

- **No stand-ins as the end state** (owner decision). The stand-in labels may remain as the
  temporary fallback only until each batch ships.
- **Correctness beats quantity:** a wrong joint angle or impossible machine is worse than
  "coming soon". Use the linter and the owner review gate.
- **No MutationObserver or per-frame work** in app UI; an observer froze real phones.
- **Licensing:** only first-party art in the approved set. Don't pull images from the web; don't
  commit generated art without recording how it was made.
- **Don't break the checksum manifest:** `build-web.mjs` fails on any mismatch; regenerate
  `sha256` and `bytes` whenever an image changes.
- **Secrets:** never print, move or commit the Android keystore or its password.
- **Keep notes as you go** in a running file, e.g. `reports/illustration-library-worklog.md`
  (decisions, pilot findings, per-batch status), committed to the branch so ChatGPT or another
  session can resume if credits run out. The owner has asked for this explicitly.

## 8. Open questions for the owner
1. Which machines count as "most popular" beyond the equipment library?
2. Is the in-house style (grey mannequin, 3-panel composite) the target for every new
   illustration, or is a refresh wanted?
3. Budget appetite if the pilot shows the in-house route can't reach the bar (commission vs. stock).

## 9. Other open work (not part of this task, don't disturb)
- **PR #42 — watch/heart-rate data.** Open, CI green, awaiting a phone test and review of the draft
  `privacy.html` (needs a contact email). Notes: `reports/watch-data-handoff.md`.
- **Owner to-do:** save the keystore password from `C:\Users\jordm\keys\ironsix-keystore-password.txt`
  into a password manager, delete that file, and back up `ironsix-release.jks`.
- Optional: a GitHub Release for one-tap APK downloads (repo is public; owner hasn't approved).

## Appendix — equipment exercises without approved illustrations (122 unique)

### kettlebell — 16
- Kettlebell Goblet Squat — today: Demo coming soon
- Kettlebell Front Squat — today: Demo coming soon
- Kettlebell Reverse Lunge — today: Demo coming soon
- Kettlebell Romanian Deadlift — today: Demo coming soon
- Kettlebell Swing — today: Demo coming soon
- Kettlebell Single-Leg Deadlift — today: Demo coming soon
- Kettlebell Hip Thrust — today: Demo coming soon
- Kettlebell Floor Press — today: Demo coming soon
- Single-Arm Kettlebell Press — today: Demo coming soon
- Single-Arm Kettlebell Row — today: Demo coming soon
- Kettlebell Bent-Over Row — today: Demo coming soon
- Kettlebell Lateral Raise — today: Demo coming soon
- Kettlebell Hammer Curl — today: Demo coming soon
- Kettlebell Overhead Triceps Extension — today: Demo coming soon
- Kettlebell Calf Raise — today: Demo coming soon
- Kettlebell Suitcase Carry — today: Demo coming soon
### cable — 17
- Cable Chest Press — today: Demo coming soon
- Cable Chest Fly — today: legacy CC image
- Cable Lat Pulldown — today: legacy CC image
- Seated Cable Row — today: legacy CC image
- Cable Face Pull — today: Demo coming soon
- Cable Rear Delt Fly — today: Demo coming soon
- Cable Lateral Raise — today: Demo coming soon
- Cable Curl — today: legacy CC image
- Cable Hammer Curl — today: Demo coming soon
- Cable Triceps Pressdown — today: legacy CC image
- Cable Overhead Triceps Extension — today: Demo coming soon
- Cable Straight-Arm Pulldown — today: Demo coming soon
- Cable Pull-Through — today: Demo coming soon
- Cable Glute Kickback — today: Demo coming soon
- Cable Woodchop — today: Demo coming soon
- Cable Crunch — today: Demo coming soon
- Half-Kneeling Cable Press — today: Demo coming soon
### suspension — 11
- Suspension Trainer Row — today: Demo coming soon
- Suspension Trainer Push-Up — today: Demo coming soon
- Suspension Trainer Chest Fly — today: Demo coming soon
- Suspension Trainer Hamstring Curl — today: Demo coming soon
- Suspension Trainer Split Squat — today: Demo coming soon
- Suspension Trainer Pistol Squat — today: Demo coming soon
- Suspension Trainer Body Saw — today: Demo coming soon
- Suspension Trainer Face Pull — today: Demo coming soon
- Suspension Trainer Y-Raise — today: Demo coming soon
- Suspension Trainer Biceps Curl — today: Demo coming soon
- Suspension Trainer Triceps Extension — today: Demo coming soon
### machine — 13
- Machine Chest Press — today: legacy CC image
- Machine Shoulder Press — today: legacy CC image
- Machine Lat Pulldown — today: legacy CC image
- Machine Seated Row — today: Demo coming soon
- Machine Pec Deck — today: Demo coming soon
- Machine Rear Delt Fly — today: Demo coming soon
- Machine Lateral Raise — today: Demo coming soon
- Machine Preacher Curl — today: Demo coming soon
- Machine Triceps Extension — today: Demo coming soon
- Machine Leg Curl — today: legacy CC image
- Machine Calf Raise — today: Demo coming soon
- Machine Hip Thrust — today: Demo coming soon
- Machine Abdominal Crunch — today: Demo coming soon
### smith — 9
- Smith Machine Squat — today: legacy CC image
- Smith Machine Split Squat — today: Demo coming soon
- Smith Machine Romanian Deadlift — today: Demo coming soon
- Smith Machine Hip Thrust — today: Demo coming soon
- Smith Machine Bench Press — today: legacy CC image
- Smith Machine Incline Press — today: Demo coming soon
- Smith Machine Overhead Press — today: Demo coming soon
- Smith Machine Inverted Row — today: Demo coming soon
- Smith Machine Calf Raise — today: Demo coming soon
### sandbag — 8
- Sandbag Front Squat — today: Demo coming soon
- Sandbag Reverse Lunge — today: Demo coming soon
- Sandbag Romanian Deadlift — today: Demo coming soon
- Sandbag Shouldering — today: Demo coming soon
- Bent-Over Sandbag Row — today: Demo coming soon
- Sandbag Floor Press — today: Demo coming soon
- Sandbag Overhead Press — today: Demo coming soon
- Sandbag Bear Hug Carry — today: Demo coming soon
### trap_bar — 5
- Trap Bar Deadlift — today: Demo coming soon
- Trap Bar Romanian Deadlift — today: Demo coming soon
- Trap Bar Squat — today: Demo coming soon
- Trap Bar Shrug — today: Demo coming soon
- Trap Bar Farmer's Carry — today: Demo coming soon
### ez_bar — 7
- EZ-Bar Curl — today: legacy CC image
- EZ-Bar Preacher Curl — today: Demo coming soon
- EZ-Bar Reverse Curl — today: Demo coming soon
- EZ-Bar Skull Crusher — today: Demo coming soon
- EZ-Bar Overhead Triceps Extension — today: Demo coming soon
- EZ-Bar Upright Row — today: Demo coming soon
- EZ-Bar Bent-Over Row — today: Demo coming soon
### dip — 4
- Parallel-Bar Dip — today: legacy CC image
- Assisted Parallel-Bar Dip — today: Demo coming soon
- Weighted Parallel-Bar Dip — today: Demo coming soon
- Parallel-Bar Leg Raise — today: Demo coming soon
### lat_machine — 4 (1 also listed earlier)
- Machine Lat Pulldown — today: legacy CC image
- Wide-Grip Lat Pulldown — today: Demo coming soon
- Close-Grip Lat Pulldown — today: Demo coming soon
- Straight-Arm Lat Pulldown — today: Demo coming soon
### leg_press — 3
- Machine Leg Press — today: Demo coming soon
- Single-Leg Machine Leg Press — today: Demo coming soon
- Leg Press Calf Raise — today: Demo coming soon
### leg_machine — 2
- Seated Machine Leg Curl — today: Demo coming soon
- Lying Machine Leg Curl — today: Demo coming soon
### calf_machine — 2 (1 also listed earlier)
- Machine Calf Raise — today: Demo coming soon
- Seated Machine Calf Raise — today: Demo coming soon
### hip_thrust_machine — 1 (1 also listed earlier)
- Machine Hip Thrust — today: Demo coming soon
### assist_machine — 2 (1 also listed earlier)
- Assisted Pull-Up — today: Demo coming soon
- Assisted Parallel-Bar Dip — today: Demo coming soon
### mini_band — 3
- Banded Glute Bridge — today: Demo coming soon
- Lateral Band Walk — today: Demo coming soon
- Banded Clamshell — today: Demo coming soon
### ghd — 3
- Glute-Ham Raise — today: Demo coming soon
- Back Extension — today: Demo coming soon
- GHD Sit-Up — today: Demo coming soon
### box — 3
- Box Step-Up — today: Demo coming soon
- Bulgarian Split Squat — today: Demo coming soon
- Box Squat — today: Demo coming soon
### parallettes — 3
- Parallette Push-Up — today: Demo coming soon
- Parallette Pike Push-Up — today: Demo coming soon
- Parallette L-Sit — today: Demo coming soon
### dip_belt — 2 (1 also listed earlier)
- Weighted Pull-Up — today: Demo coming soon
- Weighted Parallel-Bar Dip — today: Demo coming soon
### plates — 3
- Plate Goblet Squat — today: Demo coming soon
- Plate Overhead Press — today: Demo coming soon
- Plate Russian Twist — today: Demo coming soon
### slam_ball — 2
- Medicine Ball Slam — today: Demo coming soon
- Slam Ball Russian Twist — today: Demo coming soon
### weight_vest — 4
- Weighted Vest Push-Up — today: Demo coming soon
- Weighted Vest Pull-Up — today: Demo coming soon
- Weighted Vest Squat — today: Demo coming soon
- Weighted Vest Plank — today: Demo coming soon
