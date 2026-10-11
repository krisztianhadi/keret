/*
 * app.js - the browser builder.
 *
 * Pick a folder, and this page runs keret's own build - scan, layout, publish,
 * page - inside the tab, then hands you the finished static site as a zip. No
 * server is involved at any point: the photos are read with the File API, the
 * re-encoding happens on a canvas, and the wall is assembled in memory.
 *
 * Everything here is orchestration and DOM. The build itself is the CLI's code:
 * web/vendor/keret-core.js is generated from src/*.js by web/build.mjs.
 */

import { FONTS } from './vendor/keret-core.js';
import { createKeret } from './keret-runtime.js';
import { buildZip } from './zip.js';

/* The app wears the wall's own typeface, embedded like everything else. */
document.head.appendChild(Object.assign(document.createElement('style'), {
  textContent: '@font-face{font-family:"Geist Mono";src:url(data:font/woff2;base64,'
    + FONTS['GeistMonoVF.woff2'] + ') format("woff2");font-weight:100 900;font-display:swap}',
}));

const $ = (id) => document.getElementById(id);
const HEIC_FILE = /\.(heic|heif)$/i;
const CAPTIONS_FILE = 'captions.json';
/* keret's own two settings files. JSON because the command line reads exactly
   these, so an unzipped wall can be added to and rebuilt with `node gen.js` and
   the same settings - and because a parser for YAML would be a dependency this
   project does not take. (JSON is valid YAML, for anyone who wants to read it.) */
const CONFIG_FILE = 'wall.config.json';
const AUTHOR_FILE = 'author.json';
const SIDECARS = new Set([CAPTIONS_FILE, CONFIG_FILE, AUTHOR_FILE]);

/* One runtime instance for the life of the page: it carries the rules the build
   obeys (which extensions are photographs, which names are skipped) so the picker
   can count what the build will really take, and it holds the built wall in
   memory between the build and the download. */
const keret = createKeret();
const { IMAGE_EXTS, SKIP_PREFIXES } = keret.require('/src/images.js');

const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
};

/* ?motion=off turns every entrance off, for comparing "is this the motion or the
   layout under it" on a real device, where a desktop frame trace cannot answer. */
if (/[?&]motion=off\b/.test(location.search)) document.documentElement.dataset.motion = 'off';

const ui = {
  photobox: $('photobox'),
  steps: [...document.querySelectorAll('.step')],
  capHint: $('capHint'),
  privacy: $('privacy'),
  pickGlyph: $('pickGlyph'),
  deck: $('deck'),
  wallmini: $('wallmini'),
  form: $('form'),
  moreSettings: $('moreSettings'),
  configNote: $('configNote'),
  doneActions: $('doneActions'),
  doneHost: $('doneHost'),
  pickLead: $('pickLead'),
  pickSub: $('pickSub'),
  changeRow: $('changeRow'),
  changeBtn: $('changeBtn'),
  actions: $('actions'),
  pickBarBtn: $('pickBarBtn'),
  buildBtn: $('buildBtn'),
  buildLabel: $('buildLabel'),
  cancelBtn: $('cancelBtn'),
  bar: $('bar'),
  barFill: $('barFill'),
  buildLead: $('buildLead'),
  buildFile: $('buildFile'),
  doneLead: $('doneLead'),
  doneStats: $('doneStats'),
  downloadBtn: $('downloadBtn'),
  previewBtn: $('previewBtn'),
  againBtn: $('againBtn'),
  skipBox: $('skipBox'),
  warnBox: $('warnBox'),
  fileInput: $('fileInput'),
  modal: $('previewModal'),
  frame: $('previewFrame'),
  previewNote: $('previewNote'),
  closePreview: $('closePreview'),
};

/* A phone cannot drag a folder onto a page, and iOS cannot pick one either: the
   hero line must not open with an action the device cannot perform. */
const TOUCH_ONLY = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

const state = { files: [], cancelled: false, result: null, objectUrls: [], config: null, paths: new Map() };

/** Where a picked file sat, as far as the browser will say. */
function rememberPaths(pairs) {
  for (const [file, relPath] of pairs) state.paths.set(file, relPath || file.name);
}

/* ------------------------------------------------------------------ */
/* picking                                                            */
/* ------------------------------------------------------------------ */

/** Walk a dropped folder. Read the items synchronously: the list dies on await. */
async function filesFromDrop(dt) {
  const entries = [...(dt.items || [])]
    .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
    .filter(Boolean);
  if (!entries.length) return [...(dt.files || [])];

  const out = [];
  async function walk(entry, depth, prefix) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      state.paths.set(file, prefix + file.name);
      out.push(file);
      return;
    }
    if (!entry.isDirectory || depth > 8) return;
    const reader = entry.createReader();
    for (;;) {
      // readEntries hands back at most 100 at a time
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return;
      for (const child of batch) await walk(child, depth + 1, prefix + entry.name + '/');
    }
  }
  for (const entry of entries) await walk(entry, 0, '');
  return out;
}

const readText = async (file) => new TextDecoder().decode(await file.arrayBuffer());

