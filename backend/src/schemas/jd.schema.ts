import { z } from 'zod';

export const SourceSchema = z.enum([
  'upwork',
  'linkedin',
  'indeed',
  'freelancer',
  'remoteok',
  'wellfound',
  'generic',
]);

export const ExtractedJdSchema = z.object({
  source: SourceSchema,
  url: z.string().url(),
  title: z.string().min(1).max(500),
  company: z.string().max(500).nullable(),
  location: z.string().max(500).nullable(),
  compensation: z.string().max(500).nullable(),
  description: z.string().min(60).max(40_000),
  extractedAt: z.string().min(1),
  /** Set by the content script — flags whether the bid page has a cover-letter field. */
  hasCoverLetterField: z.boolean().optional().default(false),
  debug: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type ExtractedJd = z.infer<typeof ExtractedJdSchema>;
