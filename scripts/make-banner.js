#!/usr/bin/env node
'use strict';
/*
 * make-banner.mjs - render the README images from one capture.
 *
 *   node scripts/make-banner.js [source.jpg]
 *
 * Reads docs/assets/demo-wall.jpg (a plain capture of the demo wall at 1400px)
 * and writes two files next to it:
 *
 *   demo-window.png    the wall inside a browser window, transparent, with a
 *                      drop shadow, so it can sit on any background
 *   readme-header.png  the title card: the same wall, dimmed, with the mark the
 *                      page's favicon and the social card use - a frame outline
 *                      with the wordmark inside it
 *
 * Both are drawn with sharp, which is already a dependency: no browser, no
 * ImageMagick. The wordmark is set in Montserrat; a machine without it falls
 * back to the default sans, which is why the rendered files are committed.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { useProjectFonts } = require('../src/images');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'docs', 'assets');

/* the palette the wall page and the social card share */
const WALL = '#26231e';
const BAR = '#1b1916';
const INK = '#f2eee4';
const DIM = 'rgba(242,238,228,.55)';
const ACCENT = '#e23c30';
const PAGE = 'krisztianhadi.github.io/keret';

/* the wall's own faces: Geist for the wordmark, Geist Mono for the page pill */
const WORDMARK = 'Geist';
const MONO = 'Geist Mono';

const rect = (x, y, w, h, rx, fill) =>
  '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + fill + '"/>';

const circle = (cx, cy, r, fill) =>
  '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>';

const text = (x, y, size, fill, body, opts) => {
  const o = opts || {};
  return '<text x="' + x + '" y="' + y + '" font-family="' + (o.family || WORDMARK) + '"'
    + ' font-size="' + size + '" font-weight="' + (o.weight || 400) + '" fill="' + fill + '"'
    + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '')
    + (o.spacing ? ' letter-spacing="' + o.spacing + '"' : '') + '>'
    + String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</text>';
};

const svg = (w, h, body) =>
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' + body + '</svg>');

/**
 * The wall in a browser window: a title bar with a page pill, the capture
 * clipped to the window's rounded corners, and a soft shadow under all of it.
 */
async function buildWindow(source, out) {
  const viewW = 860;
  const barH = 34;
  const radius = 12;
  const pad = 40;

  // Width only: the window keeps the capture's own aspect, so the page chrome
  // along its bottom edge is never sliced by the crop.
  const view = await sharp(source).resize({ width: viewW }).png().toBuffer();
  const viewH = (await sharp(view).metadata()).height;
  const winW = viewW;
  const winH = viewH + barH;

  // square top corners (the title bar sits there), rounded bottom ones
  const mask = svg(winW, viewH, '<path d="M0,0 H' + winW + ' V' + (viewH - radius)
    + ' a' + radius + ',' + radius + ' 0 0 1 -' + radius + ',' + radius
    + ' H' + radius + ' a' + radius + ',' + radius + ' 0 0 1 -' + radius + ',-' + radius + ' Z" fill="#fff"/>');
  const clipped = await sharp(view).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  const pillW = 260;
  const bar = svg(winW, barH,
    '<path d="M0,' + barH + ' V' + radius + ' a' + radius + ',' + radius + ' 0 0 1 ' + radius + ',-' + radius
    + ' H' + (winW - radius) + ' a' + radius + ',' + radius + ' 0 0 1 ' + radius + ',' + radius + ' V' + barH + ' Z" fill="' + BAR + '"/>'
    + rect(0, barH - 1, winW, 1, 0, 'rgba(255,255,255,.07)')
    + circle(20, barH / 2, 5, ACCENT)
    + circle(38, barH / 2, 5, 'rgba(242,238,228,.22)')
    + circle(56, barH / 2, 5, 'rgba(242,238,228,.22)')
    + rect((winW - pillW) / 2, 8, pillW, barH - 16, (barH - 16) / 2, 'rgba(255,255,255,.06)')
    + text(winW / 2, barH / 2 + 3, 12, DIM, PAGE, { family: MONO, anchor: 'middle', spacing: 0.4 }));

  const window = await sharp({
    create: { width: winW, height: winH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: clipped, top: barH, left: 0 }, { input: bar, top: 0, left: 0 }])
    .png()
    .toBuffer();

  // The shadow is drawn on a canvas wider than the rectangle: sharp blurs with
  // edge-extend, so a rectangle that fills its own canvas keeps hard edges.
  const margin = 40;
  const shadow = await sharp(svg(winW + margin * 2, winH + margin * 2,
    rect(margin, margin, winW, winH, radius, 'rgba(0,0,0,.55)')))
    .blur(20)
    .png()
    .toBuffer();

  await sharp({
    create: { width: winW + pad * 2, height: winH + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadow, top: pad + 12 - margin, left: pad - margin },
      { input: window, top: pad, left: pad },
    ])
    .png({ compressionLevel: 9, palette: true, colours: 256, dither: 0.5 })
    .toFile(out);

  return out;
}

/**
 * The title card: the wall dimmed almost to a wall, with the mark in the middle
 * - the frame the tool is named after, and the word inside it.
 */
async function buildHeader(source, out) {
  const width = 1400;
  const height = 735;
  const frameW = 400;
  const frameH = 190;
  const cx = width / 2;
  const cy = height / 2;

  const wall = await sharp(source)
    .resize({ width, height, fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer();

  const card = svg(width, height,
    rect(0, 0, width, height, 0, WALL).replace('/>', ' opacity="0.62"/>')
    + rect(cx - frameW / 2, cy - frameH / 2, frameW, frameH, 0, 'none')
      .replace('fill="none"', 'fill="none" stroke="' + INK + '" stroke-width="16"')
    + text(cx, cy + 34, 104, INK, 'keret', { anchor: 'middle', weight: 500, spacing: 2 }));

  await sharp(wall)
    .composite([{ input: card }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(out);

  return out;
}

async function main() {
  useProjectFonts();
  const source = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ASSETS, 'demo-wall.jpg');
  if (!fs.existsSync(source)) {
    console.error('make-banner: no source capture at ' + source);
    process.exit(1);
  }
  const window = await buildWindow(source, path.join(ASSETS, 'demo-window.png'));
  const header = await buildHeader(source, path.join(ASSETS, 'readme-header.jpg'));
  for (const file of [window, header]) {
    const { width, height } = await sharp(file).metadata();
    console.log(path.relative(ROOT, file) + '  ' + width + 'x' + height + '  ' + Math.round(fs.statSync(file).size / 1024) + ' kB');
  }
}

main().catch((err) => {
  console.error('make-banner failed: ' + err.message);
  process.exit(1);
});
