/**
 * Job posting card. Wraps the EXISTING `extract()` handler produced by
 * `useExtraction()` — this component does not call any service directly.
 * The `onExtract` prop is the same callback the previous panel used.
 */
import type { FC } from 'react';
import type { ExtractedJobDescription } from '@/types/jd';
import { ActionCard, PrimaryButton, type StatusTone } from './ui';

interface Props {
  jd: ExtractedJobDescription | null;
  /** Same handler as before — bound to `useExtraction()`'s `extract`. */
  onExtract: () => void;
  disabled: boolean;
  busy: boolean;
}

const BriefcaseIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </svg>
);

const ExtractIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const JobPanel: FC<Props> = ({ jd, onExtract, disabled, busy }) => {
  const status: { tone: StatusTone; label: string } = busy
    ? { tone: 'busy', label: 'Extracting' }
    : jd
      ? { tone: 'done', label: 'Captured' }
      : { tone: 'idle', label: 'Not started' };

  const preview = jd
    ? `${jd.source.toUpperCase()} · ${jd.title}${jd.company ? ` — ${jd.company}` : ''}`
    : 'Open a job posting and click Extract.';

  return (
    <ActionCard
      icon={<BriefcaseIcon className="h-4 w-4" />}
      title="Job posting"
      status={status}
      preview={preview}
      actions={
        <PrimaryButton
          onClick={onExtract}
          disabled={disabled}
          loading={busy}
          leadingIcon={<ExtractIcon className="h-3 w-3" />}
        >
          {jd ? 'Re-extract' : 'Extract Job Description'}
        </PrimaryButton>
      }
    />
  );
};
