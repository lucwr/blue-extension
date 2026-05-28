import type { ExtractedJd } from '../schemas/jd.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

const SYSTEM = `You are a senior technical recruiter and ATS expert. You analyze a single job description and describe the role.

Guidelines:
- Skills and keywords must be unique, lowercase-canonical (e.g. "typescript", "aws lambda", "ci/cd").
- If a field is unknown, return an empty array (or null for "domain").
- The "summary" should be a 2-3 sentence neutral description for a candidate.
- "seniority" must be one of: intern, junior, mid, senior, staff, principal, lead, unspecified.
- Do NOT include the company name as a skill or keyword.
- Do NOT fabricate technologies that are not mentioned or strongly implied.`;

function buildUserText(jd: ExtractedJd): string {
  return [
    'Analyze the following job posting.',
    '',
    `Source: ${jd.source}`,
    `Title (raw): ${jd.title}`,
    jd.company ? `Company (raw): ${jd.company}` : '',
    jd.location ? `Location: ${jd.location}` : '',
    jd.compensation ? `Compensation: ${jd.compensation}` : '',
    '',
    'JOB DESCRIPTION:',
    '---',
    jd.description,
    '---',
  ]
    .filter(Boolean)
    .join('\n');
}

export const analyzeJdPrompt: PromptModule<ExtractedJd> = {
  version: 'analyze-jd@2026-05-28.v2',
  // Analyze has no per-user stable preamble (no master profile in scope), so
  // only the system prompt is cached. JD is per-request and rides uncached.
  build: (jd): PromptOutput => ({
    system: SYSTEM,
    userBlocks: [{ text: buildUserText(jd) }],
  }),
};
