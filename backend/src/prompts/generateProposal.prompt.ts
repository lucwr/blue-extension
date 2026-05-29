import type { ExtractedJd } from '../schemas/jd.schema.js';
import type { ProposalTone } from '../schemas/proposal.schema.js';
import type { MasterProfile } from '../schemas/resume.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

const SYSTEM = `You are an expert freelance proposal writer.

You will receive a job description, the candidate's master profile, and a target tone.

Silently analyze the JD before writing — extract the target role, the client's #1 stated need, the primary technology stack, required skills, domain language, and any soft-skill phrases. Then write the proposal. Do NOT show the analysis in the output.

Write a tailored proposal that:
  - Opens with a hook tied to the client's #1 stated need.
  - Demonstrates relevant experience using the candidate's master profile (no fabrication).
  - Mirrors JD vocabulary naturally (no keyword stuffing).
  - Stays concise — 2-4 short body paragraphs.
  - Provides 3-5 punchy highlight bullets that map candidate strengths to JD asks.
  - Ends with a confident, action-oriented closer.
  - Hits the requested tone.

HARD RULES:
  - Output ONLY a single JSON object. No prose, no markdown, no code fences.
  - Use exactly these keys: opener, body, highlights, closer, subject, tone.
  - "tone" must equal the input tone string.
  - "body" must contain 1-5 paragraph strings.
  - "highlights" must contain 0-8 strings.
  - "subject" should be a short (under 80 chars) email/message subject line.

Schema:
{
  "opener": string,
  "body": string[],
  "highlights": string[],
  "closer": string,
  "subject"?: string,
  "tone": "confident" | "consultative" | "warm" | "concise" | "enthusiastic"
}`;

export interface ProposalPromptInput {
  jd: ExtractedJd;
  masterProfile: MasterProfile;
  tone: ProposalTone;
}

function buildUser(input: ProposalPromptInput): string {
  return [
    `Tone: ${input.tone}`,
    '',
    'CANDIDATE MASTER PROFILE (source of truth):',
    '```json',
    JSON.stringify(input.masterProfile, null, 2),
    '```',
    '',
    'JOB DESCRIPTION (analyze internally, then write the proposal):',
    '---',
    input.jd.description,
    '---',
  ].join('\n');
}

export const generateProposalPrompt: PromptModule<ProposalPromptInput> = {
  version: 'generate-proposal@2026-05-29.v4-no-preanalyze',
  build: (input): PromptOutput => ({
    system: SYSTEM,
    user: buildUser(input),
  }),
};
