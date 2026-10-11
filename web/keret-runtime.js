/*
 * keret-runtime.js - run keret's own build modules inside a browser tab.
 *
 * The app is not a reimplementation: web/build.mjs embeds src/*.js verbatim and
 * this file supplies the node-shaped surroundings they expect - a small in-memory
 * filesystem, a Buffer with the three methods the header parser uses, a posix
 * path module, and a canvas-backed sharp. Load a module the way node would:
 *
 *   const keret = createKeret();
 *   keret.write('/photos/a.jpg', fileBytes);
 *   const config = keret.require('/src/config.js');
 *
 * Everything the build reads or writes lives in the VFS, so nothing touches the
 * user's disk and a whole wall can be built, previewed and zipped in memory.
 */

import { MODULES, ASSETS, FONTS } from './vendor/keret-core.js';
import { createCanvasSharp } from './canvas-sharp.js';

/* ------------------------------------------------------------------ */
/* Buffer                                                             */
/* ------------------------------------------------------------------ */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Byte-per-character, exactly as node's 'latin1': TextDecoder would map
    0x80-0x9f through windows-1252 and change the string. */
function fromLatin1(bytes, start, end) {
  let out = '';
  for (let i = start; i < end; i += 4096) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + 4096)));
  }
  return out;
}

