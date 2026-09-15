# Iron Marks — Visual Upgrade Handoff for ChatGPT

**Your job: upgrade every visual in the Iron Marks achievement system.** The logic is done and
tested. Do not change how marks are earned. This document is self-contained.

## 1. Where things are

| Item | Value |
|---|---|
| Repo | https://github.com/j-nut/Iron-six-training |
| Branch | `feature/iron-marks` (branched from `main` at `bed7bd5`) — **work here, not on `main`** |
| Commits so far | `c21a76a` Iron Marks feature · `ec2bd1f` blank-RIR fix |
| Preview (always the newest build of the branch) | https://iron-six-training-git-feature-i-648168-jordman55-3386s-projects.vercel.app/ |
| Production | `main` → https://iron-six-training.vercel.app — **untouched; do not push or merge to main** |
| Tests | `npm test` → 391 / 391 pass on `ec2bd1f` |

Previews sit behind Vercel sign-in. Pushing the branch builds a new preview automatically.
No PR is open yet; the owner decides when to merge.

## 2. What Iron Marks is (context for design)

Achievements calculated from finished workouts in Iron Six's six-session rotation
(Push A → Legs A → Pull A → Push B → Legs B → Pull B).
- **Values:** reward finishing sessions, balance and honest effort logging. No streaks, no
  maxing out, no leaderboards. The tone is quiet, earned and premium, not gamified confetti.
- **24 marks in 5 groups:** The Six · The Forge · Balance · Showing Up · Honest Training.
- **5 avatar ring tiers** from completed rotations:

| Ring | Rotations | Current colour |
|---|---|---|
| Iron | 3 | `#8f969e` |
| Bronze | 6 | `#cd8a4d` |
| Steel | 12 | `#b9c8d8` |
| Gold | 26 | `#f2c14e` |
| Emerald | 52 | `#2ee580` |

- **10 wearable emblems.** Each replaces the user's initials in their profile avatar, inside
  their ring:

| ID | Name | Earned by |
|---|---|---|
| `spark` | Spark | First Rep |
| `hex` | Hex | Full Six |
| `hammer` | Hammer | Momentum |
| `anvil` | Anvil | Forged (all six at Momentum) |
| `crown` | Crown | Full Apex |
| `kettlebell` | Kettlebell | Never Skip Leg Day |
| `compass` | Compass | No Detours |
| `sunrise` | Sunrise | Back at It |
| `gauge` | Gauge | Honest Effort |
| `sixsix` | Sixty-Six | 66 sessions (hidden until earned) |

- **Marks without an emblem** currently use a generic medal icon; ring marks use a ring icon.

## 3. Current visuals (what to replace) — all in `iron-marks.js`

The current art was hand-coded as placeholders: simple 24×24 stroke SVG paths, a flat
box-shadow ring and basic cards. It works, but it is not designer quality. The hammer and anvil
are especially rough.

| Surface | Where in code | What it shows |
|---|---|---|
| Emblem icons | `ICONS` map + `icon(id, size)` near the top of `iron-marks.js` | inline SVG, `stroke="currentColor"`; also `medal` and `ring` generics |
| Avatar ring and emblem | `paintAvatar()`; CSS `.pm-avatar.im-ringed` and `.im-avatar.im-ringed` using `--im-ring` | topbar avatar is 30 px (emblem drawn at 17 px); modal avatar is 54 px (26 px) |
| Trophy case modal | `open()`; CSS `.im-modal`, `.im-head`, `.im-section`, `.im-emblems`, `.im-emblem`, `.im-grid`, `.im-card`, `.im-badge`, `.im-bar` | header avatar, ring progress, emblem picker, "Closest next", five groups of mark cards |
| Mark cards | `markCard()` | earned (accent badge, "Earned {date}") vs locked (muted, progress bar, `value / target`) vs hidden ("Hidden mark") |
| "Iron Mark earned" celebration | `celebrate()`; bottom sheet on phones | avatar, earned mark cards, "Wear the … emblem", "See all marks", "Nice" |
| Profile menu entry | `profile-menu.js`: `data-action="marks"` item "Iron Marks 7 / 24" | text only |

All styles are injected by `injectStyles()` (`<style id="ironMarksStyles">`). The ring colours
live in `RINGS` in `iron-marks-engine.js`; the colour values may change, but not the IDs or
rotation counts.

