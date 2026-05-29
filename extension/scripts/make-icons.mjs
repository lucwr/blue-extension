/**
 * Resize the master extension icon into the four sizes Chrome MV3 needs.
 *
 * Workflow:
 *   1. Save your master icon at  extension/public/icons/source.png
 *      (square PNG, recommended >= 512x512 — anything smaller and the
 *       128px output will look soft).
 *   2. Run  `npm run make-icons`  from the repo root (or
 *      `npm --workspace extension run make-icons`).
 *   3. Run  `npm run build:extension`  to bundle the dist.
 *
 * Outputs:
 *   extension/public/icons/icon-16.png
 *   extension/public/icons/icon-32.png
 *   extension/public/icons/icon-48.png
 *   extension/public/icons/icon-128.png
 *
 * Uses `sharp` for high-quality downsampling (Lanczos3). Sharp ships
 * pre-built binaries for Windows/macOS/Linux — `npm install` is enough.
 *
 * NOTE: this script REPLACES the earlier synthetic icon generator. The
 * earlier version hand-rolled solid-blue PNG bytes when no real icon was
 * available; now that you have a real master, we just resize it.
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const SOURCE = path.join(OUT_DIR, 'source.png');

const SIZES = [16, 32, 48, 128];

if (!fs.existsSync(SOURCE)) {
  // eslint-disable-next-line no-console
  console.error(`\nERROR: source icon not found at:\n  ${SOURCE}\n`);
  console.error('Save your master icon there (square PNG, recommended 512x512 or larger),');
  console.error("then re-run `npm run make-icons`.\n");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const meta = await sharp(SOURCE).metadata();
// eslint-disable-next-line no-console
console.log(`source: ${SOURCE}  (${meta.width}x${meta.height}, ${meta.format})`);

for (const size of SIZES) {
  const out = path.join(OUT_DIR, `icon-${size}.png`);
  await sharp(SOURCE)
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  const { size: bytes } = fs.statSync(out);
  // eslint-disable-next-line no-console
  console.log(`  wrote icon-${size}.png  (${bytes} bytes)`);
}

// eslint-disable-next-line no-console
console.log('\nDone. Run `npm run build:extension` next.\n');
