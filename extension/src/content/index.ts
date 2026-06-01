/**
 * Content script entry point.
 *
 * Handles four CS_* messages from the popup:
 *   - CS_EXTRACT_JD     — read the active page's job description + detect cover-letter field
 *   - CS_AUTOFILL_BID   — fill known categories, return unmatched questions for LLM Q&A
 *   - CS_FILL_ANSWERS   — write the LLM-generated answers back into the page
 *   - CS_FILL_UNMATCHED — write user-picked values back into the previously unmatched fields
 *
 * Stays passive otherwise — never mutates the page until an explicit request
 * arrives, never shows UI.
 */
import type {
  AppMessage,
  AutofillBidMessage,
  ExtractJdMessage,
  FillAnswersMessage,
  FillUnmatchedMessage,
  MessageResult,
} from '@/types/messages';
import { createLogger } from '@/utils/logger';
import { autofillBidForm, fillAnswers, fillUnmatched } from './autofill';
import { extractJobDescription } from './extractor';

const log = createLogger('content');

log.debug('content script loaded', { url: location.href });

function handleExtract(
  msg: ExtractJdMessage,
  sendResponse: (r: MessageResult<'CS_EXTRACT_JD'>) => void,
): void {
  try {
    const url = msg.payload.url || location.href;
    const result = extractJobDescription(document, url);
    if (result.ok) sendResponse({ ok: true, data: result.jd });
    else sendResponse({ ok: false, error: result.error });
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
}

async function handleAutofill(
  msg: AutofillBidMessage,
  sendResponse: (r: MessageResult<'CS_AUTOFILL_BID'>) => void,
): Promise<void> {
  try {
    const report = await autofillBidForm(msg.payload.data);
    log.info('autofill pass 1 complete', {
      filled: report.filled.length,
      totalFields: report.totalFields,
      unmatched: report.unmatchedFields.length,
      pendingQuestions: report.pendingQuestions.length,
    });
    sendResponse({ ok: true, data: report });
  } catch (err) {
    log.error('autofill threw', err);
    sendResponse({
      ok: false,
      error: {
        code: 'AUTOFILL_FAILED',
        message: err instanceof Error ? err.message : 'Autofill failed',
      },
    });
  }
}

function handleFillAnswers(
  msg: FillAnswersMessage,
  sendResponse: (r: MessageResult<'CS_FILL_ANSWERS'>) => void,
): void {
  try {
    const filled = fillAnswers(msg.payload.answers);
    log.info('autofill pass 2 complete', { answersWritten: filled });
    sendResponse({ ok: true, data: { filled } });
  } catch (err) {
    log.error('fill-answers threw', err);
    sendResponse({
      ok: false,
      error: {
        code: 'AUTOFILL_FAILED',
        message: err instanceof Error ? err.message : 'Filling answers failed',
      },
    });
  }
}

async function handleFillUnmatched(
  msg: FillUnmatchedMessage,
  sendResponse: (r: MessageResult<'CS_FILL_UNMATCHED'>) => void,
): Promise<void> {
  try {
    const result = await fillUnmatched(msg.payload.picks);
    log.info('autofill pass 3 complete', { picksWritten: result.filled });
    sendResponse({ ok: true, data: result });
  } catch (err) {
    log.error('fill-unmatched threw', err);
    sendResponse({
      ok: false,
      error: {
        code: 'AUTOFILL_FAILED',
        message: err instanceof Error ? err.message : 'Filling unmatched failed',
      },
    });
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: AppMessage,
    _sender,
    sendResponse: (
      response: MessageResult<
        'CS_EXTRACT_JD' | 'CS_AUTOFILL_BID' | 'CS_FILL_ANSWERS' | 'CS_FILL_UNMATCHED'
      >,
    ) => void,
  ): boolean => {
    if (message.type === 'CS_EXTRACT_JD') {
      handleExtract(message, sendResponse as (r: MessageResult<'CS_EXTRACT_JD'>) => void);
      return false;
    }
    if (message.type === 'CS_AUTOFILL_BID') {
      // Async — react-select pass awaits menu animations. Return true to
      // keep the message channel open until sendResponse fires.
      void handleAutofill(message, sendResponse as (r: MessageResult<'CS_AUTOFILL_BID'>) => void);
      return true;
    }
    if (message.type === 'CS_FILL_ANSWERS') {
      handleFillAnswers(message, sendResponse as (r: MessageResult<'CS_FILL_ANSWERS'>) => void);
      return false;
    }
    if (message.type === 'CS_FILL_UNMATCHED') {
      // Async — the react-select branch awaits menu animations. Return true
      // to keep the message channel open until sendResponse fires.
      void handleFillUnmatched(
        message,
        sendResponse as (r: MessageResult<'CS_FILL_UNMATCHED'>) => void,
      );
      return true;
    }
    return false;
  },
);
