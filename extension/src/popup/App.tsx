import { useCallback, useEffect, useState, type FC } from 'react';
import { AppHeader } from './components/AppHeader';
import { BidPanel } from './components/BidPanel';
import { JobPanel } from './components/JobPanel';
import { ProfileEditor } from './components/ProfileEditor';
import { ProposalPanel } from './components/ProposalPanel';
import { ResumePanel } from './components/ResumePanel';
import { StatusBar } from './components/StatusBar';
import { ToastHost, toast } from './components/ui';
import { useAutofillBid } from './hooks/useAutofillBid';
import { useExtraction } from './hooks/useExtraction';
import { useGenerateProposal, useGenerateResume } from './hooks/useGeneration';
import { usePopupStore } from './store';
import { downloadResumePdf } from '@/services/pdf.service';
import { getMasterProfile } from '@/storage';
import { StorageKeys } from '@/storage/keys';
import type { PopupSession } from '@/storage';
import type { ProposalTone } from '@/types/proposal';

type View = 'job' | 'profile';

export const App: FC = () => {
  const [view, setView] = useState<View>('job');
  const [hasProfile, setHasProfile] = useState<boolean>(false);
  const { hydrated, step, jd, resume, proposal, bidReport, error, hydrate, refresh } =
    usePopupStore();

  // ─── Existing handler hooks — NOT modified, only re-wired into the new
  // UI components. Behavior, request shape, and store updates are unchanged.
  const extract = useExtraction();
  const generateResume = useGenerateResume();
  const generateProposal = useGenerateProposal();
  const { autofill: autofillBid, onPickUnmatched } = useAutofillBid();

  const busy = step !== 'idle';
  const hasContent = Boolean(jd ?? resume ?? proposal ?? bidReport);

  // Rehydrate the persisted session on mount so closing the popup doesn't
  // wipe the generated resume/proposal. Only an explicit Refresh clears it.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Live-sync from the background while the popup is open. The
  // chrome.storage.onChanged listener picks up writes the background made
  // while the popup was closed (or open elsewhere) — see store comment.
  // Also watches MasterProfile changes so the bid card unlocks the moment
  // the user saves their profile, without forcing a popup reopen.
  useEffect(() => {
    const onChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: chrome.storage.AreaName,
    ): void => {
      if (area !== 'local') return;
      const change = changes[StorageKeys.PopupSession];
      if (change) {
        const next = change.newValue as PopupSession | undefined;
        if (next) usePopupStore.getState().syncFromSession(next);
      }
      const profileChange = changes[StorageKeys.MasterProfile];
      if (profileChange) {
        setHasProfile(Boolean(profileChange.newValue));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    void getMasterProfile().then((p) => setHasProfile(Boolean(p)));
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const onRefresh = useCallback(() => {
    if (busy) return;
    if (!hasContent) return;
    void refresh();
  }, [busy, hasContent, refresh]);

  // F5 / Ctrl+R inside the popup window → same Refresh action.
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

  // Same PDF flow as before — calls the existing `downloadResumePdf` service.
  // Toast on success/failure is purely UI; the service call is untouched.
  const onDownloadPdf = useCallback(async () => {
    if (!resume) return;
    try {
      await downloadResumePdf(resume);
      toast.success('Resume PDF downloaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed';
      usePopupStore.getState().setError({ code: 'UNKNOWN', message });
      toast.error(message);
    }
  }, [resume]);

  // Same proposal-copy flow as before — assembles plain-text via the same
  // join pattern and writes to the clipboard.
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
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Cover letter copied');
    } catch {
      toast.error('Clipboard unavailable');
    }
  }, [proposal]);

  // Same generation handler as before — only repackaged so a tone-less
  // call still works for the new fallback button.
  const onGenerateProposal = useCallback(
    (tone?: ProposalTone) => {
      void generateProposal(tone);
    },
    [generateProposal],
  );

  return (
    <div className="relative flex h-[600px] w-[400px] flex-col bg-slate-50/40">
      <ToastHost />
      <AppHeader
        view={view}
        onSwitchView={setView}
        onRefresh={onRefresh}
        canRefresh={!busy && hasContent}
      />

      <main className="rm-scroll flex-1 overflow-y-auto">
        {!hydrated ? (
          <div className="flex items-center gap-2 p-4 text-xs text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-400" />
            Loading…
          </div>
        ) : view === 'job' ? (
          <div className="divide-y divide-slate-200/70 bg-white">
            {/* JobPanel.onExtract === useExtraction().extract — unchanged. */}
            <JobPanel
              jd={jd}
              onExtract={() => void extract()}
              disabled={busy}
              busy={step === 'extracting'}
            />
            {/* ResumePanel.onGenerate === useGenerateResume() — unchanged.
                ResumePanel.onDownloadPdf wraps downloadResumePdf service. */}
            <ResumePanel
              resume={resume}
              canGenerate={Boolean(jd)}
              onGenerate={() => void generateResume()}
              onDownloadPdf={() => void onDownloadPdf()}
              disabled={busy}
              busy={step === 'generating-resume'}
            />
            {/* ProposalPanel renders only when JD signals a cover-letter
                field. Same conditional as before. Handlers unchanged. */}
            {jd?.hasCoverLetterField !== false && (
              <ProposalPanel
                proposal={proposal}
                canGenerate={Boolean(jd)}
                disabled={busy}
                busy={step === 'generating-proposal'}
                onGenerate={onGenerateProposal}
                onCopy={() => void onCopyProposal()}
              />
            )}
            {/* BidPanel.onBid === useAutofillBid().autofill — unchanged.
                BidPanel.onPickUnmatched === useAutofillBid().onPickUnmatched.
                Gated only by `hasProfile` so the user can fill static
                contact / EEO / demographic fields before generating
                a resume. Resume + proposal upgrade the run (file upload,
                LLM Q&A) but are NOT required to start. */}
            <BidPanel
              canBid={hasProfile}
              hasResume={Boolean(resume)}
              hasProposal={Boolean(proposal)}
              proposalRequired={jd?.hasCoverLetterField !== false}
              bidReport={bidReport}
              disabled={busy}
              busy={step === 'auto-filling' || step === 'answering-questions'}
              answeringQuestions={step === 'answering-questions'}
              onBid={() => void autofillBid()}
              onPickUnmatched={(u, value) => void onPickUnmatched(u, value)}
            />
          </div>
        ) : (
          <ProfileEditor />
        )}
      </main>

      {view === 'job' && <StatusBar step={step} error={error} />}
    </div>
  );
};
