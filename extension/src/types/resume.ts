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
}

export const RESUME_SCHEMA_VERSION = '1.0.0';
