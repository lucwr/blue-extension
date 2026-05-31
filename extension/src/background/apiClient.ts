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
import type { ExtractedJobDescription } from '@/types/jd';
import type {
  AnsweredQuestion,
  AppError,
  AppErrorCode,
  AutofillPendingQuestion,
} from '@/types/messages';
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

  async generateResume(input: {
    jd: ExtractedJobDescription;
    masterProfile: MasterProfile;
    templateId: string;
  }): Promise<ResumeJson> {
    const result = await request<{ resume: ResumeJson }>('/api/resume', {
      method: 'POST',
      body: input,
      // Resume gen on Claude Sonnet emits ~3-4K output tokens at ~50-80 tok/s,
      // so 60s is too tight. 3 min covers worst-case + a retry attempt.
      timeoutMs: 180_000,
    });
    return result.resume;
  },

  async generateProposal(input: {
    jd: ExtractedJobDescription;
    masterProfile: MasterProfile;
    tone: ProposalTone;
  }): Promise<ProposalJson> {
    const result = await request<{ proposal: ProposalJson }>('/api/proposal', {
      method: 'POST',
      body: input,
      timeoutMs: 120_000,
    });
    return result.proposal;
  },

  async importResumePdf(pdfBase64: string): Promise<MasterProfile> {
    // PDF parse + LLM call is slow — give it a generous timeout.
    const result = await request<{ profile: MasterProfile }>('/api/profile/import-pdf', {
      method: 'POST',
      body: { pdfBase64 },
      timeoutMs: 180_000,
    });
    return result.profile;
  },

  async answerQuestions(input: {
    questions: AutofillPendingQuestion[];
    jd: ExtractedJobDescription;
    resume: ResumeJson;
    masterProfile: MasterProfile;
  }): Promise<{ answers: AnsweredQuestion[] }> {
    // Map content-script questions (fieldIndex-based) to LLM-friendly ids,
    // then map answers back to fieldIndex. Keeps the LLM prompt clean —
    // it sees stable string ids, not opaque numeric indices.
    const idToFieldIndex = new Map<string, number>();
    const llmQuestions = input.questions.map((q, i) => {
      const id = `q${i + 1}`;
      idToFieldIndex.set(id, q.fieldIndex);
      return { id, question: q.question };
    });
    const result = await request<{ answers: Array<{ id: string; text: string }> }>(
      '/api/answer-questions',
      {
        method: 'POST',
        body: {
          questions: llmQuestions,
          jd: input.jd,
          resume: input.resume,
          masterProfile: input.masterProfile,
        },
        timeoutMs: 120_000,
      },
    );
    const answers: AnsweredQuestion[] = [];
    for (const a of result.answers) {
      const fieldIndex = idToFieldIndex.get(a.id);
      if (fieldIndex === undefined) continue;
      answers.push({ fieldIndex, answer: a.text });
    }
    return { answers };
  },
};

export { ApiCallError };
