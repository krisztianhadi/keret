# Architecture

Keret is one build step and one page. `node gen.js` reads a folder of
photographs, writes an output folder, and exits; the output is plain static
files. Nothing runs at request time.

## Data flow

```
gen.js                     CLI: argv, config, guards, orchestration
  src/config.js            defaults, wall.config.json, WALL_* env, validation, outDir guards
  src/setup.js             the first-run wizard: the questions, and the files it writes
  src/images.js            header parsing (size + EXIF), sharp re-encoding, placeholders
  src/layout.js            bricks, masonry columns, silhouette, canvas size
  src/page.js              the HTML document from src/assets/* + the wall data
  src/stamp.js             the source hash stamped into the page
  src/assets/head.html     the page head template
  src/assets/body.html     the static markup (stage, header, hint, controls)
  src/assets/page.css      the stylesheet, verbatim
  src/assets/engine.js     the browser engine, verbatim, with the wall data substituted
  src/assets/ui.js         the page chrome: the credit line and the photographer card
scripts/serve.js           a zero-dependency static server for local preview
scripts/check-build.js     structural check of a built directory, no browser
scripts/check-stamp.js     is this build still in sync with the source?
scripts/seed-placeholders.js  deterministic sample images (fixtures, and a wall with something on it)
scripts/make-banner.js    the README and social images, drawn from one capture of the demo wall
src/assets/fonts/         Geist Mono and Geist Sans, variable, weight 100-900 (SIL OFL 1.1)
web/                      the browser build: the same modules, in a tab (below)
web/build.mjs             bakes src/*.js + the assets + the fonts into web/vendor/keret-core.js
web/keret-runtime.js      a vfs, a Buffer, a posix path and a module loader for those modules
web/canvas-sharp.js       the sharp chain, on a canvas
web/app.js                the picker, the build orchestration, the preview, the download
web/zip.js                a store-only zip writer, so the whole site downloads as one file
```

The build order matters:

1. **Config** is loaded and validated (unknown keys are fatal). With a terminal
   attached, the first-run wizard may ask a few questions and write
   `wall.config.json` first; it is skipped entirely without a TTY, with `--yes`,
   or on `--check`.
2. **Paths** are resolved against the current working directory and passed through
   `checkPaths`; a refused path aborts with exit 2 before anything is touched.
3. **Scan.** Each image is described from its own header bytes: dimensions, EXIF
   orientation, capture date, camera, exposure. No image is decoded yet, so this
   is milliseconds even for hundreds of photos, and the layout can be computed
   without writing anything (`--check` stops here).
4. **Layout.** Photos are grouped into bricks and placed in columns (below).
5. **Publish.** Each photo is re-encoded into `<out>/photos/`, and only files that
   were really written stay on the wall. One failure aborts with exit 3 and no
   page is written.
6. **Page.** The wall data, the assets, the page chrome and the metadata are
   assembled into `index.html`, plus `og.jpg`, `apple-touch-icon.png`,
   `robots.txt`, `sitemap.xml`, `.nojekyll` and `CNAME` when applicable.
7. **Stamp.** A hash of the generator sources and the instance config is written
   into the page, so CI can tell a stale build from a fresh one.

## Layout

The wall is **masonry with portrait pairing**. A column slot ("brick") is either
one full-width photo or **two portraits side by side**, sized to fill the same
slot width, so portrait pairs read as one landscape tile instead of towering over
the column rhythm.

1. Photos are ordered by an FNV-1a hash of the filename, so a wall never shows
   name or date clusters. This is the order everything else follows from.
2. Landscapes, `-x`-marked photos and a stable ~30% slice of portraits ("heroes",
   `hash % 10 < heroRate`) become full-width bricks. Extreme 9:16 portraits stay
   paired (`heroMinAspect`).
3. Remaining portraits are paired in that same scrambled order; each pair is
   solved so both photos share one height and together fill the slot.
