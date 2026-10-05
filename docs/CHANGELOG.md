# Changelog

Reverse-chronological. One dated section per work block, entries tagged
`[Feature]`, `[Fix]` or `[Break]`.

## 2026-10-05 - Keret 0.1.0, extracted as a standalone tool

The engine that built a personal photo wall becomes a general tool with its own
repository, license and demo wall.

`[Fix]` **Three demo photographs were removed.** A closer look at the
published wall found people in three of them: walkers on the footbridge in
the flood picture, two figures down the Marbella street, and visitors on the
path at Portland Head lighthouse. The rest of the wall was re-checked at a
larger size than the original contact sheets, and the risky subjects (bridges,
streets, lighthouses, coasts, buildings) were checked again a tile at a time.

`[Feature]` **A first-run wizard.** On a terminal, a wall with no
`wall.config.json` is asked a few questions (title, description, site URL,
photographer name, email, website) and the answers are written to
`wall.config.json` and `author.json`. Every later run asks whether to keep the
current setup and, if not, shows each previous answer as the default. It is
skipped without a TTY, with `--yes`/`-y`, or on `--check`; `--setup` asks again
on purpose. The config it writes holds only the answered keys, and clearing the
name leaves an existing card alone rather than deleting it.

`[Feature]` **A credit line and a photographer card.** The page carries a small
"Powered by Keret" box in the bottom left corner (`credit`, null to hide it) and,
when `author.json` exists in the working directory, an Author button in the top
right corner that opens a card with the photographer's name, role, bio, email,
phone, location and links. The card is written into the page as data and rendered
with `textContent`, so a bio with markup cannot execute. Unknown keys in the
card fail the build, and the card is part of the build stamp.

`[Feature]` **The fit control wears Lucide's `locate` mark**, replacing the
stray copyright glyph (`&copy;`) that had been standing in for it, and the author button
wears `square-user`. Both are inline SVG, so the page still fetches nothing.

`[Feature]` **Keret is a package, not a site.** `node gen.js` now builds the wall
in the **current working directory** instead of the directory the script lives
in, so the tool can be a global `keret` bin (or a checkout anywhere) while each
wall keeps its own photos, config and output. The generator's own assets still
resolve against the package.

`[Feature]` **The favicon is configuration.** `favicon.bg` and `favicon.dot` drive
the inline SVG mark, the 64x64 page icon and the apple-touch icon. Colours are
validated as hex, because they are interpolated into an SVG data URI.

`[Feature]` **The captions sidecar works, and captions survive missing EXIF.**
`captions.file` is now a real config key (it was read but unreachable, so a
sidecar could never be configured). When a photo carries no exposure data the
author's title takes the exposure line, and the sidecar `credit` takes the camera
line - which is what a wall of stock photos, scans or exports needs.

`[Feature]` **Demo wall.** 24 public-domain photographs (no people), their
captions, the built site and a Pages workflow, all committed. Sources and licenses:
[demo/CREDITS.md](../demo/CREDITS.md).

`[Feature]` **The demo is EXIF-only.** 105 Wikimedia Commons originals, all CC0 1.0 or
public domain, every one carrying camera EXIF. They are committed at demo size
(1000px, quality 76, about 12 MB in total) and resized with `keepExif()`, so each
frame on the wall shows the date, exposure and camera the engine read from the
file. A photograph whose capture data exists only in XMP or IPTC is skipped: the
demo has to show what the reader can actually read. Authors, licenses and sources
are in [demo/CREDITS.md](../demo/CREDITS.md) and in the README.

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
byte-identical across rebuilds, which the new end-to-end determinism test asserts
and CI now enforces with a `git diff` of the rebuilt demo.

`[Fix]` **`npm run seed` writes where you are**, not next to the package, matching
the working-directory convention.

`[Break]` `gen.js` no longer resolves relative paths against its own directory,
and the stamp hashes the generator's files from the package while hashing
`wall.config.json` from the wall. `scripts/check-stamp.js` takes the project root
from the page path (`<root>/dist/index.html`) or as a second argument.
`scripts/check-build.js` reads its config from the current directory.

### Before the split

The engine grew inside the site repository; that history is the ancestry of this
code and is summarized here:

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
