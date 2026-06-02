/**
 * Canonical resume JSON shape — this is the single source of truth that
 *   1. the AI must conform to (validated by Zod on the backend), and
 *   2. the React resume templates deterministically render into HTML/PDF.
 *
 * The AI never produces styled HTML directly.
 */
export interface ResumeJson {
  meta: ResumeMeta;
  contact: ResumeContact;
  targetTitle: string;
  summary: string;
  skills: ResumeSkills;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  /** Free-form sections the user can opt in to (e.g. "Open source", "Publications"). */
  extras: ResumeExtra[];
}

export interface ResumeMeta {
  /** Schema version, bumped when the JSON shape changes. */
  schemaVersion: string;
  /** Resume render template id (matches a key in `extension/src/templates`). */
  templateId: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** Origin job URL the resume was tailored for, when applicable. */
  sourceJobUrl?: string;
}

export interface ResumeContact {
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface ResumeSkills {
  languages: string[];
  frontend: string[];
  backend: string[];
  cloud: string[];
  databases: string[];
  testing: string[];
  tools: string[];
}

export interface ResumeExperience {
  company: string;
  title: string;
  location?: string;
  /** Free-form "YYYY-MM" or "YYYY" — strict ISO is *not* required because resumes use "Present". */
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ResumeProject {
  name: string;
  link?: string;
  description: string;
  technologies: string[];
  bullets: string[];
}

export interface ResumeEducation {
  institution: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  details?: string[];
}

export interface ResumeCertification {
  name: string;
  issuer: string;
  date?: string;
  credentialUrl?: string;
}

export interface ResumeExtra {
  heading: string;
  items: string[];
}

/** Yes/No/Prefer-not-to-say for boolean-shaped EEO questions. */
export type YesNoPNTS = 'yes' | 'no' | 'prefer-not-to-say' | '';

/**
 * Demographics / EEO answers — filled once in the Profile tab and reused
 * by the auto-fill engine for every bid form.
 */
export interface ResumeDemographics {
  workAuthorizedUS: YesNoPNTS;
  requiresSponsorshipUS: YesNoPNTS;
  gender: string;
  race: string;
  veteran: string;
  disability: string;
  /** Common Greenhouse follow-up: "Do you identify as transgender?" */
  transgender: YesNoPNTS;
  /** "Are you Hispanic/Latino?" — separate yes/no/PNTS field on US EEO forms. */
  hispanicLatino: YesNoPNTS;
  pronouns: string;
}

/**
 * User-configurable defaults for bid form questions that don't fit the
 * EEO bucket — prior employment, generic "do you have experience?",
 * source attribution, salary. These let the auto-fill engine answer
 * deterministically without the LLM round trip for common patterns.
 */
export interface BidPreferences {
  /** "Have you previously worked for <company>?" — defaults to 'no'. */
  priorEmployment: YesNoPNTS;
  /** "Do you have experience with X?" — defaults to 'yes' since the candidate applied. */
  hasRelevantExperience: YesNoPNTS;
  /** "How did you hear about this opportunity?" — free-text, used for SELECT match-by-contains too. */
  howDidYouHear: string;
  /** "What are your salary expectations?" — free-text, often a range. */
  salaryExpectation: string;
  /** "Highest degree attained" — Bachelor's Degree, Master of Business Administration (M.B.A.), etc. */
  highestDegree: string;
  /** "Are you 18 years of age or older?" — defaults to 'yes' since virtually all candidates are. */
  over18: YesNoPNTS;
  /** "What is your age range?" — free-text like "30-35", matched against the form's radio options. */
  ageRange: string;
}

/**
 * Skeleton "master profile" the user fills in once. The AI tailors *this*
 * into a job-specific `ResumeJson` — the master profile is the source of truth
 * that prevents hallucinated experience.
 */
export interface MasterProfile {
  contact: ResumeContact;
  summary: string;
  skills: ResumeSkills;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  extras: ResumeExtra[];
  /** Optional — older profiles without demographics still load. */
  demographics?: ResumeDemographics;
  /** Optional — defaults for common bid-form questions. */
  bidPreferences?: BidPreferences;
}

export const EMPTY_DEMOGRAPHICS: ResumeDemographics = {
  workAuthorizedUS: '',
  requiresSponsorshipUS: '',
  gender: '',
  race: '',
  veteran: '',
  disability: '',
  transgender: '',
  hispanicLatino: '',
  pronouns: '',
};

export const EMPTY_BID_PREFERENCES: BidPreferences = {
  priorEmployment: 'no',
  hasRelevantExperience: 'yes',
  howDidYouHear: 'LinkedIn',
  salaryExpectation: '',
  highestDegree: '',
  over18: 'yes',
  ageRange: '',
};

export const RESUME_SCHEMA_VERSION = '1.0.0';
