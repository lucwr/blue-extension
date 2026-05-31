/**
 * Raw job-description payload produced by a content-script extractor.
 * This is the canonical JD shape passed downstream to the backend for
 * resume / proposal generation.
 */
export interface ExtractedJobDescription {
  /** Site identifier that produced this extraction. */
  source: JobSource;
  /** Fully-qualified URL of the page the JD was pulled from. */
  url: string;
  /** Best-effort job title (raw text). */
  title: string;
  /** Hiring company name when available. */
  company: string | null;
  /** Location string (city, region, "Remote", etc.). */
  location: string | null;
  /** Compensation string when present in the JD. */
  compensation: string | null;
  /** Cleaned full description body. */
  description: string;
  /** ISO timestamp produced at extraction time. */
  extractedAt: string;
  /**
   * True if the page contains a textarea / long-form input that looks like a
   * cover-letter / proposal / "why are you a fit" field. Set by the content
   * script extractor.ts after the adapter chain. The popup uses this to skip
   * the Proposal generation step when the bid form doesn't actually need one.
   * Optional because adapters don't set it themselves — extractor.ts stamps it.
   */
  hasCoverLetterField?: boolean;
  /** Adapter-specific debug breadcrumbs (never sent to AI). */
  debug?: Record<string, string | number | boolean>;
}

export type JobSource =
  | 'upwork'
  | 'linkedin'
  | 'indeed'
  | 'freelancer'
  | 'remoteok'
  | 'wellfound'
  | 'generic';
