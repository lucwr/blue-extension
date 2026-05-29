/**
 * Generates solid-color PNG icons at the four sizes the manifest references.
 *
 * Uses only Node built-ins (fs, zlib) — no canvas/sharp/imagemagick dependency.
 * Hand-rolls a minimal valid PNG: 8-byte signature, IHDR, IDAT, IEND.
 *
 * Run once with `node extension/scripts/make-icons.mjs`. Output is committed
 * (well, would be — currently the `public/` tree is git-ignored) at:
 *   extension/public/icons/icon-{16,32,48,128}.png
 *
 * Color matches the brand-500 from tailwind.config.js (#2f7dff).
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CRC-32 (PNG flavor: polynomial 0xEDB88320, init 0xFFFFFFFF, final XOR 0xFFFFFFFF).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = (CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makeSolidPng(size, r, g, b) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr.writeUInt8(8, 8);        // bit depth
  ihdr.writeUInt8(2, 9);        // color type: 2 = RGB (no alpha)
  ihdr.writeUInt8(0, 10);       // compression: deflate
  ihdr.writeUInt8(0, 11);       // filter: adaptive (per-scanline)
  ihdr.writeUInt8(0, 12);       // interlace: none

  // Image data — one scanline at a time, each prefixed with a filter byte (0 = none).
  const bytesPerPixel = 3;
  const scanlineSize = 1 + size * bytesPerPixel;
  const raw = Buffer.alloc(scanlineSize * size);
  for (let row = 0; row < size; row++) {
    const base = row * scanlineSize;
    raw[base] = 0; // filter: none
    for (let col = 0; col < size; col++) {
      const off = base + 1 + col * bytesPerPixel;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// Brand color (tailwind brand-500 = #2f7dff)
const [r, g, b] = [0x2f, 0x7d, 0xff];

for (const size of [16, 32, 48, 128]) {
  const png = makeSolidPng(size, r, g, b);
  const filePath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, png);
  // eslint-disable-next-line no-console
  console.log(`wrote ${filePath} (${png.length} bytes)`);
}
