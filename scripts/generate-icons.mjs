#!/usr/bin/env node
/**
 * Generates the PWA icon set into public/icons/ — pure Node, no image deps.
 * Design: HYPERSTRIKE! starburst emblem (cyan 8-spike blast + white core)
 * over the deep-space background with a magenta ring.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, pixelFn) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const i = y * stride + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- artwork

const BG = [11, 10, 30]; // #0b0a1e
const CYAN = [77, 243, 255];
const MAGENTA = [255, 77, 216];
const WHITE = [255, 255, 255];

/** 8-spike starburst polygon (16 vertices, first spike pointing up). */
function starburstPoints(outer, inner) {
  const pts = [];
  for (let k = 0; k < 16; k++) {
    const ang = -Math.PI / 2 + (k * Math.PI) / 8;
    const rad = k % 2 === 0 ? outer : inner;
    pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
  }
  return pts;
}

function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function makePixelFn({ artScale }) {
  return (x, y, size) => {
    const c = size / 2;
    const dx = x + 0.5 - c;
    const dy = y + 0.5 - c;
    const dist = Math.hypot(dx, dy);
    const S = size * artScale;

    // deep-space background with a soft cyan glow behind the emblem
    const glow = Math.max(0, 1 - dist / (size * 0.7)) ** 2 * 0.22;
    let r = BG[0] + (CYAN[0] - BG[0]) * glow;
    let g = BG[1] + (CYAN[1] - BG[1]) * glow;
    let b = BG[2] + (CYAN[2] - BG[2]) * glow;

    // magenta ring
    const ringR = 0.44 * S;
    const ringW = 0.024 * S;
    if (Math.abs(dist - ringR) <= ringW) {
      [r, g, b] = MAGENTA;
    }

    // starburst spikes
    if (inPolygon(dx, dy, starburstPoints(0.34 * S, 0.145 * S))) {
      [r, g, b] = CYAN;
    }

    // white core
    if (dist <= 0.055 * S) {
      [r, g, b] = WHITE;
    }

    return [r, g, b, 255];
  };
}

// -------------------------------------------------------------------- output

mkdirSync(outDir, { recursive: true });
const icons = [
  ['icon-192.png', 192, { artScale: 1 }],
  ['icon-512.png', 512, { artScale: 1 }],
  ['icon-maskable-512.png', 512, { artScale: 0.62 }],
  ['apple-touch-icon.png', 180, { artScale: 1 }],
];
for (const [name, size, opts] of icons) {
  writeFileSync(join(outDir, name), encodePng(size, makePixelFn(opts)));
  console.log(`wrote ${name} (${size}x${size})`);
}
