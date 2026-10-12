#!/usr/bin/env node
/*
 * version-assets.mjs - put the app's assets behind a per-deploy URL.
 *
 *   node version-assets.mjs <dir> <version>
 *
 * Why this exists: the app's files have fixed names, so a browser that has
 * `app.css` cached keeps using it after a deploy, and the page it just fetched
 * revalidated picks up the new `index.html` - new markup, old stylesheet, old
 * script. That is not a cache-header problem to be argued about with a zone
 * setting; a new URL per deploy simply cannot be stale.
 *
 * So the assets are copied into `<dir>/v<version>/` and the HTML references that
 * directory instead. Relative imports inside the JavaScript resolve within it, so
 * no import specifier is rewritten and module syntax cannot be broken by this
 * step. The originals stay where they were: an `index.html` from someone's cache
 * still asks for `/app.js` and still gets one.
 *
 * An empty version means a local build - nothing is versioned, and nothing fails.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/* What must move together into the versioned directory: the two files the HTML
   names, and everything they import relative to themselves. */
const ASSETS = ['app.css', 'app.js', 'keret-runtime.js', 'canvas-sharp.js', 'zip.js'];
const DIRS = ['vendor'];
/* What the HTML references and this step rewrites. */
const REFERENCED = ['app.css', 'app.js'];
const PAGES = ['index.html', 'hosting.html', '404.html'];

const rel = (value) => String(value).replace(/^\.\//, '');
const [dir = 'dist', version = ''] = process.argv.slice(2);

if (!existsSync(dir)) {
  console.error('version-assets: no such directory: ' + dir);
  process.exit(1);
}

if (!version) {
  console.log('version-assets: no version given, assets left unversioned');
  process.exit(0);
}

const stamp = 'v' + rel(version).replace(/[^a-zA-Z0-9._-]/g, '');
const target = path.join(dir, stamp);
mkdirSync(target, { recursive: true });

for (const name of ASSETS) {
  const from = path.join(dir, name);
  if (!existsSync(from)) {
    console.error('version-assets: ' + name + ' is not in ' + dir + ' - copy the app first');
    process.exit(1);
  }
  copyFileSync(from, path.join(target, name));
}
for (const name of DIRS) {
  const from = path.join(dir, name);
  if (existsSync(from)) cpSync(from, path.join(target, name), { recursive: true });
}

let rewritten = 0;
for (const page of PAGES) {
  const file = path.join(dir, page);
  if (!existsSync(file)) continue;
  let html = readFileSync(file, 'utf8');
  if (html.includes(stamp + '/')) continue;
  // a page that already carries some other deploy's stamp is normalised first, so
  // this step is safe to run twice or after a different version
  html = html.replace(/((?:href|src)=")v[^/"]+\/(app\.css|app\.js)(")/g, '$1$2$3');
  for (const name of REFERENCED) {
    const attribute = new RegExp('((?:href|src)=")' + name.replace('.', '\\.') + '(")', 'g');
    html = html.replace(attribute, '$1' + stamp + '/' + name + '$2');
  }
  writeFileSync(file, html);
  rewritten += 1;
}

/* Every reference the HTML now makes has to exist: a typo in the list above would
   otherwise ship a page whose stylesheet 404s, and nothing would say so. */
for (const page of PAGES) {
  const file = path.join(dir, page);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)="(v[^"]+)"/g)) {
    if (!existsSync(path.join(dir, match[1]))) {
      console.error('version-assets: ' + page + ' references ' + match[1] + ', which is not in ' + dir);
      process.exit(1);
    }
  }
}

console.log('version-assets: ' + ASSETS.length + ' files and ' + DIRS.length + ' directory under ' + stamp + '/, ' + rewritten + ' page(s) rewritten');
