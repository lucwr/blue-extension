import type { FC } from 'react';
import type { ResumeJson } from '@/types/resume';

interface Props {
  resume: ResumeJson | null;
  canGenerate: boolean;
  onGenerate: () => void;
  onDownloadPdf: () => void;
  disabled: boolean;
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
}) => (
  <section className="space-y-3 border-t border-slate-200 p-4">
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900/90 text-white shadow-sm">
          <FileIcon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Resume</h2>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Tailored to JD</p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || disabled}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-600 to-brand-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800 hover:shadow disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
        >
          <SparkleIcon className="h-3 w-3" />
          {resume ? 'Regenerate' : 'Generate'}
        </button>
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={!resume || disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <DownloadIcon className="h-3 w-3" />
          PDF
        </button>
      </div>
    </header>

    {!canGenerate && !resume && (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
        Extract a job posting first — the AI tailors your resume directly from the full JD.
      </p>
    )}

    {resume && (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm transition hover:shadow">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          {resume.meta.templateId} · v{resume.meta.schemaVersion}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{resume.targetTitle}</div>
        <div className="text-slate-600">
          {resume.contact.fullName} · {resume.contact.email}
        </div>
        <p className="mt-2 max-h-20 overflow-y-auto text-slate-600">{resume.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">
            {resume.experience.length} role{resume.experience.length === 1 ? '' : 's'}
          </span>
          {resume.projects.length > 0 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">
              {resume.projects.length} project{resume.projects.length === 1 ? '' : 's'}
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">
            {Object.values(resume.skills).reduce((acc, arr) => acc + arr.length, 0)} skills
          </span>
          {resume.extras.length > 0 && (
            <span className="rounded bg-brand-100 px-1.5 py-0.5 font-medium text-brand-800">
              +{resume.extras.length} extras
            </span>
          )}
        </div>
      </div>
    )}
  </section>
);
