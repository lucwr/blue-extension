import { config } from '../config.js';
import { analyzeJdPrompt } from '../prompts/index.js';
import { AnalyzedJdSchema, type AnalyzedJd, type ExtractedJd } from '../schemas/jd.schema.js';
import { jsonCompletion } from './claude.service.js';

export async function analyzeJobDescription(jd: ExtractedJd): Promise<AnalyzedJd> {
  return jsonCompletion({
    label: analyzeJdPrompt.version,
    model: config.anthropic.models.analyze,
    prompt: analyzeJdPrompt.build(jd),
    schema: AnalyzedJdSchema,
    // Classification-style task — keep effort low; the schema does the heavy lifting.
    effort: 'low',
  });
}
