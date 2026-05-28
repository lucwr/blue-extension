import type { ExtractedJobDescription } from '@/types/jd';
import { cleanJobText, cleanLabel } from '@/utils/text';
import { pickElement, pickText, type SiteAdapter } from './types';

/**
 * Upwork job page extractor. Upwork's DOM changes frequently — selectors are
 * ordered most-stable → most-volatile so the first match wins.
 */
export const upworkAdapter: SiteAdapter = {
  id: 'upwork',
  matches(url) {
    try {
      const u = new URL(url);
      return u.hostname.endsWith('upwork.com') && /\/jobs\/(_~|.+~)/.test(u.pathname);
    } catch {
      return false;
    }
  },
  extract(doc, url) {
    const title = pickText(doc, [
      '[data-test="job-title"]',
      'h1[data-cy="job-title"]',
      'h1',
    ]);

    const descriptionEl = pickElement(doc, [
      '[data-test="Description"]',
      'section[data-test="Description"] .text-body',
      'div.job-description',
      'div[data-test="job-description"]',
    ]);

    const compensation = pickText(doc, [
      '[data-test="BudgetAmount"]',
      '[data-test="HourlyRate"]',
      '[data-cy="clock-timelog"]',
    ]);

    const location = pickText(doc, [
      '[data-test="LocationLabel"]',
      '[data-cy="client-location"]',
    ]);

    const description = cleanJobText(descriptionEl?.textContent ?? '');
    if (!title || description.length < 60) return null;

    return {
      source: 'upwork',
      url,
      title: cleanLabel(title) ?? 'Upwork job',
      // Upwork hides the client name behind verification — leave null intentionally.
      company: null,
      location: cleanLabel(location),
      compensation: cleanLabel(compensation),
      description,
      extractedAt: new Date().toISOString(),
      debug: { length: description.length },
    } satisfies ExtractedJobDescription;
  },
};
