# Setup

## What you need

- **Node 18.17 or newer** (20 LTS or 22 recommended; `.nvmrc` says 22).
- **`sharp`**, installed by `npm install`. It pulls a prebuilt binary for your
  platform; no compiler is needed on Linux x64, macOS or Windows.
- Nothing else. No database, no service, no build tool.

## Install

```sh
git clone https://github.com/nomorenamesstudio/keret.git
cd keret
npm install
```

Or use it as a CLI without cloning:

```sh
npx --yes github:nomorenamesstudio/keret --help     # runs the generator from the repo
npm install -g github:nomorenamesstudio/keret       # provides the `keret` command
```

## First run

The first time you build a wall in a directory, with a terminal attached, the
generator asks a few questions and writes the answers next to your photos:

```
A few questions, once. Enter keeps the [default].

Title [Photo Wall]: Iceland 2026
Description [A wall of photographs.]: Twelve days on the ring road.
Site URL, used for social tags and the sitemap (optional): photos.example.com
Photographer name, for the contact card (optional): Ada Lovelace
  Email (optional): ada@example.com
  Website or profile (optional): ada.example.com

wrote /home/you/pictures/wall/wall.config.json
wrote /home/you/pictures/wall/author.json
```

Every later run offers to keep what is there, and shows each previous answer as
the default if you say no:

```
Keep the current setup ("Iceland 2026")? (y/n) [y]
```

The config it writes holds only what you answered, so the generator's defaults
keep improving underneath it.

| Situation | What happens |
| --- | --- |
| `--yes` (or `-y`) | never asks: uses `wall.config.json`, or the built-in defaults when there is none |
| `--setup` | asks again even when a config file exists |
| no terminal (pipe, CI, cron) | nothing is asked and nothing is written; the build uses the config or the defaults |
| `--check` | never asks: a dry run does not write files |

Clearing the photographer's name leaves an existing `author.json` alone and says
so, because deleting a contact card is your call.

## Your first wall

```sh
mkdir -p ~/pictures/wall/photos
cp ~/Pictures/*.jpg ~/pictures/wall/photos/
cd ~/pictures/wall
node ~/Code/keret/gen.js
```

That writes `./dist`. Look at it with any static server:

```sh
npx --yes serve dist            # or: npm --prefix ~/Code/keret run serve -- dist
```

The generator resolves everything against the **current directory**, so `keret`
can be installed globally while each wall keeps its own photos and config.

Sample images, if you want a wall before you have photos of your own:

```sh
cd ~/pictures/wall
node ~/Code/keret/scripts/seed-placeholders.js
node ~/Code/keret/gen.js
```

## The bundled demo

```sh
npm run demo          # builds demo/ into demo/dist (passes --yes, so it never asks)
npm run demo:serve    # http://127.0.0.1:3100/
npm run demo:check    # structural check of the built demo
```

`demo/dist/` is committed so the demo works offline and GitHub Pages can serve it
as-is.

## Configuration

Copy the example and edit it:

```sh
cp wall.config.example.json wall.config.json
```

