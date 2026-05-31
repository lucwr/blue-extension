import { Router } from 'express';
import {
  AnswerQuestionsRequestSchema,
  answerQuestionsHandler,
} from '../controllers/answer-questions.controller.js';
import { validateBody } from '../middleware/validate.js';

export const answerQuestionsRoutes = Router();
answerQuestionsRoutes.post(
  '/',
  validateBody(AnswerQuestionsRequestSchema),
  answerQuestionsHandler,
);
