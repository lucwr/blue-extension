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
