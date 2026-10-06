#!/usr/bin/env node
'use strict';
/*
 * gen.js - build the photo wall.
 *
 *   node gen.js [options]
 *
 * Run it from the directory that holds wall.config.json and the photos.
 *
 *     --photos <dir>    photo source directory        (config: photosDir)
 *     --out <dir>       output directory              (config: outDir)
 *     --config <file>   instance config file          (default: wall.config.json)
 *     --force           wipe a non-empty output directory that is not a build
  --yes             never ask anything: use the config, or the defaults
  --setup           ask the setup questions again
 *     --yes             never ask anything: use the config, or the defaults
 *     --setup           ask the setup questions again
 *     --check           scan + lay out, write nothing (CI friendly)
 *     --help            this text
 *
 * Positional arguments are still accepted for backwards compatibility:
 *   node gen.js [photosDir] [outDir]
 *
 * What it does:
 *   1. scans photosDir for images (jpg/jpeg/png/webp/gif)
 *   2. reads intrinsic sizes + EXIF orientation from the file headers, so the
 *      layout matches how a browser renders each photo (never cropped)
 *   3. re-encodes every photo into outDir/photos (metadata stripped, EXIF
 *      orientation baked in) plus a low-res tier and an inline placeholder
 *   4. lays the wall out, then writes index.html, og.jpg, robots.txt,
 *      sitemap.xml, CNAME and .nojekyll
 *
 * The page is only ever built from copies that were actually written, and the
 * build fails loudly if a photo could not be published - a wall that
 * references a missing file is worse than a failed build.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { loadConfig, checkPaths } = require('./src/config');
const setupModule = require('./src/setup');
const stampMod = require('./src/stamp');
const layoutMod = require('./src/layout');
const images = require('./src/images');
const { buildPage } = require('./src/page');

/*
 * The instance is built where the command runs: config, photos and output all
 * resolve against the current working directory, so the tool can live anywhere
 * (a checkout, an npm bin) while the wall is built next to the photos.
 */
const ROOT = process.cwd();

/** Build failures carry the exit code the CLI should use. */
class BuildError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'BuildError';
    this.exitCode = code || 1;
  }
}

const USAGE = `photo wall generator

  node gen.js [options]

  --photos <dir>    photo source directory       (config: photosDir)
  --out <dir>       output directory             (config: outDir)
  --config <file>   instance config file         (default: wall.config.json)
  --force           wipe a non-empty output directory that is not a build
  --check           scan + lay out, write nothing
  --help            this text

environment: WALL_CONFIG points at a config file, WALL_* variables override
individual settings (see docs/SETUP.md).\n`;

/** Parse argv: flags win, two positional args stay supported. */
function parseArgs(argv) {
  const out = { positional: [], force: false, check: false, help: false, yes: false, setup: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--force') { out.force = true; continue; }
    if (a === '--yes' || a === '-y') { out.yes = true; continue; }
    if (a === '--setup' || a === '--init') { out.setup = true; continue; }
    if (a === '--check' || a === '--dry-run') { out.check = true; continue; }
    if (a === '--photos' || a === '--out' || a === '--config') {
      const value = argv[++i];
      if (value === undefined) throw new Error(a + ' needs a value');
      out[a.slice(2)] = value;
      continue;
    }
    if (a.startsWith('--')) throw new Error('unknown option ' + a);
    out.positional.push(a);
  }
  if (out.positional.length > 2) {
    throw new Error('too many arguments (expected at most photosDir and outDir)');
  }
  if (out.positional[0]) out.photos = out.photos || out.positional[0];
  if (out.positional[1]) out.out = out.out || out.positional[1];
  return out;
}

/**
 * The two caption lines the engine draws, as the wall data it reads:
 * `spec` is the exposure line (optionally prefixed with the year) and `cam` the
 * camera. captions.maxLines 0/1 drops the camera line, 0 drops the spec too.
 *
 * Two fallbacks keep a wall captioned when the photographs carry no EXIF (stock
 * photos, scans, exports): the author's own title takes the exposure line, and
 * the sidecar credit takes the camera line.
 */
function captionPair(photo, cfg) {
  const max = Math.max(0, Math.min(2, cfg.captions.maxLines));
  const spec = cfg.captions.showSpecs
    ? [cfg.captions.showYear ? photo.year : '', photo.specs || photo.title].filter(Boolean).join(' - ')
    : '';
  const cam = cfg.captions.showCamera ? (photo.camera || photo.credit) : '';
  return { spec: max >= 1 ? spec : '', cam: max >= 2 ? cam : '' };
}

