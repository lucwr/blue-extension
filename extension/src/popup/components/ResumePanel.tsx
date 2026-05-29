import type { FC } from 'react';
import type { ResumeJson } from '@/types/resume';

interface Props {
  resume: ResumeJson | null;
  canGenerate: boolean;
  onGenerate: () => void;
  onDownloadPdf: () => void;
  disabled: boolean;
}

export const ResumePanel: FC<Props> = ({ resume, canGenerate, onGenerate, onDownloadPdf, disabled }) => (
  <section className="space-y-3 border-t border-slate-200 p-4">
    <header className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-800">Resume</h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || disabled}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resume ? 'Regenerate' : 'Generate'}
        </button>
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={!resume || disabled}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download PDF
        </button>
      </div>
    </header>

    {!canGenerate && !resume && (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
        Extract a job posting first — the AI tailors your resume directly from the full JD.
      </p>
    )}

    {resume && (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          {resume.meta.templateId} · v{resume.meta.schemaVersion}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{resume.targetTitle}</div>
        <div className="text-slate-600">
          {resume.contact.fullName} · {resume.contact.email}
        </div>
        <p className="mt-2 max-h-20 overflow-y-auto text-slate-600">{resume.summary}</p>
        <div className="mt-2 text-[11px] text-slate-500">
          {resume.experience.length} roles · {resume.projects.length} projects ·{' '}
          {Object.values(resume.skills).reduce((acc, arr) => acc + arr.length, 0)} skills
        </div>
      </div>
    )}
  </section>
);
