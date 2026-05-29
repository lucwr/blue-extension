import { useCallback, useState, type FC } from 'react';
import { JobPanel } from './components/JobPanel';
import { ProfileEditor } from './components/ProfileEditor';
import { ProposalPanel } from './components/ProposalPanel';
import { ResumePanel } from './components/ResumePanel';
import { StatusBar } from './components/StatusBar';
import { useExtraction } from './hooks/useExtraction';
import {
  useGenerateProposal,
  useGenerateResume,
} from './hooks/useGeneration';
import { usePopupStore } from './store';
import { downloadResumePdf } from '@/services/pdf.service';
import type { ProposalTone } from '@/types/proposal';

type View = 'job' | 'profile';

const TabButton: FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded px-2 py-1 text-xs font-medium transition ${
      active
        ? 'bg-brand-100 text-brand-800'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
);

export const App: FC = () => {
  const [view, setView] = useState<View>('job');
  const { step, jd, resume, proposal, error } = usePopupStore();
  const extract = useExtraction();
  const generateResume = useGenerateResume();
  const generateProposal = useGenerateProposal();

  const busy = step !== 'idle';

  const onDownloadPdf = useCallback(async () => {
    if (!resume) return;
    try {
      await downloadResumePdf(resume);
    } catch (err) {
      usePopupStore.getState().setError({
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'PDF generation failed',
      });
    }
  }, [resume]);

  const onCopyProposal = useCallback(async () => {
    if (!proposal) return;
    const text = [
      proposal.subject ? `Subject: ${proposal.subject}` : '',
      proposal.opener,
      ...proposal.body,
      ...(proposal.highlights.length
        ? ['', 'Highlights:', ...proposal.highlights.map((h) => `• ${h}`)]
        : []),
      '',
      proposal.closer,
    ]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
  }, [proposal]);

  const onGenerateProposal = useCallback(
    (tone?: ProposalTone) => {
      void generateProposal(tone);
    },
    [generateProposal],
  );

  return (
    <div className="flex h-[600px] w-[400px] flex-col bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div>
          <div className="text-sm font-bold text-slate-900">Resume Maker</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            AI job bidding · v0.1
          </div>
        </div>
        <nav className="flex gap-1" role="tablist">
          <TabButton active={view === 'job'} onClick={() => setView('job')}>
            Job
          </TabButton>
          <TabButton active={view === 'profile'} onClick={() => setView('profile')}>
            Profile
          </TabButton>
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        {view === 'job' ? (
          <>
            <JobPanel
              jd={jd}
              onExtract={() => void extract()}
              disabled={busy}
            />
            <ResumePanel
              resume={resume}
              canGenerate={Boolean(jd)}
              onGenerate={() => void generateResume()}
              onDownloadPdf={() => void onDownloadPdf()}
              disabled={busy}
            />
            <ProposalPanel
              proposal={proposal}
              canGenerate={Boolean(jd)}
              disabled={busy}
              onGenerate={onGenerateProposal}
              onCopy={() => void onCopyProposal()}
            />
          </>
        ) : (
          <ProfileEditor />
        )}
      </main>

      {view === 'job' && <StatusBar step={step} error={error} />}
    </div>
  );
};
