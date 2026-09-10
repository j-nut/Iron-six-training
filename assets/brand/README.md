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
ground, so alpha was taken from each pixel's distance to that ground with a noise floor — a hard
key left a grey haze across the whole rectangle, which showed as a faint block on the app's
background. The icons are deliberately **not** transparent: they sit on an opaque rounded tile,
because a transparent icon looks broken on a launcher.

## Accent colour

The mark's green is `#2ee580`. The app's `--accent` matches it. If the logo ever changes, both
that variable in `style.css` and the `rgba(46,229,128,…)` tints across the JS modules move
together — they were `#9ddf68` / `rgba(157,223,104,…)` before the logo arrived.
