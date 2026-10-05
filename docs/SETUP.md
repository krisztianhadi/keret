# Setup

## What you need

- **Node 18.17 or newer** (20 LTS or 22 recommended; `.nvmrc` says 22).
- **`sharp`**, installed by `npm install`. It pulls a prebuilt binary for your
  platform; no compiler is needed on Linux x64, macOS or Windows.
- Nothing else. No database, no service, no build tool.

## Install

```sh
git clone https://github.com/krisztianhadi/keret.git
cd keret
npm install
```

Or use it as a CLI without cloning:

```sh
npx --yes github:krisztianhadi/keret --help     # runs the generator from the repo
npm install -g github:krisztianhadi/keret       # provides the `keret` command
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

### Ports used in this repository

| Port | Used by |
| --- | --- |
| 3100 | `npm run demo:serve`, `npm run serve` (local preview only) |

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
