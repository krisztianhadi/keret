# API: the generator's interface

Everything a wall can be told to do, through the command line, the environment or
`wall.config.json`.

## Command line

```
node gen.js [options]

  --photos <dir>    photo source directory       (config: photosDir)
  --out <dir>       output directory             (config: outDir)
  --config <file>   instance config file         (default: wall.config.json)
  --force           wipe a non-empty output directory that is not a build
  --yes             never ask anything: use the config, or the defaults
  --setup           ask the setup questions again
  --check           scan + lay out, write nothing
  --help            the usage text
```

The first run in a directory, with a terminal attached, asks a few questions and
writes `wall.config.json` (and `author.json`). Later runs offer to keep it. See
[SETUP.md](SETUP.md) for the questions and the non-interactive rules.

Positional arguments are still accepted for convenience:
`node gen.js [photosDir] [outDir]`.

Paths are resolved against the **current working directory**, not against the
package. Run the command from the directory that holds the photos and the config;
the tool itself can live anywhere (a checkout, a global `keret` bin).

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | the wall was written (or `--check` laid it out) |
| `1` | an unexpected failure: unreadable config, bad image, disk error |
| `2` | refused before doing anything: missing photos dir, unsafe `outDir` |
| `3` | a photo could not be published; no page was written |

### Environment

`WALL_CONFIG` points at a config file. The `WALL_*` variables below override
individual settings (highest precedence after the command line); only these are
read, so the environment cannot inject arbitrary config.

| Variable | Config key |
| --- | --- |
| `WALL_TITLE` | `title` |
| `WALL_DESCRIPTION` | `description` |
| `WALL_LANG` | `lang` |
| `WALL_SITE_URL` | `siteUrl` |
| `WALL_THEME_COLOR` | `themeColor` |
| `WALL_OG_PHOTO` | `og.photo` |
| `WALL_OG_SOURCE` | `og.source` |
| `WALL_PHOTOS_DIR` | `photosDir` |
| `WALL_OUT_DIR` | `outDir` |
| `WALL_ANALYTICS_SCRIPT` | `analytics.script` |
| `WALL_ANALYTICS_ID` | `analytics.websiteId` |
| `WALL_ANALYTICS_DOMAINS` | `analytics.domains` |
| `WALL_MAX_EDGE` | `images.maxEdge` |
| `WALL_QUALITY` | `images.quality` |
| `WALL_COLS` | `layout.cols` |
| `WALL_HERO_RATE` | `layout.heroRate` |
| `WALL_CAPTION_LINES` | `captions.maxLines` |
| `WALL_SHOW_YEAR` | `captions.showYear` |
| `WALL_SHOW_CAMERA` | `captions.showCamera` |
| `WALL_SHOW_SPECS` | `captions.showSpecs` |
| `WALL_ZOOM_MAX` | `zoom.max` |
| `WALL_NOSCRIPT_LIMIT` | `noscript.limit` |

## Configuration

Precedence, lowest to highest: built-in defaults, `wall.config.json`, environment,
command line. Unknown keys are a hard error, so a typo fails the build.

`wall.config.example.json` is a valid starting point: copy it to
`wall.config.json`.

### Identity and sharing

Run `node gen.js --setup` to be asked about these instead of editing the file by
hand; `--yes` turns the questions off.

| Key | Default | Meaning |
| --- | --- | --- |
| `title` | `"Photo Wall"` | page title, the `<h1>` on the wall, and the no-JS heading |
| `description` | `"A wall of photographs."` | meta description |
| `lang` | `"en"` | `<html lang>` |
| `siteUrl` | `""` | absolute site URL, e.g. `https://photos.example.com/`. When empty there are no social tags, no canonical link and no sitemap. A `CNAME` file in the project root is used as a fallback |
| `themeColor` | `"#26231e"` | browser chrome color |
| `favicon.bg` | `"#26231e"` | favicon background (hex only) |
| `favicon.dot` | `"#e23c30"` | favicon dot (hex only); the same two colors make `apple-touch-icon.png` |
| `credit` | `{"label":"Powered by","brand":"Keret","url":"https://github.com/krisztianhadi/keret"}` | the small box in the bottom left corner; `brand` is the link and `url` its target. `null` hides the box |
| `author.file` | `"author.json"` | the photographer card behind the top right button, resolved against the working directory. No file means no button |
| `analytics` | `null` | `null` disables it. Otherwise `{ "script": "https://...", "websiteId": "...", "domains": "example.com", "cache": true }`; `script` and `websiteId` are required |

### The photographer card

`author.json` in the working directory holds the photographer, and the page grows a
button in the top right corner that opens it. The file is strict: an unknown key
fails the build, so a typo cannot ship a half-empty card.

```json
{
  "name": "Ada Lovelace",
  "role": "Photographer",
  "bio": "One or two lines about the work.",
  "email": "hello@example.com",
  "phone": "+66 00 000 000",
  "location": "Chiang Mai, Thailand",
  "links": [
    { "label": "Website", "href": "https://example.com/" },
    { "label": "Instagram", "href": "https://instagram.com/example" }
  ]
}
```

| Field | Required | Effect |
| --- | --- | --- |
| `name` | yes | the heading; without it there is no button |
| `role` | no | a dim line under the name |
| `bio` | no | a short paragraph |
| `email` | no | rendered as a `mailto:` link |
| `phone` | no | rendered as a `tel:` link |
| `location` | no | plain text |
| `links` | no | `[{ label, href }]`; every `href` must start with `http(s)://`, `mailto:` or `tel:` |

