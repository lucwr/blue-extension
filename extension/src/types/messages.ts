/**
 * Message bus contract between popup ↔ background ↔ content scripts.
 *
 * Every message is a discriminated union keyed on `type`. The bus helpers in
 * `services/messaging.ts` enforce request/response pairing at compile time.
 */
import type { ExtractedJobDescription } from './jd';
import type { ProposalJson, ProposalTone } from './proposal';
import type { BidPreferences, MasterProfile, ResumeDemographics, ResumeJson } from './resume';

export type MessageType =
  | 'CS_EXTRACT_JD'
  | 'CS_AUTOFILL_BID'
  | 'CS_FILL_ANSWERS'
  | 'CS_FILL_UNMATCHED'
  | 'BG_GENERATE_RESUME'
  | 'BG_GENERATE_PROPOSAL'
  | 'BG_IMPORT_RESUME_PDF'
  | 'BG_ANSWER_QUESTIONS'
  | 'BG_JOB_SEARCH'
  | 'BG_HEALTHCHECK';

/**
 * One result from the Google Custom Search → Sheets job search. Mirrors the
 * backend `JobResult` shape (services/jobSearch.ts).
 */
export interface JobSearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface BaseMessage<T extends MessageType, P> {
  type: T;
  payload: P;
  /** Correlates request to response, set by the messaging helper. */
  requestId?: string;
}

/**
 * Snapshot of everything the content script needs to fill a bid form. The
 * popup assembles this from the master profile + generated resume + (optional)
 * generated proposal. `proposal` is omitted when the bid page has no
 * cover-letter field — the autofill engine then falls back to the summary.
 */
export interface BidPayload {
  contact: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    website?: string;
  };
  targetTitle: string;
  summary: string;
  /** Approximate years from earliest startDate to most recent endDate. */
  yearsOfExperience: number;
  /**
   * The candidate's most recent (or current) employer. Used by the autofill
   * engine for fields labelled "Current or Most Recent Company" / "Current
   * Employer" — distinct from the JD's company. Omitted when the master
   * profile has no work history yet.
   */
  currentCompany?: string;
  /**
   * The candidate's most recent (or current) job title. Used for fields
   * labelled "Current or Most Recent Title" / "Current Position" — distinct
   * from `targetTitle`, which is the JD-tailored title the candidate is
   * applying for. Omitted when the master profile has no work history.
   */
  currentTitle?: string;
  /** Optional — omitted when no cover-letter field was detected on the page. */
  proposal?: {
    subject?: string;
    opener: string;
    body: string[];
    highlights: string[];
    closer: string;
  };
  /** Optional — omitted when the candidate hasn't filled them in yet. */
  demographics?: ResumeDemographics;
  /** Optional — defaults for common Greenhouse custom-question selects. */
  bidPreferences?: BidPreferences;
  /**
   * Resume PDF rendered in the popup, base64-encoded, ready for the autofill
   * engine to upload to any "Resume" / "CV" file-upload field discovered on
   * the bid page. Always present once the popup has generated a resume.
   * Decoded in the content script via atob() → Uint8Array → File. Skipping
   * the round-trip through chrome.runtime serialization means the engine
   * doesn't need filesystem access.
   */
  resumePdf?: {
    filename: string;
    base64: string;
  };
  /**
   * Cover-letter PDF rendered from the generated proposal. Uploaded ONLY
   * to file-upload fields explicitly marked as required (red asterisk in
   * the label, `required` attribute on the input, or `aria-required="true"`)
   * — optional cover-letter uploads are skipped to match the user's
   * stated preference. Absent when no proposal was generated.
   */
  coverLetterPdf?: {
    filename: string;
    base64: string;
  };
}

/** One detected field that was filled (or attempted) by the autofill engine. */
export interface AutofillFilled {
  /** Classifier label, e.g. "first-name", "email", "cover-letter". */
  category: string;
  /** Short preview of the value written (truncated to 80 chars). */
  preview: string;
  /** Human-friendly hint at which field was matched (label or name attr). */
  selectorHint: string;
}

/**
 * A free-text question on the bid form that the classifier couldn't match
 * to a known category but looks like a real question to answer. The popup
 * forwards these to the backend Q&A endpoint, then writes the answers back
 * via `CS_FILL_ANSWERS`.
 */
export interface AutofillPendingQuestion {
  /** Index into the content script's field enumeration so the answer can be written back. */
  fieldIndex: number;
  /**
   * Frame this question came from. Set by the popup-side aggregator after
   * the fan-out — content scripts don't know their own frameId. Absent until
   * the aggregator stamps it. The second-pass CS_FILL_ANSWERS uses this to
   * route each answer back to the correct frame so we never write into a
   * sibling iframe's form.
   */
  frameId?: number;
  /** The question text (the field's label). */
  question: string;
  /** Short hint for the UI. */
  hint: string;
  /**
   * Tag of the underlying input element. Tells the LLM how to size the
   * answer and lets the backend force exact-match against `options` for
   * selects. Defaults to "textarea" when unset (legacy compatibility).
   */
  fieldKind?: 'input' | 'textarea' | 'select';
  /**
   * Valid choices for `fieldKind: 'select'` fields. The LLM's reply MUST be
   * one of these strings verbatim — the popup writes it back via the
   * select's text-match path, so any mismatch leaves the field blank.
   */
  options?: string[];
}

