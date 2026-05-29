import { Router } from 'express';
import { ImportPdfRequestSchema, importResumePdf } from '../controllers/profile.controller.js';
import { validateBody } from '../middleware/validate.js';

export const profileRoutes = Router();

profileRoutes.post('/import-pdf', validateBody(ImportPdfRequestSchema), importResumePdf);