4. Bricks flow into equal-width columns. How tall each column may get is the
   **silhouette** (`layout.shape`):
   - `circle` (default) caps each column by a circular arc - tallest in the
     middle, nothing at the rim - so the wall reads as a disc;
   - `oval` is the same arc in a phone-proportioned ellipse (`OVAL_ASPECT`,
     0.46:1), which at fit fills a portrait screen instead of floating in it;
   - `arch` equalizes the columns (always feed the shortest) and then sorts them
     tallest-to-middle, the classic rectangle with a soft arch along the edges.
5. Every column is shifted so its vertical midpoint sits on one shared axis. With
   the arc from step 4 that is all a disc needs: the outline falls out of the caps
   plus one shared axis.
6. Frames keep the photo's own aspect ratio; nothing is ever cropped. Caption
   height is reserved per frame, so a caption never overlaps the photo below.

Auto column count (`layout.cols: 0`) searches a few counts either side of the
square root of the brick count for `arch` and keeps the canvas closest to square.
For the shaped silhouettes it is arithmetic instead of a search: a disc of N
columns is as tall as it is wide at *every* N, so what fixes N is how much brick
the arc can hold - too few and it overflows, too many and the rim columns starve
inside a bigger canvas.

**A leaning frame is presentation, not geometry.** `layout.hang: 'wonky'` gives
each frame a small rotation and nudge, and `layout.fixture` hangs a pin or four
bits of tape on it - but neither moves a frame in the wall data, so the overlap and
margin checks in `scripts/check-build.js` still describe what is on screen (the
lean is a couple of degrees into a gutter that is tens of pixels wide). Both come
from a hash of the filename, computed in the engine: a `Math.random()` would make a
rebuild move a wall that is already hung, and the determinism contract is that the
same photos and config produce the same wall. The fixtures are background images,
never masks or filters - a filter per frame is what killed the tab in 0.4.

Whole bricks cannot tile an arc exactly, so a shaped canvas runs a couple of
percent past its nominal aspect (measured: 22280x22708 for a 1000-photo circle,
0.98:1) and the rim is a staircase rather than a smooth curve.

**Determinism is a contract, not an accident.** Given the same photos and config,
the output tree is byte-identical: ordering comes from a hash, the column search
is exhaustive over a fixed range, and nothing reads the clock (the sitemap
deliberately carries no `<lastmod>`). It is *not* additive-stable: adding one
photo may re-lay the whole wall, because pair and column decisions are global.

## The browser engine

`src/assets/engine.js` is a small imperative engine, not a framework:

- The layout is inlined as `POS`, so frames are placed instantly; there is no
  measure-then-place pass and no layout thrash.
- Only visible frames are rendered (culling by viewport rectangle). The cull
  runs on a `requestAnimationFrame` and is triggered by the engine’s own
  gestures, so anything that moves the camera by hand (a script, a screenshot
  harness) has to call `scheduleCull()` afterwards or the frames culled under the
  previous view stay hidden.
- Pan is a `translate` on one world element; pinch, wheel, `+`/`-`, double-tap and
  the fit button share one zoom path with a clamp.
- The smallest zoom is the fit scale (`MIN_SCALE` is only a floor against a
  degenerate transform). It used to be a fixed 0.03, which silently stopped
  being the fit scale once a wall was big enough to fit at a smaller one: past a
  few hundred photos the whole wall could no longer be seen at once. This is
  coupled to `layout.maxCols`: the column cap decides how big the canvas gets,
  and the canvas decides the fit scale, so raising one without the other trades a
  tall strip for a wall that does not fit.
- Each photo gets a 24px blurred placeholder inlined as a data URI, so a frame
  shows a soft preview while the real image decodes.
- Every photo is published at more than one size: the full copy in `photos/`,
  plus one file per rung of `images.tiers` in `photos/<edge>/`. A frame is
  pointed at the smallest rung that covers the pixels it occupies *on screen*.

Three constraints are load-bearing and are asserted by tests:

- **No `will-change` and no 3D transforms.** Promoting a few hundred frames made
  iOS build one giant GPU layer and killed the tab (a `JetsamEvent` memory kill).
