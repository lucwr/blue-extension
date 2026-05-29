import type { ExtractedJd } from '../schemas/jd.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

const SYSTEM = `You are a senior technical recruiter and ATS expert.
You analyze a single job description and produce a STRICT JSON object that describes the role.

Rules:
- Output ONLY a single JSON object. No prose, no markdown, no code fences.
- Use the exact keys defined in the schema below. Never invent new keys.
- Arrays must contain unique, lowercase-canonical skill/keyword strings (e.g. "typescript", "aws lambda", "ci/cd").
- If a field is unknown, return an empty array (or null for "domain").
- "seniority" must be one of: intern, junior, mid, senior, staff, principal, lead, unspecified.
- "summary" is a 2-3 sentence neutral description for a candidate.
- Do NOT include the company name as a skill or keyword.
- Do NOT fabricate technologies that are not mentioned or strongly implied.

JSON schema:
{
  "targetTitle": string,
  "seniority": "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "lead" | "unspecified",
  "domain": string | null,
  "requiredSkills": string[],
  "preferredSkills": string[],
  "frameworks": string[],
  "cloud": string[],
  "databases": string[],
  "testing": string[],
  "softSkills": string[],
  "atsKeywords": string[],
  "domainTerminology": string[],
  "summary": string
}`;

function buildUser(jd: ExtractedJd): string {
  return [
    'Analyze the following job posting and return the JSON object as specified.',
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
  version: 'analyze-jd@2026-05-28.v3-openrouter',
  build: (jd): PromptOutput => ({
    system: SYSTEM,
    user: buildUser(jd),
  }),
};
