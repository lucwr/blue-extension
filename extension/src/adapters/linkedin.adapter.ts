import type { ExtractedJobDescription } from '@/types/jd';
import { cleanJobText, cleanLabel } from '@/utils/text';
import { pickElement, pickText, type SiteAdapter } from './types';

/**
 * LinkedIn job pages come in two flavors: standalone (`/jobs/view/`) and
 * collection ("see more" overlay inside `/jobs/`). Both render the JD into
 * a node with class `description__text` or `jobs-description__content`.
 */
export const linkedinAdapter: SiteAdapter = {
  id: 'linkedin',
  matches(url) {
    try {
      const u = new URL(url);
      return u.hostname.endsWith('linkedin.com') && u.pathname.includes('/jobs/');
    } catch {
      return false;
    }
  },
  extract(doc, url) {
    const title = pickText(doc, [
      '.jobs-unified-top-card__job-title',
      '.top-card-layout__title',
      'h1.t-24',
      'h1',
    ]);

    const company = pickText(doc, [
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '.top-card-layout__second-subline a',
    ]);

    const location = pickText(doc, [
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
      '.jobs-unified-top-card__primary-description .t-black--light',
    ]);

    const descriptionEl = pickElement(doc, [
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-description-content__text',
      '.description__text',
      '.show-more-less-html__markup',
    ]);

    const description = cleanJobText(descriptionEl?.textContent ?? '');
    if (!title || description.length < 60) return null;

    return {
      source: 'linkedin',
      url,
      title: cleanLabel(title) ?? 'LinkedIn job',
      company: cleanLabel(company),
      location: cleanLabel(location),
      compensation: null,
      description,
      extractedAt: new Date().toISOString(),
      debug: { length: description.length },
    } satisfies ExtractedJobDescription;
  },
};