- **The rung comes from the frame's on-screen size, never from the viewport.** A
  `srcset`/`sizes` ladder was tried first and made memory worse on iOS below 200%
  zoom, because `sizes` cannot see the world transform: the browser picks the
  large candidate while the frame is small on screen. The engine computes
  `world width x scale x devicePixelRatio` itself. Downgrades apply immediately
  (they are what frees memory); upgrades are trickled (3 per frame while the
  camera moves, 12 once it stops, after a 180 ms quiet window) because a fast
  pinch would otherwise queue a decode for every frame entering the viewport.
  `zoom.lodBudget` caps the decoded pixels on screen; over budget, the frames
  covering the fewest device pixels are softened first.
- **Nothing per frame may carry a `filter`.** A filtered element gets its own
  render surface, and changing the scale repaints every one of them. The blurred
  placeholder therefore stops rendering the moment its photo decodes
  (`.pbox.loaded .pbg { display:none }`). The box shadow was measured and costs
  nothing either way, so it stays.

The measurements behind that (2026-10-12, iPhone 15 Pro Max, 300 photos served at
2048px, a page driving its own zoom-out ramp from 0.30 to fit, one tab at a time,
and a `localStorage` flag that reports a killed tab as `prev=CRASH`):

| build | result |
| --- | --- |
| stock, one 2048 copy per photo | died between 0.11 and 0.08, all 300 full copies requested (3.4 GB of decoded pixels) |
| full copies, shadows and blur off | died in the same band: at that size the wall dies of memory, and the decorations change nothing |
| tier ladder, stock CSS | **died at 0.15 with 18 MB of images on screen** - so not memory |
| tier ladder, box shadow off (blur alive) | died: the shadow is not the cost |
| tier ladder, blurred placeholder off | survived |
| tier ladder, placeholder removed once its photo decoded | **survived all seven steps; 300/300 frames at fit, 13 MB** |

The failure was never "too many photographs" or "too many pixels on screen": it
was a live filter surface per frame. The shipped ladder is the x2 one measured
above (128/256/512/1024); coarser ladders were simulated and peak at 79-124 MB
resident instead of 40 MB, and a rung at or above `images.maxEdge` is dropped
because it would only duplicate the full copy.

Changing anything in the rendering path still needs a test on a real phone, one
change at a time, with a measured improvement. That is why the assets are emitted
verbatim and `test/page.test.js` fails if the build starts transforming them.

## Decisions that are not obvious from the code

- **`sharp` is mandatory.** The alternative to re-encoding is copying the original
  bytes into the output, which would publish EXIF, GPS and embedded thumbnails.
  The build fails instead of silently downgrading; see [SECURITY.md](../SECURITY.md).
- **The GPS IFD is never parsed.** `images.js` reads the tags it needs and
  deliberately skips `0x8825`, so coordinates cannot leak through a log or a
  caption.
- **Two roots.** The generator's own files resolve against the package
  (`PACKAGE_ROOT`), while config, photos and output resolve against the current
  working directory (`ROOT`). That is what lets the tool be installed globally
  while a wall is built next to its photos.
- **Output directory guards.** The build wipes its output, so `checkPaths` refuses
  an output that is the photos folder, contains it, is contained by it, is the
  project root or above, is a filesystem root, or is a non-empty directory with no
  `index.html` (unless `--force`). Do not remove these.
- **Publish-then-page.** The layout is computed first, but the page is only
  written after every photo is confirmed on disk, and any failure aborts the whole
  build. A wall referencing a missing file is worse than a failed build.
- **The wizard never deletes anything.** Clearing the photographer's name
  leaves `author.json` in place and prints a line saying so: a build run is not
  the right place to remove someone's contact card. It also writes only the keys
  it asked about, so improving a default later still reaches existing walls.
- **The chrome rides in the engine's script block.** The credit line, the wall
  description and the photographer card are page furniture, so they live in their
  own asset (`ui.js`) and their own data object, but they are emitted inside the same
  `<script>` as the engine: one script block means one escaping path for the wall
  data and the chrome alike, and `test/page.test.js` splits the block at the
  chrome's opening comment to check each half against its own file.
