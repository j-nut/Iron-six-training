# Iron Six illustration asset handoff

The approved replacement illustration library is complete: **85 / 85 canonical exercises**.

## Asset archives

Two zipped WebP packs are preserved in the project owner's Google Drive:

- **Higher-quality pack (recommended for integration):** https://drive.google.com/file/d/1qwKt27zxF--0XR6gmFQu2eWPCLM8YLEx/view?usp=drivesdk
  - 85 canonical exercise images
  - optimized WebP assets, max dimension ~960 px
  - includes `manifest.json` mapping canonical exercise names to filenames
- **Smaller fallback pack:** https://drive.google.com/file/d/1vfx2ny_JivSG867M8rKYcw5VcT7ej19K/view?usp=drivesdk
  - 85 canonical exercise images
  - optimized WebP assets, max dimension ~720 px
  - includes `manifest.json`

The final approved **Isometric Lat Press** is the version labeled **SET / PRESS DOWN / HOLD-SQUEEZE**.

## Integration instructions

1. Use `exercise-registry.js` as the canonical source of exercise names and existing `mediaId` values.
2. Do not rename exercises or change equipment definitions.
3. Copy each approved asset into the first-party exercise-media location used by the app.
4. Map each image to the existing canonical `mediaId`; do not invent new movements.
5. Replace the schematic/legacy visual for the same movement where appropriate.
6. Mark the corresponding first-party media record `approved` rather than `schematic`.
7. Run `node tools/exercise-audit.mjs` and the full test suite.
8. Fix any resolver/coverage mismatch until all 85 canonical exercises resolve to their intended new illustration.
9. Commit and deploy to Vercel.

Do **not** use rejected collage images, random machine/cable variants, or any non-canonical exercise artwork.

The progress tracker is `reports/new-illustration-progress.md` and is complete at 85/85.
