/**
 * Programmatic verification that the PDF pipeline produces a non-blank PDF.
 *
 *   1. Launch headless Chrome via puppeteer-core (using the OS Chrome install)
 *   2. Open extension/scripts/test-pdf.html — same offscreen-host + html2pdf
 *      logic as the popup's downloadResumePdf()
 *   3. Wait for window.__testResult
 *   4. If `ok: true`, decode the returned PDF base64 and run pdf-parse on it
 *      to confirm real text content extracted (e.g. "Marko Azirovic", "Summary")
 *
 * Usage:  node extension/scripts/run-pdf-test.mjs
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import zlib from 'node:zlib';

/**
 * Minimal text extraction from a jsPDF-produced PDF.
 *
 * jsPDF writes text using PDF operators like:  (Marko Azirovic) Tj
 * Text streams are typically FlateDecoded. We:
 *   1. Find each stream/endstream block.
 *   2. Try to inflate it; on failure, fall back to the raw bytes.
 *   3. Extract `(...) Tj` and `[(...)] TJ` operands as text fragments.
 *
 * This is sufficient for verifying that real text is present — we don't
 * need a full PDF parser for the assertion "this is not a blank PDF".
 */
function extractTextFromPdf(buf) {
  const raw = buf.toString('binary');
  const streams = [];
  const STREAM_RE = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = STREAM_RE.exec(raw)) !== null) streams.push(m[1]);

  const parts = [];
  for (const s of streams) {
    let decoded = s;
    try {
      decoded = zlib.inflateSync(Buffer.from(s, 'binary')).toString('binary');
    } catch {
      /* not flate-compressed or partial — use raw */
    }
    // Tj / TJ string operands
    const TJ_RE = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
    let t;
    while ((t = TJ_RE.exec(decoded)) !== null) {
      parts.push(t[1].replace(/\\([()\\])/g, '$1'));
    }
    const TJ_ARR_RE = /\[([\s\S]*?)\]\s*TJ/g;
    while ((t = TJ_ARR_RE.exec(decoded)) !== null) {
      const inner = t[1];
      const STR_RE = /\(((?:\\.|[^()\\])*)\)/g;
      let s2;
      while ((s2 = STR_RE.exec(inner)) !== null) {
        parts.push(s2[1].replace(/\\([()\\])/g, '$1'));
      }
    }
  }
  return parts.join(' ');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PAGE = path.join(__dirname, 'test-pdf.html');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    : null,
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((p) => p && existsSync(p));
if (!chromePath) {
  console.error('FAIL: could not locate Chrome. Set CHROME_PATH env var.');
  process.exit(1);
}

console.log('Using Chrome at:', chromePath);
console.log('Loading test page:', TEST_PAGE);

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let exitCode = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });

  // Surface in-page console messages so we can see html2canvas/html2pdf chatter.
  page.on('console', (msg) => {
    // Always echo console output during diagnostics.
    console.log(`  [page ${msg.type()}]`, msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('  [page error]', err.message);
  });

  await page.goto(pathToFileURL(TEST_PAGE).href, { waitUntil: 'networkidle0', timeout: 30_000 });

  // Wait for the in-page logic to populate window.__testResult.
  const result = await page.waitForFunction(() => window.__testResult, { timeout: 20_000 })
    .then((h) => h.jsonValue());

  if (!result?.ok) {
    console.error('FAIL: PDF pipeline did not succeed:', result);
    exitCode = 1;
  } else {
    console.log(
      `OK: canvas ${result.canvasW}×${result.canvasH}, PDF base64 length ${result.pdfBase64Length}`,
    );

    // Decode the PDF, parse it with pdf-parse, confirm real text.
    const pdfBytes = Buffer.from(result.pdfBase64, 'base64');
    const text = extractTextFromPdf(pdfBytes);

    console.log(`PDF: ${pdfBytes.length} bytes, ${result.pages} page(s), ${text.length} chars of text`);
    console.log('--- extracted text (first 500 chars) ---');
    console.log(text.slice(0, 500));
    console.log('-----------------------------------------');

    const requiredFragments = ['Marko Azirovic', 'Senior AI', 'SUMMARY', 'Karibu', 'Languages'];
    const lower = text.toLowerCase();
    const missing = requiredFragments.filter((f) => !lower.includes(f.toLowerCase()));
    if (missing.length > 0) {
      console.error(`FAIL: PDF text is missing fragments: ${missing.join(', ')}`);
      exitCode = 2;
    } else {
      console.log('✓ PDF text contains every expected fragment — pipeline produces non-blank output.');
    }
  }
} catch (err) {
  console.error('FAIL: exception during test:', err.message);
  exitCode = 3;
} finally {
  await browser.close();
}

process.exit(exitCode);
