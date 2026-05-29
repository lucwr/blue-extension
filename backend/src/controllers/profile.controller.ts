import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ImportPdfRequestSchema } from '../schemas/profile.schema.js';
import { parseResumePdf } from '../services/parseResume.service.js';

export { ImportPdfRequestSchema };

export const importResumePdf: RequestHandler = async (req, res, next) => {
  try {
    const { pdfBase64 } = req.body as z.infer<typeof ImportPdfRequestSchema>;
    const profile = await parseResumePdf(pdfBase64);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
};
