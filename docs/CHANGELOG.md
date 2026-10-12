# Changelog

Reverse-chronological. One dated section per work block, entries tagged
`[Feature]`, `[Fix]` or `[Break]`.

## 2026-10-12 - Assets revalidate, so a deploy cannot ship a hybrid

The wordmark looked broken and "Build a new wall" did nothing on the live site,
while both worked locally and in a fresh browser. The markup was new and the
stylesheet and script were not: an inline `.mark` collapses to its 5px dot without
the rule that makes it a flex item, and an `app.js` from before the button existed
has no listener for its id.

Cloudflare Pages caches HTML with `max-age=0, must-revalidate` and **everything else
with `max-age=14400`**, so for four hours after any deploy a returning visitor gets
today's `index.html` with last deploy's `app.css` and `app.js`. An earlier entry here
recorded the `max-age=0` and called it right for fixed filenames — that was measured
on `/` alone, and the generalisation was wrong.

`[Fix]` **`web/_headers`**, shipped into the deploy root: the app's stylesheet,
scripts and the vendor bundle revalidate on every load. A 304 is cheap; a stale
stylesheet is not. Images keep the four-hour cache — a stale social card is
harmless. Anyone holding a copy from before this fix needs one hard reload; the
browser will not ask about a file it believes is fresh.

## 2026-10-12 - The finished wall gets a way out, the wordmark a way back

`[Feature]` **"Build a new wall"**, under the download: it clears the photographs
and the built zip and returns to the empty state. The form keeps what was typed -
those fields come back the moment new photographs are picked - while a
`wall.config.json` that arrived with a dropped folder goes with it, so a new wall
cannot quietly inherit the last one's settings.

`[Fix]` **"Build again" is "Edit and rebuild"** now, which is what it does: the same
photographs stay picked, and the details are there to change before building again.

`[Feature]` **The wordmark links back to the start** (`./`, titled "Start over"), so
anywhere in the app is one click from the empty state. The manual's copy names the
button the same way.

`[Fix]` **The manual sits on the mat in light mode.** Its page background was the
cappuccino wall, which left the ink looking washed out; it is the frames' own cream
now (`#fbfaf6`), flat — the wall's vignette darkens the corners and reads as grime on
a light surface. Page-scoped: the app keeps its wall in both themes.

`[Fix]` **Light-theme buttons on the mat were 4.26:1.** `--cap` goes from `#776f63`
to `#6f685c`: 4.74:1 on a tinted button, 5.28:1 on the plain mat. Worth recording
what was *not* broken, because an earlier entry here implied it was: `--cap` on the
mat is 4.86:1 in the dark theme and always was fine. The 2.81:1 measured then was a
mid-animation blend, and the one real misuse was `--cap` as text on the *wall*
(1.77:1), which only the manual was doing and no longer does.

## 2026-10-11 - The button picks loose photographs again

The app's file input carried `webkitdirectory` on desktop, which meant the browser
only ever offered a folder chooser: anyone whose photographs sit loose, or who
wanted to add three pictures to a wall, had no way in.

`[Fix]` **The button picks files; the frame takes folders.** A plain input is the
only dialog that can select single photographs, so that is what the button opens
now — on every device, falling back to Library / Take Photo / Files on iOS as
before. Folders keep arriving the way they already did: dropped on the frame,
where `webkitGetAsEntry` walks them recursively, with loose files landing in the
same handler. The drop target is the only control that takes both, so the empty
state says it: *"Drop photos or a folder"*.

`[Fix]` **`--ink-dim` was 4.42:1 on the black box**, just under the 4.5:1 body
text wants — the ink of every quiet control inside the frame (Change photos,
Cancel build). It is 5.16:1 at 55%.



Somebody who built their wall in the browser is holding a zip, not a checkout, and
`docs/HOSTING.md` is written for someone with both. `web/hosting.html` is the same
ground for the first audience, in the app's own clothes.

`[Feature]` **`hosting.html`.** Four numbered ways in - Cloudflare Pages by drag
and drop, Netlify Drop, GitHub Pages, your own server - each with the steps, the
one thing that usually goes wrong, and a link to that host's own documentation.
It opens with the two mistakes that cause most of the support questions (the
`fonts` folder left behind, and `index.html` sitting one folder too deep), explains
what a pending certificate looks like, and says which two things are baked in at
build time - the share preview and the canonical link - so the address belongs in
the app before the build, not after.

