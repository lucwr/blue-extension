import { Router } from 'express';
import {
  ProposalRequestSchema,
  generateProposalHandler,
} from '../controllers/proposal.controller.js';
import { validateBody } from '../middleware/validate.js';

export const proposalRoutes = Router();
proposalRoutes.post('/', validateBody(ProposalRequestSchema), generateProposalHandler);
