/**
 * Prompt registry. Each prompt is a pure function that returns the structured
 * input for a Claude `messages.parse()` call.
 *
 * The contract is intentionally tight:
 *   1. The system prompt declares *behavior* only — the JSON shape is enforced
 *      by `output_config.format` at the API layer, not by prose rules.
 *   2. User content is split into ordered blocks. Mark stable preambles (the
 *      candidate's master profile, fixed reference material) with `cache: true`
 *      so they ride the prompt cache across repeated requests.
 *   3. Each prompt carries a `version` for A/B and observability.
 */

/** One block of user content. The first block(s) you want cached must be marked. */
export interface UserBlock {
  text: string;
  /** When true, attaches a `cache_control: ephemeral` marker to this block. */
  cache?: boolean;
}

export interface PromptOutput {
  /** Behavior rules — always cached at the API layer. */
  system: string;
  /**
   * Ordered user content blocks. The block(s) with `cache: true` form the
   * cached prefix together with `system`; everything after rides uncached.
   */
  userBlocks: UserBlock[];
}

export interface PromptModule<TInput> {
  version: string;
  build: (input: TInput) => PromptOutput;
}

export { analyzeJdPrompt } from './analyzeJd.prompt.js';
export { generateResumePrompt } from './generateResume.prompt.js';
export { generateProposalPrompt } from './generateProposal.prompt.js';