`[Feature]` **The app's "hosting guide" link points at it**, in a new tab, so the
finished wall stays where it is in the tab behind. `docs/HOSTING.md` keeps the
command-line side and now opens with a pointer to the page.

`[Fix]` **The page travels with the app**: in the deploy's file list, in
`sitemap.xml`, and covered by the analytics tag like everything else.

## 2026-10-11 - A beacon, without putting it in the repo

The hosted app reports pageviews and completed builds to the studio's own
analytics instance. The repository carries none of it.

`[Feature]` **Injected at build time, from the host.** The whole tag lives in a
Cloudflare Pages environment variable (`ANALYTICS_TAG`, production only) and one
step on the end of the build command writes it into `dist/index.html` and
`dist/404.html`. It is idempotent, it no-ops without the variable, and
`CF_PAGES_BRANCH` keeps preview deployments untracked. A self-hoster who clones
this repository and points a Pages project at it gets the app with no tracking at
all — there is nothing to strip.

`[Feature]` **A `wall-built` event, not just pageviews.** The same tag watches for
the done step and reports how many photographs the wall had, so the useful number
(the people who finished a build) is separable from the people who only looked.

`[Fix]` **Do Not Track is respected.** The tag carries `data-do-not-track="true"`,
so a visitor who asks not to be tracked makes no request at all. Verified both
ways on the live site: with `navigator.doNotTrack` set to `1` the page sends
nothing, without it one pageview.

`[Fix]` **The copy on the page stays true.** Photographs are still never uploaded;
the beacon reports that the page was opened, from the same site, with no cookie.
`docs/SETUP.md` says so plainly, in place of the claim that the build command was
the whole deploy.

## 2026-10-11 - The app gets an address

`web/` is published at <https://keret.nomorenames.studio>, on a Cloudflare Pages
project whose root directory is `web/` so the build installs nothing.

`[Feature]` **Share card and head tags.** `scripts/og-card.html` renders to
`web/og.png` (1200x630) through `scripts/gen-og.mjs` - the app's own palette and
face, served from the repo so the two cannot drift, and three of the demo's
public-domain photographs in cream mats. The page carries canonical, `og:*`
(with `og:image:alt`) and `twitter:summary_large_image`, plus an 180x180 touch
icon generated from the same mark.

`[Feature]` **`robots.txt`, `sitemap.xml` and a 404.** The 404 is the app's own
clothes with one line and one way back; Pages serves it for any unknown path.

`[Fix]` **The title uses an em dash** (`keret.app — build a photo wall in your
browser`), matching the studio's standing copy rule.

`[Break]` **None. The command line is untouched**; the demo stays at
`krisztianhadi.github.io/keret/`.

## 2026-10-10 - The browser wall becomes something to hand to a person

The app in `web/` is rebuilt around one screen with one job per row, and the wall
it produces now carries its own settings so a wall can be kept up to date.

`[Feature]` **One forward action, in one place.** Choose photos -> Build the photo
wall -> Download the site (.zip) sits in a single slot on the frame's footer; the
photo box holds only what is happening, plus quiet contextual links (*Change
photos*, *Cancel build*, *Preview*, *Build again*). The settings live in the box
with the photographs: title, description and creator first, everything else behind
*More settings*. They appear when there is something to build or rebuild and are
gone while a build runs.

`[Feature]` **The wall's settings ride in the zip.** `wall.config.json` and
`author.json` are written beside `index.html` in the command line's own format, so
a downloaded wall is rebuildable with `node gen.js`; dropping the unzipped folder
back into the app restores every setting, including the keys the form does not
show. Dropping a folder that contains a `photos/` folder now treats that folder as
the source, so the site's own `og.jpg` and touch icon no longer walk onto the wall
as photographs.

`[Feature]` **A stack of prints instead of a progress bar.** The photographs the
wall is about to be built from appear as framed prints on the desk, sampled across
the set; when it is done, five of the published ones are laid out the way the wall
lays them out. Both are drawn through a canvas at 480px, so a phone never holds
full-size bitmaps for a decoration.

`[Feature]` **Motion that can be seen, at a cost that was measured.** The frame
eases between sizes, the words rise 14px into place, the settings drawer grows open
and shut. Two findings shaped it: the switch costs one long frame (~64ms on a
6x-throttled CPU) with no animation at all, so the cost is laying out the new step
rather than the motion, and the box changing size only after the thumbnails
decoded shoved everything under it down 146px in a single frame. Transforms are
kept off anything holding a photograph because Safari re-rasterizes those;
durations live in one `DUR` block and all of it turns off under
`prefers-reduced-motion` or `?motion=off`.