/**
 * The settings that travel with a wall.
 *
 * Drop the folder you unzipped last time - or a photos folder with these files in
 * it - and the wall comes back exactly as it was set up, which is the point: keep
 * adding photographs and rebuild without re-typing anything. These are the command
 * line's own files, not an app-specific dialect.
 */
async function readSidecars(files) {
  const found = { config: null, author: null, problem: '' };
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name !== CONFIG_FILE && name !== AUTHOR_FILE) continue;
    try {
      const parsed = JSON.parse(await readText(file));
      if (name === CONFIG_FILE) found.config = parsed; else found.author = parsed;
    } catch (err) {
      found.problem = name + ' could not be read: ' + err.message;
    }
  }
  return found;
}

/** Put what was loaded into the form, so the fields show the wall you are rebuilding. */
function applySidecars({ config, author, problem }) {
  const set = (id, value) => { if (typeof value === 'string' && value) $(id).value = value; };
  if (config) {
    set('fTitle', config.title);
    set('fDescription', config.description);
    set('fSiteUrl', config.siteUrl);
    set('fAuthor', author && author.name);
    if (config.font === 'sans' || config.font === 'mono') {
      const radio = document.querySelector('input[name="font"][value="' + config.font + '"]');
      if (radio) radio.checked = true;
    }
    const edge = config.images && String(config.images.maxEdge);
    if (edge && [...$('fMaxEdge').options].some((option) => option.value === edge)) $('fMaxEdge').value = edge;
  }
  if (author) {
    set('fAuthor', author.name);
    set('fRole', author.role);
    set('fBio', author.bio);
    set('fEmail', author.email);
    const link = (author.links || [])[0];
    if (link) set('fLink', link.href);
  }
  const loaded = [config ? CONFIG_FILE : '', author ? AUTHOR_FILE : ''].filter(Boolean);
  ui.configNote.hidden = !loaded.length && !problem;
  ui.configNote.textContent = problem || (loaded.length
    ? 'Settings loaded from ' + loaded.join(' and ') + ' - change them and build again.'
    : '');
}

/** Keep the photographs and the captions sidecar; report what was dropped. */
function selectUsable(files) {
  const keep = [];
  const ignored = [];
  const seen = new Set();

  /* Dropping a folder that was unzipped from an earlier build brings the site's
     own furniture with it - og.jpg, apple-touch-icon.png, index.html. If there is
     a photos/ folder in the drop, that folder is the source and the rest is output;
     without that rule the social card and the touch icon walked onto the wall as
     photographs. */
  const inPhotos = files.filter((file) => /(^|\/)photos\//.test(state.paths.get(file) || ''));
  const source = inPhotos.length
    ? files.filter((file) => inPhotos.includes(file) || SIDECARS.has(file.name.toLowerCase()))
    : files;

  for (const file of source) {
    const name = file.name;
    if (HEIC_FILE.test(name)) {
      ignored.push({ file: name, reason: 'heic/heif is not supported - export it as JPEG first' });
      continue;
    }
    if (SIDECARS.has(name.toLowerCase())) { keep.push(file); continue; }
    if (!IMAGE_EXTS.has(extensionOf(name))) {
      ignored.push({ file: name, reason: 'not a photo (jpg, png, webp, gif)' });
      continue;
    }
    if (SKIP_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      ignored.push({ file: name, reason: 'name starts with "' + name[0] + '"' });
      continue;
    }
    if (seen.has(name)) {
      ignored.push({ file: name, reason: 'another file already uses this name - folders are flattened' });
      continue;
    }
    seen.add(name);
    keep.push(file);
  }
  return { keep, ignored };
}

/* The caption line under the frame is standing help, one short line per step -
   never status, and never a place where a number can get clipped. Status lives
   in the photo box, which grows with whatever it has to say. */
const HOSTING = 'https://github.com/krisztianhadi/keret/blob/main/docs/HOSTING.md';
const HELP = {
  // the caption line is the empty state's line: once there are photographs on the
  // desk it has said what it had to say, and it goes
  pick: 'JPG, PNG, WebP or GIF — a few hundred is fine',
  // what the zip is for, in one breath and one "or", with the one link that helps
  done: 'The whole site in a zip. Use it locally, or put it online with our <a href="' + HOSTING
    + '" target="_blank" rel="noopener noreferrer">hosting guide</a>.',
};

function setHint(line) {
  ui.capHint.textContent = line || '';
}

/**
 * Motion, deliberately legible.
 *
 * Two rules learned the hard way here. The words move (14px rise, 340ms) and the
 * photographs only fade: a transform over a picture with a shadow is what iOS
 * Safari re-rasterizes every frame, and the deck is exactly that. And the swap is
 * a cross-fade rather than an animated height - a measured frame trace put the
 * cost of switching in laying out the new step, so the box changes height in one
 * step while the old step is at zero opacity and nothing is visible moving.
 */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION = !REDUCED && !/[?&]motion=off\b/.test(location.search);
const EASE = 'cubic-bezier(.22, .61, .36, 1)';

/* Every duration in the app, in one place: the first pass was quick enough to
   read as a cut rather than a movement, so these are roughly half again as long
   and the whole thing can be retuned from here. */
const DUR = {
  out: 220,        // the step on its way out
  in: 340,         // the step arriving
  rise: 480,       // the words rising into place
  stagger: 70,     // between one line and the next
  after: 220,      // the caption and the promise, behind the step
  panel: 280,      // the form and the action row
  frame: 460,      // the box changing size
  drawer: 420,     // the settings drawer opening
  drawerShut: 340, // and closing
  print: 380,      // one print landing on the desk
  printGap: 120,   // between prints
};

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Replace whatever animation an element is running: repeated rises must not pile up. */
function animate(el, frames, options) {
  if (!el) return null;
  if (el.getAnimations) el.getAnimations().forEach((running) => running.cancel());
  return el.animate(frames, options);
}

function riseIn(el, delay) {
  if (!MOTION || !el || el.hidden) return;
  animate(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
    { duration: DUR.rise, delay: delay || 0, easing: EASE, fill: 'both' });
}

function fadeIn(el, delay, duration) {
  if (!MOTION || !el || el.hidden) return;
  animate(el, [{ opacity: 0 }, { opacity: 1 }],
    { duration: duration || DUR.in, delay: delay || 0, easing: 'ease-out', fill: 'both' });
}

/** Leave the step on screen, fading, before it is taken away. */
async function fadeOut(el) {
  if (!MOTION || !el) return;
  await animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR.out, easing: 'ease-in', fill: 'both' }).finished;
  if (el.getAnimations) el.getAnimations().forEach((running) => running.cancel());
}

