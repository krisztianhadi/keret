'use strict';
/*
 * layout.js - wall geometry.
 *
 * Masonry with portrait pairing: a column slot ("brick") is either one
 * full-width photo, or TWO portrait photos side by side sized to fill the same
 * slot width, so portrait pairs read like a landscape tile and never tower
 * over the column rhythm. Bricks flow into equal-width masonry columns and every
 * column is shifted onto one shared midpoint axis.
 *
 * The silhouette is `layout.shape`:
 *   'circle' (default) - each column is capped by a circle, so the wall reads as
 *       a disc. The disc is what the shared axis was always for: cap the columns
 *       by an arc instead of equalizing them and the outline becomes a plate.
 *   'oval' - the same arc in a phone-proportioned ellipse (OVAL_ASPECT), which
 *       fills a portrait screen at fit instead of floating in the middle of it.
 *   'arch' - the classic rectangle: columns equalized (shortest column first),
 *       then sorted tallest-to-middle for a soft arch along the top and bottom.
 *
 * Determinism contract: for a given photo set and config the output is
 * byte-stable. It is NOT additive-stable - photos are ordered by a hash of
 * their filename (so the wall never shows name or date clusters), pairs form
 * from that order, and the column count is chosen for a roughly square canvas,
 * so adding a photo may re-lay the whole wall.
 */

/** FNV-1a hash of a filename: stable sort key for the scrambled wall order. */
function hashFile(name) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Natural filename order (DSC2 < DSC10). Used for logs and tie-breaks. */
function naturalSort(a, b) {
  const pa = a.match(/(\d+)|(\D+)/g) || [];
  const pb = b.match(/(\d+)|(\D+)/g) || [];
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const xa = pa[i], xb = pb[i];
    if (xa == null) return -1;
    if (xb == null) return 1;
    const da = /^\d+$/.test(xa), db = /^\d+$/.test(xb);
    if (da && db) {
      const la = xa.replace(/^0+/, ''), lb = xb.replace(/^0+/, '');
      if (la.length !== lb.length) return la.length - lb.length;
      const c = la.localeCompare(lb);
      if (c) return c;
    } else if (da !== db) return da ? -1 : 1;
    else {
      const c = xa.localeCompare(xb);
      if (c) return c;
    }
  }
  return a.localeCompare(b);
}

const isMarked = (file, suffix) => new RegExp(escapeRe(suffix) + '\\.[^.]+$', 'i').test(file);

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Group photos into bricks (independent of column count, so the column search
 * can reuse it).
 *
 * photos: [{ file, w, h, marked }] - intrinsic px, mark already resolved.
 * Returns [{ list: [...] }] with pw/ph filled in on every photo.
 */
function buildBricks(photos, cfg) {
  const { long, mat, gap, heroRate, heroMinAspect } = cfg.layout;
  const suffix = cfg.layout.markSuffix || '-x';
  const pairBudget = long - 2 * mat - gap;

  const sized = photos.map((p) => ({
    ...p,
    hash: p.hash === undefined ? hashFile(p.file) : p.hash,
    marked: p.marked === undefined ? isMarked(p.file, suffix) : p.marked,
    aspect: (p.w && p.h) ? p.w / p.h : 4 / 3,
  }));
  // scrambled order: hash of the filename, filenames as the tie-break
  sized.sort((a, b) => a.hash - b.hash || naturalSort(a.file, b.file));
  sized.forEach((p, i) => { p.idx = i; });

  const fullSize = (p) => {
    p.pw = long;
    p.ph = Math.max(1, Math.round(long / Math.max(p.aspect, 0.01)));
  };

  const marked = sized.filter((p) => p.marked);              // -x: always full width
  const landscapes = sized.filter((p) => !p.marked && p.aspect >= 1);
  const plainPorts = sized.filter((p) => !p.marked && p.aspect < 1);
  // hero lottery: a stable ~heroRate/10 slice of the unmarked portraits goes big
  const isHero = (p) => (p.hash % 10) < heroRate && p.aspect >= heroMinAspect;
  const heroes = plainPorts.filter(isHero);
  const pairable = plainPorts.filter((p) => !isHero(p));

  for (const p of landscapes) fullSize(p);
  for (const p of marked) fullSize(p);
  for (const p of heroes) fullSize(p);

  const pairCount = Math.floor(pairable.length / 2);
  const pairs = [];
  for (let k = 0; k < pairCount; k++) {
    const list = [pairable[2 * k], pairable[2 * k + 1]];
    const a1 = Math.max(list[0].aspect, 0.01);
    const a2 = Math.max(list[1].aspect, 0.01);
    const h = Math.min(pairBudget / (a1 + a2), 1500);
    list[0].pw = Math.max(1, Math.round(h * a1)); list[0].ph = Math.round(h);
    list[1].pw = Math.max(1, Math.round(h * a2)); list[1].ph = Math.round(h);
    pairs.push({ firstIdx: list[0].idx, list: list });
  }
  // an odd leftover portrait stays a single (wider) brick - deliberate: a lone
  // half-width cell would leave a hole in the column rhythm
  const odd = pairable.length % 2 ? pairable[pairable.length - 1] : null;
  if (odd) fullSize(odd);

  const bricks = [];
  for (const p of landscapes) bricks.push({ firstIdx: p.idx, list: [p] });
  for (const p of marked) bricks.push({ firstIdx: p.idx, list: [p] });
  for (const p of heroes) bricks.push({ firstIdx: p.idx, list: [p] });
  for (const pair of pairs) bricks.push(pair);
  if (odd) bricks.push({ firstIdx: odd.idx, list: [odd] });
  bricks.sort((a, b) => a.firstIdx - b.firstIdx);

  return { bricks, photos: sized };
}

