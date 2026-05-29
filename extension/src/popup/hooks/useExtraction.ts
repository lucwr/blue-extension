import { sendToTab } from '@/services/messaging';
import type { AppError } from '@/types/messages';
import { useCallback } from 'react';
import { usePopupStore } from '../store';

/**
 * Runs the full Phase-1 extraction flow:
 *   1. Resolve the active tab.
 *   2. Ask the content script to extract a JD.
 *   3. Push the result into the popup store.
 */
export function useExtraction(): () => Promise<void> {
  const { setStep, setJd, setError, setResume, setProposal } = usePopupStore();

  return useCallback(async () => {
    setStep('extracting');
    setError(null);
    setJd(null);
    setResume(null);
    setProposal(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) {
        const error: AppError = {
          code: 'EXTRACTION_FAILED',
          message: 'No active tab. Open a job posting and try again.',
        };
        setError(error);
        setStep('idle');
        return;
      }

      const result = await sendToTab(tab.id, {
        type: 'CS_EXTRACT_JD',
        payload: { url: tab.url },
      });

      if (!result.ok) {
        setError(result.error);
      } else {
        setJd(result.data);
      }
    } catch (err) {
      setError({
        code: 'EXTRACTION_FAILED',
        message: err instanceof Error ? err.message : 'Extraction failed',
      });
    } finally {
      setStep('idle');
    }
  }, [setStep, setJd, setError, setResume, setProposal]);
}