/** The frame changes size in front of you rather than jumping: the box is eased
    from its old height to its new one while the incoming step is still at zero
    opacity, so nothing is seen being clipped on the way. */
function resizeBox(from, to) {
  if (!MOTION || !from || !to || from === to) return;
  const box = ui.photobox;
  box.style.overflow = 'hidden';
  // a size change wants a gentler curve than a fade: EASE front-loads a quarter of
  // the distance into the first frame (measured 117px of 412), which reads as a
  // jerk however smooth the rest is
  const grow = animate(box, [{ height: from + 'px' }, { height: to + 'px' }],
    { duration: DUR.frame, easing: 'cubic-bezier(.45, .05, .25, 1)', fill: 'both' });
  grow.finished.then(() => {
    if (box.getAnimations) box.getAnimations().forEach((running) => running.cancel());
    box.style.overflow = '';
  }).catch(() => { box.style.overflow = ''; });
}

/**
 * The swap happens in two halves, because the frame's new size can only be
 * measured once *everything* about the state has been set - the step alone is
 * half of it, and the form, the caption and the footer all change with it. Doing
 * it in one call measured a height that still had the form in it, animated to
 * that, and then jumped the rest of the way (275px, in the first attempt).
 */
async function beginStep() {
  const current = ui.steps.find((step) => !step.hidden);
  const from = ui.photobox.offsetHeight;
  if (current) await fadeOut(current);
  return from;
}

/** Returns true when the step really changed. */
function endStep(name, from) {
  const current = ui.steps.find((step) => !step.hidden);
  const next = ui.steps.find((step) => step.dataset.step === name);
  const swapped = current !== next;
  for (const step of ui.steps) step.hidden = step.dataset.step !== name;
  resizeBox(from, ui.photobox.offsetHeight);
  return swapped;
}

/**
 * The settings drawer opens and closes by growing its own contents.
 *
 * <details> flips between two laid-out states with nothing in between, and the
 * frame around it changes height with it. Animating the inner block instead of the
 * frame means the box, the form and the white frame all follow it for free, and
 * the whole thing stays one animation rather than three that have to agree.
 */
function wireDisclosure(details) {
  const summary = details.querySelector('summary');
  const body = details.querySelector('.fields');
  if (!summary || !body) return;
  let busy = false;

  summary.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!MOTION || busy) { details.open = !details.open; return; }
    busy = true;
    body.style.overflow = 'hidden';
    if (!details.open) {
      details.open = true;                       // lay it out, then grow into it
      const to = body.offsetHeight;
      await animate(body, [{ height: '0px', opacity: 0 }, { height: to + 'px', opacity: 1 }],
        { duration: DUR.drawer, easing: EASE, fill: 'both' }).finished;
    } else {
      const from = body.offsetHeight;
      await animate(body, [{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: DUR.drawerShut, easing: 'ease-in', fill: 'both' }).finished;
      details.open = false;
    }
    if (body.getAnimations) body.getAnimations().forEach((running) => running.cancel());
    body.style.overflow = '';
    busy = false;
  });
}

/** Everything that arrives with a step: its words first, then the pictures, then
    the caption and the form on the mat behind them. */
function animateStep(swapped) {
  if (!MOTION) return;
  const step = ui.steps.find((s) => !s.hidden);
  if (!step) return;
  const lead = swapped ? 140 : 0;   // let the frame grow first, then fill it
  if (swapped) fadeIn(step, lead);
  [...step.querySelectorAll('.lead, .sub, .row')].forEach((el, i) => riseIn(el, lead + 60 + i * DUR.stagger));
  fadeIn(ui.wallmini, lead);
  riseIn(ui.capHint, DUR.after);
  riseIn(ui.privacy, DUR.after);
  riseIn(ui.form, DUR.panel);
  riseIn(ui.actions, DUR.panel);
}