## 4. Design system you must fit

- **Dark theme tokens** (`style.css :root`):
  - `--bg #0b0c0f`, `--surface #12141a`, `--surface2 #191c24`, `--line #292d38`
  - `--text #f7f8fa`, `--muted #a4aab8`, `--danger #ff8b8b`, `--radius 18px`
- **Accent is per profile** (`accent-theme.js`): green, blue, cyan, purple, orange or red.
  - Use `var(--accent)` and `rgba(var(--accent-rgb), a)` for accent UI. Never hard-code the
    accent green.
  - **Ring metals are deliberately fixed** and must look good against every accent. The avatar
    background is the accent colour.
- **Font:** Inter, then system UI.
- **Polish layer** (`premium-ui.css`): subtle edge light and depth, "never glossy"; easing
  `--premium-ease: cubic-bezier(.22,.8,.22,1)`; motion is restrained and disabled under
  `prefers-reduced-motion`. Match this.
- **Brand:** `assets/brand/` (Iron Six logo and icons). The exercise illustrations in
  `assets/exercise-illustrations/*.webp` are the house illustration style.
- **Guest avatar** (not signed in): `.pm-avatar.guest` has a dark background and a muted
  foreground, so emblems must read in both the accent and the guest states.

## 5. What to deliver

1. **An emblem set of 10, plus generics for marks without an emblem.**
   - A cohesive family that echoes the hexagon in the Iron Six logo.
   - It must read at **17 px** (topbar avatar) and look rich at 38–54 px (cards, modal header).
   - Consider two levels of detail: a simple glyph for small sizes and a detailed badge for
     large ones.
2. **Ring tiers.** A real metal feel per tier (for example a subtle conic or linear gradient
   and edge highlight) that is clearly distinct at 30 px. Emerald should feel like the peak tier.
3. **Mark cards:** clear earned, locked and hidden states. Locked should look intentionally
   dormant (silhouette or desaturated), not broken. Keep the progress bars legible.
4. **Trophy case layout polish:** hierarchy, spacing and the emblem picker (selected, owned and
   locked states); it must be comfortable at 375×812.
5. **Celebration moment:** a tasteful reveal (for example the emblem settling into its ring)
   of at most about 600 ms, no confetti spam, and a static version under `prefers-reduced-motion`.
6. **Optional:** a small ring-tier indicator in the profile menu entry.

### Format guidance
- **Inline SVG strings** in `ICONS` are simplest: no build changes, instant theming via
  `currentColor`.
- **SVG or WebP files** are also fine, but:
  - `scripts/build-web.mjs` copies only specific asset folders (exercise images, illustrations
    via a checksum manifest, and `assets/brand`). A new folder such as `assets/iron-marks/` must
    be added there, ideally with a checksummed `manifest.json` like `assets/exercise-illustrations/`.
  - The Android build (`scripts/build-android-web.mjs`) copies all of `assets/`.
  - Keep total added weight small (roughly under 150 KB), and don't load remote images or fonts.
- If an emblem becomes an `<img>` instead of `<svg>`, update the test in
  `tests/iron-marks.test.js` that asserts `#pmAvatar svg`, keeping the same intent
  ("the avatar shows the emblem").

## 6. Hard constraints (do not break)

1. **Do not change the logic or the IDs.** `iron-marks-engine.js` rules, the mark IDs, emblem IDs
   (`spark` … `sixsix`) and ring IDs are stored in synced user profiles
   (`trainerMemory.achievements.emblem` / `seen`). Renaming an ID breaks worn emblems and
   re-triggers celebrations.
2. **Keep these DOM hooks, which tests use:**
   - `#ironMarksModal`, `#ironMarksEarned`, `#pmAvatar`
   - `[data-wear="<emblem id>"]` (and `data-wear=""` for Initials), `[data-done]`, `[data-all]`
   - the `data-action="marks"` menu item
   - the text "Iron Mark earned", mark titles in the cards, "Hidden mark", and the group titles
3. **No DOM observers (MutationObserver) and no per-frame work.** A DOM observer previously froze
   the workout screen on real phones. The avatar is repainted by the profile menu every 1.5 s, so
   painting must stay cheap and idempotent (no layout thrash, no flicker, no restarting
   animations on every repaint).