- **The author card is strict, and it is stamped.** `author.json` rejects unknown
  keys like the config does, because a typo would otherwise ship a half-empty
  card. It is also part of the build stamp, so editing the card marks a committed
  build stale.
- **Alt text while the title is still there.** The author's sidecar title is used
  for alt text and for the caption line before the frame title is replaced by the
  filename.
- **The stamp.** CI cannot rebuild a wall whose photos are not in the repository,
  so it checks the source hash recorded in the page instead, and the demo is
  additionally rebuilt and diffed.

## The browser build

`web/` turns a folder into a wall without installing anything. It is not a second
implementation: `web/build.mjs` embeds `gen.js` and `src/*.js` verbatim as
CommonJS factories, and `web/keret-runtime.js` supplies the surroundings they
expect - an in-memory filesystem, a `Buffer` with the encodings the header parser
uses, a posix `path`, and a `sharp` that draws on a canvas. The app then calls the
same functions the CLI calls, in the same order:

```
File API ──► vfs /photos/*  ──► images.scanPhotos ──► layout.layout ──► page.buildPage
                 │                    │                    │                │
            user's folder      headers, EXIF          geometry        index.html
                 │                    │
                 └── images.writeCopies ──► vfs /out/photos/* ──► zip.js ──► download
```

`test/web.test.js` runs that runtime in node and asserts it scans the demo folder
identically to the CLI, so a broken shim cannot silently change what the build
sees. It also parses `web/app.js` and checks that every function it calls exists
and every id it reaches for is in the page - an edit that eats half a function
leaves a module that reads fine and a page that is dead, which no other test here
would catch.

### Repository layout: one implementation, two front doors

The CLI is the package (root, `bin: gen.js`, one dependency) and `web/` is a
second front door onto the same `src/`. There is no second implementation to keep
in step, which is why a fix to the layout, the header parser or the page lands for
both at once, and why the existing tests cover both. The alternatives were worse:
two repositories would mean vendoring `src/` and fixing everything twice, and npm
workspaces would trade the flat clone-and-run quick start for a layout nobody
needs. `web/` has no dependencies and no build step beyond the generated bundle,
so deploying it is copying the folder to any static host - which, today, is a
Cloudflare Pages project whose root directory is `web/`. Pointed at the repo root,
Pages would install the CLI's `sharp` on every build for a bundle that needs none.
`docs/SETUP.md` carries the exact build command and the post-deploy checks.

### The app's own decisions

- **No stamp.** A browser build carries no source hash: the stamp exists so CI can
  tell a committed `dist/` from a stale one, and there is no commit here. It is the
  one line `scripts/check-build.js` reports on a downloaded zip.
- **The app's version rides in the generated bundle.** The footer says which
  version of the code the page is running, read from `META.version` in
  `web/vendor/keret-core.js`, which `web/build.mjs` stamps from `package.json`.
  Not a hardcoded string (it drifts) and not a fetch (the app has to work opened
  straight off a disk). The bundle's per-file hashes cannot see the version, so
  `test/web.test.js` asserts the stamped version against `package.json` as well:
  a bump that nobody rebuilt fails the suite instead of shipping a footer that
  announces the version before last.
- **Publish before layout.** The CLI lays out first and aborts on the first photo
  it cannot publish; in a tab that would leave a hole where a photo failed. The
  browser publishes first and lays out what really made it, then reports the rest
  as skipped. With nothing failing the two orders produce identical geometry.
- **Originals are released as they are published.** A few hundred photographs must
  not have to fit in memory twice.
- **The zip is deterministic.** Entries are stored, not deflated, and carry a fixed
  timestamp, so building the same folder twice downloads byte-identical files. That
  also means the archive is not compressed beyond what the photos already are.
- **The preview is the real page.** It renders in an iframe without a service
  worker and without touching the page that goes into the zip (the face is inlined
  so the font needs no request either).
