import { z } from 'zod';
import { config } from '../config.js';
import { answerQuestionsPrompt, type AnswerQuestionsInput } from '../prompts/answerQuestions.prompt.js';
import { jsonCompletion } from './llm.service.js';

/**
 * Schema for the model's response. Each answer must echo the input id so we
 * can match it back to the originating field. We cap text length so a
 * runaway answer can't blow past a bid form's input limit.
 */
const ResponseSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        text: z.string().min(1).max(1200),
      }),
    )
    .max(32),
});

export type AnswerQuestionsResponse = z.infer<typeof ResponseSchema>;

export async function answerQuestions(
  input: AnswerQuestionsInput,
): Promise<AnswerQuestionsResponse> {
  if (input.questions.length === 0) {
    return { answers: [] };
  }

  return jsonCompletion({
    label: answerQuestionsPrompt.version,
    // Q&A goes on Haiku by default — short answers, latency-sensitive.
    // Override with LLM_MODEL_QA if you want proposal-tier quality.
    model: config.llm.models.qa,
    prompt: answerQuestionsPrompt.build(input),
    schema: ResponseSchema,
    // Short, varied answers — slightly higher temperature than resume gen.
    temperature: 0.55,
    maxTokens: 2048,
  });
}
