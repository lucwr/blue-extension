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
 *   2. If there are pending questions AND we have a JD + resume to ground
 *      the model, ask the backend LLM to answer them (in one batched call).
 *      When JD or resume is missing, the LLM stage is SKIPPED and the
 *      pending questions stay in the report for the user to answer
 *      manually — the static profile-driven fills still happen.
 *   3. Send the answers back to the content script to write them into the
 *      page.
 *
 * The flow can run as soon as the master profile exists. JD, resume, and
 * proposal are all OPTIONAL upgrades:
 *   - JD missing       → no source-of-truth for LLM Q&A; that stage skipped.
 *   - resume missing   → falls back to profile.summary + profile.experience
 *                        title for `targetTitle`/`summary`; no resume PDF
 *                        upload; LLM Q&A stage skipped.
 *   - proposal missing → no cover-letter PDF upload; cover-letter text
 *                        category fills from `summary` (existing behavior).
 *
 * Exposes `onPickUnmatched` alongside the trigger so the BidPanel can offer
 * manual one-click picks for the fields the engine flagged as unmatched.
 */
export function useAutofillBid(): UseAutofillBid {
  const { jd, resume, proposal, setBidReport, setError, setStep } = usePopupStore();

  const autofill = useCallback(async () => {
    // Master profile is the ONLY hard requirement — every static field
    // (contact, demographics, EEO, bid preferences, current company/title)
    // comes from it. Resume / proposal / JD are optional upgrades.
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

    // Render PDFs only when the corresponding artifacts exist. Render
    // failures don't block the rest of the autofill flow; we just skip the
    // file-upload pass and let the user drop the file manually if needed.
    let resumePdf: { filename: string; base64: string } | undefined;
    let coverLetterPdf: { filename: string; base64: string } | undefined;
    if (resume) {
      try {
        resumePdf = renderResumePdfBase64(resume);
      } catch (err) {
        log.warn('failed to render resume PDF for autofill upload', err);
      }
    }
    if (resume && proposal) {
      try {
        coverLetterPdf = renderCoverLetterPdfBase64(proposal, resume);
      } catch (err) {
        log.warn('failed to render cover-letter PDF for autofill upload', err);
      }
    }

    // Most recent role (index 0 in the canonical newest-first ordering)
    // drives both `current-company` / `current-title` autofill AND the
    // fallback `targetTitle` when no resume exists yet.
    const mostRecentRole = profile.experience[0] ?? resume?.experience[0] ?? null;

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
      // Title/summary fall back through: tailored resume → JD title →
      // profile's most-recent role title / profile summary. Empty string
      // is a valid no-fill signal for the engine (it just won't write
      // those categories).
      targetTitle: resume?.targetTitle ?? jd?.title ?? mostRecentRole?.title ?? '',
      summary: resume?.summary ?? profile.summary ?? '',
      yearsOfExperience: computeYearsOfExperience(profile.experience),
      ...(resumePdf ? { resumePdf } : {}),
      ...(coverLetterPdf ? { coverLetterPdf } : {}),
      ...(mostRecentRole
        ? {
            ...(mostRecentRole.company ? { currentCompany: mostRecentRole.company } : {}),
            ...(mostRecentRole.title ? { currentTitle: mostRecentRole.title } : {}),
          }
        : {}),
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
      //
      // The Q&A endpoint needs JD + tailored resume as grounding context
      // (see backend `answer-questions` prompt). When either is absent we
      // SKIP this stage entirely — the pending questions remain in the
      // report so the user can answer them manually, and the static
      // profile-driven fills are still committed below.
      if (report.pendingQuestions.length > 0 && jd && resume) {
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
