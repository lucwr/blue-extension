import { z } from 'zod';

/**
 * Request body for `POST /api/job-search`.
 *
 * `query` is a raw Google Custom Search query string — it may carry the usual
 * operators (`site:`, `intitle:`, quotes, `OR`, …). `max` caps how many
 * results we page for (Google returns 10 per request, ~100 max), each page
 * costing one unit of the 100-queries/day free quota.
 */
export const JobSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(300),
  max: z.number().int().min(1).max(100).optional(),
});

export type JobSearchRequest = z.infer<typeof JobSearchRequestSchema>;