/** The form is for setting a wall up before a build, and for changing it before the
    next one: it is not on screen while there is nothing to build, and not while a
    build is running. */
function showForm(visible) {
  ui.form.hidden = !visible;
}

/**
 * The frame's footer, whichever step we are in: Choose photos -> Build ->
 * Download. One forward button, never two in the same row; after a build, Build
 * again and Preview sit under the download as the two things you might do with a
 * finished wall.
 */
function showAction(name) {
  ui.pickBarBtn.hidden = name !== 'pick';
  ui.buildBtn.hidden = name !== 'build';
  ui.doneActions.hidden = name !== 'download';
  ui.actions.hidden = name === 'none';
}

async function showPicker(files) {
  const { keep, ignored } = selectUsable(files);
  state.files = keep;
  state.ignored = ignored;
  const photos = keep.filter((f) => IMAGE_EXTS.has(extensionOf(f.name))).length;
  const sidecars = await readSidecars(keep);
  state.config = sidecars.config;
  applySidecars(sidecars);
  const from = await beginStep();
  // the formats and the promise are the empty state's two lines: once photos are on
  // the desk, both have done their job
  setHint(photos ? '' : HELP.pick);
  ui.privacy.hidden = photos > 0;
  showForm(photos > 0);
  ui.changeRow.hidden = !photos;
  // SVG elements have no `hidden` IDL property: set the attribute the CSS matches
  if (photos) ui.pickGlyph.setAttribute('hidden', ''); else ui.pickGlyph.removeAttribute('hidden');
  if (!photos) {
    ui.pickLead.textContent = TOUCH_ONLY ? 'Pick photos for your wall' : 'Drop a folder of photos';
    ui.pickSub.textContent = TOUCH_ONLY ? 'from your library or from Files' : 'or use the button below';
    showAction('pick');
    hideDeck();
  } else {
    ui.pickLead.textContent = photos + (photos === 1 ? ' photo is ready' : ' photos are ready');
    ui.pickSub.textContent = 'Nothing is uploaded — the build happens here';
    showAction('build');
    // the stack claims its space now, so the frame's new size includes it
    showDeck(keep.filter((f) => IMAGE_EXTS.has(extensionOf(f.name))));
  }
  if (ignored.length) showSkipped(ignored); else hideSkipped();
  const swapped = endStep('pick', from);
  animateStep(swapped);
}

/* ------------------------------------------------------------------ */
/* the stack of prints in the box                                     */
/* ------------------------------------------------------------------ */

/**
 * A few of the chosen photographs, drawn small.
 *
 * They are decoded once through a canvas at thumbnail size rather than pointed at
 * the originals: an <img> on a 12-megapixel file costs a full-size bitmap in
 * memory, and on a phone three of those is a real tab-killer for a decoration.
 * Safari cannot always decode from a File through createImageBitmap, so a failure
 * falls back to the file's own object URL and lets the browser try.
 */
const DECK_EDGE = 480;
const DECK_MAX = 3;
let deckToken = 0;
const deckUrls = [];

async function thumbFrom(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const scale = Math.min(1, DECK_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}

/** Spread the sample across the set, so the pile shows the range, not the first
    three files the folder happened to list. */
function spread(list, count) {
  if (list.length <= count) return list.slice();
  const out = [];
  for (let i = 0; i < count; i++) out.push(list[Math.round((i * (list.length - 1)) / (count - 1))]);
  return out;
}

function hideDeck() {
  deckToken++;
  ui.deck.hidden = true;
  ui.deck.textContent = '';
  while (deckUrls.length) URL.revokeObjectURL(deckUrls.pop());
}

async function showDeck(photos) {
  hideDeck();
  const token = deckToken;
  /* Claim the space first. The stack is a fixed 146px of the box, and claiming it
     only once the thumbnails had decoded (two frames later) shoved the frame and
     everything under it down in one step - measured at 146px, and a 32ms frame
     with it. Reserving up front means the pictures arrive into a space that is
     already the right size. */
  ui.deck.hidden = false;
  const picks = spread(photos, DECK_MAX);
  const sources = [];
  for (const file of picks) {
    try {
      sources.push(await thumbFrom(file));
    } catch (err) {
      const url = URL.createObjectURL(file);
      deckUrls.push(url);
      sources.push(url);
    }
  }
  if (token !== deckToken) {           // another selection landed while we drew
    while (deckUrls.length) URL.revokeObjectURL(deckUrls.pop());
    return;
  }
  // back to front: the last image in the DOM is the one on top of the pile
  ui.deck.textContent = '';
  sources.reverse().forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    ui.deck.appendChild(img);
    // the prints fade in as they land, one behind the other - they used to appear
    // with no animation at all, because the container (not the pictures) was what
    // got animated a moment earlier, while it was still empty
    fadeIn(img, i * DUR.printGap, DUR.print);
  });
}

/* ------------------------------------------------------------------ */
/* the finished wall, in miniature                                    */
/* ------------------------------------------------------------------ */

/* Where the frames lie on the desk, as a percentage of the little wall. Fixed
   numbers, so the arrangement is the same every time: four photographs around the
   middle and the mark where the middle of the pile is. */
