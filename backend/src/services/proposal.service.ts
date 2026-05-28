import { config } from '../config.js';
import { generateProposalPrompt } from '../prompts/index.js';
import type { AnalyzedJd, ExtractedJd } from '../schemas/jd.schema.js';
import { type ProposalJson, type ProposalTone } from '../schemas/proposal.schema.js';
import { ProposalJsonSchema } from '../schemas/proposal.schema.js';
import type { MasterProfile } from '../schemas/resume.schema.js';
import { jsonCompletion } from './claude.service.js';

interface GenerateProposalArgs {
  jd: ExtractedJd;
  analysis: AnalyzedJd;
  masterProfile: MasterProfile;
  tone: ProposalTone;
}

export async function generateProposal(input: GenerateProposalArgs): Promise<ProposalJson> {
  return jsonCompletion({
    label: generateProposalPrompt.version,
    model: config.anthropic.models.proposal,
    prompt: generateProposalPrompt.build(input),
    schema: ProposalJsonSchema,
    // Proposals are creative-but-constrained — medium gives the best ratio.
    effort: 'medium',
  });
}
