import { useCallback } from 'react';
import { sendToBackground, sendToTab } from '@/services/messaging';
import { renderCoverLetterPdfBase64, renderResumePdfBase64 } from '@/services/pdf.service';
import { getMasterProfile } from '@/storage';
import type { AutofillReport, AutofillUnmatchedField, BidPayload } from '@/types/messages';
import type { MasterProfile } from '@/types/resume';
import { createLogger } from '@/utils/logger';
import { usePopupStore } from '../store';

const log = createLogger('popup:autofill-bid');

/**
 * Parse a year from a date string like "2022", "04/2024", "Jan 2024".
 * Returns null when no 4-digit year is present.
 */
function parseYear(s: string): number | null {
  const m = s.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/**
 * Approximate total years between the candidate's earliest startDate and
 * latest endDate ("Present"/"Current" counts as the current year). Returns
 * 0 if dates are unparseable.
 */
function computeYearsOfExperience(experience: MasterProfile['experience']): number {
  let earliestStart = Number.POSITIVE_INFINITY;
  let latestEnd = Number.NEGATIVE_INFINITY;
  const now = new Date().getFullYear();
  for (const role of experience) {
    const start = parseYear(role.startDate);
    if (start !== null && start < earliestStart) earliestStart = start;
    if (/present|current/i.test(role.endDate)) {
      if (now > latestEnd) latestEnd = now;
    } else {
      const end = parseYear(role.endDate);
      if (end !== null && end > latestEnd) latestEnd = end;
    }
  }
  if (!Number.isFinite(earliestStart) || !Number.isFinite(latestEnd)) return 0;
  return Math.max(0, latestEnd - earliestStart);
}

interface UseAutofillBid {
  /** Run the autofill orchestration. */
  autofill: () => Promise<void>;
  /**
   * Apply a user-chosen value to one of the unmatched fields surfaced by
   * the autofill report. Routes per-frame using `u.frameId` (mirroring the
   * CS_FILL_ANSWERS fan-out), then optimistically mutates the bidReport in
   * the popup store: the field moves from `unmatchedFields` to `filled`
   * with category `manual-pick`.
   */
  onPickUnmatched: (u: AutofillUnmatchedField, value: string) => Promise<void>;
}

/**
 * Trigger autofill on the current tab. Three-stage orchestration:
 *   1. Send a bid payload to the content script. The page is scanned, known
 *      fields are filled, and any free-text questions we can't classify come
 *      back as `pendingQuestions`.
 *   2. If there are pending questions, ask the backend LLM to answer them
 *      (in one batched call, grounded in jd + resume + profile).
 *   3. Send the answers back to the content script to write them into the
 *      page.
 *
 * The proposal step is optional. When the page has no cover-letter field
 * (detected during extraction), the user can bid without generating a
 * proposal at all — the autofill engine skips that category.
 *
 * Exposes `onPickUnmatched` alongside the trigger so the BidPanel can offer
 * manual one-click picks for the fields the engine flagged as unmatched.
 */
export function useAutofillBid(): UseAutofillBid {
  const { jd, resume, proposal, setBidReport, setError, setStep } = usePopupStore();

  const autofill = useCallback(async () => {
    if (!jd) {
      setError({
        code: 'UNKNOWN',
        message: 'Extract the job description first.',
      });
      return;
    }
    if (!resume) {
      setError({
        code: 'UNKNOWN',
        message: 'Generate the resume first — the bid needs your tailored summary and title.',
      });
      return;
    }
    // Proposal is only required when the page actually has a cover-letter
    // field. Otherwise we let the bid proceed without one.
    const needsProposal = jd.hasCoverLetterField !== false;
    if (needsProposal && !proposal) {
      setError({
        code: 'UNKNOWN',
        message: 'This bid page has a cover-letter field. Generate the proposal first.',
      });
      return;
    }
    const profile = await getMasterProfile();
    if (!profile) {
      setError({
        code: 'UNKNOWN',
        message:
          'Open the Profile tab and save your master profile first — the bid uses your contact info.',
      });
      return;
    }

    setStep('auto-filling');
    setError(null);

    // Render the resume PDF (and, when we have a proposal, the cover letter
    // PDF) BEFORE handing off to the content script — the autofill engine
    // will programmatically upload them into any matching file-input field
    // it finds. Render failures don't block the rest of the autofill flow:
    // we just skip the file-upload pass and let the user drop the file
    // manually if needed.
    let resumePdf: { filename: string; base64: string } | undefined;
    let coverLetterPdf: { filename: string; base64: string } | undefined;
    try {
      resumePdf = renderResumePdfBase64(resume);
    } catch (err) {
      log.warn('failed to render resume PDF for autofill upload', err);
    }
    if (proposal) {
      try {
        coverLetterPdf = renderCoverLetterPdfBase64(proposal, resume);
      } catch (err) {
        log.warn('failed to render cover-letter PDF for autofill upload', err);
      }
    }

    const data: BidPayload = {
      contact: {
        fullName: profile.contact.fullName,
        email: profile.contact.email,
        ...(profile.contact.phone ? { phone: profile.contact.phone } : {}),
        ...(profile.contact.location ? { location: profile.contact.location } : {}),
        ...(profile.contact.linkedin ? { linkedin: profile.contact.linkedin } : {}),
        ...(profile.contact.github ? { github: profile.contact.github } : {}),
        ...(profile.contact.website ? { website: profile.contact.website } : {}),
      },
      targetTitle: resume.targetTitle,
      summary: resume.summary,
      yearsOfExperience: computeYearsOfExperience(profile.experience),
      ...(resumePdf ? { resumePdf } : {}),
      ...(coverLetterPdf ? { coverLetterPdf } : {}),
      // Most recent role lives at index 0 of the master profile's experience
      // array (the canonical newest-first ordering used everywhere else).
      // Falls back to the generated resume's experience if the master profile
      // has none — keeps "current company" working for users who imported a
      // resume but haven't manually filled the Profile tab.
      ...(() => {
        const recent =
          profile.experience[0] ?? resume.experience[0] ?? null;
        if (!recent) return {};
        return {
          ...(recent.company ? { currentCompany: recent.company } : {}),
          ...(recent.title ? { currentTitle: recent.title } : {}),
        };
      })(),
      ...(proposal
        ? {
            proposal: {
              ...(proposal.subject ? { subject: proposal.subject } : {}),
              opener: proposal.opener,
              body: proposal.body,
              highlights: proposal.highlights,
              closer: proposal.closer,
            },
          }
        : {}),
      ...(profile.demographics ? { demographics: profile.demographics } : {}),
      ...(profile.bidPreferences ? { bidPreferences: profile.bidPreferences } : {}),
    };

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setError({
          code: 'AUTOFILL_FAILED',
          message: 'No active tab. Open the bid page and try again.',
        });
        return;
      }
      const tabId = tab.id;

      // Stage 1 — scan + fill known fields.
      const fillResult = await sendToTab(tabId, {
        type: 'CS_AUTOFILL_BID',
        payload: { data },
      });
      if (!fillResult.ok) {
        setError(fillResult.error);
        return;
      }
      let report: AutofillReport = fillResult.data;

      // Stage 2 — LLM-answer any unclassified question-like fields, then
      // write them back. Best-effort: a Q&A failure should not throw away
      // the successful fills the user already sees.
      if (report.pendingQuestions.length > 0) {
        setStep('answering-questions');
        const answerResult = await sendToBackground({
          type: 'BG_ANSWER_QUESTIONS',
          payload: {
            questions: report.pendingQuestions,
            context: { jd, resume, masterProfile: profile },
          },
        });
        if (answerResult.ok && answerResult.data.answers.length > 0) {
          setStep('auto-filling');
          // Each answer needs to go back to the frame its question came
          // from — otherwise we'd write into a sibling iframe's textarea
          // by index collision. The aggregator tagged every pending
          // question with its originating frameId; mirror that onto the
          // answer and dispatch CS_FILL_ANSWERS per-frame in parallel.
          const fidByIndex = new Map<number, number>();
          for (const q of report.pendingQuestions) {
            if (typeof q.frameId === 'number') fidByIndex.set(q.fieldIndex, q.frameId);
          }
          const answersByFrame = new Map<number, typeof answerResult.data.answers>();
          for (const a of answerResult.data.answers) {
            const fid = fidByIndex.get(a.fieldIndex) ?? 0;
            const tagged = { ...a, frameId: fid };
            const bucket = answersByFrame.get(fid) ?? [];
            bucket.push(tagged);
            answersByFrame.set(fid, bucket);
          }

          const writeResults = await Promise.all(
            Array.from(answersByFrame.entries()).map(async ([fid, answers]) => {
              return sendToTab(
                tabId,
                {
                  type: 'CS_FILL_ANSWERS',
                  payload: { answers },
                },
                { frameId: fid },
              );
            }),
          );

          const allOk = writeResults.every((r) => r.ok);
          if (allOk) {
            // Reflect the answered questions in the report so the UI can
            // show them as filled rather than pending.
            const answeredIndices = new Set(
              answerResult.data.answers.map((a) => a.fieldIndex),
            );
            const previewFor = (idx: number): string => {
              const a = answerResult.data.answers.find((x) => x.fieldIndex === idx);
              return a ? a.answer.slice(0, 80) : '';
            };
            report = {
              ...report,
              filled: [
                ...report.filled,
                ...report.pendingQuestions
                  .filter((q) => answeredIndices.has(q.fieldIndex))
                  .map((q) => ({
                    category: 'llm-answer',
                    preview: previewFor(q.fieldIndex),
                    selectorHint: q.hint,
                  })),
              ],
              pendingQuestions: report.pendingQuestions.filter(
                (q) => !answeredIndices.has(q.fieldIndex),
              ),
            };
          }
        } else if (!answerResult.ok) {
          // Don't blow up the whole flow — leave pendingQuestions visible
          // so the user can answer them manually, and surface the error.
          setError(answerResult.error);
        }
      }

      setBidReport(report);
    } catch (err) {
      setError({
        code: 'AUTOFILL_FAILED',
        message: err instanceof Error ? err.message : 'Autofill failed',
      });
    } finally {
      setStep('idle');
    }
  }, [jd, resume, proposal, setBidReport, setError, setStep]);

  const onPickUnmatched = useCallback(
    async (u: AutofillUnmatchedField, value: string): Promise<void> => {
      if (!value) return;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          setError({
            code: 'AUTOFILL_FAILED',
            message: 'No active tab. Open the bid page and try again.',
          });
          return;
        }
        const tabId = tab.id;

        // Mirror the CS_FILL_ANSWERS routing: if the descriptor knows
        // which frame it came from, target that frame directly so we never
        // write into a sibling iframe's form. Without a frameId, fall back
        // to fan-out (sendToTab default).
        const result = await sendToTab(
          tabId,
          {
            type: 'CS_FILL_UNMATCHED',
            payload: { picks: [{ fieldKey: u.fieldKey, value }] },
          },
          typeof u.frameId === 'number' ? { frameId: u.frameId } : {},
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }

        // Optimistically reflect the manual pick in the popup store so the
        // UI updates without a re-run of the full autofill pass.
        const current = usePopupStore.getState().bidReport;
        if (!current) return;
        const matchKey = u.fieldKey;
        const matchFrame = u.frameId;
        const next: AutofillReport = {
          ...current,
          unmatchedFields: current.unmatchedFields.filter(
            (x) => !(x.fieldKey === matchKey && x.frameId === matchFrame),
          ),
          filled: [
            ...current.filled,
            {
              category: 'manual-pick',
              preview: value.length > 80 ? `${value.slice(0, 77)}…` : value,
              selectorHint: u.selectorHint ?? u.label.slice(0, 60),
            },
          ],
        };
        setBidReport(next);
      } catch (err) {
        setError({
          code: 'AUTOFILL_FAILED',
          message: err instanceof Error ? err.message : 'Manual pick failed',
        });
      }
    },
    [setBidReport, setError],
  );

  return { autofill, onPickUnmatched };
}
