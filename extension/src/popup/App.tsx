import { useCallback, useEffect, useState, type FC } from 'react';
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

const RefreshIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M21 12a9 9 0 1 1-3.5-7.1" />
    <path d="M21 4v6h-6" />
  </svg>
);

export const App: FC = () => {
  const [view, setView] = useState<View>('job');
  const { hydrated, step, jd, resume, proposal, bidReport, error, hydrate, refresh } =
    usePopupStore();
  const extract = useExtraction();
  const generateResume = useGenerateResume();
  const generateProposal = useGenerateProposal();
  const autofillBid = useAutofillBid();

  const busy = step !== 'idle';
  const hasContent = Boolean(jd ?? resume ?? proposal ?? bidReport);

  // Rehydrate the persisted session on mount so closing the popup doesn't
  // wipe the generated resume/proposal. Only an explicit Refresh clears it.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const onRefresh = useCallback(() => {
    // Don't allow mid-run wipes — would orphan inflight requests.
    if (busy) return;
    if (!hasContent) return;
    void refresh();
  }, [busy, hasContent, refresh]);

  // F5 (or Ctrl/Cmd+R) inside the popup window → same Refresh action.
  // We swallow the default so the popup doesn't reload mid-action, then
  // clear state via the store.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const isF5 = e.key === 'F5';
      const isReloadCombo = (e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R');
      if (!isF5 && !isReloadCombo) return;
      e.preventDefault();
      onRefresh();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onRefresh]);

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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || !hasContent}
            title="Clear generated resume, proposal, and bid state (F5)"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Refresh — clear generated content"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
          </button>
          <nav className="flex gap-1 rounded-lg bg-slate-100/60 p-0.5" role="tablist">
            <TabButton active={view === 'job'} onClick={() => setView('job')}>
              Job
            </TabButton>
            <TabButton active={view === 'profile'} onClick={() => setView('profile')}>
              Profile
            </TabButton>
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {!hydrated ? (
          <div className="p-4 text-xs text-slate-500">Loading…</div>
        ) : view === 'job' ? (
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