`[Fix]` **The browser app is one page, not a form of guesses.** The empty state
opens with the wording the device can act on (a phone is told to pick photographs,
not to drop a folder) and that wording is chosen in CSS, because a module script
runs late enough that the desktop line was visible for a moment on a phone. Icons
are Lucide v1.55.0 - the set this project's page chrome already uses - instead of
hand-drawn paths at five different stroke widths. The type scale is rem off a 16px
base, and form controls are pinned at 16px so iOS does not zoom the page on focus.

`[Fix]` **`hidden` on an SVG is not a thing.** The folder mark stayed visible
behind the stack because `hidden` is an `HTMLElement` property; it is set as an
attribute now.

## 2026-10-10 - The wall builds in a browser tab

The generator becomes usable by people who will never open a terminal, without a
server to pay for: `web/` is a static page that runs the same build and hands back
the finished site as a zip.

`[Feature]` **`web/` runs `src/`, it does not reimplement it.** `web/build.mjs`
bakes `gen.js` and `src/*.js` into `web/vendor/keret-core.js` as CommonJS
factories; `web/keret-runtime.js` gives them an in-memory filesystem, a `Buffer`
with the encodings the header parser uses, a posix `path` and a module loader, and
`web/canvas-sharp.js` implements the sharp chain - `rotate`, `resize`, `jpeg`,
`png`, `webp`, `composite`, `toBuffer`, `toFile` - on a canvas. The app calls
`scanPhotos`, `layout`, `writeCopies` and `buildPage` exactly as the CLI does. On
the demo folder the browser build reports the same 105 photos, the same 9 columns
and the same 6792x6965 canvas as `node gen.js --check`, and 105 of 105 published
photographs have identical pixel dimensions; the files are about 13% larger,
because the browser's JPEG encoder is not mozjpeg.

`[Feature]` **Pick a folder, preview the wall, download the site.** Drag a folder
in or use the picker (subfolders are read), optionally set the title, description,
site address, photographer and typeface, then watch it publish photo by photo. The
preview is the real `index.html` rendered in an iframe with its photo requests
pointed at object URLs, so the wall pans and zooms exactly as it will once hosted.
The download is a store-only zip with fixed timestamps: building the same folder
twice produces byte-identical archives (measured), which is the reproducibility
contract in a place that has no source stamp to check.

`[Feature]` **Nothing is uploaded, and there is no stamp.** The photos are read
with the File API and never leave the tab; the JSON, the fonts and the engine are
baked into the bundle, so the app also runs from a `file://` folder. A browser
build carries no `<!-- built by gen.js -->` stamp - there is no commit for CI to
compare against - which is the one line `scripts/check-build.js` reports on a
downloaded zip, and the only structural difference from a CLI build of the same
photographs.

`[Feature]` **`test/web.test.js`.** The runtime is exercised in node: it scans the
demo folder field-for-field identically to the CLI (which is what a broken shim
would break first), the committed bundle is checked against the sources it embeds,
and the hand-written zip is walked header by header with a known CRC check value.

Known limits, accepted for this first pass: the encoder is the browser's (same
dimensions, larger files, and Safari cannot encode WebP at all, so webp input is
reported as a failure rather than written under the wrong name); the wall is held
in memory, comfortable at a few hundred photographs; and the social card is drawn
by compositing the CLI's own SVG card over the photo, which renders in the browser
rather than through librsvg, so its type metrics differ slightly.

`[Feature]` **The wall's own description reaches the page.** `description` was
written into `<meta name="description">` and `og:description` and nowhere else, so
the one line explaining a wall was only ever read by a crawler - and a reader who
filled the field in went looking for it on the page and found nothing. The card
behind the top right button now opens with it, above the photographer's bio, and a
wall that has a description but no `author.json` grows the button too: the card is
the wall's corner, not only the photographer's. `gen.js` passes the description
into the chrome object, `ui.js` draws it, and the card's stylesheet carries the
rule; the committed demo is rebuilt for it.


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

`[Feature]` **Four hosting tutorials.** `docs/HOSTING.md`, linked from the README right after the quick start, covers GitHub Pages
(including what to set for the bundled workflow), Cloudflare Pages (Git
integration or Direct Upload with a zip, and the 1,000-file cap a large wall will
hit), Netlify (Drop or Git), and your own server with nginx or Caddy. Each links
to the provider's documentation for the parts that move, and the shared steps -
`siteUrl` before the final build, relative URLs, the stamp - are stated once at
the top.

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
