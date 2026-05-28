/**
 * JWT auth middleware. Phase-1 stance:
 *   - If the request carries a Bearer token, verify it and attach `req.auth`.
 *   - If no token is present and we are in dev mode, we still allow through
 *     so a freshly-installed extension can hit /api/health before the
 *     enrollment flow exists. In production we 401 instead.
 *
 * A future `/api/auth/enroll` endpoint will issue tokens to extension
 * installations. That route is intentionally not implemented yet (Phase 5).
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './errorHandler.js';

export interface AuthClaims {
  sub: string;
  iat: number;
  exp: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthClaims;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    if (config.isDev) {
      next();
      return;
    }
    next(new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const claims = jwt.verify(token, config.jwt.secret) as AuthClaims;
    req.auth = claims;
    next();
  } catch (err) {
    next(
      new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token', {
        reason: err instanceof Error ? err.message : 'unknown',
      }),
    );
  }
}

export function signToken(subject: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  return jwt.sign({ sub: subject }, config.jwt.secret, { expiresIn: ttlSeconds });
}
