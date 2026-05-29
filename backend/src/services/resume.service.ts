import { config } from '../config.js';
import { generateResumePrompt } from '../prompts/index.js';
import type { AnalyzedJd, ExtractedJd } from '../schemas/jd.schema.js';
import {
  ResumeJsonSchema,
  type MasterProfile,
  type ResumeJson,
} from '../schemas/resume.schema.js';
import { applyAtsRules } from './ats.service.js';
import { jsonCompletion } from './llm.service.js';

interface GenerateResumeArgs {
  jd: ExtractedJd;
  analysis: AnalyzedJd;
  masterProfile: MasterProfile;
  templateId: string;
}

export async function generateResume(input: GenerateResumeArgs): Promise<ResumeJson> {
  const draft = await jsonCompletion({
    label: generateResumePrompt.version,
    model: config.llm.models.resume,
    prompt: generateResumePrompt.build(input),
    schema: ResumeJsonSchema,
    // Resumes are long-form JSON — give headroom.
    maxTokens: 8192,
    temperature: 0.4,
  });

  return applyAtsRules(draft, input.analysis, input.templateId);
}
