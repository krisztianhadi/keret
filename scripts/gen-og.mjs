/*
 * gen-og.mjs - render the app's share card and touch icon.
 *
 * The cards are HTML (scripts/og-card.html, scripts/icon-card.html) so they wear
 * the app's own palette and face instead of being a picture nobody can edit, and
 * they have to be served rather than opened from disk or the font will not load:
 *
 *   node scripts/serve.js . 4330            # serve the repo root
 *   node scripts/gen-og.mjs                 # writes web/og.png, web/apple-touch-icon.png
 *
 * Playwright is not a dependency of this project (the CLI ships one, sharp). The
 * script looks for it the way the rest of this machine does - an installed
 * `playwright`, a `PLAYWRIGHT` env var, or the sibling checkout that has it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASE = process.env.CARD_BASE || 'http://127.0.0.1:4330';

const CANDIDATES = [
  process.env.PLAYWRIGHT,
  '@playwright/test',
  'playwright',
  '/home/k/Code/ghosted/node_modules/@playwright/test',
].filter(Boolean);

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const candidate of CANDIDATES) {
    try {
      return require(candidate);
    } catch {
      // try the next one
    }
  }
  throw new Error('could not find playwright; set PLAYWRIGHT=/path/to/@playwright/test');
}

/* What to render, and where it lands. */
const CARDS = [
  { page: 'og-card.html', out: 'web/og.png', width: 1200, height: 630, label: 'social card' },
  { page: 'icon-card.html', out: 'web/apple-touch-icon.png', width: 180, height: 180, label: 'touch icon' },
];

const { chromium } = loadPlaywright();

const browser = await chromium.launch();
try {
  for (const card of CARDS) {
    const page = await browser.newPage({
      viewport: { width: card.width, height: card.height },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    const url = `${BASE}/scripts/${card.page}`;
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response || !response.ok()) throw new Error(`${url} answered ${response ? response.status() : 'nothing'}`);
    // the card is only correct once the photographs have decoded and the font has
    // settled, and a screenshot taken before that ships a blank or a fallback face
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }))));
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
    });
    const missing = await page.evaluate(() => [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src')));
    if (missing.length) throw new Error(`${card.page}: no image at ${missing.join(', ')}`);
    await page.screenshot({ path: path.join(ROOT, card.out) });
    await page.close();
    console.log(`  ok  ${card.out} (${card.width}x${card.height}) - ${card.label}`);
  }
} finally {
  await browser.close();
}

/* A card is only worth publishing if it is legible: the two sizes below are the
   ones the feed readers crop to, so check the file is the size it claims. */
for (const card of CARDS) {
  const file = path.join(ROOT, card.out);
  if (!existsSync(file)) throw new Error(`${card.out} was not written`);
  const png = readFileSync(file);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== card.width || height !== card.height) {
    throw new Error(`${card.out} is ${width}x${height}, expected ${card.width}x${card.height}`);
  }
}
