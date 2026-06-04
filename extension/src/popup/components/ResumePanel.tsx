import type { FC } from 'react';
import type { ResumeJson } from '@/types/resume';
import { Spinner, StatusChip } from './Spinner';

interface Props {
  resume: ResumeJson | null;
  canGenerate: boolean;
  onGenerate: () => void;
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
  const chipTone = busy ? 'busy' : resume ? 'done' : 'pending';
  const chipText = busy ? 'Generating' : resume ? 'Tailored' : canGenerate ? 'Ready' : 'Awaiting JD';
  return (
    <section className="border-t border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-sm">
            <FileIcon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-slate-800">Resume</h2>
              <StatusChip tone={chipTone} text={chipText} />
            </div>
            <p className="truncate text-[10px] uppercase tracking-wide text-slate-400">
              {resume ? `${resume.targetTitle}` : 'Tailored to JD'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate || disabled}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-600 to-brand-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
          >
            {busy ? <Spinner className="h-3 w-3" /> : <SparkleIcon className="h-3 w-3" />}
            {resume ? 'Regenerate' : 'Generate'}
          </button>
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={!resume || disabled}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <DownloadIcon className="h-3 w-3" />
            PDF
          </button>
        </div>
      </div>
    </section>
  );
};
