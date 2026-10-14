/* Splice the pin and tape sprites into src/assets/page.css, idempotently.
   The block lives between explicit sentinels, and the script refuses to write a
   stylesheet it has damaged: an earlier version stripped from its marker to the
   next unindented line, which - every rule in this file is indented - was the end
   of the file, and took the chrome, the controls and the author card with it. */
import fs from 'node:fs';
import sharp from 'sharp';

/* Generates the fixture sprites and the mat grain into src/assets/page.css, between
   sentinels, idempotently. Run it from the repository root: `node scripts/make-fixtures.mjs`.
   This lives in the repo rather than in a scratch directory because the stylesheet it
   writes is committed: without the generator in the repo, the sprites in page.css have no
   source anyone can regenerate. That was learned by breaking the scratch copy.

   Two rules are baked into what it draws, both from measured failures:
   - sprites are background images, never `filter:` on the element, because a filter per
     frame keeps a render surface per frame alive and a zoom repaints them all (0.4);
   - the grain is a PNG, not an feTurbulence SVG, because a filter is evaluated per pixel
     and re-rasterised whenever its drawn size changes - every zoom step - which is what
     made a large wall crawl on a phone. */
import path from 'node:path';

const uri = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg.replace(/\s+/g, ' ').trim()).toString('base64');

/* The mat is paper, not plastic. A tiled data URI of `feTurbulence`, neutral and
   barely there: a background image is one paint, where `filter:` on the element would
   give every frame a render surface of its own - the trade that cost a day in 0.4. */
async function paper() {
  // A PNG tile of smooth noise, dark only, so it works on both mats. This replaces an
  // feTurbulence SVG, and that is the whole point: a filter is evaluated per pixel and
  // re-rasterised whenever the tile's drawn size changes - every zoom step - and on a
  // phone that is enough to make a large wall crawl. A PNG is decoded once and then only
  // scaled. Measured: 4.7 KB, against an SVG that was larger and cost far more to draw.
  const cells = 48, size = 192;
  const noise = Buffer.alloc(cells * cells);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;   // stable, no diagonal stripes
      noise[y * cells + x] = 128 + Math.round((h - Math.floor(h)) * 200);
    }
  }
  const smooth = await sharp(noise, { raw: { width: cells, height: cells, channels: 1 } })
    .resize(size, size, { kernel: 'cubic' }).raw().toBuffer();
  const rgba = Buffer.alloc(size * size * 4);
  // alpha around a 3.5% darkening with a spread of about 1.3% of the mat's luminance, which
  // is what the SVG tile it replaces measured (mean 9 levels of darkening, std 3.3)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(9 + (smooth[i] / 255 - 0.5) * 16)));
  }
  const png = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 }).toBuffer();
  return 'data:image/png;base64,' + png.toString('base64');
}

/** The tile, built once: the stylesheet is assembled from it below. */
const PAPER = await paper();

/* one strip of tape, already leaning: its long axis crosses the corner it holds */
/* mix a hex colour toward another; the head is shaded with the result */
function mix(hex, other, amount) {
  const parts = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parts(hex), [r2, g2, b2] = parts(other);
  const f = (a, b) => Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  return '#' + f(r1, r2) + f(g1, g2) + f(b1, b2);
}

