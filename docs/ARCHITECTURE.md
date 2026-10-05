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
  src/layout.js            bricks, masonry columns, arch silhouette, canvas size
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
4. Bricks flow into equal-width columns, shortest column first.
5. Columns are reordered into an **arch**: tallest in the middle, shortest at the
   outer edges.
6. Every column is shifted so its vertical midpoint sits on one shared axis.
7. Frames keep the photo's own aspect ratio; nothing is ever cropped. Caption
   height is reserved per frame, so a caption never overlaps the photo below.

Auto column count (`layout.cols: 0`) searches a few counts either side of the
square root of the brick count and keeps the canvas closest to square.

**Determinism is a contract, not an accident.** Given the same photos and config,
the output tree is byte-identical: ordering comes from a hash, the column search
is exhaustive over a fixed range, and nothing reads the clock (the sitemap
deliberately carries no `<lastmod>`). It is *not* additive-stable: adding one
photo may re-lay the whole wall, because pair and column decisions are global.

## The browser engine

`src/assets/engine.js` is a small imperative engine, not a framework:

- The layout is inlined as `POS`, so frames are placed instantly; there is no
  measure-then-place pass and no layout thrash.
- Only visible frames are rendered (culling by viewport rectangle).
- Pan is a `translate` on one world element; pinch, wheel, `+`/`-`, double-tap and
  the fit button share one zoom path with a clamp.
- Each photo gets a 24px blurred placeholder inlined as a data URI, so a frame
  shows a soft preview while the real image decodes.

Two constraints are load-bearing and are asserted by tests:

- **No `will-change` and no 3D transforms.** Promoting a few hundred frames made
  iOS build one giant GPU layer and killed the tab (a `JetsamEvent` memory kill).
- **One image tier.** Earlier experiments with `srcset` tiers made memory worse on
  iOS below 200% zoom, so the wall ships a single served copy.

Changing anything in the rendering path needs a test on a real phone, one change
at a time, with a measured improvement. That is why the assets are emitted
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
- **The chrome rides in the engine's script block.** The credit line and the
  photographer card are page furniture, so they live in their own asset
  (`ui.js`) and their own data object, but they are emitted inside the same
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

## Tests

`npm test` runs node's own runner over `test/`, no framework and no browser:

| File | Contract |
| --- | --- |
| `config.test.js` | defaults, merge order, unknown keys, env typing, range checks, the outDir guards, the configs this repo ships |
| `images.test.js` | header parsing (JPEG/PNG/GIF), EXIF extraction, metadata stripping on publish, GIF to PNG, scan reporting |
| `layout.test.js` | determinism, no overlapping frames, symmetric margin, single photo centering, empty wall, `-x`, pairing, column bounds |
| `page.test.js` | assets emitted byte for byte (engine and chrome separately), escaping, instance metadata, the chrome's icons, no-JS fallback, the iOS constraints |
| `build.test.js` | end-to-end build, furniture, captions, byte-identical rebuild of the whole tree, publish failure aborts, guards, `--check` |

`scripts/check-build.js` covers what a unit test cannot see cheaply: it reads the
built page, verifies every referenced photo exists, that frames do not overlap,
that the margin matches the config, that the inlined engine compiles and the
inline CSS defines every `var()` it uses.
