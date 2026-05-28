/**
 * Content script entry point. Listens for `CS_EXTRACT_JD` requests from the
 * background worker / popup and runs the adapter chain against the live DOM.
 *
 * Stays *passive* — never mutates the page or shows UI. The popup owns UI.
 */
import type { AppMessage, ExtractJdMessage, MessageResult } from '@/types/messages';
import { createLogger } from '@/utils/logger';
import { extractJobDescription } from './extractor';

const log = createLogger('content');

log.debug('content script loaded', { url: location.href });

chrome.runtime.onMessage.addListener(
  (
    message: AppMessage,
    _sender,
    sendResponse: (response: MessageResult<'CS_EXTRACT_JD'>) => void,
  ): boolean => {
    if (message.type !== 'CS_EXTRACT_JD') return false;

    const msg = message as ExtractJdMessage;
    try {
      const url = msg.payload.url || location.href;
      const result = extractJobDescription(document, url);
      if (result.ok) {
        sendResponse({ ok: true, data: result.jd });
      } else {
        sendResponse({ ok: false, error: result.error });
      }
    } catch (err) {
      log.error('extraction threw', err);
      sendResponse({
        ok: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: err instanceof Error ? err.message : 'Unknown extraction failure',
        },
      });
    }
    // Synchronous response — return false to close the channel.
    return false;
  },
);