function pin(color, dark) {
  // The needle is short on purpose: the mat is 20 world px deep and the pin has
  // to be pushed into the MAT. The point is inside the wall, so it is not drawn:
  // the shaft ends square with a touch of shading where it enters. Its entry lands
  // 10px below the frame's top edge, ten clear of the photograph, so the per-photo
  // jitter cannot push it onto the picture.
  //
  // The head stands off the surface, so it casts, and the head is a sphere rather
  // than a filled circle: grain, a soft highlight, a shaded head. All of it baked
  // into the sprite - a `filter:` on the element would give every frame a render
  // surface of its own, which is what killed the phone tab in 0.4. The viewBox
  // carries the room the shadow needs; the pin sits 3px in from the right.
  const light = mix(color, '#ffffff', 0.42);
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 40"> <defs> <filter id="ps" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.7"/></filter> <filter id="grain" x="0" y="0" width="100%" height="100%"> <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/> <feColorMatrix type="saturate" values="0"/> </filter> <radialGradient id="head" cx="34%" cy="28%" r="78%"> <stop offset="0" stop-color="${light}"/> <stop offset="50%" stop-color="${color}"/> <stop offset="100%" stop-color="${dark}"/> </radialGradient> <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"> <stop offset="0" stop-color="#7c8287"/> <stop offset="42%" stop-color="#c6cbcf"/> <stop offset="100%" stop-color="#848a8f"/> </linearGradient> <clipPath id="hc"><circle cx="15" cy="13" r="8.6"/></clipPath> </defs> <g filter="url(#ps)" opacity=".3"> <circle cx="15.8" cy="14.6" r="8.6" fill="#000"/> <rect x="15.7" y="21" width="1.6" height="7" rx=".8" fill="#000"/> </g> <ellipse cx="15.6" cy="19.6" rx="7.2" ry="2.3" fill="rgba(0,0,0,.3)" filter="url(#ps)"/> <rect x="14.1" y="19" width="1.8" height="7" rx=".5" fill="url(#steel)"/> <ellipse cx="15" cy="26" rx="1.4" ry=".8" fill="rgba(0,0,0,.34)"/> <circle cx="15" cy="13" r="8.6" fill="url(#head)"/> <g clip-path="url(#hc)"> <rect x="0" y="0" width="36" height="40" filter="url(#grain)" opacity=".17"/> <ellipse cx="11.9" cy="9.8" rx="2.4" ry="1.6" fill="#fff" opacity=".38" filter="url(#ps)"/> </g> </svg>`);
}

