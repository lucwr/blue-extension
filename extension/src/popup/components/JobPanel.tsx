import type { FC } from 'react';
import type { ExtractedJobDescription } from '@/types/jd';
import { truncate } from '@/utils/text';
import { safeHostname } from '@/utils/url';

interface Props {
  jd: ExtractedJobDescription | null;
  onExtract: () => void;
  disabled: boolean;
}

export const JobPanel: FC<Props> = ({ jd, onExtract, disabled }) => (
  <section className="space-y-3 p-4">
    <header className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-800">Job posting</h2>
      <button
        type="button"
        onClick={onExtract}
        disabled={disabled}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {jd ? 'Re-extract' : 'Extract from page'}
      </button>
    </header>

    {jd ? (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
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
        Open a job posting and click <span className="font-semibold">Extract from page</span>. The AI will tailor your resume from the full JD in one step.
      </div>
    )}
  </section>
);
