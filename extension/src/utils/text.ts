/**
 * DOM-text normalization helpers. Site adapters call into these to produce a
 * single canonical "clean string" before handing the JD to the AI.
 *
 * Goals:
 *  - collapse runs of whitespace
 *  - strip zero-width / private-use characters that throw off tokenization
 *  - flatten Windows-style line endings
 *  - remove obvious duplicate paragraphs that bad sites inject for SEO
 */

/** Whitespace + control chars normalization. */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿]/g, '') // zero-width
    .replace(/\t/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Removes consecutive duplicate paragraphs (case-insensitive). */
export function dedupeParagraphs(input: string): string {
  const paragraphs = input.split(/\n{2,}/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paragraphs) {
    const key = p.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.trim());
  }
  return out.join('\n\n');
}

/**
 * One-call pipeline used by every adapter. Anything more aggressive should
 * live in an adapter-specific cleanup step.
 */
export function cleanJobText(raw: string): string {
  return dedupeParagraphs(normalizeWhitespace(raw));
}

/** Tightens a single-line label like "Posted 3 days ago • Full-time". */
export function cleanLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = normalizeWhitespace(raw).replace(/[•·|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Truncate without splitting words mid-token, used in popup previews. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const slice = input.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
