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
