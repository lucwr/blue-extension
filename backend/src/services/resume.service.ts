import { config } from '../config.js';
import { generateResumePrompt } from '../prompts/index.js';
import type { ExtractedJd } from '../schemas/jd.schema.js';
import {
  ResumeJsonSchema,
  type MasterProfile,
  type ResumeJson,
} from '../schemas/resume.schema.js';
import { applyAtsRules } from './ats.service.js';
import { jsonCompletion } from './llm.service.js';

interface GenerateResumeArgs {
  jd: ExtractedJd;
  masterProfile: MasterProfile;
  templateId: string;
}

export async function generateResume(input: GenerateResumeArgs): Promise<ResumeJson> {
  const draft = await jsonCompletion({
    label: generateResumePrompt.version,
    model: config.llm.models.resume,
    prompt: generateResumePrompt.build(input),
    schema: ResumeJsonSchema,
    // Senior resumes typically land in 3-4K output tokens — 6K is safe headroom
    // without inviting the model to over-produce. (Lower is the main lever for
    // wall-clock latency since output generation is the bottleneck.)
    maxTokens: 6144,
    temperature: 0.4,
  });

  return applyAtsRules(draft, input.templateId);
}
