/**
 * Resume card. Wraps the EXISTING handlers from `useGenerateResume()` and
 * the existing `downloadResumePdf` service. Both are passed in as props
 * from App.tsx — this component does not import or call them directly.
 */
import type { FC } from 'react';
import type { ResumeJson } from '@/types/resume';
import { ActionCard, PrimaryButton, SecondaryButton, type StatusTone } from './ui';

interface Props {
  resume: ResumeJson | null;
  canGenerate: boolean;
  /** Same handler as before — bound to `useGenerateResume()`. */
  onGenerate: () => void;
  /** Same handler as before — calls `downloadResumePdf` via App.tsx. */
  onDownloadPdf: () => void;
  disabled: boolean;
  busy: boolean;
}

const FileIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
);

const SparkleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
  </svg>
);

const DownloadIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const ResumePanel: FC<Props> = ({
  resume,
  canGenerate,
  onGenerate,
  onDownloadPdf,
  disabled,
  busy,
}) => {
  const status: { tone: StatusTone; label: string } = busy
    ? { tone: 'busy', label: 'Generating' }
    : resume
      ? { tone: 'done', label: 'Completed' }
      : canGenerate
        ? { tone: 'ready', label: 'Ready' }
        : { tone: 'idle', label: 'Awaiting JD' };

  const preview = resume
    ? `${resume.targetTitle} · ${resume.experience.length} roles · ${Object.values(resume.skills).reduce((acc, arr) => acc + arr.length, 0)} skills`
    : canGenerate
      ? 'Tailored to the captured job description.'
      : 'Extract a job description to enable.';

  return (
    <ActionCard
      icon={<FileIcon className="h-4 w-4" />}
      title="Resume"
      status={status}
      preview={preview}
      actions={
        <>
          <PrimaryButton
            onClick={onGenerate}
            disabled={!canGenerate || disabled}
            loading={busy}
            leadingIcon={<SparkleIcon className="h-3 w-3" />}
          >
            {resume ? 'Regenerate' : 'Generate Resume'}
          </PrimaryButton>
          <SecondaryButton
            onClick={onDownloadPdf}
            disabled={!resume || disabled}
            leadingIcon={<DownloadIcon className="h-3 w-3" />}
          >
            PDF
          </SecondaryButton>
        </>
      }
    />
  );
};
