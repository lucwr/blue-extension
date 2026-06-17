/**
 * Background message router. Every `BG_*` message from the popup lands here
 * and is dispatched to the appropriate API call. Content-script messages are
 * forwarded to the originating tab.
 */
import { getMasterProfile, getSettings, mergePopupSession, pushHistory } from '@/storage';
import type {
  AnswerQuestionsMessage,
  AppError,
  AppMessage,
  GenerateProposalMessage,
  GenerateResumeMessage,
  HealthcheckMessage,
  ImportResumePdfMessage,
  JobSearchMessage,
  MessageResult,
} from '@/types/messages';
import { createLogger } from '@/utils/logger';
import { api, ApiCallError } from './apiClient';

const log = createLogger('bg:router');

function toAppError(err: unknown): AppError {
  if (err instanceof ApiCallError) return err.appError;
  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Unknown background error',
  };
}

async function requireMasterProfile(): Promise<
  { ok: true; profile: NonNullable<Awaited<ReturnType<typeof getMasterProfile>>> }
  | { ok: false; error: AppError }
> {
  const profile = await getMasterProfile();
  if (!profile) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        message:
          'No master profile saved yet. Open the popup → Profile and fill in your background before generating.',
      },
    };
  }
  return { ok: true, profile };
}

async function handleHealthcheck(
  _msg: HealthcheckMessage,
): Promise<MessageResult<'BG_HEALTHCHECK'>> {
  try {
    const result = await api.healthcheck();
    return { ok: true, data: { ok: true, backendReachable: true, version: result.version } };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}

async function handleImportResumePdf(
  msg: ImportResumePdfMessage,
): Promise<MessageResult<'BG_IMPORT_RESUME_PDF'>> {
  try {
    const profile = await api.importResumePdf(msg.payload.pdfBase64);
    return { ok: true, data: profile };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}

async function handleResume(msg: GenerateResumeMessage): Promise<MessageResult<'BG_GENERATE_RESUME'>> {
  const profileGuard = await requireMasterProfile();
  if (!profileGuard.ok) {
    await mergePopupSession({ step: 'idle', error: profileGuard.error });
    return { ok: false, error: profileGuard.error };
  }
  // Snapshot to PopupSession so a popup re-opened mid-flight sees the
  // "Generating…" state, then the result, even if its sendResponse
  // listener was already torn down.
  await mergePopupSession({ jd: msg.payload.jd, step: 'generating-resume', error: null });
  try {
    const resume = await api.generateResume({
      jd: msg.payload.jd,
      masterProfile: profileGuard.profile,
      templateId: msg.payload.templateId,
    });
    await pushHistory({
      id: `hist_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      source: msg.payload.jd.source,
      jobUrl: msg.payload.jd.url,
      jobTitle: msg.payload.jd.title,
      company: msg.payload.jd.company,
      jd: msg.payload.jd,
      resume,
      proposal: null,
    });
    // Write the completed resume back to PopupSession so a re-opened
    // popup picks it up via hydrate() — even if the message-bus reply
    // was lost because the popup closed while we were generating.
    await mergePopupSession({ resume, step: 'idle', error: null });
    return { ok: true, data: resume };
  } catch (err) {
    const error = toAppError(err);
    await mergePopupSession({ step: 'idle', error });
    return { ok: false, error };
  }
}

async function handleProposal(
  msg: GenerateProposalMessage,
): Promise<MessageResult<'BG_GENERATE_PROPOSAL'>> {
  const profileGuard = await requireMasterProfile();
  if (!profileGuard.ok) {
    await mergePopupSession({ step: 'idle', error: profileGuard.error });
    return { ok: false, error: profileGuard.error };
  }
  await mergePopupSession({ jd: msg.payload.jd, step: 'generating-proposal', error: null });
  try {
    const proposal = await api.generateProposal({
      jd: msg.payload.jd,
      masterProfile: profileGuard.profile,
      tone: msg.payload.tone,
    });
    await mergePopupSession({ proposal, step: 'idle', error: null });
    return { ok: true, data: proposal };
  } catch (err) {
    const error = toAppError(err);
    await mergePopupSession({ step: 'idle', error });
    return { ok: false, error };
  }
}

async function handleAnswerQuestions(
  msg: AnswerQuestionsMessage,
): Promise<MessageResult<'BG_ANSWER_QUESTIONS'>> {
  const { questions, context } = msg.payload;
  if (questions.length === 0) {
    return { ok: true, data: { answers: [] } };
  }
  try {
    const result = await api.answerQuestions({
      questions,
      jd: context.jd,
      resume: context.resume,
      masterProfile: context.masterProfile,
    });
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}

async function handleJobSearch(msg: JobSearchMessage): Promise<MessageResult<'BG_JOB_SEARCH'>> {
  try {
    const data = await api.searchJobs(msg.payload);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}

export async function dispatch(message: AppMessage): Promise<MessageResult<AppMessage['type']>> {
  log.debug('dispatch', message.type);
  // Bootstrap settings on first use so DEFAULT_SETTINGS always seeds in.
  await getSettings();

  switch (message.type) {
    case 'BG_HEALTHCHECK':
      return handleHealthcheck(message);
    case 'BG_GENERATE_RESUME':
      return handleResume(message);
    case 'BG_GENERATE_PROPOSAL':
      return handleProposal(message);
    case 'BG_IMPORT_RESUME_PDF':
      return handleImportResumePdf(message);
    case 'BG_ANSWER_QUESTIONS':
      return handleAnswerQuestions(message);
    case 'BG_JOB_SEARCH':
      return handleJobSearch(message);
    case 'CS_EXTRACT_JD':
    case 'CS_AUTOFILL_BID':
    case 'CS_FILL_ANSWERS':
    case 'CS_FILL_UNMATCHED':
      // CS_* messages travel popup → tab directly via sendToTab. Surface a
      // clear error if one ever lands here by mistake.
      return {
        ok: false,
        error: {
          code: 'UNKNOWN',
          message: `${message.type} must be sent to a tab, not the background worker.`,
        },
      } satisfies MessageResult<'CS_EXTRACT_JD'>;
    default: {
      const exhaustive: never = message;
      const fallback: MessageResult<'BG_HEALTHCHECK'> = {
        ok: false,
        error: { code: 'UNKNOWN', message: `Unknown message type: ${String(exhaustive)}` },
      };
      return fallback as MessageResult<AppMessage['type']>;
    }
  }
}
