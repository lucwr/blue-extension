import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export class HttpError extends Error {
  override readonly name = 'HttpError';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    logger.warn({ path: req.path, code: err.code, status: err.status }, err.message);
    res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    return;
  }

  if (err instanceof ZodError) {
    logger.warn({ path: req.path, issues: err.issues }, 'request validation failed');
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Request payload failed validation',
      details: err.flatten(),
    });
    return;
  }

  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'Unknown server error',
  });
};
