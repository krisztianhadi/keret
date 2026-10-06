# Changelog

Reverse-chronological. One dated section per work block, entries tagged
`[Feature]`, `[Fix]` or `[Break]`.

## 2026-10-05 - Keret 0.1.0, extracted as a standalone tool

The engine that built a personal photo wall becomes a general tool with its own
repository, license and demo wall. Newest first.

`[Feature]` **The generated social card carries the wall.** The photograph is
darkened and captioned in the page's own type: the title in uppercase and
letterspaced, `by <photographer>` when `author.json` names someone other than
the title, and the number of photographs on its own line. A shared link now looks
like the wall rather than an anonymous photograph. Long titles wrap to two lines
and ellipsise past that. SVG text needs fontconfig, which has no cache to write in
a container, so the card points it at the temp area first and the build stays
quiet.

`[Fix]` **The default social card is the photo that fits it.** The picker took
the widest landscape on the wall, which is the worst choice for a 1200x630
cover crop: on the demo it chose a 3.97:1 panorama, threw away 52% of it and
enlarged the rest 2.5x, so every shared link showed a soft card. It now scores
every photo for crop loss and enlargement and takes the best fit - the demo
switches to a 1.79:1 frame at 1.2x with 6% cropped.

`[Fix]` **The hint sits in the chrome band.** It floated about 50px above the
bottom edge while the credit line and the controls sat on it, so the three read as
unrelated pieces, and on a phone-width window it wrapped onto the controls. It
now shares their line, their pill, their border and their blur, and it steps
aside under 840px or on a coarse pointer, where there is no room for it beside
the controls.

`[Fix]` **A wide strip instead of a tall card.** The README header was 1400x735,
which sat under the badges and took a third of the first screen. It is 1600x640
now, and `npm run banner` also writes `docs/assets/social-preview.jpg` at
1200x630 - the size a social card is rendered at - so the repository's social
preview can use the mark without being cropped. The frame scales with the canvas,
so both carry it at the same weight.

`[Feature]` **Geist, and a choice of face.** The wall is set in Geist Mono or
Geist Sans, and the choice is one config key (`font: "mono"`, the default, or
`"sans"`). Both faces are variable (weight 100-900, one file each) and are copied
into `dist/fonts/` with their OFL licence, so the type is served from the wall's
own domain: no font CDN, no third-party request, and the page still renders with
the shipped face offline. The generated social card and the README images use the
same face through fontconfig, pointed at the vendored files, rather than whatever
the machine happens to have installed.

`[Feature]` **README images, drawn not screenshotted by hand.**
`npm run banner` renders two files from one capture of the demo wall: the title
card (the wall dimmed, the frame and the wordmark over it, the mark the favicon
and the social card already use) and the wall inside a browser window with a drop
shadow, on a transparent background so it sits on any theme. 334 kB for both,
drawn with sharp, so a new capture means one command rather than another session
in an image editor.

`[Feature]` **A first-run wizard.** On a terminal, a wall with no
`wall.config.json` is asked a few questions (title, description, site URL,
photographer name, email, website) and the answers are written to
`wall.config.json` and `author.json`. Every later run asks whether to keep the
current setup and, if not, shows each previous answer as the default. It is
skipped without a TTY, with `--yes`/`-y`, or on `--check`; `--setup` asks again on
purpose. The config it writes holds only the answered keys, and clearing the name
leaves an existing card alone rather than deleting it.

`[Feature]` **A credit line and a photographer card.** The page carries a small
"Powered by Keret" box in the bottom left corner (`credit`, `null` to hide it)
and, when `author.json` exists in the working directory, an Author button in the
top right corner that opens a card with the photographer's name, role, bio,
email, phone, location and links. The card is written into the page as data and
rendered with `textContent`, so a bio with markup cannot execute. Unknown keys in
the card fail the build, and the card is part of the build stamp. Both pieces of
chrome ride in the engine's script block, so the page keeps one inline script and
one escaping path.

`[Feature]` **The fit control wears Lucide's `locate` mark**, replacing the stray
copyright glyph (`&copy;`) that had been standing in for it, and the author
button wears `square-user`. Both are inline SVG, so the page still fetches
nothing.

`[Fix]` **Three demo photographs were removed.** A closer look at the published
wall found people in three of them: walkers on the footbridge in the flood
picture, two figures down the Marbella street, and visitors on the path at
Portland Head lighthouse. Everything else was re-checked at a larger size than
the original contact sheets, and the risky subjects (bridges, streets,
lighthouses, coasts, buildings) were checked again a tile at a time.

