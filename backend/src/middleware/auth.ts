/**
 * JWT auth middleware. Phase-1 stance:
 *   - If the request carries a Bearer token, verify it and attach `req.auth`.
 *   - If no token is present, allow through (in every environment). The
 *     extension has no enrollment flow yet, so requiring a token in
 *     production would 401 every AI call (import-pdf, resume, proposal, …).
 *     Tokens that ARE sent are still verified and rejected when invalid.
 *
 * A future `/api/auth/enroll` endpoint will issue tokens to extension
 * installations (Phase 5). Once that ships, tighten this back up so a
 * missing token 401s in production.
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
    // No token: allow through until the enrollment flow (Phase 5) exists.
    next();
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
