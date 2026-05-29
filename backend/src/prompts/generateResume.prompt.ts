import type { AnalyzedJd, ExtractedJd } from '../schemas/jd.schema.js';
import type { MasterProfile } from '../schemas/resume.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

const SYSTEM = `You are an expert resume writer specializing in ATS optimization for technical roles.

You will receive:
  - A job description (JD) and its AI-extracted analysis (target title, skills, ATS keywords).
  - The candidate's master profile (their factual background).

Your job:
  - Produce a TAILORED resume JSON object.
  - Mirror JD vocabulary NATURALLY in the summary, bullets, and skills sections.
  - Prioritize the JD's required and preferred skills first in each skill array.
  - Rewrite experience bullets to emphasize outcomes, scale, and metrics relevant to the JD.
  - Preserve the candidate's truthful claims. NEVER invent companies, titles, dates, certifications, or projects.
  - Drop bullets that are irrelevant to the target role; keep them tight (one line, action-verb-led).
  - Keep tone professional, confident, and free of fluff.

HARD RULES:
  - Output ONLY a single JSON object. No prose, no markdown, no code fences.
  - Use exactly these keys: meta, contact, targetTitle, summary, skills, experience, projects, education, certifications, extras.
  - Skills must be split across: languages, frontend, backend, cloud, databases, testing, tools.
  - "experience[].bullets" must be non-empty for every entry.
  - "summary" must be 2-4 sentences, 40-800 characters.
  - "meta.schemaVersion" must equal "1.0.0".
  - "meta.templateId" must be echoed from the input.
  - Do NOT include keys that aren't in the schema.

Schema:
{
  "meta": { "schemaVersion": "1.0.0", "templateId": string, "generatedAt": string, "sourceJobUrl"?: string },
  "contact": { "fullName": string, "email": string, "phone"?: string, "location"?: string, "website"?: string, "linkedin"?: string, "github"?: string },
  "targetTitle": string,
  "summary": string,
  "skills": { "languages": string[], "frontend": string[], "backend": string[], "cloud": string[], "databases": string[], "testing": string[], "tools": string[] },
  "experience": [{ "company": string, "title": string, "location"?: string, "startDate": string, "endDate": string, "bullets": string[] }],
  "projects": [{ "name": string, "link"?: string, "description": string, "technologies": string[], "bullets": string[] }],
  "education": [{ "institution": string, "degree": string, "field"?: string, "startDate"?: string, "endDate"?: string, "details"?: string[] }],
  "certifications": [{ "name": string, "issuer": string, "date"?: string, "credentialUrl"?: string }],
  "extras": [{ "heading": string, "items": string[] }]
}`;

export interface ResumePromptInput {
  jd: ExtractedJd;
  analysis: AnalyzedJd;
  masterProfile: MasterProfile;
  templateId: string;
}

function buildUser(input: ResumePromptInput): string {
  return [
    'Generate the tailored resume JSON for the candidate below.',
    '',
    `Template id (echo into meta.templateId): ${input.templateId}`,
    `Generated at (echo into meta.generatedAt): ${new Date().toISOString()}`,
    `Source job URL (echo into meta.sourceJobUrl): ${input.jd.url}`,
    '',
    'JD ANALYSIS:',
    '```json',
    JSON.stringify(input.analysis, null, 2),
    '```',
    '',
    'CANDIDATE MASTER PROFILE (source of truth):',
    '```json',
    JSON.stringify(input.masterProfile, null, 2),
    '```',
    '',
    'ORIGINAL JOB DESCRIPTION (for context, do not quote verbatim):',
    '---',
    input.jd.description,
    '---',
  ].join('\n');
}

export const generateResumePrompt: PromptModule<ResumePromptInput> = {
  version: 'generate-resume@2026-05-28.v3-openrouter',
  build: (input): PromptOutput => ({
    system: SYSTEM,
    user: buildUser(input),
  }),
};