/** How many bricks a photo set produces (used to bound the column search). */
function countBricks(photos, cfg) {
  return buildBricks(photos, cfg).bricks.length;
}

/** How tall an ellipse matched to a phone screen is, as width / height. */
const OVAL_ASPECT = 0.46;

/**
 * The fraction of the silhouette's height a column may use: 1 at the middle,
 * 0 at the rim, following a circle. Bricks are whole, so the outline is a
 * staircase - it reads as a mosaic edge, not a smooth curve.
 */
function shapeProfile(c, cols) {
  const t = (2 * (c + 0.5)) / cols - 1;
  return Math.sqrt(Math.max(0, 1 - t * t));
}

/**
 * Height of the silhouette a photo set needs in `cols` columns of `slot` width,
 * so the arc holds every brick. A shape's area is pi/4 of its bounding box, and
 * an elliptical one of aspect `ratio` needs this many columns to fit the bricks
 * into a box of that shape.
 */
function shapeCols(totalBrickHeight, slot, cols, ratio) {
  return Math.max(3, Math.min(cols, Math.round(
    Math.sqrt((4 * totalBrickHeight * ratio) / (Math.PI * slot)))));
}

/** Total height of every brick, gaps included: what the silhouette must hold. */
function brickTotal(photos, cfg) {
  const { capH, mat, gap } = layoutDims(cfg);
  const { bricks } = buildBricks(photos, cfg);
  return bricks.reduce((sum, brick) =>
    sum + Math.max(...brick.list.map((p) => p.ph + capH + 2 * mat)) + gap, 0);
}

/**
 * Lay the wall out in `cols` columns.
 * Returns { photos, bricks, canvasW, canvasH, cols }.
 */
