import axios from 'axios';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { JobSearchRequestSchema } from '../schemas/jobSearch.schema.js';
import { saveToSheet, searchJobs } from '../services/jobSearch.js';

export { JobSearchRequestSchema };

/** Build the editable-sheet URL when the sheet id is configured. */
function sheetUrl(): string | null {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id || id.startsWith('replace-') || id === 'your-sheet-id') return null;
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/**
 * Translate the failures that bubble up from the Google Custom Search / Sheets
 * stack into HttpErrors carrying a message the popup can show verbatim. The
 * default error handler would otherwise collapse an axios 403 into a generic
 * 500 ("Request failed with status code 403"), hiding Google's real reason.
 */
function normalizeJobSearchError(err: unknown): unknown {
  if (axios.isAxiosError(err) && err.response) {
    const status = err.response.status;
    const data = err.response.data as { error?: { message?: string } } | undefined;
    const apiMessage = data?.error?.message ?? err.message;
    if (status === 403) {
      return new HttpError(
        502,
        'JOB_SEARCH_API_DISABLED',
        `Google Custom Search rejected the request (403): ${apiMessage}`,
        data,
      );
    }
    return new HttpError(
      502,
      'JOB_SEARCH_API_ERROR',
      `Google Custom Search error ${status}: ${apiMessage}`,
      data,
    );
  }
  // requireEnv() in the service throws this when a GOOGLE_* var is unset.
  if (err instanceof Error && err.message.startsWith('Missing env var')) {
    return new HttpError(500, 'JOB_SEARCH_NOT_CONFIGURED', err.message);
  }
  return err;
}

export const runJobSearch: RequestHandler = async (req, res, next) => {
  try {
    const { query, max } = req.body as z.infer<typeof JobSearchRequestSchema>;
    const jobs = await searchJobs(query, max ?? 30);
    const saved = jobs.length > 0 ? await saveToSheet(jobs) : 0;
    res.json({ jobs, saved, sheetUrl: sheetUrl() });
  } catch (err) {
    next(normalizeJobSearchError(err));
  }
};
