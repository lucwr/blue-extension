/**
 * Strongly-typed wrappers around `chrome.runtime.sendMessage` and
 * `chrome.tabs.sendMessage`. Resolves the right response shape based on the
 * message `type` discriminant — no `any` at call sites.
 *
 * Multi-frame strategy
 * --------------------
 * Many job sites — Greenhouse, Lever, Workable, anything that "embeds" a
 * standard board — render their application form inside a cross-origin
 * iframe. `chrome.tabs.sendMessage(tabId, msg)` only delivers to the top
 * frame by default, so we'd never reach the form's inputs / selects /
 * textareas.
 *
 * `sendToTab` therefore fans the message out to EVERY frame in the tab
 * (via `chrome.scripting.executeScript({allFrames: true})` to enumerate
 * frame IDs without needing the `webNavigation` permission), then merges
 * the replies into a single result per message type:
 *
 *   - `CS_EXTRACT_JD`   → pick the frame returning the longest JD body
 *   - `CS_AUTOFILL_BID` → sum counts, concat filled, tag each pending
 *                         question with its originating `frameId`
 *   - `CS_FILL_ANSWERS` → sum filled counts
 *   - other CS_*        → first ok wins
 *
 * Callers that already know which frame they want (e.g. the answers-
 * second-pass routes per-frame) can pass `{frameId}` to bypass fan-out.
 *
 * `sendToTab` is resilient to the classic MV3 quirk where the content script
 * isn't loaded on tabs that existed before the extension was installed/
 * reloaded — on "Receiving end does not exist" it falls back to
 * `chrome.scripting` (authed via `activeTab` when the user clicks the
 * popup), injects the content script on demand into all frames, and retries.
 */
import type {
  AppMessage,
  AutofillReport,
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
 * extension was loaded, etc.). Defaults to `allFrames: true` so embedded
 * application forms in iframes (Greenhouse, Lever, etc.) get the script too.
 */
async function injectContentScript(
  tabId: number,
  options: { allFrames?: boolean; frameIds?: number[] } = {},
): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = (manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? []);
  if (files.length === 0) {
    throw new Error('No content_scripts.js entries found in manifest');
  }
  const target: chrome.scripting.InjectionTarget =
    options.frameIds && options.frameIds.length > 0
      ? { tabId, frameIds: options.frameIds }
      : { tabId, allFrames: options.allFrames ?? true };
  await chrome.scripting.executeScript({ target, files });
}

/**
 * Enumerate every frame ID in the given tab. Uses
 * `chrome.scripting.executeScript({allFrames: true})` with a tiny probe so
 * we don't need the heavyweight `webNavigation` permission. Doubles as a
 * sanity check that scripts are runnable in those frames.
 */
async function enumerateFrameIds(tabId: number): Promise<number[]> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => location.href,
    });
    const ids = results
      .map((r) => r.frameId)
      .filter((v): v is number => typeof v === 'number');
    // Top frame is always id 0 — make sure it's present.
    if (!ids.includes(0)) ids.unshift(0);
    return ids;
  } catch (err) {
    log.warn('enumerateFrameIds failed, falling back to top-only', err);
    return [0];
  }
}

interface FrameReply<T> {
  frameId: number;
  result: MessageResult<T extends MessageType ? T : never> | null;
}

async function sendOnce<M extends AppMessage>(
  tabId: number,
  message: M,
  frameId: number,
): Promise<MessageResult<M['type']> | null> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, message, { frameId })) as MessageResult<
      M['type']
    >;
    return r ?? null;
  } catch (err) {
    if (isMissingReceiverError(err)) return null;
    throw err;
  }
}

/**
 * Merge per-frame replies into one. The shape of the merged value depends on
 * the message type — we keep the routing logic here so callers see one
 * canonical reply.
 */
