/**
 * Backend API client used by the background service worker.
 *
 * Key design points:
 *  - All AI traffic goes through the backend; no API keys ever ship to the
 *    extension.
 *  - JWT is attached from chrome.storage.local when present.
 *  - Errors are mapped into the extension's `AppError` shape, never raw HTTP.
 */
import { getAuthToken, getSettings } from '@/storage';
import type { AnalyzedJobDescription, ExtractedJobDescription } from '@/types/jd';
import type { AppError, AppErrorCode } from '@/types/messages';
import type { ProposalJson, ProposalTone } from '@/types/proposal';
import type { ResumeJson, MasterProfile } from '@/types/resume';
import { createLogger } from '@/utils/logger';

const log = createLogger('bg:api');

const DEFAULT_TIMEOUT_MS = 60_000;

interface BackendError {
  code?: AppErrorCode;
  message?: string;
  details?: unknown;
}

class ApiCallError extends Error {
  override readonly name = 'ApiCallError';
  constructor(readonly appError: AppError) {
    super(appError.message);
  }
}

function statusToCode(status: number): AppErrorCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 422) return 'AI_INVALID_OUTPUT';
  if (status >= 500) return 'BACKEND_ERROR';
  return 'BACKEND_ERROR';
}

async function request<T>(
  path: string,
  init: {
    method: 'GET' | 'POST';
    body?: unknown;
    timeoutMs?: number;
  },
): Promise<T> {
  const settings = await getSettings();
  const token = await getAuthToken();
  const url = `${settings.backendBaseUrl.replace(/\/$/, '')}${path}`;

  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    log.debug(`-> ${init.method} ${url}`);
    const response = await fetch(url, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      let payload: BackendError = {};
      try {
        payload = (await response.json()) as BackendError;
      } catch {
        /* ignore — backend may have returned text */
      }
      const code = payload.code ?? statusToCode(response.status);
      throw new ApiCallError({
        code,
        message:
          payload.message ?? `Backend responded with ${response.status} ${response.statusText}`,
        details: payload.details,
      });
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiCallError) throw err;
    if ((err as { name?: string }).name === 'AbortError') {
      throw new ApiCallError({
        code: 'TIMEOUT',
        message: `Request to backend timed out after ${timeoutMs}ms`,
      });
    }
    throw new ApiCallError({
      code: 'BACKEND_UNREACHABLE',
      message:
        'Could not reach the backend. Make sure it is running and that the URL in Settings is correct.',
      details: err instanceof Error ? err.message : err,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  async healthcheck(): Promise<{ ok: true; version: string }> {
    return request<{ ok: true; version: string }>('/api/health', { method: 'GET', timeoutMs: 5_000 });
  },

  async analyzeJd(jd: ExtractedJobDescription): Promise<AnalyzedJobDescription> {
    const result = await request<{ analysis: AnalyzedJobDescription }>('/api/analyze', {
      method: 'POST',
      body: { jd },
    });
    return result.analysis;
  },

  async generateResume(input: {
    analysis: AnalyzedJobDescription;
    jd: ExtractedJobDescription;
    masterProfile: MasterProfile;
    templateId: string;
  }): Promise<ResumeJson> {
    const result = await request<{ resume: ResumeJson }>('/api/resume', {
      method: 'POST',
      body: input,
    });
    return result.resume;
  },

  async generateProposal(input: {
    analysis: AnalyzedJobDescription;
    jd: ExtractedJobDescription;
    masterProfile: MasterProfile;
    tone: ProposalTone;
  }): Promise<ProposalJson> {
    const result = await request<{ proposal: ProposalJson }>('/api/proposal', {
      method: 'POST',
      body: input,
    });
    return result.proposal;
  },
};

export { ApiCallError };
