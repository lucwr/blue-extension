/**
 * Background message router. Every `BG_*` message from the popup lands here
 * and is dispatched to the appropriate API call. Content-script messages are
 * forwarded to the originating tab.
 */
import { getMasterProfile, getSettings, pushHistory } from '@/storage';
import type {
  AnswerQuestionsMessage,
  AppError,
  AppMessage,
  GenerateProposalMessage,
  GenerateResumeMessage,
  HealthcheckMessage,
  ImportResumePdfMessage,
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
  if (!profileGuard.ok) return { ok: false, error: profileGuard.error };
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
    return { ok: true, data: resume };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}

async function handleProposal(
  msg: GenerateProposalMessage,
): Promise<MessageResult<'BG_GENERATE_PROPOSAL'>> {
  const profileGuard = await requireMasterProfile();
  if (!profileGuard.ok) return { ok: false, error: profileGuard.error };
  try {
    const proposal = await api.generateProposal({
      jd: msg.payload.jd,
      masterProfile: profileGuard.profile,
      tone: msg.payload.tone,
    });
    return { ok: true, data: proposal };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
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
