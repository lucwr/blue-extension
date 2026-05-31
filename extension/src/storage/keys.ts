/**
 * Centralized chrome.storage.local key registry. Always import from here —
 * never inline a string literal. Each key has a typed shape declared in
 * `storage/index.ts`.
 */
export const StorageKeys = {
  Settings: 'settings.v1',
  MasterProfile: 'masterProfile.v1',
  ResumeTemplates: 'resumeTemplates.v1',
  ProposalTemplates: 'proposalTemplates.v1',
  History: 'history.v1',
  AuthToken: 'auth.token.v1',
  /**
   * Sticky popup workspace — JD + generated resume + proposal + bid report
   * for the most recently worked-on job. Survives popup close so a user
   * can re-open and pick up where they left off. Cleared only by an
   * explicit Refresh action.
   */
  PopupSession: 'popupSession.v1',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];
