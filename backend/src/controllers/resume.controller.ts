import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AnalyzedJdSchema, ExtractedJdSchema } from '../schemas/jd.schema.js';
import { MasterProfileSchema } from '../schemas/resume.schema.js';
import { generateResume } from '../services/resume.service.js';

export const ResumeRequestSchema = z.object({
  jd: ExtractedJdSchema,
  analysis: AnalyzedJdSchema,
  masterProfile: MasterProfileSchema,
  templateId: z.string().min(1).max(60),
});

export const generateResumeHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as z.infer<typeof ResumeRequestSchema>;
    const resume = await generateResume(input);
    res.json({ resume });
  } catch (err) {
    next(err);
  }
};