The card is written into the page as data and rendered with `textContent`, so a bio
containing markup is displayed, never executed.

### Social card

| Key | Default | Meaning |
| --- | --- | --- |
| `og.source` | `"assets/og.jpg"` | a ready-made 1200x630 card, relative to the project root. Copied as it is when the file exists |
| `og.photo` | `""` | when no card exists, this photo is cropped into `og.jpg`. Empty means "choose for me": the build scores every photo on the wall for how little of it the 1200x630 crop would throw away and how little it would have to be enlarged, and takes the best fit |

### Paths

| Key | Default | Meaning |
| --- | --- | --- |
| `photosDir` | `"photos"` | where the originals are; never written to |
| `outDir` | `"dist"` | output directory; wiped on every build after the guards pass |

### Captions

| Key | Default | Meaning |
| --- | --- | --- |
| `captions.file` | `"captions.json"` | sidecar inside `photosDir`; a path may also be absolute |
| `captions.maxLines` | `2` | `0` to `2`. `1` drops the camera line, `0` drops both |
| `captions.showYear` | `true` | prefix the exposure line with the year the photo was taken |
| `captions.showSpecs` | `true` | the exposure line (focal length, f-number, shutter, ISO) |
| `captions.showCamera` | `true` | the camera line |

### Layout

The wall is masonry with portrait pairing: a column slot is either one full-width
photo or two portraits side by side, sized to fill the same slot width. Bricks
flow into equal-width columns (shortest column first), the columns are reordered
into an arch (tallest in the middle) and shifted onto one shared midpoint axis.

| Key | Default | Meaning |
| --- | --- | --- |
| `layout.cols` | `0` | fixed column count; `0` picks the count closest to a square canvas |
| `layout.long` | `600` | display width of a full-width frame, in wall pixels |
| `layout.gap` | `64` | one gutter for columns, stacked frames and pairs |
| `layout.mat` | `20` | mat border around each photo |
| `layout.pad` | `260` | empty wall margin around the whole arrangement |
| `layout.capGap` | `22` | air between the photo and the caption text |
| `layout.heroRate` | `3` | out of 10 unmarked portraits, how many go full width (a stable hash decides which) |
| `layout.heroMinAspect` | `0.6` | never blow up extreme 9:16-ish portraits; narrower than this stays paired |
| `layout.markSuffix` | `"-x"` | filename suffix that forces a photo to full width, e.g. `tower-x.jpg` |
| `layout.maxCols` | `14` | ceiling for the automatic column count |

### Images

| Key | Default | Meaning |
| --- | --- | --- |
| `images.maxEdge` | `2048` | longest edge of the served copy |
| `images.quality` | `82` | JPEG and WebP quality |
| `images.thumbEdge` | `24` | edge of the inline blurred placeholder |
| `images.thumbQuality` | `55` | quality of that placeholder |
| `images.ogWidth` | `1200` | social card width, also the `og:image:width` tag |
| `images.ogHeight` | `630` | social card height |
| `images.ogQuality` | `82` | social card quality |

### Interaction and fallback

| Key | Default | Meaning |
| --- | --- | --- |
| `zoom.max` | `4` | zoom ceiling the engine clamps to |
| `noscript.limit` | `60` | how many photos the no-JavaScript list shows |

## The captions sidecar

`photos/captions.json` (path configurable) maps a filename or a bare basename to
a title or to an object:

```json
{
  "harbour-morning.jpg": "Harbour, first light",
  "harbour-morning": { "title": "Harbour, first light", "alt": "Fishing boats at dawn", "credit": "Photo: Julia Caesar" }
}
```

| Field | Effect |
| --- | --- |
| `title` | used as the alt text, and as the first caption line when the photo has no exposure data |
| `alt` | the alt text verbatim, overriding everything else |
| `credit` | the second caption line when the photo has no camera EXIF |
| `specs` | overrides the exposure line for this photo |

The sidecar is consumed silently, never listed as a skipped photo, and it is
never copied into the output.

## Output

| File | Notes |
| --- | --- |
| `index.html` | the wall: inlined CSS, inlined engine, the layout as data, social tags, the no-JS list |
| `photos/<name>` | re-encoded copies, EXIF stripped, orientation baked in, never enlarged |
| `og.jpg` | the social card: the committed one, or cropped from a photo |
| `apple-touch-icon.png` | 180x180, from `favicon.bg` and `favicon.dot` |
| `robots.txt`, `sitemap.xml` | written when `siteUrl` is set |
| `.nojekyll` | stops GitHub Pages from hiding files that start with an underscore |
| `CNAME` | copied when a `CNAME` file exists in the project root |

## Scripts in this repository

| Command | What it does |
| --- | --- |
| `npm test` | the suite: node's test runner, no framework |
| `npm run demo` | builds `demo/` into `demo/dist` |
| `npm run demo:serve` | serves `demo/dist` on port 3100 |
| `npm run demo:check` | structural check of the built demo |
| `npm run seed` | writes sample PNGs into `./photos` |
| `npm run serve` | serves `./dist` on port 3100 |
| `npm run stamp` | verifies a built page is in sync with the source that produced it |