function aggregateReplies<M extends AppMessage>(
  type: M['type'],
  replies: Array<FrameReply<M['type']>>,
): MessageResult<M['type']> {
  const ok = replies.filter((r) => r.result?.ok);

  if (type === 'CS_EXTRACT_JD') {
    // Pick the frame whose JD body is longest — the iframe almost always
    // beats the wrapper page on bid embeds.
    const okJds = ok
      .map((r) => ({ frameId: r.frameId, data: (r.result as MessageResult<'CS_EXTRACT_JD'> & { ok: true }).data }))
      .filter((r) => (r.data.description ?? '').length > 0);
    if (okJds.length > 0) {
      const best = okJds.reduce((a, b) =>
        (b.data.description?.length ?? 0) > (a.data.description?.length ?? 0) ? b : a,
      );
      return { ok: true, data: best.data } as MessageResult<M['type']>;
    }
    // No frame returned a JD — surface the first error from any frame.
    const firstErr = replies.find((r) => r.result && !r.result.ok);
    if (firstErr?.result) return firstErr.result as MessageResult<M['type']>;
    return {
      ok: false,
      error: {
        code: 'NO_JD_FOUND',
        message:
          'No job description detected on this page (top frame or any iframe). Open a real job posting and try again.',
      },
    } as MessageResult<M['type']>;
  }

  if (type === 'CS_AUTOFILL_BID') {
    const merged: AutofillReport = {
      filled: [],
      totalFields: 0,
      unmatched: 0,
      pendingQuestions: [],
      ranAt: new Date().toISOString(),
    };
    let anyOk = false;
    for (const r of ok) {
      anyOk = true;
      const report = (r.result as MessageResult<'CS_AUTOFILL_BID'> & { ok: true }).data;
      merged.totalFields += report.totalFields;
      merged.unmatched += report.unmatched;
      merged.filled.push(...report.filled);
      for (const q of report.pendingQuestions) {
        // Tag every question with the frame it came from so the second
        // pass can route the LLM-generated answer back without writing
        // into a sibling iframe's form.
        merged.pendingQuestions.push({ ...q, frameId: r.frameId });
      }
    }
    if (anyOk) return { ok: true, data: merged } as MessageResult<M['type']>;
    const firstErr = replies.find((r) => r.result && !r.result.ok);
    if (firstErr?.result) return firstErr.result as MessageResult<M['type']>;
    return {
      ok: false,
      error: {
        code: 'AUTOFILL_FAILED',
        message: 'No frame in this tab responded to the autofill request.',
      },
    } as MessageResult<M['type']>;
  }

  if (type === 'CS_FILL_ANSWERS') {
    let total = 0;
    for (const r of ok) {
      const data = (r.result as MessageResult<'CS_FILL_ANSWERS'> & { ok: true }).data;
      total += data.filled;
    }
    return { ok: true, data: { filled: total } } as MessageResult<M['type']>;
  }

  // Fallback for any other CS_* — first ok, else first error.
  const firstOk = replies.find((r) => r.result?.ok);
  if (firstOk?.result) return firstOk.result as MessageResult<M['type']>;
  const firstErr = replies.find((r) => r.result && !r.result.ok);
  if (firstErr?.result) return firstErr.result as MessageResult<M['type']>;
  return {
    ok: false,
    error: { code: 'UNKNOWN', message: 'No frame responded.' },
  } as MessageResult<M['type']>;
}

/**
 * Background / popup → content script in a tab.
 *
 * Default: fans out to every frame and aggregates. Pass `{frameId}` to
 * target one frame only (used by the answers second-pass, which already
 * knows the frame each answer came from).
 */
export async function sendToTab<M extends AppMessage>(
  tabId: number,
  message: M,
  options: { frameId?: number } = {},
): Promise<MessageResult<M['type']>> {
  const stamped = { ...message, requestId: message.requestId ?? newRequestId() };

  // Verify the tab is one we can talk to before doing work.
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

  // ----- Single-frame mode -----
  if (options.frameId !== undefined) {
    try {
      let r = await sendOnce(tabId, stamped, options.frameId);
      if (r) return r;
      // Inject just this frame and retry.
      await injectContentScript(tabId, { frameIds: [options.frameId] }).catch(() => undefined);
      r = await sendOnce(tabId, stamped, options.frameId);
      if (r) return r;
      return {
        ok: false,
        error: {
          code: 'EXTRACTION_FAILED',
          message: `Content script did not respond in frame ${options.frameId}.`,
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

  // ----- Fan-out mode (default) -----
  try {
    let frameIds = await enumerateFrameIds(tabId);
    let replies = await Promise.all(
      frameIds.map(async (fid) => ({
        frameId: fid,
        result: await sendOnce<M>(tabId, stamped, fid).catch(() => null),
      })),
    );

    // If NOTHING came back from any frame, fall back to a force-inject and
    // retry once — typical when the tab existed before the extension was
    // (re)loaded.
    if (replies.every((r) => r.result === null)) {
      log.info('no frames responded — force-injecting all frames', { tabId, url: tab.url });
      try {
        await injectContentScript(tabId, { allFrames: true });
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
      // Re-enumerate in case the injection revealed new frames.
      frameIds = await enumerateFrameIds(tabId);
      replies = await Promise.all(
        frameIds.map(async (fid) => ({
          frameId: fid,
          result: await sendOnce<M>(tabId, stamped, fid).catch(() => null),
        })),
      );
    }

    log.debug('fan-out replies', {
      type: message.type,
      frames: replies.map((r) => ({ frameId: r.frameId, ok: r.result?.ok ?? null })),
    });

    return aggregateReplies<M>(message.type, replies as Array<FrameReply<M['type']>>);
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
