import { z } from 'zod';

export const ProposalToneSchema = z.enum([
  'confident',
  'consultative',
  'warm',
  'concise',
  'enthusiastic',
]);
export type ProposalTone = z.infer<typeof ProposalToneSchema>;

export const ProposalJsonSchema = z.object({
  opener: z.string().min(20).max(500),
  body: z.array(z.string().min(40).max(1000)).min(1).max(5),
  highlights: z.array(z.string().min(8).max(300)).max(8),
  closer: z.string().min(10).max(400),
  subject: z.string().min(4).max(120).optional(),
  tone: ProposalToneSchema,
});
export type ProposalJson = z.infer<typeof ProposalJsonSchema>;
