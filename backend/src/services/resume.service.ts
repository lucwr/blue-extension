import { config } from '../config.js';
import { generateResumePrompt } from '../prompts/index.js';
import type { AnalyzedJd, ExtractedJd } from '../schemas/jd.schema.js';
import {
  ResumeJsonSchema,
  type MasterProfile,
  type ResumeJson,
} from '../schemas/resume.schema.js';
import { applyAtsRules } from './ats.service.js';
import { jsonCompletion } from './claude.service.js';

interface GenerateResumeArgs {
  jd: ExtractedJd;
  analysis: AnalyzedJd;
  masterProfile: MasterProfile;
  templateId: string;
}

export async function generateResume(input: GenerateResumeArgs): Promise<ResumeJson> {
  const draft = await jsonCompletion({
    label: generateResumePrompt.version,
    model: config.anthropic.models.resume,
    prompt: generateResumePrompt.build(input),
    schema: ResumeJsonSchema,
    // Resume gen is the highest-value generation; spend on it.
    effort: 'high',
    // Resumes are long-form JSON — give headroom.
    maxTokens: 8192,
  });

  return applyAtsRules(draft, input.analysis, input.templateId);
}
