import type { AnalyzedJd, ExtractedJd } from '../schemas/jd.schema.js';
import type { MasterProfile } from '../schemas/resume.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

const SYSTEM = `You are an expert resume writer specializing in ATS optimization for technical roles.

You receive a job description (JD), its AI analysis (target title, skills, ATS keywords), and the candidate's master profile (their factual background).

Produce a tailored resume:
- Mirror JD vocabulary NATURALLY in the summary, bullets, and skills sections.
- Prioritize the JD's required and preferred skills first in each skill array.
- Rewrite experience bullets to emphasize outcomes, scale, and JD-relevant metrics.
- Preserve the candidate's truthful claims. NEVER invent companies, titles, dates, certifications, or projects.
- Drop bullets irrelevant to the target role; keep them tight, one line, action-verb-led.
- Use a professional, confident tone without fluff.

Field-level rules:
- "summary" should be 2-4 sentences and around 60-700 characters.
- "experience[].bullets" must be non-empty for every entry.
- "meta.schemaVersion" must equal "1.0.0".
- "meta.templateId" must echo the template id from the input.
- "meta.generatedAt" must be the current ISO-8601 timestamp.
- "meta.sourceJobUrl" must echo the source URL from the input.`;

export interface ResumePromptInput {
  jd: ExtractedJd;
  analysis: AnalyzedJd;
  masterProfile: MasterProfile;
  templateId: string;
}

function buildPerRequest(input: ResumePromptInput): string {
  return [
    `Template id (echo into meta.templateId): ${input.templateId}`,
    `Generated at (echo into meta.generatedAt): ${new Date().toISOString()}`,
    `Source job URL (echo into meta.sourceJobUrl): ${input.jd.url}`,
    '',
    'JD ANALYSIS:',
    '```json',
    JSON.stringify(input.analysis, null, 2),
    '```',
    '',
    'ORIGINAL JOB DESCRIPTION (for context, do not quote verbatim):',
    '---',
    input.jd.description,
    '---',
  ].join('\n');
}

export const generateResumePrompt: PromptModule<ResumePromptInput> = {
  version: 'generate-resume@2026-05-28.v2',
  build: (input): PromptOutput => ({
    system: SYSTEM,
    // Block 1 (cached): master profile — stable per user across many JDs.
    // Block 2 (uncached): JD + analysis + per-request meta — varies every call.
    userBlocks: [
      {
        text: [
          'CANDIDATE MASTER PROFILE (source of truth — never invent beyond this):',
          '```json',
          JSON.stringify(input.masterProfile, null, 2),
          '```',
        ].join('\n'),
        cache: true,
      },
      { text: buildPerRequest(input) },
    ],
  }),
};
