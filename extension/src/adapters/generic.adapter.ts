/**
 * Generic fallback adapter. Used when no site-specific adapter matches, or
 * when a site adapter returns null because its selectors broke after a
 * frontend change.
 *
 * Strategy:
 *   1. Prefer structured JSON-LD JobPosting (most ATS-aware sites embed this).
 *   2. Otherwise pick the densest text block (largest <article>/<main>/<section>).
 *   3. Pull title from <h1> / <title>.
 */
import type { ExtractedJobDescription } from '@/types/jd';
import { cleanJobText, cleanLabel } from '@/utils/text';
import { type SiteAdapter, pickText, textOf } from './types';

interface JsonLdJobPosting {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
  baseSalary?: unknown;
}

function readJsonLd(doc: Document): JsonLdJobPosting | null {
  const scripts = doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const parsed = JSON.parse(s.textContent ?? 'null');
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const type = node?.['@type'];
        const isJob =
          (typeof type === 'string' && type === 'JobPosting') ||
          (Array.isArray(type) && type.includes('JobPosting'));
        if (isJob) return node as JsonLdJobPosting;
      }
    } catch {
      // Ignore unparseable JSON-LD blocks — sites often ship multiple.
    }
  }
  return null;
}

function descriptionToText(html: string): string {
  // First pass: parse as HTML and extract textContent. Handles real HTML.
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let text = tmp.textContent ?? '';

  // Second pass: some sites (e.g., join.com) entity-encode their JSON-LD
  // description, so after pass 1 the text still contains literal "<p>" /
  // "</strong>" sequences. Re-set as innerHTML and re-extract to peel that
  // second layer.
  if (text.includes('<') && text.includes('>')) {
    tmp.innerHTML = text;
    text = tmp.textContent ?? '';
  }

  // Final defensive strip — kills any malformed tag remnants the DOM parser
  // couldn't resolve (e.g. unclosed tags inside attribute strings).
  return text.replace(/<\/?[a-z][^>]*>/gi, ' ');
}

function densestBlock(doc: Document): Element | null {
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>('article, main, [role="main"], section, .job, .description'),
  );
  let best: { el: Element; len: number } | null = null;
  for (const el of candidates) {
    const t = (el.textContent ?? '').trim();
    if (t.length < 200) continue;
    if (!best || t.length > best.len) best = { el, len: t.length };
  }
  return best?.el ?? null;
}

export const genericAdapter: SiteAdapter = {
  id: 'generic',
  matches: () => true,
  extract(doc, url): ExtractedJobDescription | null {
    const ld = readJsonLd(doc);

    let title = '';
    let company: string | null = null;
    let description = '';

    if (ld) {
      title = ld.title ?? '';
      const org = ld.hiringOrganization;
      company = typeof org === 'string' ? org : (org?.name ?? null);
      description = ld.description ? descriptionToText(ld.description) : '';
    }

    if (!title) {
      title = pickText(doc, ['h1', 'meta[property="og:title"]', 'title']);
      if (!title) {
        const og = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]');
        title = og?.content ?? '';
      }
    }

    if (!description) {
      const block = densestBlock(doc);
      description = textOf(block);
    }

    const cleaned = cleanJobText(description);
    if (cleaned.length < 80) return null;

    return {
      source: 'generic',
      url,
      title: cleanLabel(title) ?? 'Untitled role',
      company: cleanLabel(company),
      location: null,
      compensation: null,
      description: cleaned,
      extractedAt: new Date().toISOString(),
      debug: { strategy: ld ? 'jsonld' : 'densest', length: cleaned.length },
    };
  },
};
