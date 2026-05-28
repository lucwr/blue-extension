import type { ExtractedJobDescription } from '@/types/jd';
import { cleanJobText, cleanLabel } from '@/utils/text';
import { pickElement, pickText, type SiteAdapter } from './types';

export const indeedAdapter: SiteAdapter = {
  id: 'indeed',
  matches(url) {
    try {
      const u = new URL(url);
      return u.hostname.endsWith('indeed.com');
    } catch {
      return false;
    }
  },
  extract(doc, url) {
    const title = pickText(doc, [
      'h1.jobsearch-JobInfoHeader-title',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      'h1',
    ]);

    const company = pickText(doc, [
      '[data-testid="inlineHeader-companyName"]',
      'div.jobsearch-CompanyInfoContainer a',
      '[data-company-name="true"]',
    ]);

    const location = pickText(doc, [
      '[data-testid="inlineHeader-companyLocation"]',
      'div.jobsearch-JobInfoHeader-subtitle div',
    ]);

    const compensation = pickText(doc, [
      '[id^="salaryInfoAndJobType"] span',
      '#salaryInfoAndJobType',
    ]);

    const descriptionEl = pickElement(doc, [
      '#jobDescriptionText',
      '[data-testid="jobsearch-JobComponent-description"]',
      'div.jobsearch-jobDescriptionText',
    ]);

    const description = cleanJobText(descriptionEl?.textContent ?? '');
    if (!title || description.length < 60) return null;

    return {
      source: 'indeed',
      url,
      title: cleanLabel(title) ?? 'Indeed job',
      company: cleanLabel(company),
      location: cleanLabel(location),
      compensation: cleanLabel(compensation),
      description,
      extractedAt: new Date().toISOString(),
      debug: { length: description.length },
    } satisfies ExtractedJobDescription;
  },
};
