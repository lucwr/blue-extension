import { useCallback, type FC } from 'react';
import { JobPanel } from './components/JobPanel';
import { ResumePanel } from './components/ResumePanel';
import { ProposalPanel } from './components/ProposalPanel';
import { StatusBar } from './components/StatusBar';
import { useExtraction } from './hooks/useExtraction';
import {
  useAnalyze,
  useGenerateProposal,
  useGenerateResume,
} from './hooks/useGeneration';
import { usePopupStore } from './store';
import { downloadResumePdf } from '@/services/pdf.service';
import type { ProposalTone } from '@/types/proposal';

export const App: FC = () => {
  const { step, jd, analysis, resume, proposal, error } = usePopupStore();
  const extract = useExtraction();
  const analyze = useAnalyze();
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
      ...(proposal.highlights.length ? ['', 'Highlights:', ...proposal.highlights.map((h) => `• ${h}`)] : []),
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
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-sm font-bold text-slate-900">Resume Maker</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            AI job bidding · v0.1
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <JobPanel
          jd={jd}
          analysis={analysis}
          onExtract={() => void extract()}
          onAnalyze={() => void analyze()}
          disabled={busy}
        />
        <ResumePanel
          resume={resume}
          canGenerate={Boolean(analysis)}
          onGenerate={() => void generateResume()}
          onDownloadPdf={() => void onDownloadPdf()}
          disabled={busy}
        />
        <ProposalPanel
          proposal={proposal}
          canGenerate={Boolean(analysis)}
          disabled={busy}
          onGenerate={onGenerateProposal}
          onCopy={() => void onCopyProposal()}
        />
      </main>

      <StatusBar step={step} error={error} />
    </div>
  );
};
