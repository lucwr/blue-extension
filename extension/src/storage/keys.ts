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
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];
