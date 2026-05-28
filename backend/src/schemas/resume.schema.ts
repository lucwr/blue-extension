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

export const ResumeSkillsSchema = z.object({
  languages: z.array(z.string().min(1).max(60)).max(30),
  frontend: z.array(z.string().min(1).max(60)).max(30),
  backend: z.array(z.string().min(1).max(60)).max(30),
  cloud: z.array(z.string().min(1).max(60)).max(20),
  databases: z.array(z.string().min(1).max(60)).max(20),
  testing: z.array(z.string().min(1).max(60)).max(20),
  tools: z.array(z.string().min(1).max(60)).max(30),
});
export type ResumeSkills = z.infer<typeof ResumeSkillsSchema>;

export const ResumeExperienceSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  location: z.string().max(120).optional(),
  startDate: z.string().min(1).max(20),
  endDate: z.string().min(1).max(20),
  bullets: z.array(z.string().min(8).max(400)).min(1).max(10),
});

export const ResumeProjectSchema = z.object({
  name: z.string().min(1).max(200),
  link: z.string().max(300).optional(),
  description: z.string().min(1).max(500),
  technologies: z.array(z.string().min(1).max(60)).max(20),
  bullets: z.array(z.string().min(8).max(400)).max(6),
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
  items: z.array(z.string().min(1).max(300)).max(12),
});

export const ResumeMetaSchema = z.object({
  schemaVersion: z.string().min(1).max(20),
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

export const MasterProfileSchema = z.object({
  contact: ResumeContactSchema,
  summary: z.string().max(1000),
  skills: ResumeSkillsSchema,
  experience: z.array(ResumeExperienceSchema).max(20),
  projects: z.array(ResumeProjectSchema).max(20),
  education: z.array(ResumeEducationSchema).max(10),
  certifications: z.array(ResumeCertificationSchema).max(20),
  extras: z.array(ResumeExtraSchema).max(6),
});
export type MasterProfile = z.infer<typeof MasterProfileSchema>;

export const RESUME_SCHEMA_VERSION = '1.0.0';
