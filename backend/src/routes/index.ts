import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { answerQuestionsRoutes } from './answer-questions.routes.js';
import { jobSearchRoutes } from './jobSearch.routes.js';
import { profileRoutes } from './profile.routes.js';
import { proposalRoutes } from './proposal.routes.js';
import { resumeRoutes } from './resume.routes.js';

export function buildApiRouter(): Router {
  const api = Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0' });
  });

  api.use(apiLimiter);
  api.use(requireAuth);

  api.use('/resume', resumeRoutes);
  api.use('/proposal', proposalRoutes);
  api.use('/profile', profileRoutes);
  api.use('/answer-questions', answerQuestionsRoutes);
  api.use('/job-search', jobSearchRoutes);

  return api;
}
