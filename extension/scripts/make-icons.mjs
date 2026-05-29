/**
 * Generate the BlueStar Chrome MV3 toolbar icons from code.
 *
 *   SVG (math-defined 5-point star)  ──►  16 / 32 / 48 / 128 px PNGs
 *
 * Why generate (not resize a raster source):
 *   - Native transparent background — no flood-fill, no source.png needed.
 *   - Math-defined geometry stays crisp at every size, especially 16px.
 *   - Reproducible from code; tweaking colors / proportions is a one-line edit.
 *   - Matches the toolbar-icon convention of other extensions (silhouette on
 *     transparent canvas, takes the toolbar's bg color automatically).
 *
 * Run:
 *   npm run make-icons
 *
 * Output files (all transparent background):
 *   extension/public/icons/icon-16.png
 *   extension/public/icons/icon-32.png
 *   extension/public/icons/icon-48.png
 *   extension/public/icons/icon-128.png
 *   extension/public/icons/source.png      (512×512 master, for archival)
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];

// ---------- design constants ----------
//
// Canvas is 100×100 (viewBox units). Star is centered with the outer radius
// nearly filling the canvas (R = 45 of 50) so the silhouette reads boldly
// at 16px. Inner radius at 0.4 × outer gives a "chunky" 5-point shape that
// stays legible when downsampled.
const CANVAS = 100;
const CENTER = CANVAS / 2;
const OUTER_R = 45;
const INNER_R = 18;
const POINTS = 5;
const ROTATION_DEG = -90; // first point up

// Brand colors. Mid-tone is tailwind's brand-500 (#2F7DFF) so the icon
// matches the popup's accent color.
const HIGHLIGHT = '#8FC0FF'; // top of gradient (sky highlight)
const MID = '#2F7DFF'; // brand blue
const SHADOW = '#0F3A99'; // bottom of gradient (deep blue)
const OUTLINE = '#0A2865'; // subtle outline for definition at small sizes

// ---------- geometry ----------

function starPoints(cx, cy, outerR, innerR, count, rotationDeg) {
  const total = count * 2;
  const step = 180 / count; // degrees per outer/inner alternation
  const pts = [];
  for (let i = 0; i < total; i++) {
    const angleRad = ((rotationDeg + i * step) * Math.PI) / 180;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angleRad);
    const y = cy + r * Math.sin(angleRad);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

const points = starPoints(CENTER, CENTER, OUTER_R, INNER_R, POINTS, ROTATION_DEG);

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <linearGradient id="g" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="${HIGHLIGHT}"/>
      <stop offset="45%" stop-color="${MID}"/>
      <stop offset="100%" stop-color="${SHADOW}"/>
    </linearGradient>
  </defs>
  <polygon points="${points}"
           fill="url(#g)"
           stroke="${OUTLINE}"
           stroke-width="1"
           stroke-linejoin="round"/>
</svg>`;

// ---------- rasterize ----------

fs.mkdirSync(OUT_DIR, { recursive: true });
const svgBuffer = Buffer.from(SVG);

// 512×512 master kept for archival / external use.
const SOURCE_OUT = path.join(OUT_DIR, 'source.png');
await sharp(svgBuffer)
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toFile(SOURCE_OUT);
console.log(`wrote source.png  (512×512 master, transparent bg)`);

for (const size of SIZES) {
  const out = path.join(OUT_DIR, `icon-${size}.png`);
  await sharp(svgBuffer)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  const { size: bytes } = fs.statSync(out);
  console.log(`wrote icon-${size}.png   (${bytes} bytes, transparent bg)`);
}

console.log('\nDone. Run `npm run build:extension` next.\n');
