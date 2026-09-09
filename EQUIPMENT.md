# Equipment and dynamic exercise expansion

How a profile's available equipment is chosen, stored, and turned into exercises.

## The pieces

| File | Role |
| --- | --- |
| `equipment-catalog.js` | The catalogue of equipment users can pick from, plus alias matching. Shared by client and API. |
| `equipment-exercise-library.js` | Which movements each equipment *family* can introduce, and into which movement slot. Shared by client and API. |
| `equipment-coverage.js` | Deterministic analysis: what can this profile actually train, and what is missing. |
| `equipment-manager.js` | The picker UI. |
| `api/equipment-exercises.js` | Server-side generation. Bounded by the two shared files above. |
| `core.js` | `exerciseAvailable`, `generatedOptionsForSlot`, `choose` — where equipment actually changes the workout. |

## Storage

Two shapes, for backwards compatibility:

- **`user.equipment`** — the nine original boolean flags (`dumbbells`, `barbell`, `landmine`, `rack`, `bench`, `pullup`, `bands`, `abwheel`, `medball`). The workout builders reference these directly via `requires: ['barbell','rack']`, so the keys are frozen.
- **`user.customEquipment`** — an array of display names, capped at 16. Everything else lives here. Generated exercises reference it via `requiresCustom: ['Kettlebells']`.

`user.program.generatedExercises` holds what the API returned (capped at 80). It is pruned whenever equipment changes, so an exercise can never outlive the gear it needs.

## Name matching

Users type free text, so the catalogue owns resolution. `catalog.match(name)` tries, in order:

1. exact match on the canonical name, the item id, or any alias;
2. a **word-boundary** containment scan, longest match wins.

The boundary requirement is what stops "band" matching inside "sandbag". `"Bowflex adjustable kettlebells"`, `"kb"` and a tapped **Kettlebells** chip all resolve to the same item, and therefore to the same exercise list. An unrecognised name is still saved — it just adds no movements, and the UI says so instead of pretending.

## What the AI can and cannot do

The generator is **selection, not invention.**

- Groq is handed `illustratedCandidates`, drawn from `equipment-exercise-library.js` for the families the supplied equipment resolves to. It picks and orders; it cannot add.
- `validatedExercises` re-checks every returned row against that same allowlist. A name/slot pair that is not in the library is dropped, so a movement cannot be invented and a curl cannot be relabelled as a squat.
- Sets, reps, prescriptions, priority and muscle mapping come from the deterministic `SLOTS` table, never from the model.
- Equipment names are untrusted input and are treated as data. `tests/equipment-media.test.js` asserts each of these.
- With no `GROQ_API_KEY`, the endpoint returns the full curated list. The feature degrades to "no ordering help", not "broken".

## Illustrations are not a gate

An earlier version required `media.has(name)` for every generated exercise. That predated the six-tier media resolver and silently killed the feature: five of the nine equipment families had no illustrated movements at all, so adding a kettlebell added **zero** exercises while reporting success.

Media is now a *ranking* signal. Illustrated movements sort first and carry `illustrated: true`; unillustrated ones are still returned and resolve through the app's own labelled "demo coming soon" tier. Withholding a real training option to hide a missing picture costs the user more than it saves.

## Coverage analysis

`IronSixEquipmentCoverage.analyze(user)` runs every workout builder across all three variants against the profile's real equipment and counts how many options survive `exerciseAvailable`, including generated ones. Nothing is estimated.

Each slot is graded:

| Severity | Meaning |
| --- | --- |
| `empty` | no option at all — the builder falls through to whatever it lists last |
| `thin` | exactly one option, so there is no variation and no swap |
| `unloaded` | options exist but none use equipment |

`score` is 0–100 (empty slots cost full, thin slots half). Gaps carry `suggestions`: catalogue items that would genuinely fill *that* slot, excluding anything the profile already owns — by family, so owning gymnastic rings does not produce a recommendation to buy a TRX.

The analysis runs against a **copy** of the profile. Building a workout writes a selection cache, and inspecting coverage must never change which exercise the user is about to be shown. `tests/equipment-coverage.test.js` asserts this.

## Selection: equipment has to actually win

`choose()` in `core.js` ranks a slot's pool by `exerciseRecentPenalty + listIndex*1.5 + groqPenalty + fallbackPenalty`.

`fallbackPenalty` (+24) applies to an option requiring no equipment **when the pool contains one that does**. Without it, adding a lat pulldown machine only added a swap option while the workout still opened with a prone lat pull. Recency penalties reach 120, so variety still outranks this — the preference decides ties, it does not freeze the plan.

## Adding equipment to the catalogue

1. Add the item to `equipment-catalog.js` with a `category`, generous `aliases`, and a `family` (or `family: null` plus `conditioning: true` for cardio and recovery gear, which is recorded but adds no strength work).
2. Add that family's movements to `equipment-exercise-library.js`. Every `base` must be a key in the `SLOTS` table in `api/equipment-exercises.js`.
3. Only file a movement under a slot whose pattern it actually trains. A leg extension is not "Squat volume" — leave the slot empty rather than mis-file it.
4. Run `npm test`. `equipment-media.test.js` fails on an unknown slot name, on a family with no exercises, and on an exercise list nothing in the catalogue can reach.