function layout(photos, cfg, cols) {
  const { long, gap, mat, capH, pad } = layoutDims(cfg);
  const iw = long + 2 * mat;                 // brick slot width incl. mats
  const nCols = Math.max(1, cols || cfg.layout.cols || autoCols(photos, cfg));

  const { bricks, photos: sized } = buildBricks(photos, cfg);
  const shape = cfg.layout.shape || 'circle';
  const slot = iw + gap;
  const heights = bricks.map((brick) => Math.max(...brick.list.map((p) => p.ph + capH + 2 * mat)));
  const colH = new Array(nCols).fill(pad);

  const place = (i, c) => {
    const brick = bricks[i];
    let x = pad + c * slot;
    for (const p of brick.list) {
      p.x = x;
      p.y = colH[c];
      p.col = c;
      x += p.pw + 2 * mat + gap;
    }
    colH[c] += heights[i] + gap;
  };

  if (shape === 'arch') {
    // equal columns: always feed the shortest, which is what fills a rectangle
    for (let i = 0; i < bricks.length; i++) {
      let c = 0;
      for (let k = 1; k < nCols; k++) if (colH[k] < colH[c]) c = k;
      place(i, c);
    }
  } else {
    // a disc: cap each column by the arc, tallest in the middle
    const arrW = nCols * iw + (nCols - 1) * gap;
    const ideal = shape === 'oval' ? arrW / OVAL_ASPECT : arrW;
    const profile = [];
    for (let c = 0; c < nCols; c++) profile.push(shapeProfile(c, nCols));
    const profileSum = profile.reduce((sum, r) => sum + r, 0);
    const total = heights.reduce((sum, h) => sum + h + gap, 0);
    // the arc's own height, stretched if the column count was capped and cannot
    // hold every brick at the shape's aspect
    const arcH = Math.max(ideal, profileSum ? total / profileSum : total);
    const cap = profile.map((r) => arcH * r);
    for (let i = 0; i < bricks.length; i++) {
      let best = 0, bestScore = -Infinity;
      for (let c = 0; c < nCols; c++) {
        const free = cap[c] - (colH[c] - pad);
        // most room left inside the arc; a brick that fits nowhere goes to the
        // column least past its own cap, so leftovers spread across the middle
        // instead of piling into one column and notching the outline
        const score = free >= heights[i] ? free : -1e6 - (colH[c] - pad - cap[c]);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      place(i, best);
    }
  }

  // salon center: shift every column so its vertical midpoint sits on one
  // shared axis - shorter columns extend equally above and below it
  const colHeight = (c) => Math.max(0, colH[c] - gap - pad);
  const used = [];
  for (let c = 0; c < nCols; c++) if (colH[c] > pad) used.push(c);
  const maxH = used.length ? Math.max(...used.map(colHeight)) : 0;
  const midAxis = pad + maxH / 2;
  for (const p of sized) {
    p.y += Math.round(midAxis - (pad + colHeight(p.col) / 2));
  }

  // arch silhouette: the tallest column lands in the middle, the shortest at
  // the outer edges. Only occupied columns take part, so a wall with fewer
  // photos than columns stays centered instead of drifting to one side.
  // A shape already places its heights symmetrically, so its columns keep their
  // left-to-right order (mirrored about the middle); the arch instead brings the
  // tallest column to the middle. Ordering a disc by height breaks it: the two
  // centre columns tie, and the tie-break pushes one of them out to the rim.
  const middle = (nCols - 1) / 2;
  const order = used.slice();
  if (shape === 'arch') order.sort((a, b) => colHeight(b) - colHeight(a) || a - b);
  else order.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
  const targets = archTargets(used.length);
  const compact = new Map();                 // old column -> centered position
  for (let j = 0; j < order.length; j++) compact.set(order[j], j);
  const colCount = Math.max(1, used.length);
  const arrW = colCount * iw + (colCount - 1) * gap;
  const canvasW = pad * 2 + arrW;
  for (const p of sized) {
    const from = p.col;
    const to = compact.get(from) || 0;
    p.col = to;
    // absolute x: centered arrangement, target slot from the arch order
    p.x = pad + targets[to] * slot + (p.x - (pad + from * slot));
  }
  const canvasH = maxH + 2 * pad;
  return { photos: sized, bricks, canvasW, canvasH, cols: colCount };
}

/** Column targets, center-out: [center, center-1, center+1, ...]. */
function archTargets(n) {
  const out = [];
  if (n % 2 === 1) {
    const center = (n - 1) / 2;
    out.push(center);
    for (let d = 1; d <= center; d++) out.push(center - d, center + d);
  } else {
    const left = n / 2 - 1, right = n / 2;
    for (let d = 0; d < n / 2; d++) out.push(left - d, right + d);
  }
  return out;
}

/** caption strip height for the configured number of lines */
function captionHeight(cfg) {
  return cfg.layout.capGap + Math.max(1, cfg.captions.maxLines) * 16 + 2;
}

function layoutDims(cfg) {
  return { ...cfg.layout, capH: captionHeight(cfg) };
}

/**
 * Auto column count. For a shape it is arithmetic rather than a search: a disc
 * of `cols` columns has a height of its own width, so the wall is square at
 * every column count - what fixes the count is how many bricks that arc can
 * hold. (Too few and the arc overflows; too many and the rim columns starve,
 * leaving a small disc inside a big canvas.)
 */
function autoCols(photos, cfg) {
  const max = cfg.layout.maxCols;
  const shape = (cfg.layout && cfg.layout.shape) || 'circle';
  if (shape !== 'arch') {
    const { long, mat, gap } = layoutDims(cfg);
    const slot = long + 2 * mat + gap;
    const ratio = shape === 'oval' ? OVAL_ASPECT : 1;
    return shapeCols(brickTotal(photos, cfg), slot, max, ratio);
  }
  const bricks = countBricks(photos, cfg);
  const target = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, bricks))));
  const lo = Math.max(1, Math.min(target - 2, max));
  const hi = Math.max(lo, Math.min(target + 3, max, Math.max(1, bricks)));
  let best = lo, bestScore = Infinity;
  for (let c = lo; c <= hi; c++) {
    const laid = layout(photos, cfg, c);
    const score = Math.abs(Math.log(laid.canvasW / laid.canvasH)); // 1:1 ideal
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

module.exports = {
  hashFile, naturalSort, layout, autoCols, countBricks, brickTotal, captionHeight,
  layoutDims, isMarked, archTargets, shapeProfile, shapeCols, OVAL_ASPECT,
};
