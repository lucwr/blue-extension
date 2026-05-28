import type { ExtractedJobDescription, JobSource } from '@/types/jd';

/**
 * Contract every site adapter implements. The extractor in
 * `content/extractor.ts` runs the adapter chain (site-specific → generic)
 * and returns the first non-empty result.
 */
export interface SiteAdapter {
  readonly id: JobSource;
  /** Cheap predicate — typically just a hostname/path check. */
  matches(url: string): boolean;
  /** Pull a JD out of the current DOM. Returns null when the page isn't a JD view. */
  extract(doc: Document, url: string): ExtractedJobDescription | null;
}

/** Helper used inside adapters to read text content safely. */
export function textOf(node: Element | null | undefined): string {
  if (!node) return '';
  return (node.textContent ?? '').trim();
}

/** First matching selector that yields non-empty text. */
export function pickText(doc: Document | Element, selectors: string[]): string {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const t = textOf(el);
    if (t) return t;
  }
  return '';
}

/** First matching selector that yields the element itself. */
export function pickElement(doc: Document | Element, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  return null;
}
