import { create } from 'zustand';
import type { AnalyzedJobDescription, ExtractedJobDescription } from '@/types/jd';
import type { AppError } from '@/types/messages';
import type { ProposalJson } from '@/types/proposal';
import type { ResumeJson } from '@/types/resume';

export type FlowStep = 'idle' | 'extracting' | 'analyzing' | 'generating-resume' | 'generating-proposal';

interface PopupState {
  step: FlowStep;
  jd: ExtractedJobDescription | null;
  analysis: AnalyzedJobDescription | null;
  resume: ResumeJson | null;
  proposal: ProposalJson | null;
  error: AppError | null;

  setStep: (step: FlowStep) => void;
  setJd: (jd: ExtractedJobDescription | null) => void;
  setAnalysis: (a: AnalyzedJobDescription | null) => void;
  setResume: (r: ResumeJson | null) => void;
  setProposal: (p: ProposalJson | null) => void;
  setError: (e: AppError | null) => void;
  reset: () => void;
}

export const usePopupStore = create<PopupState>((set) => ({
  step: 'idle',
  jd: null,
  analysis: null,
  resume: null,
  proposal: null,
  error: null,

  setStep: (step) => set({ step }),
  setJd: (jd) => set({ jd }),
  setAnalysis: (analysis) => set({ analysis }),
  setResume: (resume) => set({ resume }),
  setProposal: (proposal) => set({ proposal }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      step: 'idle',
      jd: null,
      analysis: null,
      resume: null,
      proposal: null,
      error: null,
    }),
}));
