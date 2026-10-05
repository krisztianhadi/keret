'use strict';
/*
 * stamp.js - the freshness stamp written into dist/index.html.
 *
 * The stamp is a hash of the generator sources, the instance config and the
 * published photo count, so CI can tell whether a committed wall still matches
 * the code that produced it (a stale build is otherwise indistinguishable from
 * a fresh one).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* the generator's own files, relative to the package, not to the wall */
const PACKAGE_ROOT = path.join(__dirname, '..');
const SOURCES = ['gen.js', 'src/config.js', 'src/images.js', 'src/layout.js', 'src/page.js', 'src/stamp.js'];
const STAMP_RE = /<!-- built by gen\.js source=([0-9a-f]+) photos=(\d+) -->/;

/**
 * Label a hashed file by its path inside the package, so the stamp does not
 * depend on where the checkout or the wall happens to live on disk.
 */
function label(file) {
  const rel = path.relative(PACKAGE_ROOT, file);
  return rel.startsWith('..') ? path.basename(file) : rel;
}

/**
 * Hash of the generator sources plus everything else the wall is built from:
 * the instance config and any extra files (the author card).
 */
function sourceHash(root, extra) {
  const home = root || PACKAGE_ROOT;
  const entries = SOURCES.map((f) => path.join(PACKAGE_ROOT, f));
  const configFile = path.join(home, 'wall.config.json');
  if (fs.existsSync(configFile)) entries.push(configFile);
  for (const file of extra || []) if (file && fs.existsSync(file)) entries.push(file);
  const hash = crypto.createHash('sha256');
  for (const file of entries) {
    hash.update(label(file));
    if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 12);
}

function stampLine(root, photoCount, extra) {
  return '<!-- built by gen.js source=' + sourceHash(root, extra) + ' photos=' + photoCount + ' -->';
}

/** Insert or replace the stamp right after the doctype. */
function applyStamp(html, root, photoCount, extra) {
  const line = stampLine(root, photoCount, extra);
  const existing = STAMP_RE.exec(html);
  if (existing) return html.replace(STAMP_RE, line);
  return html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + line);
}

/** Read the stamp out of a built page. Returns { source, photos } or null. */
function readStamp(html) {
  const m = STAMP_RE.exec(html);
  return m ? { source: m[1], photos: Number(m[2]) } : null;
}

module.exports = { sourceHash, stampLine, applyStamp, readStamp, STAMP_RE, SOURCES, PACKAGE_ROOT };
