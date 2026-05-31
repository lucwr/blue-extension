import type { FC } from 'react';
import type { ExtractedJobDescription } from '@/types/jd';
import { truncate } from '@/utils/text';
import { safeHostname } from '@/utils/url';

interface Props {
  jd: ExtractedJobDescription | null;
  onExtract: () => void;
  disabled: boolean;
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

export const JobPanel: FC<Props> = ({ jd, onExtract, disabled }) => (
  <section className="space-y-3 p-4">
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900/90 text-white shadow-sm">
          <BriefcaseIcon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Job posting</h2>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">From active tab</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onExtract}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-600 to-brand-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800 hover:shadow disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
      >
        <DownloadIcon className="h-3 w-3" />
        {jd ? 'Re-extract' : 'Extract from page'}
      </button>
    </header>

    {jd ? (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm transition hover:shadow">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          {jd.source} · {safeHostname(jd.url)}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{jd.title}</div>
        {jd.company && <div className="text-slate-600">{jd.company}</div>}
        {jd.location && <div className="text-slate-500">{jd.location}</div>}
        <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-slate-600">
          {truncate(jd.description, 1200)}
        </p>
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
        Open a job posting and click <span className="font-semibold text-slate-700">Extract from page</span>.
        The AI will tailor your resume from the full JD in one step.
      </div>
    )}
  </section>
);
