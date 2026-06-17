import { Router } from 'express';
import { JobSearchRequestSchema, runJobSearch } from '../controllers/jobSearch.controller.js';
import { validateBody } from '../middleware/validate.js';

export const jobSearchRoutes = Router();

jobSearchRoutes.post('/', validateBody(JobSearchRequestSchema), runJobSearch);