function tape(deg) {
  const w = 78, h = 26, cx = 40, cy = 37;
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  // A strip comes off the roll with clean long edges, and its two ends are cut by
  // the dispenser's serrated edge - or torn. So the ends zigzag, shallowly and
  // unevenly, while the sides stay straight. Fixed numbers, not random: the sprite
  // is generated into a committed stylesheet.
  const step = h / 7;
  const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => y0 + step * i);
  // seven shallow teeth per end, depths uneven and different on each side, so it
  // reads as torn rather than as a saw. Deep enough to survive being seen at 50%,
  // which is where a phone looks at a wall this size.
  const right = [0, 4.2, 1.3, 3.8, 1.1, 4.4, 1.6, 0].map((d) => x1 - d);
  const left = [0, 3.4, 1.5, 4.4, 1.2, 3.6, 1.8, 0].map((d) => x0 + d);
  const d = 'M' + left[0] + ' ' + ys[0]
    + ' L' + right[0] + ' ' + ys[0]
    + right.slice(1).map((x, i) => ' L' + x + ' ' + ys[i + 1]).join('')
    + ' L' + left[7] + ' ' + ys[7]
    + left.slice(0, 7).reverse().map((x, i) => ' L' + x + ' ' + ys[6 - i]).join('')
    + ' Z';
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 74">
    <g transform="rotate(${deg} ${cx} ${cy})">
      <path d="${d}" fill="rgba(255,255,255,.5)"/>
      <path d="${d}" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="1"/>
      <rect x="${x0 + 3}" y="${y0 + 1}" width="${w - 6}" height="${h * 0.34}" fill="rgba(255,255,255,.22)"/>
    </g>
  </svg>`);
}

const PINS = [
  ['c0', '#e23c30', '#93241c'],   // the wall's own accent red
  ['c1', '#c9a227', '#8a6d14'],   // brass
  ['c2', '#2f7d76', '#1b4f4a'],   // teal
  ['c3', '#5b6bb5', '#39447c'],   // indigo
  ['c4', '#8a8377', '#5a5449'],   // warm gray
];

const block = `  /* fixtures:start - generated by .tmp/blog/make-fixtures.mjs */
  /* --- how a frame is held up -------------------------------------------
     Sprites as background images: a mask or a filter would give every frame its
     own render surface, and a zoom repaints them all (see the placeholder rule
     above). A background is one paint and nothing more. */
  /* Taped flat to the wall. A frame held down at four corners stops standing off
     it, so it keeps a contact shadow and nothing more. Deliberately not applied to
     every fixture: a pinned frame still bows out at the bottom, where the pin is
     the only thing touching, and keeps the shadow that says so. */
  .frame.fix-tape { box-shadow:0 1px 1px rgba(0,0,0,.14), 0 2px 4px rgba(0,0,0,.10); }
  @media (prefers-color-scheme: dark) {
    /* the dark theme's mats otherwise carry a deeper shadow than the wall needs */
    .frame.fix-tape { box-shadow:0 1px 2px rgba(0,0,0,.4), 0 3px 6px rgba(0,0,0,.28); }
  }

  /* A pin holds the frame at its top edge only, so the frame leans away from the wall
     as it goes down: nothing should shadow above it, and the shadow grows toward the
     bottom. A box-shadow cannot taper, and a blurred pseudo-element would give every
     frame its own render surface - which is what killed the phone tab in 0.4 - so the
     stand-off shadow is a gradient band under the frame instead. */
  .frame.fix-pin { box-shadow:0 1px 1px rgba(0,0,0,.18); }
  .frame.fix-pin::after {
    content:''; position:absolute; left:5px; right:5px; top:100%; height:16px;
    border-radius:0 0 3px 3px;
    background:linear-gradient(to bottom, rgba(0,0,0,.22), rgba(0,0,0,0));
  }
  @media (prefers-color-scheme: dark) {
    .frame.fix-pin { box-shadow:0 1px 2px rgba(0,0,0,.42); }
    .frame.fix-pin::after { background:linear-gradient(to bottom, rgba(0,0,0,.4), rgba(0,0,0,0)); }
  }

  /* layout.grain: false - a flat mat, no tile drawn at all */
  .no-grain .frame { background-image:none; }

  .fix { position:absolute; pointer-events:none; }

  /* one pin, top middle, its point in the mat just above the photograph */
  .fix.pin {
    /* the sprite boxes the pin 3px in from its right edge to leave room for the
       shadow, so the box is hung by the pin's own centre (15), not by half the box */
    top:-16px; left:50%; width:36px; height:40px; margin-left:-15px;
    background-repeat:no-repeat; background-position:center; background-size:contain;
  }
  ${PINS.map(([cls, color, dark]) => `.fix.pin.${cls} { background-image:url("${pin(color, dark)}"); }`).join('\n  ')}

  /* One piece of tape per corner, each its own element: a background cannot be
     rotated on its own, and four pieces placed by one rule look like a printed
     pattern. The element is a sprite wide and tall, hung so that its centre sits
     on the corner, half on the mat and half on the wall; the bottom two use the
     mirrored sprite, so each piece leans the same way as the one above it. The
     engine adds a small per-photo tilt and shift to each. */
  .fix.tape {
    width:82px; height:76px;
    background-repeat:no-repeat; background-size:82px 76px;
  }
  /* Each piece sits IN from its corner rather than on it, so the frame's corner
     shows past the tape's outer edge: tape put on by hand stops short. The strip is
     27px across, so half of it reaches 13px either side of the centre line; shifting
     the centre 17px in along the corner's diagonal leaves about 4px of corner bare.
     That is 12px on each axis, 12 / cos45. */
  .fix.tape.tl { left:-29px;  top:-26px;    background-image:url("${tape(-45)}"); }
  .fix.tape.tr { right:-29px; top:-26px;    background-image:url("${tape(45)}"); }
  .fix.tape.bl { left:-29px;  bottom:-26px; background-image:url("${tape(45)}"); }
  .fix.tape.br { right:-29px; bottom:-26px; background-image:url("${tape(-45)}"); }
  /* fixtures:end */
