import type { FC } from 'react';
import type { ProposalJson, ProposalTone } from '@/types/proposal';
import { Spinner, StatusChip } from './Spinner';

const TONES: ProposalTone[] = ['confident', 'consultative', 'warm', 'concise', 'enthusiastic'];

interface Props {
  proposal: ProposalJson | null;
  canGenerate: boolean;
  disabled: boolean;
  busy: boolean;
  onGenerate: (tone?: ProposalTone) => void;
  onCopy: () => void;
}

const MessageIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const CopyIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const ProposalPanel: FC<Props> = ({
  proposal,
  canGenerate,
  disabled,
  busy,
  onGenerate,
  onCopy,
}) => {
  const chipTone = busy ? 'busy' : proposal ? 'done' : 'pending';
  const chipText = busy ? 'Drafting' : proposal ? `Tone: ${proposal.tone}` : canGenerate ? 'Pick tone' : 'Awaiting JD';
  return (
    <section className="border-t border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-sm">
            <MessageIcon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-slate-800">Proposal</h2>
              <StatusChip tone={chipTone} text={chipText} />
            </div>
            <p className="truncate text-[10px] uppercase tracking-wide text-slate-400">
              Cover letter
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <select
            defaultValue=""
            disabled={!canGenerate || disabled}
            onChange={(e) => {
              const v = e.target.value as ProposalTone | '';
              if (v) onGenerate(v);
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              Tone…
            </option>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCopy}
            disabled={!proposal || disabled}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
            Copy
          </button>
        </div>
      </div>
    </section>
  );
};
