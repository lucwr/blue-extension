/**
 * Runs the adapter chain against the current document and returns the first
 * adapter that produces a usable JD. Generic adapter always runs last as a
 * safety net.
 *
 * Also detects whether the current page has a cover-letter / proposal /
 * "why are you a fit" form field. The popup uses that flag to skip the
 * Proposal generation step on bid pages that don't actually need one —
 * which roughly halves perceived end-to-end latency for those flows.
 */
import { adapters } from '@/adapters';
import type { ExtractedJobDescription } from '@/types/jd';
import type { AppError } from '@/types/messages';
import { createLogger } from '@/utils/logger';

const log = createLogger('content:extractor');

/**
 * Sentinel regex for cover-letter-style fields. Same vocabulary as the
 * autofill engine's `cover-letter` matcher so detection here predicts what
 * the autofill engine will later try to fill.
 */
const COVER_LETTER_RE =
  /\b(cover[\s_-]?letter|proposal|why[\s_-]?(you|fit|interested|join|us|this)|introduce[\s_-]?yourself|introduction|tell[\s_-]?us|describe[\s_-]?yourself|pitch|message[\s_-]?to[\s_-]?(client|hiring))\b/i;

function fieldSignals(el: HTMLElement): string {
  const labelText = (() => {
    if ((el as HTMLInputElement).id) {
      try {
        const lab = document.querySelector(`label[for="${CSS.escape((el as HTMLInputElement).id)}"]`);
        if (lab?.textContent) return lab.textContent;
      } catch {
        /* CSS.escape can throw on weird ids */
      }
    }
    const wrap = el.closest('label');
    if (wrap?.textContent) return wrap.textContent;
    return '';
  })();
  return [
    (el as HTMLInputElement).name ?? '',
    el.id ?? '',
    el.getAttribute('placeholder') ?? '',
    el.getAttribute('aria-label') ?? '',
    labelText,
  ]
    .join(' ')
    .toLowerCase();
}

function detectCoverLetterField(doc: Document): boolean {
  // Strong signal: a textarea whose label / placeholder / name matches the
  // cover-letter vocabulary. Plain <input type="text"> rarely holds a
  // cover letter, so we restrict to textareas + multi-line inputs.
  const textareas = Array.from(doc.querySelectorAll<HTMLTextAreaElement>('textarea'));
  for (const ta of textareas) {
    if (COVER_LETTER_RE.test(fieldSignals(ta))) return true;
  }
  // Also accept very-long inputs with cover-letter-shaped labels (rare).
  const longInputs = Array.from(
    doc.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'),
  ).filter((el) => Number(el.getAttribute('maxlength') ?? 0) >= 500);
  for (const inp of longInputs) {
    if (COVER_LETTER_RE.test(fieldSignals(inp))) return true;
  }
  return false;
}

export function extractJobDescription(
  doc: Document,
  url: string,
): { ok: true; jd: ExtractedJobDescription } | { ok: false; error: AppError } {
  const matched = adapters.filter((a) => a.matches(url));
  const ordered = matched.length > 0 ? matched : adapters;

  const hasCoverLetterField = detectCoverLetterField(doc);

  for (const adapter of ordered) {
    try {
      const jd = adapter.extract(doc, url);
      if (jd) {
        log.info(`extracted via ${adapter.id}`, {
          url,
          len: jd.description.length,
          hasCoverLetterField,
        });
        return { ok: true, jd: { ...jd, hasCoverLetterField } };
      }
    } catch (err) {
      log.warn(`adapter ${adapter.id} threw`, err);
    }
  }

  return {
    ok: false,
    error: {
      code: 'NO_JD_FOUND',
      message:
        'No job description detected on this page. Open a job posting and try again, or paste the JD manually from the popup.',
    },
  };
}
