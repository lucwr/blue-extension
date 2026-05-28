import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * IP-based rate limiter for /api routes. In a multi-tenant deployment swap
 * the keyGenerator to use `req.auth.userId` from the JWT.
 */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Slow down and try again in a moment.',
  },
});
