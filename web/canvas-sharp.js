/*
 * canvas-sharp.js - the sharp surface keret uses, backed by the browser's own
 * image decoder and encoder.
 *
 * src/images.js is written against sharp's chain: rotate -> resize -> jpeg/png/
 * webp -> toBuffer, plus composite/toFile for the social card and the touch
 * icon. This module implements exactly that chain, so the CLI's publish path
 * runs unmodified in a tab.
 *
 * Two honest differences from sharp, both visible in the output:
 *
 *   - the encoder is the browser's, not libvips + mozjpeg, so a browser build is
 *     not byte-identical to `node gen.js` (the wall's own geometry, captions and
 *     markup still are);
 *   - png({compressionLevel}) has no canvas equivalent - the browser picks its
 *     own deflate level.
 *
 * Safari cannot encode WebP from a canvas at all; that throws with a message
 * naming the file, rather than writing PNG bytes under a .webp name.
 */

/** True when the bytes are an SVG document rather than a raster image. */
function looksLikeSvg(bytes) {
  let i = 0;
  // BOM, then whitespace
  if (bytes.length > 2 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  return bytes[i] === 0x3c; // '<'
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('the browser could not decode this image'));
    img.src = url;
  });
}

/**
 * Decode any input into something drawable.
 *
 * Raster bytes go through createImageBitmap with imageOrientation:'from-image',
 * which is what sharp's .rotate() does: the EXIF orientation is applied and the
 * result carries no metadata. SVG (the social card) is decoded as an image.
 */
async function decode(input, svgFontCss) {
  if (typeof input === 'string') return decodeSvg(input, svgFontCss);
  const bytes = input;
  if (looksLikeSvg(bytes)) return decodeSvg(new TextDecoder().decode(bytes), svgFontCss);

  const blob = new Blob([bytes]);
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch (err) {
      // fall through: some browsers refuse a format here that <img> accepts
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** An SVG needs its typeface embedded: an SVG loaded as an image cannot reach
    the page's fonts, and fontconfig does not exist here. */
async function decodeSvg(text, fontCss) {
  const withCss = fontCss ? text.replace(/<svg[^>]*>/, (tag) => tag + fontCss) : text;
  const url = URL.createObjectURL(new Blob([withCss], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    if (img.decode) { try { await img.decode(); } catch (err) { /* onload was enough */ } }
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sizeOf = (img) => ({
  w: img.width || img.naturalWidth || 0,
  h: img.height || img.naturalHeight || 0,
});

/** Where the source rectangle lands on the destination canvas. */
function geometry(srcW, srcH, resize) {
  const W = Number(resize.width) || 0;
  const H = Number(resize.height) || 0;
  const fit = resize.fit || 'cover';

  if (fit === 'cover' && W && H) {
    const scale = Math.max(W / srcW, H / srcH);
    return {
      w: W, h: H, sx: 0, sy: 0, sw: srcW, sh: srcH,
      // position: sharp's default is centre, which is what the card uses
      dx: Math.round((W - srcW * scale) / 2), dy: Math.round((H - srcH * scale) / 2),
      dw: Math.round(srcW * scale), dh: Math.round(srcH * scale),
    };
  }

  let scale = Math.min(W ? W / srcW : Infinity, H ? H / srcH : Infinity);
  if (!Number.isFinite(scale)) scale = 1;
  if (resize.withoutEnlargement) scale = Math.min(scale, 1);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  return { w, h, sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: w, dh: h };
}

async function encodeCanvas(canvas, format, quality) {
  const q = typeof quality === 'number' ? Math.min(1, Math.max(0, quality / 100)) : undefined;
  let blob;
  if (canvas.convertToBlob) {
    blob = await canvas.convertToBlob({ type: format, quality: q });
  } else {
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the browser could not encode this image'))),
        format, q);
    });
  }
  // A browser that cannot encode the requested type quietly hands back PNG.
  if (format && blob.type && blob.type !== format) {
    throw new Error('this browser cannot encode ' + format.split('/')[1]
      + ' - try Chrome, Edge or Firefox for webp input');
  }
  return blob;
}

/**
 * The sharp-shaped factory. `wrap` makes a Buffer-like view of the output (so
 * the caller's `toString('base64')` works for the inline placeholder) and
 * `writeFile` is where .toFile() puts its bytes.
 */
export function createCanvasSharp({ wrap, writeFile, svgFontCss = '' }) {
  class Chain {
    constructor(input) {
      this.input = input;
      this._resize = null;
      this._composite = [];
      this._format = { type: 'image/jpeg', quality: 82 };
    }

    rotate() { return this; } // createImageBitmap already applies the EXIF orientation

    resize(opts) { this._resize = opts || null; return this; }

    composite(layers) {
      for (const layer of layers || []) this._composite.push(layer || {});
      return this;
    }

    jpeg(opts) { this._format = { type: 'image/jpeg', quality: (opts && opts.quality) || 82 }; return this; }
    png() { this._format = { type: 'image/png', quality: undefined }; return this; }
    webp(opts) { this._format = { type: 'image/webp', quality: (opts && opts.quality) || 82 }; return this; }

    async _render() {
      const base = await decode(this.input, svgFontCss);
      const src = sizeOf(base);
      if (!src.w || !src.h) throw new Error('the image has no usable size');
      const box = this._resize ? geometry(src.w, src.h, this._resize) : {
        w: src.w, h: src.h, sx: 0, sy: 0, sw: src.w, sh: src.h, dx: 0, dy: 0, dw: src.w, dh: src.h,
      };
      const canvas = makeCanvas(box.w, box.h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('this browser gave no 2d canvas context');
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(base, box.sx, box.sy, box.sw, box.sh, box.dx, box.dy, box.dw, box.dh);
      if (base.close) base.close();

      for (const layer of this._composite) {
        const over = await decode(layer.input, svgFontCss);
        const s = sizeOf(over);
        ctx.drawImage(over, layer.left || 0, layer.top || 0, s.w, s.h);
        if (over.close) over.close();
      }
      return canvas;
    }

    async toBuffer() {
      const canvas = await this._render();
      const blob = await encodeCanvas(canvas, this._format.type, this._format.quality);
      return wrap(new Uint8Array(await blob.arrayBuffer()));
    }

    async toFile(file) {
      const buf = await this.toBuffer();
      writeFile(file, buf);
      return { size: buf.length };
    }
  }

  return function sharp(input) { return new Chain(input); };
}
