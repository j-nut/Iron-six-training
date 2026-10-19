# Landmine illustration replacement review — 2026-09-21

## Scope and decision

User rejected all landmine illustrations for awkward or incorrect execution. Replaced nine named landmine guides plus Meadows Row, the tenth canonical exercise requiring the landmine. Canonical names, equipment definitions and media IDs remain unchanged.

The previous three-pose template was intentionally superseded for this subset: initial replacement drafts still changed bar length across poses. Selected assets use one large pose plus three movement instructions. These are AI-generated illustrations checked visually by the assistant, not trainer-certified demonstrations or measured biomechanical models. Some omit an in-image title; the app supplies the canonical title.

## Exercise review

| Exercise | Selected setup / visible checks |
|---|---|
| Landmine Press | One-arm press matching each-arm prescription; free hand clear; loaded sleeve near working hand; diagonal reach; upright torso. |
| Half-Kneeling Landmine Press | One knee supported, opposite foot planted; single pressing arm; free hand clear; diagonal reach without backward lean. |
| Landmine Squat | Two hands at chest; plate at moving end; hips and knees flexed; heels grounded. |
| Landmine Hack Squat | Faces away from anchor; loaded end supported at shoulder/upper back; sleeve secured by hands; both feet grounded. Original showed an unrelated low-held squat. |
| Landmine Romanian Deadlift | Hips back and high; shallow knee bend; neutral back; arms long; plate beside hands rather than at anchor. |
| Landmine Reverse Lunge | Chest-held sleeve; front foot flat; rear toes planted and knee lowered; instructions specify stepping back and returning. |
| Landmine Row | Two-handed shaft grip behind plate; straddled stance; lowered arms; straight shaft with leg clearance. First row drafts were rejected for apparent hip intersection and a bent shaft. |
| Landmine T-Bar Row | Two-handed neutral-grip attachment surrounding shaft behind plate; straddled hinge stance; lowered arms and visible leg clearance. |
| Meadows Row | One-hand overhand sleeve grip; staggered side-on stance; opposite hand/thigh support; hinged neutral back. |
| Landmine Rotation | Two hands, long arms, wide stance; plate at moving end; fixed anchor ahead; braced torso; controlled side-to-side instructions. |

Checks applied: exact exercise variant, load end versus anchor, continuous shaft, grip/contact, stance and joint position, whole-body visibility, readable instructions. The poses are illustrative, not a substitute for a full moving demonstration. The T-bar guide illustrates the handle variant; the existing equipment definition was not expanded.

## Reference review before generation

- [Eric Cressey — Half-Kneeling 1-arm Landmine Press](https://ericcressey.com/strength-exercise-of-the-week-half-kneeling-1-arm-landmine-press/): unilateral half-kneeling setup and trunk bracing.
- [Roy Pumphrey — Landmine RDL](https://www.roypumphrey.com/landmine-rdl/): hip hinge, high hips, near-vertical shins, neutral spine.
- [Muscle & Strength — Landmine Rotation](https://www.muscleandstrength.com/exercises/landmine-rotation): wide athletic stance, two-hand grip, long arms and controlled torso rotation.
- [Muscle & Strength — Meadows Row](https://www.muscleandstrength.com/exercises/meadows-row): staggered hinge, overhand grip, controlled elbow path.
- [John Rusin — Landmine Exercises](https://drjohnrusin.com/top-10-unconventional-landmine-exercises/): fixed pivot, angled bar path and chest-held squat setup.
- Additional search evidence: Lee Boyce's landmine hack-squat demonstration (https://www.youtube.com/watch?v=9VSQomFgQnM), his hack-squat article, Ben Bruno's squat/reverse-lunge instruction, and Muscle & Strength's T-bar row guide. Their search excerpts were available, but direct pages/videos were not all retrievable. Do not represent them as fully watched demonstrations.

## Assets and reproducibility

- Generator: built-in image_gen, not CLI/API fallback.
- Final generation prompts and row correction: `reports/landmine-illustration-prompts.json`.
- Selected outputs: `assets/exercise-illustrations/*-v2.webp` for these ten exercises; 1200 × 800, WebP quality 88.
- Versioned filenames avoid serving cached incorrect images. Old ten files removed; source-control history preserves them.
- Manifest records include updated dimensions, byte counts, SHA-256, style and review metadata. Registry builder propagates v2 style while preserving v1 for other guides.
- Do not reintroduce the initial multi-pose drafts or the rejected row drafts displayed during generation.

## Validation

- `npm ci --ignore-scripts`: succeeded.
- `npm test`: 409 passed, 0 failed.
- `node tools/build-exercise-registry.mjs`: 85 canonical exercises and 85 approved first-party mappings.
- `node tools/exercise-audit.mjs`: 0 broken frame references; 0 orphan assets. Existing audit also lists 109 unmapped noncanonical equipment-library names; this task does not fill that separate backlog.
- `node scripts/build-web.mjs`: succeeded; 85 first-party images verified and packaged.
- Delivery/preview status recorded in PR and final response; do not infer production deployment merely from these local checks.

