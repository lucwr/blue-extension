/**
 * Raw job-description payload produced by a content-script extractor.
 * This is the un-analyzed shape — see `AnalyzedJobDescription` for the AI output.
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

/** Result of `analyzeJobDescription` on the backend (shape mirrors the Zod schema). */
export interface AnalyzedJobDescription {
  targetTitle: string;
  seniority: Seniority;
  domain: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  frameworks: string[];
  cloud: string[];
  databases: string[];
  testing: string[];
  softSkills: string[];
  atsKeywords: string[];
  domainTerminology: string[];
  /** Short natural-language summary the popup can render. */
  summary: string;
}

export type Seniority =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'lead'
  | 'unspecified';
