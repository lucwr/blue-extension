import { useCallback } from 'react';
import { sendToBackground, sendToTab } from '@/services/messaging';
import { getMasterProfile } from '@/storage';
import type { AutofillReport, BidPayload } from '@/types/messages';
import type { MasterProfile } from '@/types/resume';
import { usePopupStore } from '../store';

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
 */
export function useAutofillBid(): () => Promise<void> {
  const { jd, resume, proposal, setBidReport, setError, setStep } = usePopupStore();

  return useCallback(async () => {
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
          const writeResult = await sendToTab(tabId, {
            type: 'CS_FILL_ANSWERS',
            payload: { answers: answerResult.data.answers },
          });
          if (writeResult.ok) {
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
}