4. **Never animate the avatar continuously.** Only animate on the celebration, once.
5. **Accessibility:**
   - Text contrast of at least 4.5:1 on dark surfaces.
   - Locked or disabled states must not rely on colour alone.
   - Decorative SVGs keep `aria-hidden="true"`, and the dialogs keep `role="dialog"` with labels.
   - Escape and backdrop click close the dialogs.
6. **Mobile first:** verify at 375×812. The modal is a bottom sheet on phones and centred at
   640 px or wider.
7. **Scope:** change only Iron Marks visuals (`iron-marks.js`, the `RINGS` colours, optional new
   assets, the build asset copy, and a small menu tweak in `profile-menu.js`). Don't touch
   workout, auth, sync or camera code.

## 7. How to see and test it

```bash
npm ci
npm test
node scripts/build-web.mjs
node scripts/build-android-web.mjs
```

For a local preview, serve the repo root statically (for example
`python -m http.server 5178`) and open http://localhost:5178 at 375×812. `/api` calls fail
locally; that is expected.

To seed a history that shows the celebration, the Iron ring and several emblems, paste this in
the browser console on the Today screen:

```js
const R=IronSixMarksEngine.ROTATION,now=Date.now(),D=864e5;
const mk=(k,ts)=>({ts,workoutKey:k,name:WORKOUT_META[k].name,sets:12,plannedSets:12,readiness:{energy:4,soreness:1},
  details:[{name:'Lift',sets:Array.from({length:12},()=>({weight:'100',reps:'8',rir:'2',done:true}))}]});
const u=activeUser();const h=[];let t=now-40*D;for(let i=0;i<17;i++){h.push(mk(R[i%6],t));t+=2*D}
u.history=[...h].reverse();u.today={};
u.trainerMemory={...(u.trainerMemory||{}),achievements:{introduced:true,seen:IronSixMarksEngine.evaluate(u).marks.filter(m=>m.unlocked).map(m=>m.id)}};
u.history.unshift(mk('pull_b',now-60000));saveData();IronSixMarks.check(); // shows "Iron Mark earned" (Iron Ring)
// IronSixMarks.open() opens the trophy case. For later tiers, raise the loop count (36 sessions = 6 rotations = Bronze; 312 = Emerald).
// Clean up afterwards: localStorage.clear()
```

To check every tier and emblem quickly, temporarily call `IronSixMarks.wear('<id>')` after
seeding enough history (for example 66 or more sessions for `sixsix`), and screenshot each ring
at 30 px and 54 px against all six accent themes (Profile menu → Appearance).

## 8. Acceptance checklist

- [ ] The 10 emblems and generics are cohesive, legible at 17 px and polished at 38–54 px.
- [ ] The 5 ring tiers are distinct, look like metal, and work on all 6 accent colours and on the guest avatar.
- [ ] Earned, locked and hidden cards are clearly different without relying on colour alone.
- [ ] The trophy case and celebration look finished at 375×812 and at desktop width.
- [ ] The celebration animates once, stays under ~600 ms, and is static with reduced motion.
- [ ] The topbar avatar doesn't flicker or re-animate during its 1.5 s repaint.
- [ ] `npm test` passes; the web and Android builds succeed and include any new assets.
- [ ] No engine, ID or storage changes; no new network requests.
- [ ] Push to `feature/iron-marks`, confirm the Vercel preview is Ready, and report before and
  after screenshots with the preview URL. Don't merge.

## 9. Background you may need

- **Why marks are trustworthy:** everything is recalculated from finished history, and a session
  counts only if about 72% or more of its planned sets were done at a sensible effort. Duplicates
  are ignored; no counters are stored.
- **When celebrations appear:**
  - once per mark, after the session that earned it (within 12 hours), never mid-workout;
  - existing users get a single quiet toast on first run;
  - marks arriving through sync or a restore are recorded silently.
- **Two bugs fixed on this branch:**
  1. The post-workout trainer review used to replace `trainerMemory` wholesale, erasing the
     synced accent theme; it now keeps `appearance` and `achievements`.
  2. A blank RIR was read as RIR 0 in `successfulExposure`, so sets logged without RIR counted
     as sets taken to failure; it is now treated as not logged.
- **Unrelated open work:** branch `ui/today-launch-polish` (Today launch-screen copy and
  compaction) was never merged and predates later Today screen changes. Ignore it for this task.
