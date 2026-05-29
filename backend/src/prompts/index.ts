/**
 * Prompt registry. Each prompt is a pure function that returns the system +
 * user content for a chat completion.
 *
 * Contract:
 *   1. System prompt declares output rules INCLUDING the JSON schema spec —
 *      OpenRouter's `response_format: { type: 'json_object' }` mode only
 *      guarantees parseable JSON, not schema conformance, so the system
 *      prompt + Zod validation do the heavy lifting.
 *   2. User prompt carries the actual inputs.
 *   3. Each prompt carries a `version` for A/B and observability.
 */

export interface PromptOutput {
  system: string;
  user: string;
}

export interface PromptModule<TInput> {
  version: string;
  build: (input: TInput) => PromptOutput;
}

export { analyzeJdPrompt } from './analyzeJd.prompt.js';
export { generateResumePrompt } from './generateResume.prompt.js';
export { generateProposalPrompt } from './generateProposal.prompt.js';
export { parseResumePrompt } from './parseResume.prompt.js';
