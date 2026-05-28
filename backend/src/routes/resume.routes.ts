import { Router } from 'express';
import { ResumeRequestSchema, generateResumeHandler } from '../controllers/resume.controller.js';
import { validateBody } from '../middleware/validate.js';

export const resumeRoutes = Router();
resumeRoutes.post('/', validateBody(ResumeRequestSchema), generateResumeHandler);
