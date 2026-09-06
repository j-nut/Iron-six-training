# Exercise illustration provenance

The PNG images in `assets/exercises/` are unchanged Everkinetic illustrations by Greg Priday, redistributed from https://github.com/everkinetic/data at revision `446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6` under Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Original files are in `src/images-web/`. Each catalogue record retains the original filename, source link, author and license. The UI displays attribution beside each guide. No endorsement is implied. Adaptations of these images must retain attribution and use the same license. App code is separate from the image collection.

`exercise-media-catalog.js` is the exact-name mapping used by both browser and equipment API. Pause and tempo aliases show the same movement with an explicit tempo note. Supersets resolve each component independently. Images are served locally with the app; no runtime image search, third-party hotlink, or generated drawing is used.

## Coverage limitation

This release provides sourced images for the mapped exercises only. Existing unillustrated exercises remain available with an explicit missing-image message and a demonstration search link. In particular, the source collection does not cover all landmine, band, bodyweight, kettlebell, and suspension variations in the app. These are not silently given a similar-looking exercise's image. Saved workouts are preserved.

New equipment generation can only add curated movements that also have an approved image mapping. Groq ranks these candidates; output outside that list is rejected. Equipment without an illustrated candidate remains saved and the user sees an explanation.

To extend coverage, obtain a compatible licensed image of the exact movement, inspect the equipment and positions, add its assets and attribution to the catalogue, then add the vetted equipment candidate. Do not add arbitrary URLs supplied by an AI response. Full image coverage of the existing workout catalogue is still outstanding.