/** Alt text: the author's words when a sidecar provides them, else the facts. */
function altText(photo) {
  const facts = [photo.specs, photo.camera].filter(Boolean).join(' ');
  if (photo.alt) return photo.alt;
  if (photo.title) return facts ? photo.title + ' - ' + facts : photo.title;
  const readable = photo.base.replace(/[-_]+/g, ' ').trim();
  return facts ? readable + ' - ' + facts : readable;
}

/* The author card is a small, strict file: a typo should fail the build rather
   than quietly ship a half-empty card. */
const AUTHOR_KEYS = new Set(['name', 'role', 'bio', 'email', 'phone', 'location', 'links']);

/**
 * Optional photographer card, read from <root>/author.json (config: author.file).
 * Returns { data, file }: data is null when no card is configured or the file is
 * absent, and file is the resolved path the stamp has to cover.
 */
function readAuthor(root, cfg) {
  if (!cfg.author || !cfg.author.file) return { data: null, file: null };
  const file = path.resolve(root, cfg.author.file);
  if (!fs.existsSync(file)) return { data: null, file: null };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error('cannot read author file ' + file + ': ' + err.message);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('author file ' + file + ' must contain a JSON object');
  }
  for (const key of Object.keys(parsed)) {
    if (!AUTHOR_KEYS.has(key)) {
      throw new Error('unknown key "' + key + '" in ' + file + ' - known keys: '
        + [...AUTHOR_KEYS].join(', '));
    }
  }
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    throw new Error('author file ' + file + ' needs a "name"');
  }
  for (const key of ['role', 'bio', 'email', 'phone', 'location']) {
    if (parsed[key] !== undefined && typeof parsed[key] !== 'string') {
      throw new Error('author "' + key + '" must be a string in ' + file);
    }
  }
  const links = parsed.links || [];
  if (!Array.isArray(links)) throw new Error('author "links" must be an array in ' + file);
  for (const link of links) {
    if (!link || typeof link.href !== 'string' || !/^(https?:|mailto:|tel:)/i.test(link.href)) {
      throw new Error('every author link needs an href starting with http(s)://, mailto: or tel: in ' + file);
    }
    if (link.label !== undefined && typeof link.label !== 'string') {
      throw new Error('author link "label" must be a string in ' + file);
    }
  }
  return { data: { ...parsed, links }, file };
}

/** Optional captions sidecar: { "DSC0123.jpg": "Title" | { title, alt, credit } } */
function readCaptions(photosDir, cfg) {
  const file = cfg.captions.file ? path.resolve(photosDir, cfg.captions.file) : null;
  if (!file || !fs.existsSync(file)) return { map: {}, file: null };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error('cannot read captions file ' + file + ': ' + err.message);
  }
  const map = {};
  for (const [key, value] of Object.entries(parsed)) {
    const entry = typeof value === 'string' ? { title: value } : (value || {});
    map[key] = entry;
    map[path.basename(key, path.extname(key))] = entry;
  }
  return { map, file };
}

