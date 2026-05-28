import { Router } from 'express';
import { AnalyzeRequestSchema, analyzeJd } from '../controllers/analyze.controller.js';
import { validateBody } from '../middleware/validate.js';

export const analyzeRoutes = Router();
analyzeRoutes.post('/', validateBody(AnalyzeRequestSchema), analyzeJd);
