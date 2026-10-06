# Keret documentation

Keret builds a static photo wall from a folder of photographs: one page, every
photo in a frame, pan and zoom, no framework and no server runtime.

| Document | Read it when |
| --- | --- |
| [SETUP.md](SETUP.md) | installing, running, serving, deploying to Pages, ports and troubleshooting |
| [API.md](API.md) | you need the CLI flags, the setup questions, the environment variables, every `wall.config.json` key, the captions sidecar, or the photographer card |
| [ARCHITECTURE.md](ARCHITECTURE.md) | you are changing the code: the build pipeline, the layout algorithm, the engine's constraints, the guard rails |
| [HOSTING.md](HOSTING.md) | you want it on the web: GitHub Pages, Cloudflare Pages, Netlify, or your own server |
| [CHANGELOG.md](CHANGELOG.md) | you want to know what changed, dated and tagged |
| [../README.md](../README.md) | you want the pitch and the quick start |
| [../demo/CREDITS.md](../demo/CREDITS.md) | you want the sources and licenses of the demo photographs |

## The shape of the thing

```
photos/            your originals (never committed, never written to)
wall.config.json   optional: identity, caption rules, wall geometry, image sizes,
                   the credit line
author.json        optional: the photographer card in the corner
        |
        v
   node gen.js     first run on a terminal asks a few questions and writes the
                   two JSON files above; --yes never asks
        |
        v
dist/              index.html, photos/, og.jpg, robots.txt, sitemap.xml, .nojekyll
```

The page is one HTML file with the layout baked in as data and the engine inlined,
so the browser never waits on image dimensions before placing a frame.

## Contracts this repository treats as fixed

- **Determinism.** The same photos and config produce a byte-identical `dist/`
  tree, on any machine. `test/build.test.js` enforces it.
- **Privacy.** Published copies are always re-encoded, so no EXIF, GPS or
  embedded thumbnails ship. `sharp` is a hard requirement for exactly this reason.
- **No broken frames.** A photo that fails to publish fails the build; the page is
  never written listing a file that is not there.
- **Rendering path.** `src/assets/{head.html,body.html,page.css,engine.js,ui.js}`
  are emitted verbatim; `test/page.test.js` fails if the build starts transforming
  them. Change them deliberately, with a device test.
- **Nobody is asked without a terminal.** The first-run wizard is silent in CI, in
  a pipe and on `--check`, and `--yes` turns it off anywhere. A build must never
  wait for input that cannot arrive.