async function main(argv) {
  const args = parseArgs(argv || process.argv.slice(2));
  if (args.help) { process.stdout.write(USAGE); return; }

  const loadOptions = { root: ROOT, configPath: args.config ? path.resolve(args.config) : undefined };
  let loaded = loadConfig(loadOptions);
  let authorCard = readAuthor(ROOT, loaded.config);

  /* the first-run wizard: a terminal, no --yes, and not a dry run */
  if (process.stdin.isTTY && process.stdout.isTTY && !args.yes && !args.check) {
    const configFile = loaded.configPath || path.join(ROOT, 'wall.config.json');
    const outcome = await setupModule.setup({
      root: ROOT,
      configFile,
      current: fs.existsSync(configFile) ? { ...loaded.config, authorCard: authorCard.data } : null,
      photosDir: path.resolve(ROOT, args.photos || loaded.config.photosDir),
      force: args.setup,
      input: process.stdin,
      output: process.stdout,
    });
    if (outcome.wrote) {
      loaded = loadConfig(loadOptions);
      authorCard = readAuthor(ROOT, loaded.config);
    }
  }

  const { config, configPath } = loaded;

  const photosDir = path.resolve(ROOT, args.photos || config.photosDir);
  const outDir = path.resolve(ROOT, args.out || config.outDir);

  // GitHub Pages custom domain doubles as the site URL when none is configured
  const cnameFile = path.join(ROOT, 'CNAME');
  const cname = fs.existsSync(cnameFile) ? fs.readFileSync(cnameFile, 'utf8').trim() : '';
  if (!config.siteUrl && cname) config.siteUrl = 'https://' + cname + '/';

  const guard = checkPaths({ root: ROOT, photosDir, outDir, force: args.force });
  if (!guard.ok) {
    throw new BuildError('refusing to build:\n'
      + guard.errors.map((e) => '  - ' + e).join('\n')
      + '\n  photos: ' + photosDir + '\n  output: ' + outDir, 2);
  }
  if (!fs.existsSync(photosDir)) {
    throw new BuildError('photos dir not found: ' + photosDir, 2);
  }

  images.requireSharp(); // hard requirement: see src/images.js
  const captions = readCaptions(photosDir, config);
  const { photos, skipped } = images.scanPhotos(photosDir, config, captions.file);

  for (const p of photos) {
    const entry = captions.map[p.file] || captions.map[p.base] || null;
    if (entry) {
      p.title = entry.title || '';
      p.alt = entry.alt || '';
      p.credit = entry.credit || '';
      if (entry.specs) p.specs = entry.specs;
    } else {
      p.title = ''; p.alt = ''; p.credit = '';
    }
  }

  const maxScale = config.zoom.max;
  const capH = layoutMod.captionHeight(config);
  const cols = config.layout.cols > 0
    ? config.layout.cols
    : layoutMod.autoCols(photos, config);
  const laid = layoutMod.layout(photos, config, cols);

  console.log('config: ' + (configPath || 'built-in defaults'));
  console.log('photos: ' + photos.length + ' in ' + photosDir);
  console.log('columns: ' + cols + (config.layout.cols > 0 ? ' (fixed)' : ' (auto: squarest canvas)'));
  console.log('canvas: ' + laid.canvasW + 'x' + laid.canvasH + ' px, max zoom ' + maxScale + 'x');

  if (args.check) {
    const missing = laid.photos.filter((p) => !fs.existsSync(path.join(photosDir, p.file)));
    console.log('check: layout ok, nothing written' + (missing.length ? ', missing files: ' + missing.length : ''));
    if (skipped.length) console.log('ignored: ' + skipped.map((s) => s.file + ' (' + s.reason + ')').join(', '));
    return;
  }

  /* clean + rebuild the output dir */
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'photos'), { recursive: true });

  /* 1. publish the photos: only files that were really written end up on the
        wall, so index.html can never reference something that is not there */
  const published = [];
  const failed = [];
  let origBytes = 0, servedBytes = 0;
  for (const p of laid.photos) {
    const src = path.join(photosDir, p.file);
    let r;
    try {
      r = await images.writeCopies(p.file, src, outDir, config); // eslint-disable-line no-await-in-loop
    } catch (err) {
      failed.push({ file: p.file, reason: err.message });
      continue;
    }
    const destFull = path.join(outDir, 'photos', p.file);
    if (!fs.existsSync(destFull) || fs.statSync(destFull).size === 0) {
      failed.push({ file: p.file, reason: 'output file missing after write' });
      continue;
    }
    origBytes += r.before;
    servedBytes += r.after;
    p.thumb = r.thumb;
    published.push(p);
  }

  if (failed.length) {
    throw new BuildError('failed to publish ' + failed.length + ' photo(s):\n'
      + failed.map((f) => '  - ' + f.file + ': ' + f.reason).join('\n')
      + '\nthe page was not written - fix the photos and run again', 3);
  }

  // The rows are handed to the engine exactly as it expects them: the same keys
  // the pre-refactor build emitted (x, y, pw, ph, file, w, h, base, title, spec,
  // cam, thumb). 'w'/'h' are the real pixel size, which the engine does not read.
  for (const p of published) {
    const cap = captionPair(p, config);
    p.spec = cap.spec;
    p.cam = cap.cam;
    // alt text is built while the author's title is still on the photo; the
    // filename title below is for the frame, not for a screen reader
    const alt = altText(p);
    p.title = p.base.toUpperCase() + path.extname(p.file).toUpperCase();
    p.alt = alt;
  }
  // the layout never changes once photos are published, so the wall keeps its
  // geometry; only photos that made it through are on it
  const model = {
    photos: published.map((p) => ({
      x: p.x, y: p.y, pw: p.pw, ph: p.ph,
      file: p.file, w: p.w, h: p.h, base: p.base,
      title: p.title, spec: p.spec, cam: p.cam, thumb: p.thumb,
      alt: p.alt,
    })),
    canvasW: laid.canvasW,
    canvasH: laid.canvasH,
    capH,
    maxScale,
    // page chrome: the credit line, and the photographer when one is configured
    chrome: { credit: config.credit, author: authorCard.data },
  };

  /* 2. the page + its furniture */
  const pageCfg = config;
  const html = stampMod.applyStamp(buildPage(model, pageCfg), ROOT, published.length,
    authorCard.file ? [authorCard.file] : []);

  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  if (cname) fs.writeFileSync(path.join(outDir, 'CNAME'), cname + '\n');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  /* social preview + icon + crawler files */
  let ogBytes = 0;
  let ogFrom = '';
  const ogCard = config.og.source ? path.resolve(ROOT, config.og.source) : '';
  if (ogCard && fs.existsSync(ogCard)) {
    // a designed card committed with the site: use it as it is
    fs.copyFileSync(ogCard, path.join(outDir, 'og.jpg'));
    ogBytes = fs.statSync(path.join(outDir, 'og.jpg')).size;
    ogFrom = config.og.source;
  } else {
    const ogFile = config.og.photo && fs.existsSync(path.join(photosDir, config.og.photo))
      ? config.og.photo
      : ogCandidate(published, config);
    if (ogFile) {
      try {
        ogBytes = await images.writeOgImage(ogFile, path.join(photosDir, ogFile), path.join(outDir, 'og.jpg'), config, {
          title: config.title,
          author: authorCard.data ? authorCard.data.name : '',
          photos: published.length,
        });
        ogFrom = 'generated from ' + ogFile;
      } catch (err) {
        console.warn('warning: could not build og.jpg from ' + ogFile + ': ' + err.message);
      }
    }
  }
  try {
    await images.writeTouchIcon(path.join(outDir, 'apple-touch-icon.png'), config);
  } catch (err) {
    console.warn('warning: could not build apple-touch-icon.png: ' + err.message);
  }

  const site = config.siteUrl ? config.siteUrl.replace(/\/?$/, '/') : '';
  fs.writeFileSync(path.join(outDir, 'robots.txt'),
    'User-agent: *\nAllow: /\n' + (site ? 'Sitemap: ' + site + 'sitemap.xml\n' : ''));
  if (site) {
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      // no <lastmod>: the build must be byte-reproducible, and a build date
      // would make every rebuild differ
      + '  <url>\n    <loc>' + xml(site) + '</loc>\n    <changefreq>weekly</changefreq>\n  </url>\n</urlset>\n');
  }

  /* 3. report */
  const mb = (n) => (n / (1024 * 1024)).toFixed(1);
  console.log('wall: ' + published.length + ' photos, ' + path.join(outDir, 'index.html'));
  console.log('images: ' + mb(origBytes) + ' MB original -> ' + mb(servedBytes) + ' MB served'
    + (origBytes > servedBytes ? ', saved ' + mb(origBytes - servedBytes) + ' MB' : ''));
  if (ogBytes) console.log('og.jpg: ' + mb(ogBytes) + ' MB - ' + ogFrom);
  if (config.analytics) console.log('analytics: ' + config.analytics.script);
  else console.log('analytics: off');
  if (skipped.length) {
    console.log('ignored ' + skipped.length + ' file(s):');
    for (const s of skipped) console.log('  - ' + s.file + ': ' + s.reason);
  }
}

