# Contributing

Thanks for looking at Keret. The short version: keep it small, keep it
dependency-light, keep the docs honest.

## Getting set up

```sh
npm install                 # sharp, the only dependency
npm run demo                # builds the bundled demo wall into demo/dist
npm run demo:serve          # http://127.0.0.1:3100/
npm test                    # node's own test runner, no framework
```

To try your own photos instead, run the generator from the directory that holds
them:

```sh
mkdir -p ~/pictures/wall/photos
cp ~/photos/*.jpg ~/pictures/wall/photos/
cd ~/pictures/wall && node /path/to/keret/gen.js   # asks a few questions, once
npm --prefix /path/to/keret run serve   # or any static server, over dist/
```

Add `--yes` when the answers should come from `wall.config.json` instead of a
prompt; scripts and CI never get asked either way.

`npm run seed` writes sample images (a wall with something on it before you have
photos of your own).

## Ground rules

- **A wall's own photos are never committed.** `photos/` and `dist/` at the root
  of a wall are gitignored. The bundled demo is the exception: `demo/photos/` and
  `demo/dist/` are committed so the demo builds offline and Pages can serve it.
- **`sharp` stays mandatory.** It is what strips EXIF (including GPS) and bakes
  in orientation. A fallback that copies originals would publish metadata.
- **Determinism matters.** The same photo set and config must produce a
  byte-identical output tree. Nothing may depend on the clock, the environment or
  iteration order of a `Map`.
- **Docs are the source of truth.** If a change alters behavior, update
  `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SETUP.md` and add a dated entry to
  `docs/CHANGELOG.md` (tagged `[Feature]`, `[Fix]` or `[Break]`).
- **US spelling** in code, identifiers, comments, docs and copy.
- **No em dashes** in code, comments, docs or copy - use a plain hyphen.
- **Guard rails stay.** The build wipes its output directory; anything that makes
  that safer (path checks, refusing to publish a page that references a missing
  file) is a feature, not a nuisance.

## License of contributions

Keret is MIT licensed. By opening a pull request you agree that your
contribution is licensed under the same terms (inbound = outbound).

## Before opening a pull request

```sh
npm test
npm run demo
node scripts/check-stamp.js demo/dist/index.html
npm run demo:check
```

If you changed the generator or `demo/wall.config.json`, rebuild `demo/dist/` in
the same commit - CI fails when the committed demo is stale (the build stamp
records the source hash it was produced from).

## Reporting a vulnerability

See [SECURITY.md](SECURITY.md). Do not open a public issue for a
metadata/privacy problem: a broken privacy guarantee is the one class of bug that
must be handled privately first.
