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

export const ProposalPanel: FC<Props> = ({ proposal, canGenerate, disabled, onGenerate, onCopy }) => (
  <section className="space-y-3 border-t border-slate-200 p-4">
    <header className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-800">Proposal</h2>
      <div className="flex gap-2">
        <select
          defaultValue=""
          disabled={!canGenerate || disabled}
          onChange={(e) => {
            const v = e.target.value as ProposalTone | '';
            if (v) onGenerate(v);
          }}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            Generate with tone…
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
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy
        </button>
      </div>
    </header>

    {proposal ? (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
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