const MINI_PHOTOS = [
  { left: 1, top: 3, width: 30, height: 41, rot: -6 },
  { left: 66, top: 5, width: 32, height: 42, rot: 5 },
  { left: 5, top: 49, width: 32, height: 45, rot: 4 },
  { left: 63, top: 46, width: 35, height: 49, rot: -5 },
];
const MINI_MARK = { left: 31, top: 24, width: 37, height: 50, rot: -1 };
/* Where the prints lie on the desk, as percentages of the little wall: the middle
   one first, then the corners, so a small set still looks arranged rather than
   filling one edge. The middle frame is the hero and paints on top. */
const MINI_SLOTS = [MINI_MARK, MINI_PHOTOS[0], MINI_PHOTOS[3], MINI_PHOTOS[1], MINI_PHOTOS[2]];

function hideMiniWall() {
  ui.wallmini.hidden = true;
  ui.wallmini.textContent = '';
}

function place(tile, box) {
  tile.style.left = box.left + '%';
  tile.style.top = box.top + '%';
  tile.style.width = box.width + '%';
  tile.style.height = box.height + '%';
  tile.style.transform = 'rotate(' + box.rot + 'deg)';
  return tile;
}

/**
 * A handful of the published photographs, laid out like the wall: this is the
 * only place the app shows what came out rather than what went in, and it is the
 * same material - frames on a wall - rather than a number in a box.
 */
async function showMiniWall(result) {
  hideMiniWall();
  ui.wallmini.hidden = false;    // the space is claimed before the prints exist
  const picks = spread(result.rows, MINI_SLOTS.length);
  const sources = [];
  for (const row of picks) {
    const bytes = keret.read('/out/photos/' + row.file);
    if (!bytes) continue;
    try {
      sources.push(await thumbFrom(new Blob([bytes])));
    } catch (err) {
      // a print we cannot draw is simply not on the little wall
    }
  }

  ui.wallmini.textContent = '';
  sources.forEach((src, i) => {
    const slot = MINI_SLOTS[i];
    const tile = place(document.createElement('div'), slot);
    tile.className = slot === MINI_MARK ? 'tile center' : 'tile';
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    tile.appendChild(img);
    ui.wallmini.appendChild(tile);
  });
}

/**
 * Files that were never photographs, or that the build is designed to ignore
 * (hidden names, a second file with the same name). Routine, so it is quiet and
 * folded away - but every line is still there to read.
 */
function showSkipped(list) {
  ui.skipBox.hidden = false;
  ui.skipBox.innerHTML = '<summary>' + list.length + (list.length === 1 ? ' file was skipped' : ' files were skipped')
    + '</summary><ul>'
    + list.map((s) => '<li>' + escapeHtml(s.file) + ' - ' + escapeHtml(s.reason) + '</li>').join('')
    + '</ul>';
}

function hideSkipped() {
  ui.skipBox.hidden = true;
  ui.skipBox.textContent = '';
}

/** A photograph that should be on the wall and is not: that one is loud. */
function showFailed(list) {
  ui.warnBox.hidden = false;
  ui.warnBox.innerHTML = '<b>' + list.length
    + (list.length === 1 ? ' photo could not be used:' : ' photos could not be used:') + '</b><ul>'
    + list.map((s) => '<li>' + escapeHtml(s.file) + ' - ' + escapeHtml(s.reason) + '</li>').join('')
    + '</ul>';
}

