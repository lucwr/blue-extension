import type { ExtractedJd } from '../schemas/jd.schema.js';
import type { MasterProfile, ResumeJson } from '../schemas/resume.schema.js';
import type { PromptModule, PromptOutput } from './index.js';

/**
 * Bid-form short-answer generator.
 *
 * Given a batch of free-text questions from a bid/application form and the
 * candidate's full context (JD + tailored resume + master profile), produce
 * one truthful answer per question. Each answer:
 *
 *   - Is 2-4 sentences, NEVER longer than 600 characters.
 *   - Reads like a real engineer wrote it on the application form (not a
 *     marketing pitch, not a cover letter, not an essay).
 *   - Grounds claims in the candidate's actual experience (no fabrication).
 *   - Mirrors JD vocabulary naturally where it fits — but never crammed.
 *   - Avoids the AI-tell phrases listed below.
 *   - Avoids re-stating the question.
 *
 * Output is a JSON object: { answers: [{ id, text }, ...] } where each
 * `id` echoes the question id verbatim so the popup can match answers to
 * fields.
 */
const SYSTEM = `You are answering free-text questions on a job application form on behalf of the candidate. You receive the candidate's background (master profile + tailored resume) and the original job description.

RULES — write like a real senior engineer typed this into the form, not like an AI assistant:
- 2-4 sentences per answer, max 600 characters.
- Plain, direct, specific. No filler ("I'm excited to", "I'm passionate about").
- Use first person ("I"), present tense where possible.
- Vary sentence length and structure across answers — don't fall into a template.
- Ground every claim in the candidate's actual experience from the master profile.
- Use the JD's vocabulary naturally when it fits the candidate's truth — but no keyword stuffing.
- Don't re-state the question.
- Don't open with the answer's name (don't say "Why I want this role: …" — just answer).
- Don't be sycophantic about the company.

AVOID these AI-tell phrases and patterns:
- "I'm thrilled / excited / passionate / eager to"
- "deeply / truly / genuinely"
- "in today's fast-paced world"
- "leveraging cutting-edge"
- "I would love the opportunity to"
- "Throughout my career"
- "in addition to my technical skills"
- "perfectly aligns with"
- "a strong fit"
- starting every answer with "I" (vary the opening)
- ending with "I look forward to"

TRUTH RULES (non-negotiable):
- Never invent companies, dates, titles, projects, or numbers the candidate doesn't have.
- If a question asks about something not in the profile (e.g. "describe your experience with X"), acknowledge with what IS in the profile that's adjacent. Be honest about it. Don't fake it.
- Never claim credentials (security clearance, certifications, education) that aren't in the profile.

OUTPUT FORMAT — single JSON object, no prose, no markdown:
{
  "answers": [
    { "id": "<echoed verbatim>", "text": "<the answer string>" },
    ...
  ]
}

There must be one entry per input question, in the same order, with the SAME id strings.`;

export interface AnswerQuestionsInput {
  questions: Array<{ id: string; question: string }>;
  jd: ExtractedJd;
  resume: ResumeJson;
  masterProfile: MasterProfile;
}

function buildUser(input: AnswerQuestionsInput): string {
  return [
    'Answer the questions below. Return one JSON object as specified.',
    '',
    'QUESTIONS:',
    '```json',
    JSON.stringify(input.questions, null, 2),
    '```',
    '',
    'CANDIDATE MASTER PROFILE (source of truth — do not invent beyond this):',
    '```json',
    JSON.stringify(input.masterProfile, null, 2),
    '```',
    '',
    'TAILORED RESUME (for context only, already produced for this JD):',
    '```json',
    JSON.stringify(
      {
        targetTitle: input.resume.targetTitle,
        summary: input.resume.summary,
        skills: input.resume.skills,
        experience: input.resume.experience.map((r) => ({
          company: r.company,
          title: r.title,
          startDate: r.startDate,
          endDate: r.endDate,
          bullets: r.bullets,
        })),
      },
      null,
      2,
    ),
    '```',
    '',
    'ORIGINAL JOB DESCRIPTION:',
    '---',
    input.jd.description,
    '---',
  ].join('\n');
}

export const answerQuestionsPrompt: PromptModule<AnswerQuestionsInput> = {
  version: 'answer-questions@2026-05-29.v1',
  build: (input): PromptOutput => ({
    system: SYSTEM,
    user: buildUser(input),
  }),
};
