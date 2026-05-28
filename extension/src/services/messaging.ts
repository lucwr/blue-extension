/**
 * Strongly-typed wrappers around `chrome.runtime.sendMessage` and
 * `chrome.tabs.sendMessage`. Resolves the right response shape based on the
 * message `type` discriminant — no `any` at call sites.
 */
import type {
  AppMessage,
  MessageResponseMap,
  MessageResult,
  MessageType,
} from '@/types/messages';

function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Popup / background → background. Resolves with the typed response. */
export async function sendToBackground<M extends AppMessage>(
  message: M,
): Promise<MessageResult<M['type']>> {
  const stamped = { ...message, requestId: message.requestId ?? newRequestId() };
  try {
    const response = (await chrome.runtime.sendMessage(stamped)) as MessageResult<M['type']>;
    if (!response) {
      return {
        ok: false,
        error: { code: 'UNKNOWN', message: 'No response from background worker' },
      };
    }
    return response;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'sendToBackground failed',
      },
    };
  }
}

/** Background → content script in a specific tab. */
export async function sendToTab<M extends AppMessage>(
  tabId: number,
  message: M,
): Promise<MessageResult<M['type']>> {
  const stamped = { ...message, requestId: message.requestId ?? newRequestId() };
  try {
    const response = (await chrome.tabs.sendMessage(tabId, stamped)) as MessageResult<M['type']>;
    if (!response) {
      return {
        ok: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: 'Content script did not respond. The page may not be a job posting.',
        },
      };
    }
    return response;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message:
          'Could not reach the page. Refresh the tab so the extension can attach, or open a supported job site.',
        details: err instanceof Error ? err.message : err,
      },
    };
  }
}

/**
 * Convenience: returns the resolved `data` payload or throws — useful in
 * React hooks where you want to leverage error boundaries / try/catch.
 */
export async function unwrap<T extends MessageType>(
  result: MessageResult<T>,
): Promise<MessageResponseMap[T]> {
  if (result.ok) return result.data;
  const err = new Error(result.error.message) as Error & { code?: string; details?: unknown };
  err.code = result.error.code;
  err.details = result.error.details;
  throw err;
}
