# Keret

A self-hosted photo wall. Point it at a folder of photographs and it builds a
single static page: every photo in its own frame on one big wall you pan and
zoom, laid out so nothing overlaps and nothing is cropped.

Named after the Hungarian word for *frame*. It is the engine behind
[jpg.krisztian.wtf](https://jpg.krisztian.wtf/), extracted into a tool anyone can
run.

- **Static output.** A folder of HTML, images and crawler files. No database, no
  server-side runtime, no client framework.
- **Originals are never published.** Every photo is re-encoded on the way out, so
  EXIF metadata, including GPS, is dropped and orientation is baked in.
- **One photo, one frame.** Frames keep the photo's real aspect ratio: nothing is
  cropped to fit a grid.
- **Built to survive a phone.** Pan, pinch, double-tap, fit. The engine is the
  one that was debugged on real iOS hardware after a wall of a few hundred photos
  started killing the tab.
- **No JavaScript required to read it.** Without JS you get a plain list of the
  photos; the interactive wall is an enhancement.

![The demo wall: framed photographs on a dark wall, panned to a winter spruce and an alpine lake](docs/assets/demo-wall.jpg)

## Quick start

```sh
# 1. get the tool
git clone https://github.com/krisztianhadi/keret.git
cd keret
npm install                      # sharp, the only dependency

# 2. build the bundled demo wall and look at it
npm run demo
npm run demo:serve               # http://127.0.0.1:3100/
```

Building your own wall:

```sh
mkdir -p ~/pictures/wall/photos
cp ~/photos/*.jpg ~/pictures/wall/photos/
cd ~/pictures/wall
node ~/Code/keret/gen.js         # writes ./dist
npx --yes serve dist             # or any static file server
```

No config file is needed to start: the defaults build a wall from `./photos`
into `./dist`. Copy [`wall.config.example.json`](wall.config.example.json) to
`wall.config.json` when you want to change something.

## Requirements

- Node 18.17 or newer (Node 20+ recommended).
- `sharp`, installed by `npm install`. It is not optional: it is what strips
  metadata and bakes in EXIF orientation. The build refuses to run without it
  rather than publishing originals.

## Commands

| Command | What it does |
| --- | --- |
| `node gen.js` | builds `./photos` into `./dist` |
| `node gen.js --check` | lays the wall out, writes nothing |
| `node gen.js --help` | every option |
| `npm run demo` | rebuilds the bundled demo wall (`demo/dist`) |
| `npm run demo:serve` | serves the demo on port 3100 |
| `npm run demo:check` | structural check of a built wall |
| `npm run seed` | writes sample images into `./photos` |
| `npm test` | the suite (node's own runner) |

## What the wall knows about each photo

Sizes, EXIF orientation, capture date, camera and exposure are read straight from
the file headers with zero dependencies, so the layout can be computed before
anything is written and each frame matches exactly how a browser renders the
photo.

Captions are the exposure line and the camera. Both can be switched off, and a
sidecar file (`photos/captions.json`) can supply your own words per photo, which
also take over a line when a photo has no EXIF of its own:

```json
{
  "harbour-morning.jpg": {
    "title": "Harbour, first light",
    "credit": "Photo: Julia Caesar"
  }
}
```

## Configuration

Everything lives in `wall.config.json` in the directory you run the generator
from: title, description, site URL, caption rules, the geometry of the wall
(column width, gutters, mats, margins), how large the served copies are, and an
optional analytics snippet. Every key is documented in
[docs/API.md](docs/API.md#configuration); the defaults live in
[`src/config.js`](src/config.js).

Unknown keys are a hard error, so a typo fails the build instead of being
ignored.

## The demo wall

`demo/` is a complete wall: 36 photographs, their captions and the built site,
committed so the demo builds offline and can be served by GitHub Pages.

Twelve of them are Wikimedia Commons originals that still carry their camera
EXIF, so their frames show the date, exposure and camera the engine read straight
out of the file. The other twenty-four come from stock libraries that strip
metadata, so their frames show the caption written in `photos/captions.json`
instead. None of the photographs shows a person.

<!-- demo-credits:start -->
Photographs in the demo, and the people who took them. All CC0 1.0 or public
domain; the twelve Wikimedia Commons originals are the ones whose frames show
exposure and camera.

| Photograph | Author | License | Source |
| --- | --- | --- | --- |
| A pine leaning over a misty valley | Kristoffer Fredriksson | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/mountain-landscape-S2JLQ3IWFS) |
| A waterfall, and a rainbow in its spray | Robert Lukeman | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/mountain-landscape-978C9IB8S8) |
| Clouds breaking over the peaks | Zachary Domes | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/mountains-landscape-7Q21B2IB4R) |
| A path through a mountain meadow | Lili Popper | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/green-grass-T1VA15FJXL) |
| Still water, mirrored hills | Snapwire | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/widescreeen-beautiful-KDDWW6SNFE) |
| Sunlight through a breaking wave | Altered Reality | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/ocean-wave-VFAMQON3ZP) |
| The Milky Way over a lake | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/5968986/aurora-lake-reflection) |
| A violet dusk over the water | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/3338455/free-photo-image-storm-lightning) |
| An alpine lake under the peaks | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/3305359/free-photo-image-landscape-river-lake-nature) |
| Rapeseed in flower | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/3301449/free-photo-image-cc0-countryside-creative-commons) |
| Rows of lavender | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/6076418/img_9096) |
| A mountain road in October | JJ Skys the Limit | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/autumn-aerial-R7NBNFPB5X) |
| Tracks through an autumn forest | Matt Moloney | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/autumn-forest-L3G8OQESTP) |
| A spruce under snow | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/6024622/photo-image-public-domain-tree-forest) |
| A lane after snowfall | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/6015772/photo-image-public-domain-tree-forest) |
| Pines on a winter ridge | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/6024617/photo-image-public-domain-tree-forest) |
| Sandstone, sculpted by water | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/3298937/free-photo-image-landscape-best-stone-pictures-images-bizarre) |
| Icefall, in black and white | museumofnewzealand | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/13029746/long-narrow-waterfall) |
| A waterfall at a long exposure | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/3288614/free-photo-image-blur-background-cc0-cliff) |
| Sun on an old facade | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/6037706/photo-image-public-domain-sunlight-free) |
| Twin towers of a cathedral | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/6026866/photo-image-public-domain-free-history) |
| Tower Bridge at night | not credited | CC0 1.0 | [rawpixel](https://www.rawpixel.com/image/5906990/photo-image-public-domain-free-night) |
| A skyline at blue hour | Matt Bango | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/city-skyline-VXO9P3MDVP) |
| The harbour bridge at sunset | Wyncliffe | CC0 1.0 | [stocksnap](https://stocksnap.io/photo/city-bridge-FRWSEDYSC4) |
| Fog on a forest creek | Roc0ast3r | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3AFog_in_forest_and_creek_at_Kent%2C_Washington.jpg) |
| Waves on a rocky shore | Jebulon | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ANorthern_coast_Crete_rocks_waves_detail.jpg) |
| Blanket flowers | Peter Cooper Jr. | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ABlanket_flowers%2C_Cathleen_Kuehl_Memorial_Wildflower_Meadow_2026-08-01.jpg) |
| Rock formations, Lost Creek Canyon | blmcalifornia | Public domain | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ARock_formations_in_Lost_Creek_Canyon_(51581784904).jpg) |
| Sunburst in the canyon | blmcalifornia | Public domain | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ARock_formations_in_Lost_Creek_Canyon_(51580275887).jpg) |
| A house facade on Ile d Orleans | Wilfredor | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3AHouse_facade_in_%C3%8Ele_d'Orl%C3%A9ans%2C_Quebec_city%2C_Quebec%2C_Canada202204-23.jpg) |
| St Peter and the Tiber at night | Jebulon | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ASaint_Peter's_Basilica%2C_Sant'Angelo_bridge%2C_by_night%2C_Rome%2C_Italy.jpg) |
| The Tiber at dusk | Jebulon | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ASant'Angelo_bridge%2C_dusk%2C_Rome%2C_Italy.jpg) |
| A dry stone wall in the Dordogne | Jebulon | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3AStone_wall_old_farm_Dordogne.jpg) |
| Mossy rocks on Logan Creek | Unknown authorUnknown author or not provided | Public domain | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ALogan_Canyon_Scenic_Byway_-_Mossy_Rocks_of_Spring_Creek_in_Logan_Canyon_-_NARA_-_7720240.jpg) |
| An alpine lake under cloud | GlacierNPS | Public domain | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3AAlpine_Lake_(48920694036).jpg) |
| A snow path at dawn | DimiTalen | CC0 1.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3ASnow-covered_forest_path_at_dawn%2C_near_Villard-Reculas%2C_2026.jpg) |
Full file list: [demo/CREDITS.md](demo/CREDITS.md).
<!-- demo-credits:end -->

## Privacy and safety

- `sharp` is mandatory, so published copies never carry EXIF, GPS or embedded
  thumbnails.
- The GPS IFD in the source photos is never even parsed.
- The build wipes its output directory. Before it does, it refuses to run when
  the output would be the photos folder, the project root, or a non-empty
  directory that does not look like a previous build (unless `--force`).
- A photo that cannot be published fails the build; the page is never written
  with a frame pointing at a missing file.

Details in [SECURITY.md](SECURITY.md).

## Documentation

Start at [docs/INDEX.md](docs/INDEX.md). The short version:
[SETUP.md](docs/SETUP.md) to run it, [API.md](docs/API.md) for the CLI and every
config key, [ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the build and the
engine fit together.

## Built with AI

Keret is hand-written and AI-enhanced. Krisztian owns the specification, the
design decisions and the review; the code was written with **DeepSeek V4.1 Flash
in DeepSeek Harness**, under a documented method: every claim in these docs is
backed by a command in the repository, the tests are the contract, and the review
that drove the extraction from the original site is preserved in the git history
and [docs/CHANGELOG.md](docs/CHANGELOG.md) - so a reader can see which parts came
from where.

## License

MIT. See [LICENSE](LICENSE).