Every key is documented in [API.md](API.md#configuration). Nothing is required;
without a config file the defaults build `./photos` into `./dist`.

Common changes:

```sh
# a one-off build without touching the config file
WALL_TITLE="Summer 2026" WALL_SITE_URL="https://photos.example.com/" node gen.js

# check the layout without writing anything
node gen.js --check

# a wall in another directory
node gen.js --photos ~/Pictures/iceland --out ~/Sites/iceland
```

## The browser build

`web/` is the same generator running in a page, for people who will not install
Node. It needs no dependencies of its own: the modules, the stylesheet, the engine
and both typefaces are baked into `web/vendor/keret-core.js`.

```sh
npm run web:build     # regenerate the bundle after editing src/ (committed)
npm run web:check     # fail if the bundle no longer matches src/
npm run web:serve     # http://127.0.0.1:3287/
```

The bundle is committed, so deploying the app is copying `web/` to any static
host - GitHub Pages, Cloudflare Pages, a subfolder of your own site. Nothing runs
server-side, and nothing the user picks is uploaded: the photos are read with the
File API, re-encoded on a canvas, and the finished site is handed back as a zip.

`test/web.test.js` fails when the bundle is stale, so `npm run web:build` is not
optional after touching `gen.js` or `src/`. It also fails when `web/app.js` stops
parsing or reaches for an element the page does not have - the two failure modes
that make the page load but do nothing.

### The hosted app

<https://keret.nomorenames.studio> is a Cloudflare Pages project, git-connected to
this repository's `main` branch, so the live site is always a commit and there is
no local deploy step or secret to keep.

| Setting | Value |
| --- | --- |
| Root directory | `web` |
| Build command | `node build.mjs && mkdir -p dist && cp index.html hosting.html _headers app.css app.js keret-runtime.js canvas-sharp.js zip.js 404.html robots.txt sitemap.xml og.png apple-touch-icon.png dist/ && cp -r vendor dist/ && node version-assets.mjs dist "$CF_PAGES_COMMIT_SHA"` |
| Output directory | `dist` |

The studio's own deploy appends one more step to that command: if an
`ANALYTICS_TAG` environment variable is set on the project, it is written into
`dist/index.html` and `dist/404.html` before `</head>`, and preview branches skip
it. The tag counts pageviews and finished builds, is served from the studio's own
domain, and carries `data-do-not-track="true"` — a visitor who sends that signal
is not counted at all. The tag (a self-hosted analytics beacon) lives in the Pages project's
environment, deliberately not in this repo — cloning this repository and pointing
your own Pages project at it deploys the app with no tracking at all.

The root directory is the point: pointed at the repository root, Pages installs
the CLI's `sharp` on every build for an app that has no dependencies at all. The
build command runs `web/build.mjs --check`'s generator for real, so what ships is
built from the commit rather than from a possibly stale committed bundle; `npm
test` is what catches a stale bundle before it gets there.

Every deploy also copies the app's assets into `dist/v<commit>/` and points the HTML
at that directory (`web/version-assets.mjs`), so a browser that has been holding
`app.css` since the last deploy fetches the new one instead of mixing it with new
markup. That directory is served `immutable` for a year; the unversioned copies stay
in place for anyone holding a cached page, and `web/_headers` keeps them
revalidating. Locally, `node version-assets.mjs dist` with no version is a no-op, so
a scratch build looks like the repository does.

A deploy therefore needs a push. Verify one through the API rather than assuming:

```sh
T=$(cat ~/Code/.config/cloudflare/pages.token); A=d6c73c1ae5be6d50645e7db1723d290e
curl -s -H "Authorization: Bearer $T" \
  "https://api.cloudflare.com/client/v4/accounts/$A/pages/projects/keret/deployments?per_page=1" \
  | jq -c '.result[0] | {commit: .deployment_trigger.metadata.commit_hash[0:7], stage: .latest_stage.name, status: .latest_stage.status}'
```

The share card and the touch icon are generated, not hand-drawn:

```sh
node scripts/serve.js . 4330      # the card pages must be served, or the font will not load
node scripts/gen-og.mjs           # writes web/og.png (1200x630) and web/apple-touch-icon.png
```

Playwright is not a dependency here; `scripts/gen-og.mjs` looks for an installed
`playwright`, a `PLAYWRIGHT` environment variable, or this machine's sibling
checkout that has one.

A wall of 300 photographs now pans at 60 fps on an iPhone 15 Pro Max and survives
zooming out to fit, where the same wall used to kill the tab (see the measurements in
[ARCHITECTURE.md](ARCHITECTURE.md)). Two costs come with it: the build writes a tier
per rung, so a browser build does five encodes per photo instead of one, and the
downloaded zip grows by roughly 10% at the shipped ladder. `images.tiers: []` builds
one copy per photo again.

The app itself has no automated test: it needs a browser. The checks worth
repeating by hand after changing `web/` are the flow at 390px and 1280px - pick a
folder, open *More settings*, build, watch the frame resize rather than jump,
preview the wall, download the zip - and that the zip carries `wall.config.json`
and `author.json`, which dropping back into the app should restore.

## Serving and hosting

The output is static: any web server, any static host. It works from a subpath
(the page uses relative URLs), which is what GitHub Pages project sites need.

### GitHub Pages

1. Push the repository to GitHub.
2. `Settings > Pages > Build and deployment > Source = "GitHub Actions"`.
3. The bundled workflow (`.github/workflows/pages.yml`) deploys `demo/dist` on
   every push to `main`.

For your own wall, commit its `dist/` and point `siteUrl` at the Pages URL; the
same workflow pattern works with a different artifact path.

### The repository's own images

`docs/assets/` carries the pictures the repository shows: `readme-header.jpg`
(the wide strip at the top of this README), `demo-window.png` (the wall in a
browser window, transparent) and `social-preview.jpg`. All three are drawn from
one capture by `npm run banner`, so a new capture is one command rather than a
session in an image editor.

For the link preview when someone shares the repository, upload
`docs/assets/social-preview.jpg` in
`Settings > General > Social preview`. It is drawn at 1200x630, the size a social
card is rendered at, so nothing is cropped.

### Ports used in this repository

| Port | Used by |
| --- | --- |
| 3100 | `npm run demo:serve`, `npm run serve` (local preview only) |
| 3287 | `npm run web:serve` (the browser build's own page) |

Nothing listens on any port at build time.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm test`.
2. A wall built from seeded fixture photos, then checked structurally.
3. The committed demo checked against the source hash in its build stamp.
4. The demo rebuilt and diffed, proving the committed bytes are reproducible.
5. `npm run demo:check` on the committed demo.

Actions are pinned by commit SHA; the trailing comment is the human-readable
version, and Dependabot keeps both current.

## Troubleshooting

**The generator keeps asking questions** - it asks once per run on a terminal
whenever a config file exists, and reports what it wrote when one does not. Pass
`--yes` (`-y`) to never ask, `--setup` to ask on purpose, or `--check` for a dry
run that writes nothing. In a script, a pipe or CI it never asks at all.

**`sharp is required (npm install)`** - `npm install` did not finish or the
platform binary failed to load. Without `sharp` the build would have to copy
originals with their metadata, so it refuses instead. Reinstall with
`rm -rf node_modules && npm install`; on an unusual platform, `npm rebuild sharp`.

**`refusing to build: outDir sits inside photosDir`** - the guard caught an
output path that would delete originals. Check the resolved paths it prints; pass
`--force` only when you are certain the directory is a previous build.

**`failed to publish N photo(s)`** - the page is deliberately not written. The
list names each file and the reason (usually a photo still being copied off a
card, or a corrupt file). Fix the photo and run again.

**A photo is missing from the wall** - some formats are not images Keret reads
(`jpg`, `jpeg`, `png`, `webp`, `gif`), and files whose name starts with `.` or `_`
are skipped on purpose. The build lists everything it ignored and why.

**The wall is huge and slow to open** - lower `images.maxEdge` (1600 is plenty
when the wall is browsed on a screen), or split it into two walls. Every frame is
lazy-loaded and culled, but the first paint still counts the frames.

**`check-stamp.js` says the demo is stale** - the generator changed after the
demo was built. Run `npm run demo` and commit `demo/dist` with the change.
