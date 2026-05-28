import type { AnalyzedJd, ExtractedJd } from '../schemas/jd.schema.js';
import type { ProposalTone } from '../schemas/proposal.schema.js';
import type { MasterProfile } from '../schemas/resume.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

const SYSTEM = `You are an expert freelance proposal writer.

You receive a job description, its analysis, the candidate's master profile, and a target tone.

Write a tailored proposal that:
- Opens with a hook tied to the client's #1 stated need.
- Demonstrates relevant experience using the candidate's master profile (no fabrication).
- Mirrors JD vocabulary naturally (no keyword stuffing).
- Stays concise — 2-4 short body paragraphs.
- Provides 3-5 punchy highlight bullets mapping candidate strengths to JD asks.
- Ends with a confident, action-oriented closer.
- Hits the requested tone exactly.
- "tone" in the output must equal the input tone string.
- "subject" should be under 80 characters.`;

export interface ProposalPromptInput {
  jd: ExtractedJd;
  analysis: AnalyzedJd;
  masterProfile: MasterProfile;
  tone: ProposalTone;
}

function buildPerRequest(input: ProposalPromptInput): string {
  return [
    `Tone: ${input.tone}`,
    '',
    'JD ANALYSIS:',
    '```json',
    JSON.stringify(input.analysis, null, 2),
    '```',
    '',
    'JOB DESCRIPTION:',
    '---',
    input.jd.description,
    '---',
  ].join('\n');
}

export const generateProposalPrompt: PromptModule<ProposalPromptInput> = {
  version: 'generate-proposal@2026-05-28.v2',
  build: (input): PromptOutput => ({
    system: SYSTEM,
    // Same caching shape as the resume prompt: master profile cached, JD per-request.
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
