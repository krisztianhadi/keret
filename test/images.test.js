'use strict';
/* images: header parsing, EXIF, captions, scanning, re-encoding and privacy. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { clearWallEnv, tempDir, fixture } = require('./helpers');
const { loadConfig } = require('../src/config');
const images = require('../src/images');
const sharp = require('sharp');
const { writeSamples } = require('../scripts/seed-placeholders');

clearWallEnv();
const cfg = loadConfig({ root: tempDir(), env: {} }).config;

test('PNG dimensions and EXIF are read from the header bytes', () => {
  const dir = tempDir();
  const [file] = writeSamples(dir, 1); // sample-terracotta-3x2.png, 1200x800, Canon EOS R6
  const buf = fs.readFileSync(file);
  assert.deepEqual(images.detectImageSize(buf, file), { w: 1200, h: 800 });

  const exif = images.readExif(buf, file);
  assert.equal(exif.make, 'Canon');
  assert.equal(exif.iso, 100);
  assert.equal(exif.orientation, undefined, 'no orientation tag is written');

  const caption = images.formatCaption(exif);
  assert.equal(caption.camera, 'Canon EOS R6');
  assert.equal(caption.year, '2026');
  assert.match(caption.specs, /50mm f\/1\.8 1\/200s ISO 100/);
});

test('seeded samples are visible images, not blank ones', async () => {
  const dir = tempDir();
  const [file] = writeSamples(dir, 1);
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const o = (y * info.width + x) * info.channels;
    return [data[o], data[o + 1], data[o + 2]];
  };
  const center = at(Math.floor(info.width / 2), Math.floor(info.height / 2));
  const corner = at(0, 0);
  assert.notDeepEqual(center, [0, 0, 0], 'the sample center is not black');
  assert.notDeepEqual(center, corner, 'the sample is a gradient, not one flat color');
});

test('GIF dimensions come from the logical screen descriptor', () => {
  const gif = Buffer.from('GIF89a\x40\x01\xf0\x00', 'latin1');
  const buf = Buffer.concat([gif, Buffer.alloc(20)]);
  assert.deepEqual(images.detectImageSize(buf, 'x.gif'), { w: 320, h: 240 });
});

test('unknown formats return null instead of guessing', () => {
  assert.equal(images.detectImageSize(Buffer.from('not an image'), 'x.jpg'), null);
  assert.equal(images.detectImageSize(Buffer.from('not an image'), 'x.avif'), null);
});

test('scanPhotos explains every file it leaves out', () => {
  const dir = tempDir();
  writeSamples(dir, 1);
  fs.writeFileSync(path.join(dir, 'broken.jpg'), 'definitely not a jpeg');
  fs.writeFileSync(path.join(dir, 'phone.HEIC'), 'heic bytes');
  fs.writeFileSync(path.join(dir, '_scratch.jpg'), 'scratch');
  fs.writeFileSync(path.join(dir, 'captions.json'), '{}');
  fs.mkdirSync(path.join(dir, 'subdir.jpg'));

  const { photos, skipped } = images.scanPhotos(dir, cfg, path.join(dir, 'captions.json'));
  assert.equal(photos.length, 1);
  const reasons = Object.fromEntries(skipped.map((s) => [s.file, s.reason]));
  assert.match(reasons['broken.jpg'], /header unreadable/);
  assert.equal(reasons['phone.HEIC'], 'unsupported extension .heic');
  assert.match(reasons['_scratch.jpg'], /name starts with "_"/);
  assert.equal(reasons['captions.json'], undefined, 'the captions sidecar is consumed silently');
  assert.equal(reasons['subdir.jpg'], 'not a file');
});

test('the card wraps its title to fit the card width', () => {
  assert.deepEqual(images.wrapText('Iceland 2026', 30, 2), ['Iceland 2026']);
  const two = images.wrapText('A wall of photographs from twelve days on the ring road in Iceland', 30, 2);
  assert.equal(two.length, 2);
  assert.ok(two.every((line) => line.length <= 30), 'no line overflows the card: ' + JSON.stringify(two));
  assert.match(two[1], /\u2026$/, 'the text left over is ellipsised');
  const clipped = images.wrapText('Supercalifragilisticexpialidocious', 10, 1);
  assert.equal(clipped.length, 1);
  assert.ok(clipped[0].length <= 10);
  assert.match(clipped[0], /\u2026$/);
});

test('the social card is the wall identity over a darkened photo', async () => {
  const dir = tempDir();
  const [src] = writeSamples(dir, 1);
  const out = path.join(dir, 'og.jpg');
  const config = loadConfig({ root: tempDir(), env: {} }).config;
  const bytes = await images.writeOgImage('sample.png', src, out, config, { title: 'Test Wall', author: 'Ada', photos: 3 });

  const card = await sharp(out).metadata();
  assert.equal(card.width, config.images.ogWidth, 'card width');
  assert.equal(card.height, config.images.ogHeight, 'card height');
  assert.ok(bytes > 0);

  // the overlay has to darken what sits under the text
  const band = { left: 0, top: Math.round(config.images.ogHeight * 0.75), width: config.images.ogWidth, height: Math.round(config.images.ogHeight * 0.25) };
  const plain = await sharp(src).resize({ width: config.images.ogWidth, height: config.images.ogHeight, fit: 'cover' }).extract(band).stats();
  const carded = await sharp(out).extract(band).stats();
  const mean = (stats) => stats.channels.slice(0, 3).reduce((total, channel) => total + channel.mean, 0) / 3;
  assert.ok(mean(carded) < mean(plain) * 0.85, 'the band behind the text is darker: ' + mean(carded).toFixed(1) + ' vs ' + mean(plain).toFixed(1));
});

test('writeCopies publishes the copy, strips metadata and keeps a placeholder', async () => {
  const dir = tempDir();
  const [src] = writeSamples(dir, 1);
  const out = path.join(dir, 'out');
  const file = path.basename(src);
  const result = await images.writeCopies(file, src, out, cfg);

  const full = fs.readFileSync(path.join(out, 'photos', file));
  const original = fs.readFileSync(src);

  assert.ok(original.includes(Buffer.from('eXIf', 'latin1')), 'the sample really carries EXIF');
  assert.equal(full.includes(Buffer.from('eXIf', 'latin1')), false, 'metadata is stripped from the served copy');
  assert.equal(/GPS/.test(full.toString('latin1')), false, 'no GPS strings in the served copy');
  assert.ok(result.before > 0 && result.after > 0);
  assert.match(result.thumb, /^data:image\/jpeg;base64,/);
  assert.equal(result.tiers, undefined, 'the shipped engine serves a single copy');
});

test('writeCopies re-encodes GIF to a still PNG', async () => {
  const dir = tempDir();
  const gif = Buffer.concat([
    Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff', 'latin1'),
    Buffer.from('\x21\xf9\x04\x00\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b', 'latin1'),
  ]);
  const src = path.join(dir, 'tiny.gif');
  fs.writeFileSync(src, gif);
  const out = path.join(dir, 'out');
  await images.writeCopies('tiny.gif', src, out, cfg);
  const written = fs.readFileSync(path.join(out, 'photos', 'tiny.gif'));
  assert.deepEqual([...written.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'PNG magic');
});
