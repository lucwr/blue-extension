/**
 * Bid (auto-fill) card. Wraps the EXISTING handlers from `useAutofillBid()`:
 *   - `onBid` invokes `autofill()` — same single-call signature as before.
 *   - `onPickUnmatched(u, value)` invokes the same hook returned callback.
 *
 * Detected-field list, pending LLM questions, and unmatched-pick chips all
 * render the same data shape (`AutofillReport`) the existing autofill
 * engine produces. No service/api/storage code is reached from here.
 */
import type { FC } from 'react';
import type { AutofillReport, AutofillUnmatchedField } from '@/types/messages';
import { ActionCard, PrimaryButton, type StatusTone } from './ui';

interface Props {
  canBid: boolean;
  bidReport: AutofillReport | null;
  disabled: boolean;
  busy: boolean;
  /** True when the LLM is composing answers for free-text questions. */
  answeringQuestions: boolean;
  /** Same handler as before — bound to `useAutofillBid().autofill`. */
  onBid: () => void;
  /** Same handler as before — bound to `useAutofillBid().onPickUnmatched`. */
  onPickUnmatched: (u: AutofillUnmatchedField, value: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  'full-name': 'Name',
  'first-name': 'First name',
  'last-name': 'Last name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  city: 'City',
  country: 'Country',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
  title: 'Job title',
  'current-company': 'Current company',
  'current-title': 'Current title',
  'years-experience': 'Years',
  subject: 'Subject',
  'cover-letter': 'Cover letter',
  summary: 'Summary',
  'work-authorized': 'Work auth',
  'requires-sponsorship': 'Sponsorship',
  gender: 'Gender',
  race: 'Race',
  'veteran-status': 'Veteran',
  'disability-status': 'Disability',
  transgender: 'Transgender',
  'hispanic-latino': 'Hispanic/Latino',
  lgbtq: 'LGBTQ',
  pronouns: 'Pronouns',
  'eeo-default': 'EEO',
  'resume-file': 'Resume PDF',
  'cover-letter-file': 'Cover letter PDF',
  'llm-answer': 'AI answer',
  'manual-pick': 'Manual',
};

const KIND_LABELS: Record<AutofillUnmatchedField['fieldKind'], string> = {
  select: 'Dropdown',
  'react-select': 'Dropdown',
  radio: 'Radio',
  checkbox: 'Checkboxes',
  'button-group': 'Buttons',
  input: 'Input',
  textarea: 'Long answer',
};

const MAX_UNMATCHED_VISIBLE = 6;
const MAX_CHIPS_VISIBLE = 8;

const BoltIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
  </svg>
);

const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M5 13l4 4L19 7" />
  </svg>
);

export const BidPanel: FC<Props> = ({
  canBid,
  bidReport,
  disabled,
  busy,
  answeringQuestions,
  onBid,
  onPickUnmatched,
}) => {
  const filled = bidReport?.filled ?? [];
  const pending = bidReport?.pendingQuestions ?? [];
  const unmatched = bidReport?.unmatchedFields ?? [];
  const unmatchedVisible = unmatched.slice(0, MAX_UNMATCHED_VISIBLE);
  const unmatchedOverflow = Math.max(0, unmatched.length - unmatchedVisible.length);

  const status: { tone: StatusTone; label: string } = busy
    ? { tone: 'busy', label: answeringQuestions ? 'Answering' : 'Filling' }
    : bidReport
      ? { tone: 'done', label: 'Completed' }
      : canBid
        ? { tone: 'ready', label: 'Ready' }
        : { tone: 'idle', label: 'Awaiting deps' };

  const preview = bidReport
    ? `${filled.length}/${bidReport.totalFields} fields filled${relativeTime(bidReport.ranAt) ? ` · ${relativeTime(bidReport.ranAt)}` : ''}`
    : canBid
      ? 'Open the bid page, then auto-fill.'
      : 'Resume (+ proposal if required) needed first.';

  return (
    <ActionCard
      accent
      icon={<BoltIcon className="h-4 w-4" />}
      title="Auto-Fill Application"
      status={status}
      preview={preview}
      actions={
        <PrimaryButton
          onClick={onBid}
          disabled={!canBid || disabled}
          loading={busy}
          leadingIcon={<BoltIcon className="h-3 w-3" />}
        >
          {bidReport ? 'Re-fill' : 'Auto-Fill Application'}
        </PrimaryButton>
      }
      footer={
        bidReport ? (
          <div className="rounded-xl border border-emerald-200 bg-white p-3 text-xs shadow-sm">
            <div className="flex items-center gap-1.5 text-emerald-700">
              <CheckIcon className="h-3.5 w-3.5" />
              <span className="font-medium">
                Filled {filled.length} of {bidReport.totalFields} field
                {bidReport.totalFields === 1 ? '' : 's'}
              </span>
            </div>

            {filled.length > 0 && (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1 rm-scroll">
                {filled.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-brand-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-800">
                      {FIELD_LABELS[f.category] ?? f.category}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={f.preview}>
                      {f.preview}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {pending.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  {pending.length} question{pending.length === 1 ? '' : 's'} need a manual answer
                </p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto pr-1 rm-scroll">
                  {pending.map((q, i) => (
                    <li key={i} className="truncate text-[10px] text-amber-900/80" title={q.question}>
                      • {q.question}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                  {unmatched.length} field{unmatched.length === 1 ? '' : 's'} need a manual pick
                </p>
                <ul className="mt-1 space-y-1.5">
                  {unmatchedVisible.map((u, i) => {
                    const chips = (u.options ?? []).filter((t) => t.length > 0);
                    const chipsVisible = chips.slice(0, MAX_CHIPS_VISIBLE);
                    const chipsOverflow = Math.max(0, chips.length - chipsVisible.length);
                    return (
                      <li
                        key={`${u.fieldKey}:${u.frameId ?? 'top'}:${i}`}
                        className="space-y-1"
                      >
                        <div className="flex items-start gap-1.5 text-[11px]">
                          <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700">
                            {KIND_LABELS[u.fieldKind] ?? u.fieldKind}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-slate-700"
                            title={u.label}
                          >
                            {u.label || '(unlabeled)'}
                          </span>
                        </div>
                        {chipsVisible.length > 0 ? (
                          <div className="flex flex-wrap gap-1 pl-1">
                            {chipsVisible.map((t, j) => (
                              <button
                                key={`${u.fieldKey}:chip:${j}`}
                                type="button"
                                onClick={() => onPickUnmatched(u, t)}
                                disabled={disabled || busy}
                                title={t}
                                className="max-w-[140px] truncate rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {t}
                              </button>
                            ))}
                            {chipsOverflow > 0 && (
                              <span className="px-1 py-0.5 text-[10px] text-slate-500">
                                + {chipsOverflow} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="pl-1 text-[10px] text-slate-500">
                            Open the page and fill manually
                          </p>
                        )}
                      </li>
                    );
                  })}
                  {unmatchedOverflow > 0 && (
                    <li className="text-[10px] text-slate-500">
                      + {unmatchedOverflow} more …
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : !canBid ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-500">
            Generate the resume first. If the bid page has a cover-letter field, generate the
            proposal too.
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-brand-200 bg-white px-3 py-2 text-[11px] text-slate-600">
            Open the bid page in the active tab, then click <strong>Auto-Fill Application</strong>.
            The extension fills contact + EEO fields and asks the AI to draft open-ended answers.
          </p>
        )
      }
    />
  );
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const ms = Date.now() - then;
  if (ms < 5_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}
