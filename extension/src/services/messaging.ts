/**
 * Strongly-typed wrappers around `chrome.runtime.sendMessage` and
 * `chrome.tabs.sendMessage`. Resolves the right response shape based on the
 * message `type` discriminant — no `any` at call sites.
 *
 * `sendToTab` is resilient to the classic MV3 quirk where the content script
 * isn't loaded on tabs that existed before the extension was installed/reloaded.
 * On "Receiving end does not exist", it falls back to `chrome.scripting`
 * (auth'd via `activeTab` when the user clicks the popup), injects the
 * content script on demand, and retries the message once.
 */
import type {
  AppMessage,
  MessageResponseMap,
  MessageResult,
  MessageType,
} from '@/types/messages';
import { createLogger } from '@/utils/logger';

const log = createLogger('messaging');

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

const MISSING_RECEIVER_PATTERNS = [
  'Receiving end does not exist',
  'Could not establish connection',
  'message port closed before a response',
];

function isMissingReceiverError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return MISSING_RECEIVER_PATTERNS.some((p) => message.includes(p));
}

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  // Chrome blocks content scripts and chrome.scripting on these schemes.
  return /^(chrome|chrome-extension|edge|brave|about|view-source|chrome-search|chrome-untrusted|devtools|file):/.test(
    url,
  );
}

/**
 * On-demand inject the content script into a tab. Used as a fallback when
 * the auto-registered content script isn't there (tab existed before the
 * extension was loaded, etc.).
 *
 * We read the manifest's `content_scripts[0].js` so we don't have to hard-code
 * the CRX/Vite-hashed bundle filename.
 */
async function injectContentScript(tabId: number): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = (manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? []);
  if (files.length === 0) {
    throw new Error('No content_scripts.js entries found in manifest');
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files,
  });
}

/** Background / popup → content script in a specific tab. Auto-injects on first miss. */
export async function sendToTab<M extends AppMessage>(
  tabId: number,
  message: M,
): Promise<MessageResult<M['type']>> {
  const stamped = { ...message, requestId: message.requestId ?? newRequestId() };

  const trySend = async (): Promise<MessageResult<M['type']> | null> => {
    try {
      const response = (await chrome.tabs.sendMessage(tabId, stamped)) as MessageResult<M['type']>;
      return response ?? null;
    } catch (err) {
      if (isMissingReceiverError(err)) return null;
      throw err;
    }
  };

  try {
    const first = await trySend();
    if (first) return first;

    // First attempt missed (no receiver). Verify the tab can accept scripts.
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: 'Could not read the active tab.',
          details: err instanceof Error ? err.message : err,
        },
      };
    }

    if (isRestrictedUrl(tab.url)) {
      return {
        ok: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message:
            'This page does not allow extensions to attach (Chrome internal page, new tab, or file:// URL). Open a regular job posting URL and try again.',
        },
      };
    }

    log.info('content script missing, injecting on demand', { tabId, url: tab.url });
    try {
      await injectContentScript(tabId);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message:
            'Could not inject the extractor into this page. Refresh the tab and try again.',
          details: err instanceof Error ? err.message : err,
        },
      };
    }

    const second = await trySend();
    if (second) return second;

    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: 'Content script did not respond after injection. Refresh the tab and try again.',
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: err instanceof Error ? err.message : 'sendToTab failed',
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