function hideFailed() {
  ui.warnBox.hidden = true;
  ui.warnBox.textContent = '';
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ */
/* the build                                                          */
/* ------------------------------------------------------------------ */

const text = (bytes) => new TextDecoder().decode(bytes);
const mb = (n) => (n / (1024 * 1024)).toFixed(1) + ' MB';
const slug = (s) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photo-wall');

function readValues() {
  const site = $('fSiteUrl').value.trim().replace(/\/+$/, '');
  const link = $('fLink').value.trim();
  return {
    title: $('fTitle').value.trim() || 'Photo Wall',
    description: $('fDescription').value.trim() || 'A wall of photographs.',
    siteUrl: site && !/^https?:\/\//i.test(site) ? 'https://' + site : site,
    author: $('fAuthor').value.trim(),
    role: $('fRole').value.trim(),
    bio: $('fBio').value.trim(),
    email: $('fEmail').value.trim(),
    link: link && !/^(https?:|mailto:|tel:)/i.test(link) ? 'https://' + link : link,
    font: document.querySelector('input[name="font"]:checked').value,
    maxEdge: Number($('fMaxEdge').value) || 2048,
  };
}

/**
 * The photographer card, in the shape the page's chrome reads.
 *
 * src/assets/ui.js draws name, role, bio, then the facts: email, phone, location
 * and every link. The form only offers the fields a person would have to hand, so
 * what is left empty is simply not sent - an empty <dt> would ship a half card.
 */
function authorCard(values) {
  if (!values.author) return null;
  const card = { name: values.author };
  if (values.role) card.role = values.role;
  if (values.bio) card.bio = values.bio;
  if (values.email) card.email = values.email;
  if (values.link) card.links = [{ href: values.link, label: 'Website' }];
  return card;
}

/**
 * Build the whole wall in memory.
 *
 * The order differs from the CLI on purpose: photos are published first, so a
 * photo the browser cannot re-encode is left off the wall with a warning instead
 * of leaving a hole in the layout. Nothing is written anywhere the user can see
 * until they ask for the zip.
 */
async function runBuild(files, values, hooks) {
  keret.remove('/photos');
  keret.remove('/out');
  keret.remove('/originals');

  const ignored = [];
  const failed = [];

  for (const file of files) {
    keret.write('/photos/' + file.name, new Uint8Array(await file.arrayBuffer()));
  }

  const { loadConfig, fontOf } = keret.require('/src/config.js');
  /* Everything the dropped wall.config.json carried, with the form's answers on
     top - the form shows five of those keys, and the rest (layout, captions, the
     credit line) come through untouched. An unknown key still fails loudly, the
     way it does on the command line. */
  const loaded = loadConfig({
    root: '/',
    env: {},
    overrides: {
      ...(state.config || {}),
      title: values.title,
      description: values.description,
      siteUrl: values.siteUrl,
      font: values.font,
      images: { ...(state.config && state.config.images), maxEdge: values.maxEdge },
      photosDir: '/photos',
      outDir: '/out',
    },
  });
  const cfg = loaded.config;

  const images = keret.require('/src/images.js');
  const gen = keret.require('/gen.js');
  const layoutMod = keret.require('/src/layout.js');
  const { buildPage } = keret.require('/src/page.js');

  /* captions.json, if the folder carried one */
  const captionsPath = '/photos/' + cfg.captions.file;
  let captions = { map: {}, file: null };
  if (keret.has(captionsPath)) {
    const parsed = JSON.parse(text(keret.read(captionsPath)));
    const map = {};
    for (const [key, value] of Object.entries(parsed)) {
      const entry = typeof value === 'string' ? { title: value } : (value || {});
      map[key] = entry;
      map[key.replace(/\.[^.]+$/, '')] = entry;
    }
    captions = { map, file: cfg.captions.file };
  }

  const scanned = images.scanPhotos('/photos', cfg, captions.file);
  ignored.push(...scanned.skipped.map((s) => ({ file: s.file, reason: s.reason })));

  for (const p of scanned.photos) {
    const entry = captions.map[p.file] || captions.map[p.base] || null;
    p.title = (entry && entry.title) || '';
    p.alt = (entry && entry.alt) || '';
    p.credit = (entry && entry.credit) || '';
    if (entry && entry.specs) p.specs = entry.specs;
  }

  if (!scanned.photos.length) throw new Error('No readable photographs in that folder.');

  /* 1. publish: re-encode every photo, metadata stripped, orientation baked in.
        The original is dropped from memory as soon as its copy is written, so a
        folder of a few hundred photographs does not have to fit twice. */
  const published = [];
  const ogFile = gen.ogCandidate(scanned.photos, cfg);
  let ogOriginal = null;
  let bytesBefore = 0;
  let bytesAfter = 0;
  for (let i = 0; i < scanned.photos.length; i++) {
    if (hooks.cancelled()) throw new BuildCancelled();
    const photo = scanned.photos[i];
    hooks.progress(i, scanned.photos.length, photo.file);
    try {
      const r = await images.writeCopies(photo.file, '/photos/' + photo.file, '/out', cfg);
      const written = keret.read('/out/photos/' + photo.file);
      if (!written || !written.length) throw new Error('nothing was written');
      photo.thumb = r.thumb;
      bytesBefore += r.before;
      bytesAfter += r.after;
      published.push(photo);
      if (photo.file === ogFile) ogOriginal = keret.read('/photos/' + photo.file);
    } catch (err) {
      failed.push({ file: photo.file, reason: err.message });
    }
    keret.remove('/photos/' + photo.file);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  hooks.progress(scanned.photos.length, scanned.photos.length, '');
  if (!published.length) {
    throw new Error('None of those photos could be re-encoded here'
      + (failed.length ? ': ' + failed[0].reason : '.'));
  }

  /* 2. layout - on what really made it, so the wall has no holes */
  const cols = cfg.layout.cols > 0 ? cfg.layout.cols : layoutMod.autoCols(published, cfg);
  const laid = layoutMod.layout(published, cfg, cols);

  const rows = laid.photos.map((p) => {
    const cap = gen.captionPair(p, cfg);
    const alt = gen.altText(p); // the author's title, while it is still on the photo
    return {
      x: p.x, y: p.y, pw: p.pw, ph: p.ph,
      file: p.file, w: p.w, h: p.h, base: p.base,
      title: p.base.toUpperCase() + p.file.slice(p.file.lastIndexOf('.')).toUpperCase(),
      spec: cap.spec, cam: cap.cam, thumb: p.thumb, alt,
    };
  });

  const author = authorCard(values);

  /* 3. the page and its furniture */
  const html = buildPage({
    photos: rows,
    canvasW: laid.canvasW,
    canvasH: laid.canvasH,
    capH: layoutMod.captionHeight(cfg),
    maxScale: cfg.zoom.max,
    chrome: { credit: cfg.credit, description: cfg.description, author },
  }, cfg);

  keret.write('/out/index.html', html);
  keret.write('/out/.nojekyll', '');

  /* The settings ride in the zip, in the command line's own format: unzip, drop
     more photographs into photos/, rebuild - in the browser or with `node gen.js`
     - and the wall comes out set up the same way. Paths are written relative, as
     the command line expects to find them. */
  keret.write('/out/' + CONFIG_FILE,
    JSON.stringify({ ...cfg, photosDir: 'photos', outDir: 'dist' }, null, 2) + '\n');
  const authorFile = authorCard(values);
  if (authorFile) keret.write('/out/' + AUTHOR_FILE, JSON.stringify(authorFile, null, 2) + '\n');

  const face = fontOf(cfg);
  keret.write('/out/fonts/' + face.web, keret.read('/src/assets/fonts/' + face.web));
  keret.write('/out/fonts/LICENSE.txt', keret.read('/src/assets/fonts/LICENSE.txt'));

  const ogPhoto = ogFile && ogOriginal ? ogFile : '';
  if (ogPhoto) {
    try {
      keret.write('/originals/' + ogPhoto, ogOriginal);
      await images.writeOgImage(ogPhoto, '/originals/' + ogPhoto, '/out/og.jpg', cfg,
        { title: cfg.title, author: values.author, photos: published.length });
      keret.remove('/originals/' + ogPhoto);
    } catch (err) {
      ignored.push({ file: 'og.jpg', reason: 'the social preview could not be drawn here: ' + err.message });
    }
  }
  try {
    await images.writeTouchIcon('/out/apple-touch-icon.png', cfg);
  } catch (err) {
    ignored.push({ file: 'apple-touch-icon.png', reason: err.message });
  }

  const site = cfg.siteUrl ? cfg.siteUrl.replace(/\/?$/, '/') : '';
  keret.write('/out/robots.txt', 'User-agent: *\nAllow: /\n' + (site ? 'Sitemap: ' + site + 'sitemap.xml\n' : ''));
  if (site) {
    keret.write('/out/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + '  <url>\n    <loc>' + escapeHtml(site) + '</loc>\n    <changefreq>weekly</changefreq>\n  </url>\n</urlset>\n');
  }

  const entries = keret.entriesUnder('/out');
  const zip = buildZip(entries);

  return {
    cfg,
    html,
    rows,
    zip,
    entries,
    ignored,
    failed,
    stats: {
      photos: published.length,
      failed: failed.length,
      cols: laid.cols,
      canvasW: laid.canvasW,
      canvasH: laid.canvasH,
      bytesBefore,
      bytesAfter,
    },
  };
}

class BuildCancelled extends Error {}

/* ------------------------------------------------------------------ */
/* preview                                                            */
/* ------------------------------------------------------------------ */

/**
 * The real page, with its photo requests pointed at the bytes in memory.
 *
 * The wall's engine asks for 'photos/<file>'; here that expression is replaced
 * with a lookup into object URLs for this preview only. The zip keeps the page
 * exactly as the CLI would have written it.
 */
function previewHtml(result) {
  const urls = {};
  for (const row of result.rows) {
    const bytes = keret.read('/out/photos/' + row.file);
    const url = URL.createObjectURL(new Blob([bytes]));
    state.objectUrls.push(url);
    urls[row.file] = url;
  }
  const media = JSON.stringify(urls).replace(/</g, '\\u003c');
  const injected = '<script>var __keretMedia=' + media
    + ';function __keretSrc(f){return __keretMedia[f]||"photos/"+f}</script>';

  const face = result.cfg.font === 'sans' ? 'GeistSansVF.woff2' : 'GeistMonoVF.woff2';
  let html = result.html
    .replace("'photos/' + d.file", '__keretSrc(d.file)')
    .replace('url(fonts/' + face + ')', 'url(data:font/woff2;base64,' + FONTS[face] + ')');

  const at = html.lastIndexOf('<script>');
  return at < 0 ? injected + html : html.slice(0, at) + injected + html.slice(at);
}

function openPreview() {
  if (!state.result) return;
  closePreview();
  const s = state.result.stats;
  // a phone has no scroll wheel and no arrow keys: pinch is the one gesture worth naming
  const narrow = window.matchMedia('(max-width: 520px)').matches;
  ui.previewNote.innerHTML = escapeHtml(s.photos + ' photos')
    + '<span class="dims"> - ' + s.cols + ' columns - ' + s.canvasW + 'x' + s.canvasH + '</span>'
    + (narrow ? ' - pinch to zoom' : ' - drag, pinch, scroll');
  /* the modal has to be on screen before the page goes in: the wall fits itself
     to the viewport once, on load, and a hidden iframe reports no size */
  ui.modal.hidden = false;
  ui.frame.srcdoc = previewHtml(state.result);
  ui.closePreview.focus();
}

function closePreview() {
  ui.modal.hidden = true;
  ui.frame.srcdoc = '';
  for (const url of state.objectUrls) URL.revokeObjectURL(url);
  state.objectUrls = [];
}

/* ------------------------------------------------------------------ */
/* wiring                                                             */
/* ------------------------------------------------------------------ */

async function start() {
  if (!state.files.length) return;
  const values = readValues();
  state.cancelled = false;
  const from = await beginStep();
  hideSkipped();
  hideFailed();
  hideMiniWall();
  showAction('none');              // the way forward is the progress bar itself
  showForm(false);
  setHint('');
  const swapped = endStep('build', from);
  animateStep(swapped);
  ui.cancelBtn.disabled = false;
  ui.bar.setAttribute('aria-valuenow', '0');
  ui.barFill.style.width = '0%';
  ui.buildLead.textContent = 'Building the wall';
  ui.buildFile.textContent = '';
  try {
    const result = await runBuildFor(state.files, values);
    state.result = result;
    finish(result);
  } catch (err) {
    if (err instanceof BuildCancelled) {
      showPicker(state.files);       // the photographs are still picked and ready
      return;
    }
    const from = await beginStep();
    showAction('none');
    showForm(true);
    setHint('');
    showFailed([{ file: 'the wall', reason: err && err.message ? err.message : String(err) }]);
    const back = endStep('pick', from);
    animateStep(back);
  }
}

async function runBuildFor(files, values) {
  return runBuild(files, values, {
    cancelled: () => state.cancelled,
    progress: (done, total, file) => {
      const pct = total ? Math.round((done / total) * 100) : 0;
      ui.barFill.style.width = pct + '%';
      ui.bar.setAttribute('aria-valuenow', String(pct));
      ui.buildLead.textContent = done + ' of ' + total + ' photos';
      ui.buildFile.textContent = file ? 'Re-encoding ' + file : 'laying out the wall';
    },
  });
}

async function finish(result) {
  const s = result.stats;
  const from = await beginStep();
  ui.doneLead.textContent = s.photos + (s.photos === 1 ? ' photo on the wall' : ' photos on the wall');
  ui.doneStats.textContent = s.cols + ' columns - ' + s.canvasW + ' x ' + s.canvasH + ' px - '
    + mb(s.bytesBefore) + ' of photos became ' + mb(s.bytesAfter) + ' - zip ' + mb(result.zip.size);
  ui.buildFile.textContent = '';
  setHint('');
  ui.doneHost.innerHTML = HELP.done;
  showForm(false);               // the wall is built: settings come back with "Build again"
  showAction('download');
  if (result.ignored.length) showSkipped(result.ignored); else hideSkipped();
  if (result.failed.length) showFailed(result.failed); else hideFailed();
  const prints = showMiniWall(result);   // claims the wall's space, fills it below
  const swapped = endStep('done', from);
  animateStep(swapped);
  await prints;                  // the prints land before the step is on screen
  ui.downloadBtn.focus();
}

function download() {
  if (!state.result) return;
  const url = URL.createObjectURL(state.result.zip);
  const a = document.createElement('a');
  a.href = url;
  a.download = slug($('fTitle').value) + '.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* the picker: a folder when the browser allows it, files otherwise */
for (const button of [ui.pickBarBtn, ui.changeBtn]) {
  button.addEventListener('click', () => ui.fileInput.click());
}
ui.buildBtn.addEventListener('click', start);
ui.againBtn.addEventListener('click', () => {
  closePreview();
  state.result = null;
  showPicker(state.files); // the same photos stay picked: adjust the details and build again
  ui.fileInput.value = '';
});
ui.cancelBtn.addEventListener('click', () => { state.cancelled = true; ui.cancelBtn.disabled = true; });
ui.downloadBtn.addEventListener('click', download);
ui.previewBtn.addEventListener('click', openPreview);
ui.closePreview.addEventListener('click', closePreview);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ui.modal.hidden) closePreview(); });

ui.fileInput.addEventListener('change', () => {
  const files = [...ui.fileInput.files];
  state.paths.clear();
  rememberPaths(files.map((file) => [file, file.webkitRelativePath || file.name]));
  showPicker(files);
});

for (const type of ['dragenter', 'dragover']) {
  document.addEventListener(type, (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    ui.photobox.classList.add('dragging');
  });
}
document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) ui.photobox.classList.remove('dragging');
});
document.addEventListener('drop', async (e) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  ui.photobox.classList.remove('dragging');
  state.paths.clear();
  const files = await filesFromDrop(e.dataTransfer);
  if (files.length) showPicker(files);
});

/* A folder picker where one really exists.
 *
 * iOS Safari exposes `webkitdirectory` but does not implement it (WebKit bug
 * 271705): setting it only swaps the system picker for the Files app, so an
 * iPhone never reaches its photo library. Left unset there, the picker offers
 * Library, Take Photo and Files - which is the whole point on a phone, and since
 * iOS 16.4 those uploads keep their EXIF (WebKit bug 207088), so the captions
 * still work. iOS strips GPS before we ever see the file, which suits keret. */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if ('webkitdirectory' in ui.fileInput && !isIOS) {
  ui.fileInput.webkitdirectory = true;
  ui.fileInput.setAttribute('webkitdirectory', '');
  ui.pickBarBtn.title = 'Pick a folder — subfolders are read too';
}

/* the first paint: no photos yet, so the slot offers the first step */
showPicker([]);
wireDisclosure(ui.moreSettings);
