'use strict';
/* The release guard: a tag and package.json must agree, because the footer prints one and people
   check out the other. Proving it fails on a mismatch matters more than proving it passes. */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('./helpers');

const pkg = require(path.join(ROOT, 'package.json'));

test('a tag that matches the version passes, and one that does not is refused', () => {
  const runCheck = (tag) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-tag.js'), tag], { encoding: 'utf8' });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };

  const good = runCheck('v' + pkg.version);
  assert.equal(good.code, 0, 'the version package.json declares is accepted: ' + good.stderr);
  assert.match(good.stdout, /matches package\.json/);

  const bad = runCheck('v99.99.99');
  assert.equal(bad.code, 1, 'a tag that disagrees is refused');
  assert.match(bad.stderr, /the tag says 99\.99\.99 but package\.json says /);

  const none = runCheck('');
  assert.equal(none.code, 1, 'a tag with no version is refused rather than passing quietly');
  assert.match(none.stderr, /nothing to check/);
});