- **The preview hooks a seam in the engine, it does not rewrite it.** A tab has no
  server, so the photos it cannot fetch are pointed at object URLs: the engine reads
  every photo url from `window.__keretPhotoSrc` when that is set
  (`src/assets/engine.js`, one function, two forms of path) and `web/app.js` defines
  it. Rewriting the generated script instead - the previous approach, replacing
  `'photos/' + d.file` - matched one literal and silently missed the tier urls the
  engine learned to build later, which is why the preview spent an afternoon showing
  a wall of placeholders over a 404. If the seam ever goes missing the preview says so
  on screen rather than rendering in silence.
- **The settings ride in the zip.** `wall.config.json` and `author.json` are
  written beside `index.html` in the command line's own format, so a downloaded
  wall is rebuildable with `node gen.js` and the same settings. Drop the unzipped
  folder back into the app and it reads them again: the whole config is applied,
  not only the five keys the form shows, and an unknown key still fails loudly.
- **The button picks files; the frame takes folders.** One dialog cannot do both:
  an input with `webkitdirectory` opens a folder chooser and can never select loose
  photographs, and without it a folder is unreachable from the dialog at all. So the
  button opens the file picker — which on iOS falls back to Library / Take Photo /
  Files, the behaviour WebKit bug 271705 forced anyway — and folders arrive by being
  dropped on the frame, where `webkitGetAsEntry` walks them recursively. The drop
  target is the only control that takes both, which is why the empty state says
  "Drop photos or a folder" rather than naming one.
- **A `photos/` folder is the source.** Dropping an unzipped wall brings the site's
  own furniture with it; og.jpg and the touch icon would walk onto the wall as
  photographs. When the drop contains a `photos/` folder, that folder is the wall's
  source and everything beside it is output.
- **The frame changes size rather than jumping, and the words move, not the
  pictures.** Two measurements shaped this: the switch costs one long frame
  (~64ms on a 6x-throttled CPU) with no animation at all, so the cost is laying
  out the new step and not the motion; and the box changing size only *after* the
  thumbnails decoded shoved the frame and everything under it down 146px in one
  step. So the frame is eased between sizes, the content cross-fades over it, and
  transforms are kept off anything holding a photograph - Safari re-rasterizes
  those. Durations live in one `DUR` block in `web/app.js`; `?motion=off` and
  `prefers-reduced-motion` switch all of it off.

Limits accepted for now: the encoder is the browser's, so output is not
byte-identical to `node gen.js` (dimensions are: 105/105 on the demo); Safari
cannot encode WebP from a canvas, so webp input fails with a message naming the
file; the whole wall is held in memory, which is comfortable at a few hundred
photographs and not at a few thousand.

## Tests

`npm test` runs node's own runner over `test/`, no framework and no browser:

| File | Contract |
| --- | --- |
| `config.test.js` | defaults, merge order, unknown keys, env typing, range checks, the outDir guards, the configs this repo ships |
| `images.test.js` | header parsing (JPEG/PNG/GIF), EXIF extraction, metadata stripping on publish, GIF to PNG, scan reporting |
| `layout.test.js` | determinism, no overlapping frames, symmetric margin, single photo centering, empty wall, `-x`, pairing, column bounds |
| `page.test.js` | assets emitted byte for byte (engine and chrome separately), escaping, instance metadata, the chrome's icons, no-JS fallback, the iOS constraints |
| `build.test.js` | end-to-end build, furniture, captions, the author card and its stamp, byte-identical rebuild of the whole tree, publish failure aborts, guards, `--check` |
| `setup.test.js` | the first-run interview: answers that survive config validation, previous answers offered back as defaults, the rejected-email retry, the silent non-TTY path, a cleared photographer leaving the card alone |
| `web.test.js` | the browser runtime scans a folder exactly as the CLI does, the generated bundle still matches `src/`, the zip writer's CRCs and headers |

`scripts/check-build.js` covers what a unit test cannot see cheaply: it reads the
built page, verifies every referenced photo exists, that frames do not overlap,
that the margin matches the config, that the inlined engine compiles and the
inline CSS defines every `var()` it uses.
