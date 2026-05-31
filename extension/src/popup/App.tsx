import { useCallback, useState, type FC } from 'react';
import { BidPanel } from './components/BidPanel';
import { JobPanel } from './components/JobPanel';
import { ProfileEditor } from './components/ProfileEditor';
import { ProposalPanel } from './components/ProposalPanel';
import { ResumePanel } from './components/ResumePanel';
import { StatusBar } from './components/StatusBar';
import { useAutofillBid } from './hooks/useAutofillBid';
import { useExtraction } from './hooks/useExtraction';
import { useGenerateProposal, useGenerateResume } from './hooks/useGeneration';
import { usePopupStore } from './store';
import { downloadResumePdf } from '@/services/pdf.service';
import type { ProposalTone } from '@/types/proposal';

type View = 'job' | 'profile';

/** Inline SVG mark — matches the generated extension icon. */
const StarMark: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden>
    <defs>
      <linearGradient id="star-mark-grad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#8FC0FF" />
        <stop offset="45%" stopColor="#2F7DFF" />
        <stop offset="100%" stopColor="#0F3A99" />
      </linearGradient>
    </defs>
    <polygon
      points="50,5 60.58,36.41 92.80,36.10 67.12,55.56 76.45,82.36 50,67 23.55,82.36 32.88,55.56 7.20,37.64 39.42,36.41"
      fill="url(#star-mark-grad)"
      stroke="#0A2865"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const TabButton: FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
      active
        ? 'bg-brand-100 text-brand-800 shadow-inner'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
);

export const App: FC = () => {
  const [view, setView] = useState<View>('job');
  const { step, jd, resume, proposal, bidReport, error } = usePopupStore();
  const extract = useExtraction();
  const generateResume = useGenerateResume();
  const generateProposal = useGenerateProposal();
  const autofillBid = useAutofillBid();

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
      <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <StarMark className="h-7 w-7 drop-shadow-sm" />
          <div>
            <div className="text-sm font-bold leading-tight text-slate-900">Resume Maker</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              AI job bidding · v0.1
            </div>
          </div>
        </div>
        <nav className="flex gap-1 rounded-lg bg-slate-100/60 p-0.5" role="tablist">
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
            <JobPanel jd={jd} onExtract={() => void extract()} disabled={busy} />
            <ResumePanel
              resume={resume}
              canGenerate={Boolean(jd)}
              onGenerate={() => void generateResume()}
              onDownloadPdf={() => void onDownloadPdf()}
              disabled={busy}
            />
            {jd?.hasCoverLetterField !== false && (
              <ProposalPanel
                proposal={proposal}
                canGenerate={Boolean(jd)}
                disabled={busy}
                onGenerate={onGenerateProposal}
                onCopy={() => void onCopyProposal()}
              />
            )}
            <BidPanel
              canBid={Boolean(
                resume && (jd?.hasCoverLetterField === false ? true : proposal),
              )}
              bidReport={bidReport}
              disabled={busy}
              busy={step === 'auto-filling' || step === 'answering-questions'}
              answeringQuestions={step === 'answering-questions'}
              onBid={() => void autofillBid()}
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
