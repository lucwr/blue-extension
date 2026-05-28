import { z } from 'zod';

export const SourceSchema = z.enum([
  'upwork',
  'linkedin',
  'indeed',
  'freelancer',
  'remoteok',
  'wellfound',
  'generic',
]);

export const ExtractedJdSchema = z.object({
  source: SourceSchema,
  url: z.string().url(),
  title: z.string().min(1).max(500),
  company: z.string().max(500).nullable(),
  location: z.string().max(500).nullable(),
  compensation: z.string().max(500).nullable(),
  description: z.string().min(60).max(40_000),
  extractedAt: z.string().min(1),
  debug: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type ExtractedJd = z.infer<typeof ExtractedJdSchema>;

export const SenioritySchema = z.enum([
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'lead',
  'unspecified',
]);

export const AnalyzedJdSchema = z.object({
  targetTitle: z.string().min(1).max(120),
  seniority: SenioritySchema,
  domain: z.string().max(120).nullable(),
  requiredSkills: z.array(z.string().min(1).max(80)).max(40),
  preferredSkills: z.array(z.string().min(1).max(80)).max(40),
  frameworks: z.array(z.string().min(1).max(80)).max(40),
  cloud: z.array(z.string().min(1).max(80)).max(20),
  databases: z.array(z.string().min(1).max(80)).max(20),
  testing: z.array(z.string().min(1).max(80)).max(20),
  softSkills: z.array(z.string().min(1).max(80)).max(20),
  atsKeywords: z.array(z.string().min(1).max(80)).max(80),
  domainTerminology: z.array(z.string().min(1).max(80)).max(40),
  summary: z.string().min(20).max(1200),
});
export type AnalyzedJd = z.infer<typeof AnalyzedJdSchema>;
