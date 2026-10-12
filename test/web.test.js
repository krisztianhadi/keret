'use strict';
/*
 * web.test.js - the browser build's own contracts.
 *
 * The app in web/ is not a second implementation: it runs src/*.js from a
 * generated bundle behind node shims. These tests cover the two ways that can
 * quietly go wrong - the shims changing what the build sees, and the bundle
 * drifting away from the sources it claims to embed - plus the zip the user
 * actually downloads, which is hand-written and has no library checking it.
 *
 * The build itself is exercised end to end in a real browser; see
 * docs/ARCHITECTURE.md ("The browser build").
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const DEMO_PHOTOS = path.join(ROOT, 'demo', 'photos');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

test('the browser runtime reads a folder of photographs exactly as the CLI does', async () => {
  const { createKeret } = await import('../web/keret-runtime.js');
  const keret = createKeret();

  const names = fs.readdirSync(DEMO_PHOTOS).sort();
  for (const name of names) {
    keret.write('/photos/' + name, new Uint8Array(fs.readFileSync(path.join(DEMO_PHOTOS, name))));
  }

  const browserConfig = keret.require('/src/config.js');
  const browserImages = keret.require('/src/images.js');
  const browser = browserImages.scanPhotos('/photos', browserConfig.loadConfig({ root: '/', env: {} }).config, null);

  const cliConfig = require('../src/config');
  const cliImages = require('../src/images');
  const cli = cliImages.scanPhotos(DEMO_PHOTOS, cliConfig.loadConfig({ root: ROOT, env: {} }).config, null);

  assert.ok(cli.photos.length > 50, 'the demo folder is the fixture this parity check needs');
  assert.equal(browser.photos.length, cli.photos.length);
  assert.deepEqual(browser.skipped, cli.skipped);

  // mtime is the one field the vfs does not carry: nothing in the build reads it
  const strip = (p) => { const { mtime, ...rest } = p; return rest; };
  assert.deepEqual(browser.photos.map(strip), cli.photos.map(strip));
});

test('the browser bundle is built from the sources in this repository', async () => {
  const { META } = await import('../web/vendor/keret-core.js');
  const bundles = [
    ...Object.entries(META.sources).map(([rel, hash]) => [hash, fs.readFileSync(path.join(ROOT, rel))]),
    ...Object.entries(META.assets).map(([name, hash]) => [hash, fs.readFileSync(path.join(ROOT, 'src', 'assets', name))]),
    ...Object.entries(META.fonts).map(([name, hash]) => [hash, fs.readFileSync(path.join(ROOT, 'src', 'assets', 'fonts', name))]),
  ];
  assert.ok(bundles.length >= 10, 'the bundle embeds sources, assets and fonts');
  for (const [hash, bytes] of bundles) {
    assert.equal(sha(bytes), hash, 'web/vendor/keret-core.js is stale - run `npm run web:build`');
  }

  // The version the app's footer shows is stamped here too, and the per-file
  // hashes above cannot see it: bumping package.json without rebuilding used to
  // leave the page announcing the version before last.
  const want = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  assert.equal(META.version, want,
    'the bundle carries the version in package.json - run `npm run web:build`');
});

test('the zip writer produces an archive a reader can walk', async () => {
  const { buildZip, crc32 } = await import('../web/zip.js');

  // the standard check value for CRC-32 (as printed by zlib's crc32("123456789"))
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const entries = [
    { path: 'index.html', bytes: new TextEncoder().encode('<html>wall</html>') },
    { path: 'photos/a b.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) },
  ];
  const buffer = Buffer.from(await buildZip(entries).arrayBuffer());

  const eocd = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(eocd), 0x06054b50, 'end of central directory');
  assert.equal(buffer.readUInt16LE(eocd + 10), entries.length);

  const centralAt = buffer.readUInt32LE(eocd + 16);
  let cursor = centralAt;
  const seen = [];
  for (let i = 0; i < entries.length; i++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, 'central header');
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    const at = buffer.readUInt32LE(cursor + 42);
    assert.equal(buffer.readUInt32LE(at), 0x04034b50, 'local header');
    const data = buffer.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    assert.equal(buffer.readUInt32LE(cursor + 16), crc32(data), 'crc of ' + name);
    assert.deepEqual(data, Buffer.from(entries[i].bytes));
    seen.push(name);
    cursor += 46 + nameLen;
  }
  assert.deepEqual(seen, entries.map((e) => e.path));
});

test('the browser app parses, and is wired to the page it ships with', () => {
  const app = fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');

  // It has to parse at all: an edit that eats half a function is invisible to the
  // rest of this suite (the bundle is generated from src/, which app.js is not).
  // Imports are dropped so this can be parsed as a script without node's
  // experimental module loader.
  const withoutImports = app.replace(/^import .*$/gm, '');
  assert.doesNotThrow(() => new vm.Script(withoutImports), 'web/app.js must parse');

  // Every function it calls has to exist in it. This is the failure mode that keeps
  // happening when the file is edited in pieces: the module reads fine until the
  // line that calls the missing function, and then the page is dead.
  const defined = new Set([
    ...[...withoutImports.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]),
    ...[...withoutImports.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]),
    // destructuring: const { loadConfig, fontOf } = keret.require(...)
    ...[...withoutImports.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)]
      .flatMap((m) => m[1].split(',').map((n) => n.split(':').pop().trim())),
    // whatever it imports is defined elsewhere (and the imports are stripped above)
    ...[...app.matchAll(/^import\s*\{([^}]*)\}/gm)].flatMap((m) => m[1].split(',').map((n) => n.trim())),
  ]);
  const code = withoutImports
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const called = new Set([...code.matchAll(/(?<![.\w"'`])([a-z][\w$]*)\s*\(/g)].map((m) => m[1]));
  const language = new Set(('if for while switch catch return typeof function new Promise String Number Boolean Array '
    + 'Object Math JSON setTimeout clearTimeout requestAnimationFrame createImageBitmap document window getComputedStyle async').split(' '));
  assert.deepEqual([...called].filter((name) => !defined.has(name) && !language.has(name)), [],
    'web/app.js calls something it never defines');

  // And every id it reaches for has to be in the page: the two drift apart silently.
  const ids = [...app.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)].filter((id) => !html.includes('id="' + id + '"')), [],
    'web/app.js reaches for an id the page does not have');
});

test('the deploy step versions the assets, and what it writes can be loaded', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'keret-version-'));
  const copies = ['index.html', 'hosting.html', '404.html', 'app.css', 'app.js',
    'keret-runtime.js', 'canvas-sharp.js', 'zip.js'];
  for (const name of copies) fs.copyFileSync(path.join(ROOT, 'web', name), path.join(scratch, name));
  fs.cpSync(path.join(ROOT, 'web', 'vendor'), path.join(scratch, 'vendor'), { recursive: true });

  execFileSync(process.execPath, [path.join(ROOT, 'web', 'version-assets.mjs'), scratch, 'testsha'], { stdio: 'pipe' });

  // the pages point at the versioned copies
  const index = fs.readFileSync(path.join(scratch, 'index.html'), 'utf8');
  assert.match(index, /src="vtestsha\/app\.js"/);
  assert.match(index, /href="vtestsha\/app\.css"/);
  for (const page of ['hosting.html', '404.html']) {
    assert.match(fs.readFileSync(path.join(scratch, page), 'utf8'), /href="vtestsha\/app\.css"/);
  }

  // and every module the versioned scripts import relative to themselves is there,
  // which is the failure a hand-maintained copy list invites
  for (const name of ['app.js', 'keret-runtime.js', 'canvas-sharp.js', 'zip.js']) {
    const file = path.join(scratch, 'vtestsha', name);
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source, fs.readFileSync(path.join(ROOT, 'web', name), 'utf8'),
      name + ' must be copied through unchanged');
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      assert.ok(fs.existsSync(path.join(path.dirname(file), match[1])),
        name + ' imports ' + match[1] + ', which the versioned directory does not have');
    }
  }

  // no version (a local build) must change nothing at all
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'keret-plain-'));
  fs.copyFileSync(path.join(ROOT, 'web', 'index.html'), path.join(plain, 'index.html'));
  execFileSync(process.execPath, [path.join(ROOT, 'web', 'version-assets.mjs'), plain, ''], { stdio: 'pipe' });
  assert.match(fs.readFileSync(path.join(plain, 'index.html'), 'utf8'), /href="app\.css"/);
  assert.deepEqual(fs.readdirSync(plain), ['index.html']);

  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(plain, { recursive: true, force: true });
});
