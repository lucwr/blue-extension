import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ExtractedJdSchema } from '../schemas/jd.schema.js';
import { analyzeJobDescription } from '../services/analyze.service.js';

export const AnalyzeRequestSchema = z.object({
  jd: ExtractedJdSchema,
});

export const analyzeJd: RequestHandler = async (req, res, next) => {
  try {
    const { jd } = req.body as z.infer<typeof AnalyzeRequestSchema>;
    const analysis = await analyzeJobDescription(jd);
    res.json({ analysis });
  } catch (err) {
    next(err);
  }
};
