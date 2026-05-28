/**
 * Centralized, validated environment config. Crashes fast at boot if required
 * variables are missing so production never silently runs with bad defaults.
 */
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z
    .string()
    .default('8787')
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z.string().default('*'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars').default('dev-secret-please-replace-me'),

  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_ANALYZE: z.string().optional(),
  ANTHROPIC_MODEL_RESUME: z.string().optional(),
  ANTHROPIC_MODEL_PROPOSAL: z.string().optional(),
  ANTHROPIC_TIMEOUT_MS: z
    .string()
    .default('60000')
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  ANTHROPIC_MAX_VALIDATION_RETRIES: z
    .string()
    .default('2')
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(0).max(5)),

  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  RATE_LIMIT_MAX: z
    .string()
    .default('30')
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  port: parsed.data.PORT,
  env: parsed.data.NODE_ENV,
  isDev: parsed.data.NODE_ENV === 'development',
  corsOrigins:
    parsed.data.CORS_ORIGINS === '*'
      ? ('*' as const)
      : parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  jwt: {
    secret: parsed.data.JWT_SECRET,
  },
  anthropic: {
    apiKey: parsed.data.ANTHROPIC_API_KEY,
    models: {
      default: parsed.data.ANTHROPIC_MODEL,
      analyze: parsed.data.ANTHROPIC_MODEL_ANALYZE ?? parsed.data.ANTHROPIC_MODEL,
      resume: parsed.data.ANTHROPIC_MODEL_RESUME ?? parsed.data.ANTHROPIC_MODEL,
      proposal: parsed.data.ANTHROPIC_MODEL_PROPOSAL ?? parsed.data.ANTHROPIC_MODEL,
    },
    timeoutMs: parsed.data.ANTHROPIC_TIMEOUT_MS,
    maxValidationRetries: parsed.data.ANTHROPIC_MAX_VALIDATION_RETRIES,
  },
  rateLimit: {
    windowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    max: parsed.data.RATE_LIMIT_MAX,
  },
} as const;

export type AppConfig = typeof config;
