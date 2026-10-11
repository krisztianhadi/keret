/*
 * zip.js - a ZIP writer with no dependencies.
 *
 * The download is a folder of static files, and every photo in it is already a
 * compressed JPEG/PNG/WebP, so the archive stores entries uncompressed: the work
 * deflate would do is a rounding error on the total, and storing keeps the file
 * byte-for-byte reproducible - a wall built twice from the same photos downloads
 * the identical zip.
 *
 * Timestamps are fixed for the same reason (a build clock would make every
 * download differ). Entries are limited to 4 GB and 65535 files, which is four
 * orders of magnitude past a wall of photographs.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* 1980-01-01 00:00, the earliest date the format can express. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

const utf8 = new TextEncoder();

function u16(view, offset, value) { view.setUint16(offset, value, true); }
function u32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function localHeader(entry) {
  const name = utf8.encode(entry.path);
  const buf = new Uint8Array(30 + name.length);
  const view = new DataView(buf.buffer);
  u32(view, 0, 0x04034b50);
  u16(view, 4, 20);            // version needed
  u16(view, 6, 0x0800);        // UTF-8 names
  u16(view, 8, 0);             // stored
  u16(view, 10, DOS_TIME);
  u16(view, 12, DOS_DATE);
  u32(view, 14, entry.crc);
  u32(view, 18, entry.bytes.length);
  u32(view, 22, entry.bytes.length);
  u16(view, 26, name.length);
  u16(view, 28, 0);
  buf.set(name, 30);
  return buf;
}

function centralHeader(entry) {
  const name = utf8.encode(entry.path);
  const buf = new Uint8Array(46 + name.length);
  const view = new DataView(buf.buffer);
  u32(view, 0, 0x02014b50);
  u16(view, 4, 20);            // version made by
  u16(view, 6, 20);            // version needed
  u16(view, 8, 0x0800);
  u16(view, 10, 0);
  u16(view, 12, DOS_TIME);
  u16(view, 14, DOS_DATE);
  u32(view, 16, entry.crc);
  u32(view, 20, entry.bytes.length);
  u32(view, 24, entry.bytes.length);
  u16(view, 28, name.length);
  u16(view, 30, 0);            // extra length
  u16(view, 32, 0);            // comment length
  u16(view, 34, 0);            // disk number
  u16(view, 36, 0);            // internal attributes
  u32(view, 38, 0);            // external attributes
  u32(view, 42, entry.offset);
  buf.set(name, 46);
  return buf;
}

function endOfCentralDirectory(count, size, offset) {
  const buf = new Uint8Array(22);
  const view = new DataView(buf.buffer);
  u32(view, 0, 0x06054b50);
  u16(view, 4, 0);
  u16(view, 6, 0);
  u16(view, 8, count);
  u16(view, 10, count);
  u32(view, 12, size);
  u32(view, 16, offset);
  u16(view, 20, 0);
  return buf;
}

/**
 * Assemble the archive. `entries` is [{ path, bytes }] with '/'-separated paths;
 * directories are implied by the file paths, which is what every unzipper does
 * with them anyway.
 *
 * Returns a Blob: the parts are handed to the browser as they are, so the whole
 * archive is never copied into one JavaScript allocation.
 */
export function buildZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const raw of entries) {
    const bytes = raw.bytes instanceof Uint8Array ? raw.bytes : new Uint8Array(raw.bytes);
    const entry = { path: raw.path, bytes, crc: crc32(bytes), offset };
    const header = localHeader(entry);
    parts.push(header, bytes);
    central.push(centralHeader(entry));
    offset += header.length + bytes.length;
  }

  const centralSize = central.reduce((n, buf) => n + buf.length, 0);
  parts.push(...central, endOfCentralDirectory(central.length, centralSize, offset));
  return new Blob(parts, { type: 'application/zip' });
}
