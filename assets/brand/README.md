# Brand assets

`source/iron-six-logo-sheet.png` is the master artwork as supplied. Everything else here is
derived from it, so regenerate from the sheet rather than editing a derivative.

| File | Use |
| --- | --- |
| `logo-horizontal.png` | App topbar and the landing page header. Mark plus wordmark. |
| `logo-stacked.png` | Landing hero and social preview. Mark above wordmark. |
| `mark.png` | The VI mark alone, for tight spaces. |
| `icon-16/32/48/64/180/192/512.png` | Favicon, Apple touch icon, PWA and launcher icons. |

The three PNG lockups have transparent backgrounds. The sheet is light artwork on a near-black
ground, so alpha comes from each pixel's distance to that ground rather than a hard key, which
keeps the metallic gradients. Two rules matter if these are ever regenerated:

- **Detect regions at the same threshold used to cut them.** Measured background noise in the
  sheet peaks at 6.2, so the floor is 9. An earlier version detected regions at 26 and cut at 34:
  the thin `I` of IRON never registered as content, so the stacked lockup was cropped 25px to its
  right and shipped with the letter sliced off.
- **Leave a margin.** Artwork trimmed flush to its own bounding box reads as clipped once it is
  scaled, and antialiasing at the boundary makes edge strokes look thin.

The icons are deliberately **not** transparent: they sit on an opaque rounded tile, because a
transparent icon looks broken on a launcher.

## Accent colour

The mark's green is `#2ee580`. The app's `--accent` matches it. If the logo ever changes, both
that variable in `style.css` and the `rgba(46,229,128,…)` tints across the JS modules move
together — they were `#9ddf68` / `rgba(157,223,104,…)` before the logo arrived.
