import type { FC } from 'react';
import type { ExtractedJobDescription, AnalyzedJobDescription } from '@/types/jd';
import { truncate } from '@/utils/text';
import { safeHostname } from '@/utils/url';

interface Props {
  jd: ExtractedJobDescription | null;
  analysis: AnalyzedJobDescription | null;
  onExtract: () => void;
  onAnalyze: () => void;
  disabled: boolean;
}

export const JobPanel: FC<Props> = ({ jd, analysis, onExtract, onAnalyze, disabled }) => (
  <section className="space-y-3 p-4">
    <header className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-800">Job posting</h2>
      <button
        type="button"
        onClick={onExtract}
        disabled={disabled}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Extract from page
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
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={disabled}
            className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analysis ? 'Re-analyze' : 'Analyze with AI'}
          </button>
        </div>
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
        Open a job posting and click <span className="font-semibold">Extract from page</span>.
      </div>
    )}

    {analysis && (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">AI analysis</div>
        <div className="mt-1 font-semibold text-slate-900">
          {analysis.targetTitle} · {analysis.seniority}
        </div>
        <p className="mt-1 text-slate-600">{analysis.summary}</p>
        {analysis.requiredSkills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {analysis.requiredSkills.slice(0, 12).map((s) => (
              <span
                key={s}
                className="rounded bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-800"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    )}
  </section>
);