`;

const file = path.resolve('src/assets/page.css');
let css = fs.readFileSync(file, 'utf8');
const before = css.length;
// the splice goes into the middle of the stylesheet: everything after it has to
// come out byte for byte, which is the property that was violated when an earlier
// version of this script cut the file in half
const origTail = css.slice(-400);

// strip a previous splice, by sentinels
const START = '  /* fixtures:start';
const END = '  /* fixtures:end */\n';
const from = css.indexOf(START);
if (from >= 0) {
  const to = css.indexOf(END, from);
  if (to < 0) throw new Error('page.css has a fixtures:start with no fixtures:end');
  css = css.slice(0, from) + css.slice(to + END.length);
}

const FRAME = '  .frame {\n    background:var(--mat);';
const FRAME_FIXED = '  .frame {\n    position:relative;\n    background:var(--mat);';
// plain first, so this runs the same way on a stylesheet that already has the grain
const BG_PLAIN = '    background:var(--mat);';
// `--grain` is 1 / the world scale, set by the engine on every transform: the tile is
// then drawn at a size that keeps it 120 screen px at any zoom, so the browser never
// magnifies its pixels. Without it a wall zoomed to 4x shows the tile's bitmap - the
// pixelation that is the whole reason this variable exists.
const BG_GRAIN = '    background-color:var(--mat);\n    background-image:url("' + PAPER + '");\n    background-repeat:repeat;\n    background-size:calc(192px * var(--grain, 1)) calc(192px * var(--grain, 1));\n';
// strip any earlier grain by shape, not by bytes: changing the tile must not
// strand the stylesheet in a form this script can no longer recognise
css = css.replace(/    background-color:var\(--mat\);\n    background-image:url\("data:image\/(?:svg\+xml|png);base64,[^"]+"\);\n    background-repeat:repeat;\n?(    background-size:[^;]+;\n?)?/, BG_PLAIN);
if (css.includes(FRAME)) css = css.replace(FRAME, FRAME_FIXED);
if (!css.includes(FRAME_FIXED)) throw new Error('cannot find the .frame rule in page.css');
// and now the mat carries the paper
if (!css.includes(BG_PLAIN)) throw new Error('cannot find the frame background in page.css');
css = css.replace(BG_PLAIN, BG_GRAIN);

// --grain has to be declared, not only set at runtime: the build checker reads the
// stylesheet and fails on a variable it cannot find there.
if (!css.includes('--grain:')) {
  css = css.replace(/(\n    --cap: #776f63;[^\n]*\n)/,
    '$1    /* 1 / the world scale, set by the engine on every transform. The mat grain is\n'
    + '       drawn at 120px * this, so it covers 120 screen px at any zoom and its own\n'
    + '       pixels are never magnified. */\n    --grain: 1;\n');
  if (!css.includes('--grain:')) throw new Error('cannot declare --grain in the :root block');
}

const anchor = '  .item.off { display:none; }\n';
if (!css.includes(anchor)) throw new Error('cannot find the insertion anchor in page.css');
css = css.replace(anchor, anchor + block);

// --- refuse to write a stylesheet this script has damaged
const tail = css.slice(-160);
for (const must of ['#authorCard .author-close', '.item.off', '.fix.tape', '#stage', '#credit']) {
  if (!css.includes(must)) throw new Error('page.css lost "' + must + '" - not writing');
}
// the tape rule repeats its two sprites, once per corner, so count distinct ones
const sprites = new Set([...css.matchAll(/data:image\/(?:svg\+xml|png);base64,[A-Za-z0-9+/=]+/g)].map((m) => m[0]));
const expected = PINS.length + 2 + 1;   // the pin colours, the two tape pieces, the mat grain
if (sprites.size !== expected) {
  throw new Error('expected ' + expected + ' distinct sprites in page.css, found ' + sprites.size);
}
if (css.length < before * 0.9) throw new Error('page.css shrank by more than 10% - not writing');
if (css.slice(-400) !== origTail) throw new Error('page.css changed after the insertion point - not writing');

fs.writeFileSync(file, css);
console.log('page.css: ' + PINS.length + ' pins + 2 tape sprites spliced in (' + before + ' -> ' + css.length + ' bytes)');
