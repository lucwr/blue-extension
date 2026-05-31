/**
 * Typed wrapper around chrome.storage.local. Every shape is keyed in
 * `keys.ts` and bound to a concrete TS type below — callers get full
 * autocomplete and refactor-safety.
 */
import type { ExtractedJobDescription } from '@/types/jd';
import type { AutofillReport } from '@/types/messages';
import type { ProposalJson } from '@/types/proposal';
import type { MasterProfile, ResumeJson } from '@/types/resume';
import { StorageKeys, type StorageKey } from './keys';

export interface Settings {
  backendBaseUrl: string;
  defaultTemplateId: string;
  defaultProposalTone: 'confident' | 'consultative' | 'warm' | 'concise' | 'enthusiastic';
  /** Hard-cap how many history entries we keep on-device. */
  historyLimit: number;
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  source: string;
  jobUrl: string;
  jobTitle: string;
  company: string | null;
  jd: ExtractedJobDescription;
  resume: ResumeJson | null;
  proposal: ProposalJson | null;
}

/**
 * Snapshot of the popup's working state for a single job. Persisted so the
 * popup can rehydrate after being closed (clicking outside, opening another
 * window, etc.) without losing the generated resume/proposal. Cleared only
 * by an explicit Refresh action in the popup UI.
 */
export interface PopupSession {
  jd: ExtractedJobDescription | null;
  resume: ResumeJson | null;
  proposal: ProposalJson | null;
  bidReport: AutofillReport | null;
  /** ISO timestamp the session was last written. Used to invalidate stale snapshots. */
  savedAt: string;
}

interface StorageShape {
  [StorageKeys.Settings]: Settings;
  [StorageKeys.MasterProfile]: MasterProfile;
  [StorageKeys.ResumeTemplates]: { id: string; name: string }[];
  [StorageKeys.ProposalTemplates]: { id: string; name: string; body: string }[];
  [StorageKeys.History]: HistoryEntry[];
  [StorageKeys.AuthToken]: string;
  [StorageKeys.PopupSession]: PopupSession;
}

export const DEFAULT_SETTINGS: Settings = {
  backendBaseUrl: 'http://localhost:8787',
  defaultTemplateId: 'default-ats',
  defaultProposalTone: 'confident',
  historyLimit: 50,
};

export async function getValue<K extends StorageKey>(
  key: K,
): Promise<StorageShape[K] | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as StorageShape[K] | undefined;
}

export async function setValue<K extends StorageKey>(
  key: K,
  value: StorageShape[K],
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeValue(key: StorageKey): Promise<void> {
  await chrome.storage.local.remove(key);
}

export async function getSettings(): Promise<Settings> {
  const existing = await getValue(StorageKeys.Settings);
  if (!existing) {
    await setValue(StorageKeys.Settings, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  // Merge to backfill any new defaults introduced by upgrades.
  return { ...DEFAULT_SETTINGS, ...existing };
}

export async function pushHistory(entry: HistoryEntry): Promise<HistoryEntry[]> {
  const settings = await getSettings();
  const existing = (await getValue(StorageKeys.History)) ?? [];
  const next = [entry, ...existing].slice(0, settings.historyLimit);
  await setValue(StorageKeys.History, next);
  return next;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return (await getValue(StorageKeys.History)) ?? [];
}

export async function getMasterProfile(): Promise<MasterProfile | undefined> {
  return getValue(StorageKeys.MasterProfile);
}

export async function setMasterProfile(profile: MasterProfile): Promise<void> {
  await setValue(StorageKeys.MasterProfile, profile);
}

export async function getAuthToken(): Promise<string | undefined> {
  return getValue(StorageKeys.AuthToken);
}

export async function setAuthToken(token: string): Promise<void> {
  await setValue(StorageKeys.AuthToken, token);
}

export async function getPopupSession(): Promise<PopupSession | undefined> {
  return getValue(StorageKeys.PopupSession);
}

export async function setPopupSession(session: PopupSession): Promise<void> {
  await setValue(StorageKeys.PopupSession, session);
}

export async function clearPopupSession(): Promise<void> {
  await removeValue(StorageKeys.PopupSession);
}