/**
 * A field the autofill engine touched but couldn't resolve to a value the
 * user can verify. Surfaced in the popup so the user can pick from `options`
 * (when present) or be nudged to fill the page manually. Each descriptor
 * carries enough stable identity (`fieldKey`) to re-find the field for a
 * targeted second-pass write via `CS_FILL_UNMATCHED`.
 */
export interface AutofillUnmatchedField {
  /**
   * Stable id used by the second-pass writer to re-locate the field. Encoded
   * as one of:
   *   - `native:<i>`   — index into the content script's `selectAllFields()`
   *   - `radio:<name>` — the radio group's shared `name` attribute
   *   - `buttons:<idx>` — the synthetic id assigned by the button-group pass
   *   - `rs:<i>`       — index into `findReactSelectWidgets()`
   */
  fieldKey: string;
  /**
   * Frame this descriptor came from. Set by the popup-side aggregator after
   * the fan-out — content scripts don't know their own frameId. Mirrors
   * `AutofillPendingQuestion.frameId` so the second-pass writer can target
   * the right frame.
   */
  frameId?: number;
  /** Human-friendly label for the field (group label or input label). */
  label: string;
  /** Kind of field — drives the picker UI in the popup. */
  fieldKind:
    | 'select'
    | 'react-select'
    | 'radio'
    | 'checkbox'
    | 'button-group'
    | 'input'
    | 'textarea';
  /** Short hint about the underlying control (label, name attr). */
  selectorHint?: string;
  /**
   * Visible option texts when the field is a closed-list picker. The popup
   * renders these as clickable chips; one-click sends a `CS_FILL_UNMATCHED`
   * with the chosen text. Absent for free-text fields and for react-select
   * widgets where the menu can't be safely opened without page-side flicker.
   */
  options?: string[];
  /** Why the engine couldn't resolve a value on its own. */
  reason: 'no-classification' | 'no-value' | 'option-mismatch' | 'over-cap';
}

export interface AutofillReport {
  /** Successfully filled fields. */
  filled: AutofillFilled[];
  /** Total candidate form fields enumerated. */
  totalFields: number;
  /** Fields the classifier couldn't confidently map — surfaced for manual pick. */
  unmatchedFields: AutofillUnmatchedField[];
  /** Question-like fields waiting for LLM answers. Popup orchestrates the round trip. */
  pendingQuestions: AutofillPendingQuestion[];
  /** Timestamp the autofill ran. */
  ranAt: string;
}

/** One LLM-answered question to write back into a specific field. */
export interface AnsweredQuestion {
  fieldIndex: number;
  /** Mirrors the originating pending question's frameId so the popup can dispatch per-frame. */
  frameId?: number;
  answer: string;
}

export type ExtractJdMessage = BaseMessage<'CS_EXTRACT_JD', { url: string }>;
export type AutofillBidMessage = BaseMessage<'CS_AUTOFILL_BID', { data: BidPayload }>;
export type FillAnswersMessage = BaseMessage<
  'CS_FILL_ANSWERS',
  { answers: AnsweredQuestion[] }
>;
export type FillUnmatchedMessage = BaseMessage<
  'CS_FILL_UNMATCHED',
  { picks: Array<{ fieldKey: string; value: string }> }
>;
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
export type AnswerQuestionsMessage = BaseMessage<
  'BG_ANSWER_QUESTIONS',
  {
    questions: AutofillPendingQuestion[];
    /** Context the model uses to ground answers — same shape as BidPayload, minus the proposal. */
    context: {
      jd: ExtractedJobDescription;
      resume: ResumeJson;
      masterProfile: MasterProfile;
    };
  }
>;
export type HealthcheckMessage = BaseMessage<'BG_HEALTHCHECK', Record<string, never>>;
export type ImportResumePdfMessage = BaseMessage<
  'BG_IMPORT_RESUME_PDF',
  { pdfBase64: string }
>;
export type JobSearchMessage = BaseMessage<
  'BG_JOB_SEARCH',
  { query: string; max?: number }
>;

export type AppMessage =
  | ExtractJdMessage
  | AutofillBidMessage
  | FillAnswersMessage
  | FillUnmatchedMessage
  | GenerateResumeMessage
  | GenerateProposalMessage
  | AnswerQuestionsMessage
  | ImportResumePdfMessage
  | JobSearchMessage
  | HealthcheckMessage;

export interface MessageResponseMap {
  CS_EXTRACT_JD: ExtractedJobDescription;
  CS_AUTOFILL_BID: AutofillReport;
  CS_FILL_ANSWERS: { filled: number };
  CS_FILL_UNMATCHED: { filled: number };
  BG_GENERATE_RESUME: ResumeJson;
  BG_GENERATE_PROPOSAL: ProposalJson;
  BG_IMPORT_RESUME_PDF: MasterProfile;
  BG_ANSWER_QUESTIONS: { answers: AnsweredQuestion[] };
  BG_JOB_SEARCH: { jobs: JobSearchResult[]; saved: number; sheetUrl: string | null };
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
  | 'AUTOFILL_FAILED'
  | 'BACKEND_UNREACHABLE'
  | 'BACKEND_ERROR'
  | 'AI_INVALID_OUTPUT'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'UNKNOWN';
