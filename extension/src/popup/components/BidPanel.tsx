import type { FC } from 'react';
import type { AutofillReport } from '@/types/messages';

interface Props {
  canBid: boolean;
  bidReport: AutofillReport | null;
  disabled: boolean;
  busy: boolean;
  /** True when the LLM is composing answers for free-text questions. */
  answeringQuestions: boolean;
  onBid: () => void;
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
  pronouns: 'Pronouns',
  'llm-answer': 'AI answer',
};

const BoltIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
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
}) => {
  const lastRanRelative = bidReport ? relativeTime(bidReport.ranAt) : null;
  const filled = bidReport?.filled ?? [];
  const pending = bidReport?.pendingQuestions ?? [];

  return (
    <section className="space-y-3 border-t border-slate-200 bg-gradient-to-b from-brand-50/50 to-transparent p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <BoltIcon className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Make a bid</h2>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Auto-fill the form</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBid}
          disabled={!canBid || disabled}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-600 to-brand-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800 hover:shadow disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
        >
          {busy ? (
            <>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/80" />
              {answeringQuestions ? 'Answering…' : 'Filling…'}
            </>
          ) : (
            <>
              <BoltIcon className="h-3 w-3" />
              {bidReport ? 'Re-fill' : 'Auto-fill bid'}
            </>
          )}
        </button>
      </header>

      {!canBid && !bidReport && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
          Generate the resume first. If the bid page has a cover-letter field, generate the
          proposal too — otherwise the bid can run without one.
        </p>
      )}

      {canBid && !bidReport && (
        <p className="rounded-lg border border-dashed border-brand-200 bg-white p-3 text-xs text-slate-600">
          Open the job bid page in the active tab, then click <strong>Auto-fill bid</strong>. The
          extension scans every visible form field, fills the contact + EEO fields, and asks the
          AI to draft natural answers for any open-ended questions.
        </p>
      )}

      {bidReport && (
        <div className="rounded-lg border border-emerald-200 bg-white p-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-700">
              <CheckIcon className="h-3.5 w-3.5" />
              <span className="font-medium">
                Filled {filled.length} of {bidReport.totalFields} field
                {bidReport.totalFields === 1 ? '' : 's'}
              </span>
            </div>
            {lastRanRelative && (
              <span className="text-[10px] text-slate-400">{lastRanRelative}</span>
            )}
          </div>

          {filled.length > 0 && (
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
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
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                {pending.length} question{pending.length === 1 ? '' : 's'} need a manual answer
              </p>
              <ul className="mt-1 space-y-0.5">
                {pending.slice(0, 4).map((q, i) => (
                  <li key={i} className="truncate text-[10px] text-amber-900/80" title={q.question}>
                    • {q.question}
                  </li>
                ))}
                {pending.length > 4 && (
                  <li className="text-[10px] text-amber-700/80">
                    + {pending.length - 4} more…
                  </li>
                )}
              </ul>
            </div>
          )}

          {bidReport.unmatched > 0 && (
            <p className="mt-2 text-[10px] text-slate-400">
              {bidReport.unmatched} field{bidReport.unmatched === 1 ? '' : 's'} couldn't be matched
              automatically — fill those manually before submitting.
            </p>
          )}

          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
            Resume PDF and proposal file attachments still need to be attached manually — download
            them from the Resume / Proposal sections above.
          </p>
        </div>
      )}
    </section>
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
