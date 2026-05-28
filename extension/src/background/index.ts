/**
 * Service-worker entry. Manifest V3 workers are short-lived — keep startup
 * cheap and rely on `chrome.storage` / messages for state, not module globals.
 */
import { getSettings } from '@/storage';
import type { AppMessage, MessageResult } from '@/types/messages';
import { createLogger } from '@/utils/logger';
import { dispatch } from './messageHandler';

const log = createLogger('bg');

chrome.runtime.onInstalled.addListener(async (details) => {
  log.info('onInstalled', details.reason);
  // Seed defaults so the popup never sees `undefined` settings.
  await getSettings();
});

chrome.runtime.onMessage.addListener(
  (
    message: AppMessage,
    _sender,
    sendResponse: (response: MessageResult<AppMessage['type']>) => void,
  ): boolean => {
    // Only handle BG_* messages here. CS_* messages travel popup → tab directly.
    if (!message || typeof message !== 'object' || !('type' in message)) {
      sendResponse({
        ok: false,
        error: { code: 'UNKNOWN', message: 'Malformed message' },
      } as MessageResult<AppMessage['type']>);
      return false;
    }
    if (!message.type.startsWith('BG_')) {
      // Let the dedicated content-script listener handle it on the tab side.
      return false;
    }

    // Promise-based async response — must return true to keep the channel open.
    dispatch(message)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: {
            code: 'UNKNOWN',
            message: err instanceof Error ? err.message : 'Background dispatch failed',
          },
        } as MessageResult<AppMessage['type']>),
      );
    return true;
  },
);

log.info('background service worker ready');