function toBase64(bytes, start, end) {
  let out = '';
  let i = start;
  for (; i + 2 < end; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (end - i === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (end - i === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

/**
 * A Buffer good enough for the build: byte indexing, subarray (which stays a
 * Buf, so sliced EXIF blobs keep working), and toString for utf8/latin1/hex/
 * base64 - the encodings keret actually asks for.
 */
class Buf extends Uint8Array {
  toString(encoding = 'utf8', start = 0, end = this.length) {
    const enc = String(encoding).toLowerCase();
    const from = Math.max(0, start | 0);
    const to = Math.min(this.length, end === undefined ? this.length : end | 0);
    if (enc === 'latin1' || enc === 'binary') return fromLatin1(this, from, to);
    if (enc === 'base64') return toBase64(this, from, to);
    if (enc === 'hex') {
      let out = '';
      for (let i = from; i < to; i++) out += this[i].toString(16).padStart(2, '0');
      return out;
    }
    if (enc === 'ascii') {
      let out = '';
      for (let i = from; i < to; i++) out += String.fromCharCode(this[i] & 0x7f);
      return out;
    }
    return new TextDecoder(enc === 'utf-8' ? 'utf8' : 'utf8').decode(this.subarray(from, to));
  }

  /** Share memory with an existing view rather than copying the bytes. */
  static wrap(view) {
    return new Buf(view.buffer, view.byteOffset, view.byteLength);
  }

  static from(value, encoding) {
    if (typeof value === 'string') {
      const bytes = new TextEncoder().encode(value);
      return new Buf(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    if (value instanceof ArrayBuffer) return new Buf(value);
    if (ArrayBuffer.isView(value)) return Buf.wrap(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    if (Array.isArray(value)) return new Buf(value);
    if (value && typeof value.length === 'number') return new Buf(Array.from(value));
    throw new TypeError('cannot make a Buffer from ' + typeof value);
  }
}

/* ------------------------------------------------------------------ */
/* In-memory filesystem                                               */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();

class Vfs {
  constructor() {
    this.files = new Map();
  }

  write(p, data) {
    let bytes;
    if (typeof data === 'string') bytes = enc.encode(data);
    else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    else bytes = new Uint8Array(data);
    this.files.set(p, bytes);
    return bytes.length;
  }

  read(p) { return this.files.get(p); }
  has(p) { return this.files.has(p); }
  remove(p) {
    const prefix = p.replace(/\/$/, '') + '/';
    for (const key of [...this.files.keys()]) if (key === p || key.startsWith(prefix)) this.files.delete(key);
  }

  /** Immediate children of a directory: files and the first level of subdirs. */
  list(dir) {
    const prefix = dir.replace(/\/$/, '') + '/';
    const names = new Set();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (!rest) continue;
      names.add(rest.split('/')[0]);
    }
    return [...names];
  }

  entriesUnder(dir) {
    const prefix = dir.replace(/\/$/, '') + '/';
    return [...this.files.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, bytes]) => ({ path: key.slice(prefix.length), bytes }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}

/* ------------------------------------------------------------------ */
/* node shims                                                         */
/* ------------------------------------------------------------------ */

function enoent(p, syscall) {
  const err = new Error('ENOENT: no such file or directory, ' + (syscall || 'open') + " '" + p + "'");
  err.code = 'ENOENT';
  return err;
}

function createPath() {
  const norm = (p) => {
    const abs = p.startsWith('/');
    const out = [];
    for (const part of p.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); continue; }
      out.push(part);
    }
    const joined = out.join('/');
    return abs ? '/' + joined : (joined || '.');
  };
  const api = {
    sep: '/',
    normalize: norm,
    join: (...parts) => norm(parts.filter((p) => p != null && p !== '').join('/')),
    resolve: (...parts) => {
      let resolved = '';
      for (const part of parts) {
        if (part == null || part === '') continue;
        resolved = String(part).startsWith('/') ? String(part) : (resolved ? resolved + '/' + part : String(part));
      }
      return norm(resolved.startsWith('/') ? resolved : '/' + resolved);
    },
    dirname: (p) => {
      const s = String(p).replace(/\/+$/, '');
      const i = s.lastIndexOf('/');
      if (i < 0) return '.';
      return i === 0 ? '/' : s.slice(0, i);
    },
    basename: (p, ext) => {
      const s = String(p).replace(/\/+$/, '');
      const base = s.slice(s.lastIndexOf('/') + 1);
      return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
    },
    extname: (p) => {
      const base = api.basename(p);
      const i = base.lastIndexOf('.');
      return i <= 0 ? '' : base.slice(i);
    },
    relative: (from, to) => {
      const a = norm(from).split('/').filter(Boolean);
      const b = norm(to).split('/').filter(Boolean);
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
    },
    isAbsolute: (p) => String(p).startsWith('/'),
    parse: (p) => {
      const ext = api.extname(p);
      const base = api.basename(p);
      return { root: '/', dir: api.dirname(p), base, ext, name: base.slice(0, base.length - ext.length) };
    },
  };
  return api;
}

function createFs(vfs, path) {
  return {
    readFileSync(p, options) {
      const bytes = vfs.read(p);
      if (!bytes) throw enoent(p, 'open');
      if (typeof options === 'string' || (options && options.encoding)) return Buf.wrap(bytes).toString(options.encoding || options);
      return Buf.wrap(bytes);
    },
    writeFileSync(p, data) { vfs.write(p, data); },
    appendFileSync(p, data) {
      const prev = vfs.read(p);
      const add = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
      const next = new Uint8Array((prev ? prev.length : 0) + add.length);
      if (prev) next.set(prev, 0);
      next.set(add, prev ? prev.length : 0);
      vfs.write(p, next);
    },
    mkdirSync(p, opts) {
      if (!opts || !opts.recursive) return undefined;
      return undefined; // directories are implied by the paths of the files in the vfs
    },
    readdirSync(dir) {
      const names = vfs.list(dir);
      if (!names.length && !vfs.has(dir) && ![...vfs.files.keys()].some((k) => k.startsWith(dir.replace(/\/$/, '') + '/'))) {
        throw enoent(dir, 'scandir');
      }
      return names;
    },
    existsSync: (p) => vfs.has(p) || vfs.list(p).length > 0,
    statSync(p) {
      const bytes = vfs.read(p);
      const isDir = !bytes && vfs.list(p).length > 0;
      if (!bytes && !isDir) throw enoent(p, 'stat');
      return {
        size: bytes ? bytes.length : 0,
        mtimeMs: 0,
        isFile: () => Boolean(bytes),
        isDirectory: () => isDir,
      };
    },
    copyFileSync(from, to) {
      const bytes = vfs.read(from);
      if (!bytes) throw enoent(from, 'copyfile');
      vfs.write(to, bytes);
    },
    rmSync(p) { vfs.remove(p); },
  };
}

/* ------------------------------------------------------------------ */
/* module loader                                                      */
/* ------------------------------------------------------------------ */

/** The @font-face block an SVG needs to be set in Geist inside a canvas. */
function fontCss() {
  const face = (family, key) => (FONTS[key]
    ? '@font-face{font-family:"' + family + '";src:url(data:font/woff2;base64,' + FONTS[key] + ') format("woff2");}'
    : '');
  return '<style>' + face('Geist Mono', 'GeistMonoVF.woff2') + face('Geist', 'GeistSansVF.woff2') + '</style>';
}

export function createKeret() {
  const vfs = new Vfs();
  const path = createPath();

  // the page furniture and the type travel inside the bundle: no requests, and
  // the same bytes the CLI would have read off disk
  for (const [name, text] of Object.entries(ASSETS)) vfs.write('/src/assets/' + name, text);
  for (const [name, base64] of Object.entries(FONTS)) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    vfs.write('/src/assets/fonts/' + name, bytes);
  }

  const fs = createFs(vfs, path);
  const sharp = createCanvasSharp({
    wrap: Buf.wrap,
    writeFile: (p, bytes) => vfs.write(p, bytes),
    svgFontCss: fontCss(),
  });

  const processShim = {
    env: {},
    argv: [],
    platform: 'browser',
    cwd: () => '/',
    nextTick: (fn, ...args) => Promise.resolve().then(() => fn(...args)),
  };

  const shims = {
    fs,
    path,
    os: { tmpdir: () => '/tmp', EOL: '\n', platform: () => 'browser' },
    crypto: { createHash: () => { throw new Error('crypto is not available in the browser build'); } },
    readline: { createInterface: () => { throw new Error('the interactive setup is not available in the browser build'); } },
    sharp,
  };

  const cache = new Map();

  function resolveId(from, id) {
    if (!id.startsWith('.')) return id;
    const base = path.join(path.dirname(from), id);
    for (const candidate of [base, base + '.js', base + '.json', base + '/index.js']) {
      if (MODULES[candidate]) return candidate;
    }
    throw new Error('cannot resolve "' + id + '" from ' + from);
  }

  function requireFrom(from) {
    const req = (id) => {
      const key = resolveId(from, id);
      if (Object.prototype.hasOwnProperty.call(shims, key)) return shims[key];
      const factory = MODULES[key];
      if (!factory) throw new Error('module "' + id + '" is not part of the browser bundle');
      if (cache.has(key)) return cache.get(key).exports;
      const mod = { exports: {}, id: key, filename: key };
      cache.set(key, mod);
      factory(mod, mod.exports, requireFrom(key), path.dirname(key), key, Buf, processShim);
      return mod.exports;
    };
    return req;
  }

  const requireRoot = requireFrom('/');

  return {
    require: requireRoot,
    write: (p, data) => vfs.write(p, data),
    read: (p) => vfs.read(p),
    has: (p) => vfs.has(p),
    remove: (p) => vfs.remove(p),
    list: (dir) => vfs.list(dir),
    entriesUnder: (dir) => vfs.entriesUnder(dir),
  };
}
