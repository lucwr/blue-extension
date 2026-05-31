import { create } from 'zustand';
import {
  clearPopupSession,
  getPopupSession,
  setPopupSession,
  type PopupSession,
} from '@/storage';
import type { ExtractedJobDescription } from '@/types/jd';
import type { AppError, AutofillReport } from '@/types/messages';
import type { ProposalJson } from '@/types/proposal';
import type { ResumeJson } from '@/types/resume';
import { createLogger } from '@/utils/logger';

const log = createLogger('popup:store');

export type FlowStep =
  | 'idle'
  | 'extracting'
  | 'generating-resume'
  | 'generating-proposal'
  | 'auto-filling'
  | 'answering-questions';

interface PopupState {
  /** True until the persisted session has been loaded from chrome.storage. */
  hydrated: boolean;
  step: FlowStep;
  jd: ExtractedJobDescription | null;
  resume: ResumeJson | null;
  proposal: ProposalJson | null;
  bidReport: AutofillReport | null;
  error: AppError | null;

  setStep: (step: FlowStep) => void;
  setJd: (jd: ExtractedJobDescription | null) => void;
  setResume: (r: ResumeJson | null) => void;
  setProposal: (p: ProposalJson | null) => void;
  setBidReport: (r: AutofillReport | null) => void;
  setError: (e: AppError | null) => void;
  /** Hydrate from chrome.storage. Safe to call multiple times — no-ops once hydrated. */
  hydrate: () => Promise<void>;
  /**
   * Explicit user-driven refresh — wipes both the in-memory state AND the
   * persisted snapshot. Triggered by the Refresh button or the F5 keybinding.
   * The transient `step` and `error` slots are reset too.
   */
  refresh: () => Promise<void>;
}

/**
 * Persisted slice — the fields we mirror into chrome.storage so that the
 * popup picks up where it left off when re-opened. We deliberately exclude
 * `step`, `error`, and `hydrated` because they're transient/UI-only.
 */
function toSession(state: PopupState): PopupSession {
  return {
    jd: state.jd,
    resume: state.resume,
    proposal: state.proposal,
    bidReport: state.bidReport,
    savedAt: new Date().toISOString(),
  };
}

/** Best-effort write — storage failures shouldn't break the popup. */
function persist(state: PopupState): void {
  // Don't persist before hydration finishes — otherwise the initial nulls
  // would clobber the saved session on the very first store mutation.
  if (!state.hydrated) return;
  void setPopupSession(toSession(state)).catch((err) => {
    log.warn('failed to persist popup session', err);
  });
}

export const usePopupStore = create<PopupState>((set, get) => ({
  hydrated: false,
  step: 'idle',
  jd: null,
  resume: null,
  proposal: null,
  bidReport: null,
  error: null,

  setStep: (step) => set({ step }),
  setJd: (jd) => {
    set({ jd });
    persist(get());
  },
  setResume: (resume) => {
    set({ resume });
    persist(get());
  },
  setProposal: (proposal) => {
    set({ proposal });
    persist(get());
  },
  setBidReport: (bidReport) => {
    set({ bidReport });
    persist(get());
  },
  setError: (error) => set({ error }),

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const session = await getPopupSession();
      if (session) {
        set({
          jd: session.jd,
          resume: session.resume,
          proposal: session.proposal,
          bidReport: session.bidReport,
        });
      }
    } catch (err) {
      log.warn('failed to read popup session', err);
    } finally {
      set({ hydrated: true });
    }
  },

  refresh: async () => {
    set({
      step: 'idle',
      jd: null,
      resume: null,
      proposal: null,
      bidReport: null,
      error: null,
    });
    try {
      await clearPopupSession();
    } catch (err) {
      log.warn('failed to clear popup session', err);
    }
  },
}));
