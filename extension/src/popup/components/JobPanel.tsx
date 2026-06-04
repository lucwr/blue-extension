import type { FC } from 'react';
import type { ExtractedJobDescription } from '@/types/jd';
import { Spinner, StatusChip } from './Spinner';

interface Props {
  jd: ExtractedJobDescription | null;
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

const DownloadIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const JobPanel: FC<Props> = ({ jd, onExtract, disabled, busy }) => {
  const chipTone = busy ? 'busy' : jd ? 'done' : 'pending';
  const chipText = busy ? 'Extracting' : jd ? 'Captured' : 'Awaiting';
  return (
    <section className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-sm">
            <BriefcaseIcon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-slate-800">Job posting</h2>
              <StatusChip tone={chipTone} text={chipText} />
            </div>
            <p className="truncate text-[10px] uppercase tracking-wide text-slate-400">
              {jd ? `${jd.source} · ${jd.title}` : 'From active tab'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExtract}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-600 to-brand-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800 hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
        >
          {busy ? <Spinner className="h-3 w-3" /> : <DownloadIcon className="h-3 w-3" />}
          {jd ? 'Re-extract' : 'Extract from page'}
        </button>
      </div>
    </section>
  );
};