/**
 * Default social preview: the photo that fits the card best.
 *
 * The obvious pick - the widest landscape - is the worst one: an extreme
 * panorama has to be cropped to its middle half and blown up to fill 1200x630,
 * so the card ships soft. Score instead for the least cropping and no
 * enlargement, and a wall with no chosen `og.photo` still gets a sharp card.
 */
function ogCandidate(photos, config) {
  const target = config.images.ogWidth / config.images.ogHeight;
  const scaleFor = (want, have) => Math.max(1, want / have);
  let best = null;
  let bestScore = Infinity;
  for (const p of photos) {
    if (!p.w || !p.h) continue;
    const aspect = p.w / p.h;
    const upscale = Math.max(scaleFor(config.images.ogWidth, p.w), scaleFor(config.images.ogHeight, p.h));
    const cropped = Math.abs(aspect - target) / Math.max(aspect, target);
    const score = (upscale - 1) * 2 + cropped * 1.5;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best ? best.file : '';
}

function xml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (require.main === module) {
  main().catch((err) => {
    const code = err && err.exitCode ? err.exitCode : 1;
    console.error(code === 2 || code === 3 ? err.message : 'build failed: ' + (err && err.message ? err.message : err));
    if (process.env.WALL_DEBUG) console.error(err);
    process.exit(code);
  });
}

module.exports = { main, parseArgs, captionPair, altText, readAuthor, ogCandidate, BuildError };
