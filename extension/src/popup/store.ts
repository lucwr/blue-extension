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
   * Apply a fresh PopupSession from chrome.storage WITHOUT triggering the
   * persist write-through. Called by the popup-side chrome.storage.onChanged
   * listener so that work the background completed while the popup was
   * closed (or while it was open in another window) reflects immediately.
   */
  syncFromSession: (session: PopupSession) => void;
  /**
   * Explicit user-driven refresh — wipes both the in-memory state AND the
   * persisted snapshot. Triggered by the Refresh button or the F5 keybinding.
   * The transient `step` and `error` slots are reset too.
   */
  refresh: () => Promise<void>;
}

/**
 * Persisted slice — what we mirror into chrome.storage so the popup picks
 * up its working artifacts (JD, resume, proposal, bid report) when
 * re-opened. The transient UI fields — `step` and `error` — are NOT
 * persisted:
 *
 *  - `error` would otherwise surface forever on every subsequent open
 *    after a single failure, even though nothing is wrong anymore.
 *  - `step` would otherwise stay non-idle forever if the bg never wrote
 *    its 'idle' completion (popup closed mid-flight + bg crashed / went
 *    offline / hit a transient error), locking every button.
 *
 * If the bg IS still generating when the popup re-opens, the
 * `chrome.storage.onChanged` listener wired in App.tsx will restore step
 * the moment the bg writes its next snapshot — no info is lost, just no
 * spinner during the gap.
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

  setStep: (step) => {
    set({ step });
    persist(get());
  },
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
  setError: (error) => {
    set({ error });
    persist(get());
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const session = await getPopupSession();
      if (session) {
        // Only restore the working artifacts. `step` and `error` are
        // ephemeral by design — see the toSession() comment for why.
        set({
          jd: session.jd,
          resume: session.resume,
          proposal: session.proposal,
          bidReport: session.bidReport,
          step: 'idle',
          error: null,
        });
      }
    } catch (err) {
      log.warn('failed to read popup session', err);
    } finally {
      set({ hydrated: true });
    }
  },

  syncFromSession: (session: PopupSession) => {
    // Direct set() — does NOT go through the setX wrappers, so persist()
    // is NOT re-triggered. This breaks the otherwise-infinite onChanged loop
    // (popup write → storage event → popup re-applies → re-write …).
    // Only the working artifacts flow back through this path; step and
    // error are owned by the in-popup flow.
    set({
      jd: session.jd,
      resume: session.resume,
      proposal: session.proposal,
      bidReport: session.bidReport,
    });
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