`[Feature]` **The demo wall is EXIF-only, 105 photographs.** Every frame is a
Wikimedia Commons original, CC0 1.0 or public domain, committed at demo size
(1000px, quality 76, about 12 MB in total) and resized with `keepExif()`, so the
date, exposure and camera on each frame are read out of the file itself. A
photograph whose capture data exists only in XMP or IPTC is skipped: the demo has
to show what the reader can actually read. What the build publishes still carries
nothing: the served copies are re-encoded without metadata. Authors, licenses and
a source link for every file are in [demo/CREDITS.md](../demo/CREDITS.md), and the
README carries the author roster. The first pass shipped 24 stock photographs
whose libraries strip metadata in every size; those could only ever show a written
caption, so they were replaced.

`[Feature]` **Keret is a package, not a site.** `node gen.js` now builds the wall
in the **current working directory** instead of the directory the script lives
in, so the tool can be a global `keret` bin (or a checkout anywhere) while each
wall keeps its own photos, config and output. The generator's own assets still
resolve against the package.

`[Feature]` **The favicon is configuration.** `favicon.bg` and `favicon.dot` drive
the inline SVG mark, the 64x64 page icon and the apple-touch icon. Colors are
validated as hex, because they are interpolated into an SVG data URI.

`[Feature]` **The captions sidecar works, and captions survive missing EXIF.**
`captions.file` is now a real config key (it was read but unreachable, so a
sidecar could never be configured). When a photo carries no exposure data the
author's title takes the exposure line, and the sidecar `credit` takes the camera
line, which is what a wall of stock photos, scans or exports needs.

`[Feature]` **MIT license**, replacing the AGPL-3.0-only license of the original
instance repository. Community files, issue templates and the PR checklist follow
the new layout.

`[Fix]` **Alt text reaches the page.** The engine set every `img.alt` from the
filename and ignored the alt text the build worked out. It now uses the author's
sidecar text (or the facts about the shot), falling back to the readable
filename.

`[Fix]` **Alt text is built before the frame title is replaced** by the filename,
so a sidecar title no longer turns into `DSC0123.JPG` for screen readers.

`[Fix]` **`wall.config.example.json` is valid.** It documented six keys the
generator rejects (`favicon`, `captions.file`, `captions.showFilename`,
`images.smallEdge`, `zoom.openDesktop`, `zoom.openTouch`), so copying it failed on
the first run. A test now loads both configs this repository ships.

`[Fix]` **The sitemap is reproducible.** It carried today's date as `<lastmod>`,
so two builds on different days differed. Dropping it makes the whole output tree
byte-identical across rebuilds, which the end-to-end determinism test asserts and
CI enforces with a `git diff` of the rebuilt demo.

`[Fix]` **`npm run seed` writes where you are**, not next to the package, matching
the working-directory convention.

`[Break]` `gen.js` no longer resolves relative paths against its own directory,
and the stamp hashes the generator's files from the package while hashing
`wall.config.json` from the wall. `scripts/check-stamp.js` takes the project root
from the page path (`<root>/dist/index.html`) or as a second argument.
`scripts/check-build.js` reads its config from the current directory.

### Before the split

The engine grew inside a personal site before it was extracted; that history is
its ancestry, summarized here:

- masonry wall with portrait pairing, three-line captions, keyboard navigation,
  dark mode and a `sharp` image pipeline;
- iOS touch work: block native gestures, preserve zoom across resize, fix pinch
  drift with incremental midpoint anchoring, open at 35% on touch and 75% on
  desktop;
- the iOS memory kill: drop giant GPU layer promotion (`will-change`, 3D
  transforms) and cap zoom at 4x;
- build hardening: module split, output-directory guards, a hard `sharp`
  requirement so metadata can never ship, escaped wall data, a build stamp, 40+
  tests, CI with SHA-pinned actions, config extraction, social tags, `robots.txt`
  and `sitemap.xml`, and a designed share card.

## Built with AI

Keret is hand-written and AI-enhanced. Krisztian owns the specification, the
design decisions and the review; the code in this release was written with
**DeepSeek V4.1 Flash in DeepSeek Harness**. The extraction above was driven by a
code review of the original site (three release blockers, two real bugs) whose
findings and fixes are visible in the git history, and every claim in these docs
is backed by a command in this repository.
