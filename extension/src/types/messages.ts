/**
 * Message bus contract between popup ↔ background ↔ content scripts.
 *
 * Every message is a discriminated union keyed on `type`. The bus helpers in
 * `services/messaging.ts` enforce request/response pairing at compile time.
 */
import type { ExtractedJobDescription } from './jd';
import type { ProposalJson, ProposalTone } from './proposal';
import type { MasterProfile, ResumeJson } from './resume';

export type MessageType =
  | 'CS_EXTRACT_JD'
  | 'BG_GENERATE_RESUME'
  | 'BG_GENERATE_PROPOSAL'
  | 'BG_IMPORT_RESUME_PDF'
  | 'BG_HEALTHCHECK';

interface BaseMessage<T extends MessageType, P> {
  type: T;
  payload: P;
  /** Correlates request to response, set by the messaging helper. */
  requestId?: string;
}

export type ExtractJdMessage = BaseMessage<'CS_EXTRACT_JD', { url: string }>;
export type GenerateResumeMessage = BaseMessage<
  'BG_GENERATE_RESUME',
  {
    jd: ExtractedJobDescription;
    templateId: string;
  }
>;
export type GenerateProposalMessage = BaseMessage<
  'BG_GENERATE_PROPOSAL',
  {
    jd: ExtractedJobDescription;
    tone: ProposalTone;
  }
>;
export type HealthcheckMessage = BaseMessage<'BG_HEALTHCHECK', Record<string, never>>;
export type ImportResumePdfMessage = BaseMessage<
  'BG_IMPORT_RESUME_PDF',
  { pdfBase64: string }
>;

export type AppMessage =
  | ExtractJdMessage
  | GenerateResumeMessage
  | GenerateProposalMessage
  | ImportResumePdfMessage
  | HealthcheckMessage;

export interface MessageResponseMap {
  CS_EXTRACT_JD: ExtractedJobDescription;
  BG_GENERATE_RESUME: ResumeJson;
  BG_GENERATE_PROPOSAL: ProposalJson;
  BG_IMPORT_RESUME_PDF: MasterProfile;
  BG_HEALTHCHECK: { ok: true; backendReachable: boolean; version: string };
}

export type MessageResult<T extends MessageType> =
  | { ok: true; data: MessageResponseMap[T] }
  | { ok: false; error: AppError };

export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Optional structured details (validation issues, HTTP status, etc.). */
  details?: unknown;
}

export type AppErrorCode =
  | 'EXTRACTION_FAILED'
  | 'NO_JD_FOUND'
  | 'BACKEND_UNREACHABLE'
  | 'BACKEND_ERROR'
  | 'AI_INVALID_OUTPUT'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'UNKNOWN';
