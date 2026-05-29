import { config } from '../config.js';
import { analyzeJdPrompt } from '../prompts/index.js';
import { AnalyzedJdSchema, type AnalyzedJd, type ExtractedJd } from '../schemas/jd.schema.js';
import { jsonCompletion } from './llm.service.js';

export async function analyzeJobDescription(jd: ExtractedJd): Promise<AnalyzedJd> {
  return jsonCompletion({
    label: analyzeJdPrompt.version,
    model: config.llm.models.analyze,
    prompt: analyzeJdPrompt.build(jd),
    schema: AnalyzedJdSchema,
    temperature: 0.2,
  });
}
