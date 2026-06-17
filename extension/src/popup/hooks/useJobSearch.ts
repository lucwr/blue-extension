import { sendToBackground } from '@/services/messaging';
import type { MessageResult } from '@/types/messages';
import { useCallback } from 'react';

/**
 * Runs a Google Custom Search job query through the background worker, which
 * proxies it to the backend (`POST /api/job-search`) — the same path every
 * other backend call takes, so no API keys ever live in the extension.
 *
 * Returns the raw `MessageResult` so the calling view owns its own loading /
 * results / error state (the job-search tab is independent of the resume
 * flow's zustand store, which drives the bottom StatusBar).
 */
export function useJobSearch(): (
  query: string,
  max?: number,
) => Promise<MessageResult<'BG_JOB_SEARCH'>> {
  return useCallback(
    (query: string, max?: number) =>
      sendToBackground({
        type: 'BG_JOB_SEARCH',
        payload: { query, ...(max ? { max } : {}) },
      }),
    [],
  );
}
