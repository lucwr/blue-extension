/**
 * Runs the adapter chain against the current document and returns the first
 * adapter that produces a usable JD. Generic adapter always runs last as a
 * safety net.
 */
import { adapters } from '@/adapters';
import type { ExtractedJobDescription } from '@/types/jd';
import type { AppError } from '@/types/messages';
import { createLogger } from '@/utils/logger';

const log = createLogger('content:extractor');

export function extractJobDescription(
  doc: Document,
  url: string,
): { ok: true; jd: ExtractedJobDescription } | { ok: false; error: AppError } {
  const matched = adapters.filter((a) => a.matches(url));
  const ordered = matched.length > 0 ? matched : adapters;

  for (const adapter of ordered) {
    try {
      const jd = adapter.extract(doc, url);
      if (jd) {
        log.info(`extracted via ${adapter.id}`, { url, len: jd.description.length });
        return { ok: true, jd };
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
