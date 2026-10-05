# Keret documentation

Keret builds a static photo wall from a folder of photographs: one page, every
photo in a frame, pan and zoom, no framework and no server runtime.

| Document | Read it when |
| --- | --- |
| [SETUP.md](SETUP.md) | installing, running, serving, deploying to Pages, ports and troubleshooting |
| [API.md](API.md) | you need the CLI flags, the environment variables, every `wall.config.json` key, or the captions sidecar format |
| [ARCHITECTURE.md](ARCHITECTURE.md) | you are changing the code: the build pipeline, the layout algorithm, the engine's constraints, the guard rails |
| [CHANGELOG.md](CHANGELOG.md) | you want to know what changed, dated and tagged |
| [../README.md](../README.md) | you want the pitch and the quick start |
| [../demo/CREDITS.md](../demo/CREDITS.md) | you want the sources and licenses of the demo photographs |

## The shape of the thing

```
photos/            your originals (never committed, never written to)
wall.config.json   optional: identity, caption rules, wall geometry, image sizes
        |
        v
    node gen.js
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
- **Rendering path.** `src/assets/{head.html,body.html,page.css,engine.js}` are
  emitted verbatim; `test/page.test.js` fails if the build starts transforming
  them. Change them deliberately, with a device test.
