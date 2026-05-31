import type { FC } from 'react';
import type { ProposalJson, ProposalTone } from '@/types/proposal';

const TONES: ProposalTone[] = ['confident', 'consultative', 'warm', 'concise', 'enthusiastic'];

interface Props {
  proposal: ProposalJson | null;
  canGenerate: boolean;
  disabled: boolean;
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
  onGenerate,
  onCopy,
}) => (
  <section className="space-y-3 border-t border-slate-200 p-4">
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900/90 text-white shadow-sm">
          <MessageIcon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Proposal</h2>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Cover letter</p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <select
          defaultValue=""
          disabled={!canGenerate || disabled}
          onChange={(e) => {
            const v = e.target.value as ProposalTone | '';
            if (v) onGenerate(v);
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
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
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CopyIcon className="h-3 w-3" />
          Copy
        </button>
      </div>
    </header>

    {proposal ? (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm transition hover:shadow">
        {proposal.subject && (
          <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
            Subject: <span className="font-semibold text-slate-700">{proposal.subject}</span>
          </div>
        )}
        <p className="font-semibold text-slate-900">{proposal.opener}</p>
        {proposal.body.map((p, i) => (
          <p key={i} className="mt-2">
            {p}
          </p>
        ))}
        {proposal.highlights.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {proposal.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}
        <p className="mt-2">{proposal.closer}</p>
      </div>
    ) : (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
        Choose a tone above to generate a tailored proposal.
      </p>
    )}
  </section>
);
