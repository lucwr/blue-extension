import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AnalyzedJdSchema, ExtractedJdSchema } from '../schemas/jd.schema.js';
import { ProposalToneSchema } from '../schemas/proposal.schema.js';
import { MasterProfileSchema } from '../schemas/resume.schema.js';
import { generateProposal } from '../services/proposal.service.js';

export const ProposalRequestSchema = z.object({
  jd: ExtractedJdSchema,
  analysis: AnalyzedJdSchema,
  masterProfile: MasterProfileSchema,
  tone: ProposalToneSchema,
});

export const generateProposalHandler: RequestHandler = async (req, res, next) => {
  try {
    const input = req.body as z.infer<typeof ProposalRequestSchema>;
    const proposal = await generateProposal(input);
    res.json({ proposal });
  } catch (err) {
    next(err);
  }
};
