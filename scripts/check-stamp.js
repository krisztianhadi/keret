#!/usr/bin/env node
'use strict';
/*
 * check-stamp.js - verify that a built page is still in sync with the source.
 *
 *   node scripts/check-stamp.js [dist/index.html] [projectRoot]
 *
 * The photos behind a wall are usually not in the repository, so CI cannot
 * rebuild it; it can, however, tell whether the committed page was produced by
 * the generator that is in the tree. If the stamp does not match, build the
 * wall again and commit the output.
 */

const fs = require('fs');
const path = require('path');
const { readStamp, sourceHash, SOURCES, PACKAGE_ROOT } = require('../src/stamp');

const file = process.argv[2] || 'dist/index.html';
/* The wall's project root: <root>/dist/index.html -> <root>, overridable as $3. */
const root = path.resolve(process.argv[3] || path.dirname(path.dirname(path.resolve(file))));

if (!fs.existsSync(file)) {
  console.error('stamp check: ' + file + ' not found - run `npm run build`');
  process.exit(1);
}

const html = fs.readFileSync(file, 'utf8');
const stamp = readStamp(html);
if (!stamp) {
  console.error('stamp check: no build stamp in ' + file + ' - run `npm run build`');
  process.exit(1);
}

const expected = sourceHash(root);
if (stamp.source !== expected) {
  console.error('stamp check: ' + file + ' is stale (built from source=' + stamp.source
    + ', current source=' + expected + ')');
  console.error('  changed since that build: ' + SOURCES.join(', ') + ' or wall.config.json');
  console.error('  fix: build the wall again and commit the output with the source change');
  process.exit(1);
}

// the alternative resolver stats the file list only, so report it as evidence
const missing = SOURCES.filter((f) => !fs.existsSync(path.join(PACKAGE_ROOT, f)));
if (missing.length) {
  console.error('stamp check: source files missing: ' + missing.join(', '));
  process.exit(1);
}

console.log('stamp check: ' + file + ' is in sync (source=' + stamp.source + ', photos=' + stamp.photos + ')');
