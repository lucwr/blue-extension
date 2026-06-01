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
    // Senior resumes typically land in 3-4K output tokens — 4.5K trims padding
    // latency for the common case (output generation is the wall-clock
    // bottleneck). Length-truncation responses are now auto-retried at +50%
    // in llm.service.ts, so the rare longer output is still handled safely.
    maxTokens: 4500,
    temperature: 0.3,
  });

  return applyAtsRules(draft, input.templateId);
}
