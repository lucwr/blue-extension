import { config } from '../config.js';
import { generateProposalPrompt } from '../prompts/index.js';
import type { AnalyzedJd, ExtractedJd } from '../schemas/jd.schema.js';
import { ProposalJsonSchema, type ProposalJson, type ProposalTone } from '../schemas/proposal.schema.js';
import type { MasterProfile } from '../schemas/resume.schema.js';
import { jsonCompletion } from './llm.service.js';

interface GenerateProposalArgs {
  jd: ExtractedJd;
  analysis: AnalyzedJd;
  masterProfile: MasterProfile;
  tone: ProposalTone;
}

export async function generateProposal(input: GenerateProposalArgs): Promise<ProposalJson> {
  return jsonCompletion({
    label: generateProposalPrompt.version,
    model: config.llm.models.proposal,
    prompt: generateProposalPrompt.build(input),
    schema: ProposalJsonSchema,
    // Creative-but-constrained — a touch higher temperature than analyze/resume.
    temperature: 0.6,
  });
}
