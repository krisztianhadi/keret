#!/usr/bin/env node
'use strict';
/* A pushed v* tag has to be the version in package.json. The footer prints that version, so a
   tag that disagrees with it is a claim nobody can check out - and the drift is invisible until
   someone tries. Run from the repository root, or let the workflow pass GITHUB_REF_NAME. */

const fs = require('fs');
const path = require('path');

const ref = process.env.GITHUB_REF_NAME || process.argv[2] || '';
const tag = ref.replace(/^v/, '');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

if (!tag) {
  console.error('check-tag: nothing to check - pass a tag as an argument or set GITHUB_REF_NAME');
  process.exit(1);
}
if (tag !== pkg.version) {
  console.error('check-tag: the tag says ' + tag + ' but package.json says ' + pkg.version);
  process.exit(1);
}
console.log('check-tag: ' + ref + ' matches package.json ' + pkg.version);
