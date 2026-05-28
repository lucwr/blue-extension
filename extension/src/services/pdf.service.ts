/**
 * In-popup PDF generation using html2pdf.js. The function renders the
 * default React template offscreen, then captures it as a PDF.
 *
 * Why in-popup (not backend Puppeteer):
 *   - Zero network round-trip; works offline once the resume JSON is in hand
 *   - Keeps the deterministic JSON → HTML → PDF rule (template in TSX is the
 *     single source of styling truth)
 *
 * Puppeteer-based rendering still lives in the backend for server-side / API
 * consumers — see backend/src/services/pdf.service.ts (Phase 4).
 */
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import html2pdf from 'html2pdf.js';
import { DefaultResumeTemplate } from '@/templates/DefaultResumeTemplate';
import type { ResumeJson } from '@/types/resume';
import { createLogger } from '@/utils/logger';

const log = createLogger('pdf');

interface DownloadOptions {
  filename?: string;
}

function buildOffscreenHost(): { host: HTMLDivElement; cleanup: () => void; root: Root } {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.background = '#ffffff';
  document.body.appendChild(host);

  const root = createRoot(host);

  return {
    host,
    root,
    cleanup: () => {
      root.unmount();
      host.remove();
    },
  };
}

export async function downloadResumePdf(
  resume: ResumeJson,
  options: DownloadOptions = {},
): Promise<void> {
  const filename =
    options.filename ??
    `${resume.contact.fullName.replace(/\s+/g, '_')}_${resume.targetTitle.replace(/\s+/g, '_')}.pdf`;

  const { host, cleanup, root } = buildOffscreenHost();

  try {
    root.render(createElement(DefaultResumeTemplate, { resume }));
    // Allow React to flush before html2pdf reads the DOM.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(host)
      .save();
    log.info('PDF downloaded', { filename });
  } catch (err) {
    log.error('PDF generation failed', err);
    throw err;
  } finally {
    cleanup();
  }
}
