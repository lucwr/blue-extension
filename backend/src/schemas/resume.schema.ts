import { z } from 'zod';

export const ResumeContactSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  location: z.string().max(120).optional(),
  website: z.string().max(200).optional(),
  linkedin: z.string().max(200).optional(),
  github: z.string().max(200).optional(),
});
export type ResumeContact = z.infer<typeof ResumeContactSchema>;

/**
 * Every skill bucket defaults to []. The static SYSTEM prompt tells the
 * model to "remove" categories that aren't relevant to the JD — if it does
 * that, Zod would otherwise reject the JSON with
 * "skills.cloud: Required; skills.testing: Required". Default-to-empty
 * means an omitted bucket is treated as no skills in that category, which
 * is exactly the intended semantics.
 */
export const ResumeSkillsSchema = z.object({
  languages: z.array(z.string().min(1).max(60)).max(30).default([]),
  frontend: z.array(z.string().min(1).max(60)).max(30).default([]),
  backend: z.array(z.string().min(1).max(60)).max(30).default([]),
  cloud: z.array(z.string().min(1).max(60)).max(20).default([]),
  databases: z.array(z.string().min(1).max(60)).max(20).default([]),
  testing: z.array(z.string().min(1).max(60)).max(20).default([]),
  tools: z.array(z.string().min(1).max(60)).max(30).default([]),
});
export type ResumeSkills = z.infer<typeof ResumeSkillsSchema>;

export const ResumeExperienceSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  location: z.string().max(120).optional(),
  startDate: z.string().min(1).max(20),
  endDate: z.string().min(1).max(20),
  // Bumped from 10 to 12 — the user's prompt allows 5-8 bullets per recent
  // role plus 3-5 for older roles, and the model occasionally produces 11-12
  // for very senior roles when the JD lists many distinct asks.
  bullets: z.array(z.string().min(8).max(400)).min(1).max(12),
});

export const ResumeProjectSchema = z.object({
  name: z.string().min(1).max(200),
  link: z.string().max(300).optional(),
  description: z.string().min(1).max(500),
  technologies: z.array(z.string().min(1).max(60)).max(20),
  // Bumped 6 → 10 for the same reason as experience bullets above.
  bullets: z.array(z.string().min(8).max(400)).max(10),
});

export const ResumeEducationSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().min(1).max(200),
  field: z.string().max(200).optional(),
  startDate: z.string().max(20).optional(),
  endDate: z.string().max(20).optional(),
  details: z.array(z.string().max(300)).max(6).optional(),
});

export const ResumeCertificationSchema = z.object({
  name: z.string().min(1).max(200),
  issuer: z.string().min(1).max(200),
  date: z.string().max(20).optional(),
  credentialUrl: z.string().max(300).optional(),
});

export const ResumeExtraSchema = z.object({
  heading: z.string().min(1).max(80),
  // Bumped 12 → 30. After we added the ATS umbrella-phrase preservation
  // rule, the model produces larger AI/ML / Security / Soft Skills / Tools
  // buckets in `extras` (each can legitimately hold 15-25 phrases). The
  // tight 12-cap was the cause of "Output failed schema validation:
  // extras.0.items: Array must contain at most 12 element(s)".
  items: z.array(z.string().min(1).max(300)).max(30),
});

export const ResumeMetaSchema = z.object({
  // Defaults to the current version so a model that forgets to echo it
  // doesn't trip the pipeline. Templates only ever support one version.
  schemaVersion: z.string().min(1).max(20).default('1.0.0'),
  templateId: z.string().min(1).max(60),
  generatedAt: z.string().min(1).max(40),
  sourceJobUrl: z.string().url().optional(),
});

export const ResumeJsonSchema = z.object({
  meta: ResumeMetaSchema,
  contact: ResumeContactSchema,
  targetTitle: z.string().min(1).max(120),
  summary: z.string().min(40).max(800),
  skills: ResumeSkillsSchema,
  experience: z.array(ResumeExperienceSchema).max(12),
  projects: z.array(ResumeProjectSchema).max(8),
  education: z.array(ResumeEducationSchema).max(6),
  certifications: z.array(ResumeCertificationSchema).max(10),
  extras: z.array(ResumeExtraSchema).max(4),
});
export type ResumeJson = z.infer<typeof ResumeJsonSchema>;

/**
 * Demographics / EEO fields. All optional — the candidate fills these once
 * in the Profile tab so the auto-fill engine can answer the common bid-form
 * questions (work auth, sponsorship, race, gender, veteran, disability,
 * pronouns) without re-prompting per application.
 *
 * Yes/No fields are strings so the autofill can match the literal option
 * text the bid form uses (e.g. "Yes", "No", "Prefer not to say").
 */
export const ResumeDemographicsSchema = z.object({
  /** US work authorization. Common Yes/No question on US bid forms. */
  workAuthorizedUS: z.enum(['yes', 'no', 'prefer-not-to-say', '']).default(''),
  /** Whether the candidate requires visa sponsorship now or in the future. */
  requiresSponsorshipUS: z.enum(['yes', 'no', 'prefer-not-to-say', '']).default(''),
  /** Free-form so it matches whatever bucket label the form uses. */
  gender: z.string().max(80).default(''),
  /** Free-form (e.g. "Asian", "Black or African American", "Prefer not to say"). */
  race: z.string().max(120).default(''),
  /** Veteran status: free-form (US EEO categories vary by form). */
  veteran: z.string().max(120).default(''),
  /** Self-identified disability status. */
  disability: z.string().max(120).default(''),
  /** Self-identified transgender status (separate Greenhouse question on many forms). */
  transgender: z.enum(['yes', 'no', 'prefer-not-to-say', '']).default(''),
  /** Pronouns the candidate prefers (e.g. "she/her", "they/them"). */
  pronouns: z.string().max(40).default(''),
});
export type ResumeDemographics = z.infer<typeof ResumeDemographicsSchema>;

/**
 * User-configurable defaults for the open-ended-but-predictable bid form
 * questions ("Have you worked for us before?", "How did you hear?", salary).
 * Lets the autofill engine answer deterministically without round-tripping
 * the LLM for every form.
 */
export const BidPreferencesSchema = z.object({
  priorEmployment: z.enum(['yes', 'no', 'prefer-not-to-say', '']).default('no'),
  hasRelevantExperience: z.enum(['yes', 'no', 'prefer-not-to-say', '']).default('yes'),
  howDidYouHear: z.string().max(120).default('LinkedIn'),
  salaryExpectation: z.string().max(200).default(''),
});
export type BidPreferences = z.infer<typeof BidPreferencesSchema>;

export const MasterProfileSchema = z.object({
  contact: ResumeContactSchema,
  summary: z.string().max(1000),
  skills: ResumeSkillsSchema,
  experience: z.array(ResumeExperienceSchema).max(20),
  projects: z.array(ResumeProjectSchema).max(20),
  education: z.array(ResumeEducationSchema).max(10),
  certifications: z.array(ResumeCertificationSchema).max(20),
  extras: z.array(ResumeExtraSchema).max(6),
  /** Optional — old profiles without this field still validate. */
  demographics: ResumeDemographicsSchema.optional(),
  /** Optional — defaults for common bid-form questions. */
  bidPreferences: BidPreferencesSchema.optional(),
});
export type MasterProfile = z.infer<typeof MasterProfileSchema>;

export const RESUME_SCHEMA_VERSION = '1.0.0';
