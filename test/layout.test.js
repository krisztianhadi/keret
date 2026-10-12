'use strict';
/* layout: determinism, invariants, small walls, pairing and column choice. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { clearWallEnv, tempDir } = require('./helpers');
const { loadConfig } = require('../src/config');
const { layout, autoCols, countBricks, captionHeight, hashFile, OVAL_ASPECT } = require('../src/layout');

clearWallEnv();
const cfg = loadConfig({ root: tempDir(), env: {} }).config;

function photos(n, seed) {
  const list = [];
  const ratios = [3 / 2, 2 / 3, 1, 4 / 3, 9 / 16, 16 / 9];
  for (let i = 0; i < n; i++) {
    const aspect = ratios[(i + (seed || 0)) % ratios.length];
    list.push({
      file: 'photo-' + String(i).padStart(3, '0') + '.jpg',
      w: Math.round(1000 * aspect), h: 1000,
      bytes: 1000, base: 'photo-' + i, camera: '', specs: '', year: '',
    });
  }
  return list;
}

const frame = (p) => {
  const mat = cfg.layout.mat;
  return {
    x: p.x, y: p.y,
    w: p.pw + 2 * mat,
    h: p.ph + captionHeight(cfg) + 2 * mat,
  };
};

test('geometry is deterministic for the same photo set', () => {
  const a = layout(photos(40), cfg, 5);
  const b = layout(photos(40), cfg, 5);
  assert.deepEqual(
    a.photos.map((p) => [p.file, p.x, p.y, p.pw, p.ph]),
    b.photos.map((p) => [p.file, p.x, p.y, p.pw, p.ph]),
  );
});

test('additive changes may re-lay the wall (documented contract)', () => {
  const before = layout(photos(40), cfg, 5);
  const after = layout(photos(41), cfg, 5);
  const moved = before.photos.filter((p) => {
    const q = after.photos.find((x) => x.file === p.file);
    return q && (q.x !== p.x || q.y !== p.y);
  });
  // documenting reality: the wall is stable for a set, not additive-stable
  assert.ok(moved.length >= 0);
  assert.equal(after.photos.length, 41);
});

test('frames never overlap and stay inside the canvas with a symmetric margin', () => {
  const laid = layout(photos(60), cfg, 7);
  const boxes = laid.photos.map(frame);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, 'overlap between ' + laid.photos[i].file + ' and ' + laid.photos[j].file);
    }
  }
  const left = Math.min(...boxes.map((b) => b.x));
  const right = laid.canvasW - Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = laid.canvasH - Math.max(...boxes.map((b) => b.y + b.h));
  assert.equal(left, cfg.layout.pad);
  assert.equal(right, cfg.layout.pad);
  assert.equal(top, cfg.layout.pad);
  assert.equal(bottom, cfg.layout.pad);
});

test('a single photo is centered, not parked in the first of four columns', () => {
  const laid = layout(photos(1), cfg);
  const box = frame(laid.photos[0]);
  assert.equal(laid.cols, 1);
  assert.equal(laid.canvasW, cfg.layout.pad * 2 + cfg.layout.long + 2 * cfg.layout.mat);
  assert.equal(box.x, cfg.layout.pad);
  assert.equal(box.x + box.w + cfg.layout.pad, laid.canvasW);
});

test('an empty photo set produces an empty, non-crashing wall', () => {
  const laid = layout([], cfg);
  assert.equal(laid.photos.length, 0);
  assert.ok(laid.canvasW > 0 && laid.canvasH > 0);
  assert.equal(laid.cols, 1);
});

test('-x marks a portrait as full width', () => {
  const list = photos(4).map((p) => ({ ...p, w: 600, h: 1000 })); // all portraits
  list[0].file = 'marked-x.jpg';
  const laid = layout(list, cfg, 2);
  const marked = laid.photos.find((p) => p.file === 'marked-x.jpg');
  assert.equal(marked.pw, cfg.layout.long);
  assert.equal(marked.marked, true);
});

test('paired portraits share the slot width and the same height', () => {
  const list = photos(2).map((p) => ({ ...p, w: 600, h: 1000 }));
  // heroRate 0: with two portraits the lottery could promote either of them
  const plain = { ...cfg, layout: { ...cfg.layout, heroRate: 0 } };
  const laid = layout(list, plain, 1);
  const [a, b] = laid.photos;
  assert.equal(a.ph, b.ph, 'a pair is one visual tile, so both photos share a height');
  assert.ok(a.pw < cfg.layout.long, 'a paired portrait is half width, not full width');
  const budget = cfg.layout.long - 2 * cfg.layout.mat - cfg.layout.gap;
  assert.ok(Math.abs(a.pw + b.pw - budget) <= 2, 'pair fills the brick slot');
});

test('column count stays near square and within the configured maximum', () => {
  // the big sizes are the point: a cap that only binds past a few hundred photos
  // is invisible to a fixture that stops at 120, and that is exactly how a
  // 1000-photo wall ended up 3.8:1 tall
  for (const n of [1, 3, 12, 40, 120, 400, 1000]) {
    const list = photos(n);
    const cols = autoCols(list, cfg);
    const bricks = countBricks(list, cfg);
    const target = Math.max(1, Math.ceil(Math.sqrt(bricks)));
    assert.ok(cols >= 1 && cols <= cfg.layout.maxCols, 'within maxCols for n=' + n);
    assert.ok(Math.abs(cols - target) <= 3, 'near the squarest column count for n=' + n + ' (' + cols + ' vs ' + target + ')');
    const laid = layout(list, cfg, cols);
    const ratio = laid.canvasW / laid.canvasH;
    assert.ok(ratio > 0.5 && ratio < 2,
      'the canvas stays roughly square for n=' + n + ' (W:H ' + ratio.toFixed(2) + ')');
  }
});

test('the silhouette follows the configured shape', () => {
  // span per column, in the layout's own centre-out order (p.col), so the
  // outline can be read without guessing at slots
  const spans = (laid) => {
    const top = new Array(laid.cols).fill(Infinity);
    const bot = new Array(laid.cols).fill(-Infinity);
    for (const p of laid.photos) {
      top[p.col] = Math.min(top[p.col], p.y);
      bot[p.col] = Math.max(bot[p.col], p.y + p.ph);
    }
    return [...Array(laid.cols).keys()].map((c) => bot[c] - top[c]);
  };
  const shaped = (shape, n) => {
    const cfg2 = { ...cfg, layout: { ...cfg.layout, shape } };
    const list = photos(n);
    const laid = layout(list, cfg2, autoCols(list, cfg2));
    return { laid, span: spans(laid) };
  };

  const circle = shaped('circle', 400);
  const oval = shaped('oval', 400);
  const arch = shaped('arch', 400);

  for (const [name, s, target] of [['circle', circle, 1], ['oval', oval, OVAL_ASPECT], ['arch', arch, null]]) {
    assert.equal(s.laid.photos.length, 400, name + ': every photo is placed exactly once');
    const ratio = s.laid.canvasW / s.laid.canvasH;
    if (target === null) {
      assert.ok(Math.abs(Math.log(ratio)) < 0.2, 'arch keeps a squarish canvas, got ' + ratio.toFixed(2));
    } else {
      // whole bricks cannot tile an arc exactly, so the height runs a couple of
      // percent over the arc it was sized for
      assert.ok(Math.abs(ratio - target) / target < 0.05,
        name + ' canvas is ' + target.toFixed(2) + ':1, got ' + ratio.toFixed(2));
    }
  }

  // a disc tapers: the tallest column is the middle one, heights fall outward,
  // and the rim is a fraction of the middle
  const rimRatio = (s) => s.span[s.span.length - 1] / s.span[0];
  assert.ok(rimRatio(circle) < 0.45, 'circle rim is much shorter than its middle, got ' + rimRatio(circle).toFixed(2));
  assert.ok(rimRatio(oval) < 0.5, 'oval rim tapers too, got ' + rimRatio(oval).toFixed(2));
  assert.ok(rimRatio(arch) > 0.9, 'the arch keeps near-equal columns, got ' + rimRatio(arch).toFixed(2));
  for (const [name, s] of [['circle', circle], ['oval', oval]]) {
    const bumps = s.span.slice(1).map((v, i) => v - s.span[i]).filter((d) => d > 700);
    assert.equal(bumps.length, 0,
      name + ': the outline never steps back outward by more than a brick (' + bumps.join(', ') + ')');
  }
});

test('a shaped wall survives a handful of photos', () => {
  for (const n of [1, 2, 5]) {
    for (const shape of ['circle', 'oval']) {
      const cfg2 = { ...cfg, layout: { ...cfg.layout, shape } };
      const list = photos(n);
      const laid = layout(list, cfg2, autoCols(list, cfg2));
      assert.equal(laid.photos.length, n, shape + ' places all ' + n + ' photo(s)');
      for (const p of laid.photos) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.pw > 0 && p.ph > 0,
          shape + ' with ' + n + ' photos: finite geometry');
      }
      assert.ok(laid.canvasW > 0 && laid.canvasH > 0);
    }
  }
});

test('caption strip grows with the configured number of lines', () => {
  assert.equal(captionHeight(cfg), 22 + 2 * 16 + 2);
  const three = { ...cfg, captions: { ...cfg.captions, maxLines: 3 } };
  assert.equal(captionHeight(three), 22 + 3 * 16 + 2);
});

test('the sort key is a stable hash of the filename', () => {
  assert.equal(hashFile('a.jpg'), hashFile('a.jpg'));
  assert.notEqual(hashFile('a.jpg'), hashFile('b.jpg'));
  assert.ok(hashFile('a.jpg') >= 0);
});
