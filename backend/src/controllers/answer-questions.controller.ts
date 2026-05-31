import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ExtractedJdSchema } from '../schemas/jd.schema.js';
import { MasterProfileSchema, ResumeJsonSchema } from '../schemas/resume.schema.js';
import { answerQuestions } from '../services/answerQuestions.service.js';

export const AnswerQuestionsRequestSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        question: z.string().min(3).max(2000),
        /**
         * What kind of field the answer will be written into. Defaults to
         * 'textarea' for backward compatibility — the LLM uses this to size
         * the response. For 'select', the answer MUST be one of `options`
         * verbatim, else the popup will leave the field blank.
         */
        fieldKind: z.enum(['input', 'textarea', 'select']).default('textarea'),
        options: z.array(z.string().min(1).max(300)).max(60).optional(),
      }),
    )
    .min(1)
    .max(32),
  jd: ExtractedJdSchema,
  resume: ResumeJsonSchema,
  masterProfile: MasterProfileSchema,
});

export const answerQuestionsHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as z.infer<typeof AnswerQuestionsRequestSchema>;
    const result = await answerQuestions(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
