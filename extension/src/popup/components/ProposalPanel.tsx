/**
 * Proposal / cover letter card. Wraps the EXISTING handlers from
 * `useGenerateProposal()` (passed via App.tsx as `onGenerate`) and the
 * existing clipboard copy callback (`onCopy`). No service calls live
 * in this component.
 */
import type { FC } from 'react';
import type { ProposalJson, ProposalTone } from '@/types/proposal';
import { ActionCard, PrimaryButton, SecondaryButton, type StatusTone } from './ui';

const TONES: ProposalTone[] = ['confident', 'consultative', 'warm', 'concise', 'enthusiastic'];

interface Props {
  proposal: ProposalJson | null;
  canGenerate: boolean;
  disabled: boolean;
  busy: boolean;
  /** Same handler as before — bound to `useGenerateProposal()`. */
  onGenerate: (tone?: ProposalTone) => void;
  /** Same handler as before — copies the rendered proposal text. */
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

const SparkleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
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
  const status: { tone: StatusTone; label: string } = busy
    ? { tone: 'busy', label: 'Drafting' }
    : proposal
      ? { tone: 'done', label: 'Completed' }
      : canGenerate
        ? { tone: 'ready', label: 'Ready' }
        : { tone: 'idle', label: 'Awaiting JD' };

  const preview = proposal
    ? `Tone: ${proposal.tone} · ${proposal.body.length} paragraph${proposal.body.length === 1 ? '' : 's'} · ${proposal.highlights.length} highlight${proposal.highlights.length === 1 ? '' : 's'}`
    : canGenerate
      ? 'Cover letter — pick a tone to start.'
      : 'Extract a job description to enable.';

  return (
    <ActionCard
      icon={<MessageIcon className="h-4 w-4" />}
      title="Cover Letter"
      status={status}
      preview={preview}
      actions={
        <>
          <select
            defaultValue=""
            disabled={!canGenerate || disabled || busy}
            onChange={(e) => {
              const v = e.target.value as ProposalTone | '';
              if (v) onGenerate(v);
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Generate cover letter with tone"
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
          {proposal ? (
            <SecondaryButton
              onClick={onCopy}
              disabled={disabled}
              leadingIcon={<CopyIcon className="h-3 w-3" />}
            >
              Copy
            </SecondaryButton>
          ) : (
            <PrimaryButton
              onClick={() => onGenerate()}
              disabled={!canGenerate || disabled}
              loading={busy}
              leadingIcon={<SparkleIcon className="h-3 w-3" />}
            >
              Generate
            </PrimaryButton>
          )}
        </>
      }
    />
  );
};
