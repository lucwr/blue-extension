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

  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),

  LLM_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  LLM_MODEL_ANALYZE: z.string().optional(),
  LLM_MODEL_RESUME: z.string().optional(),
  LLM_MODEL_PROPOSAL: z.string().optional(),
  LLM_TIMEOUT_MS: z
    .string()
    .default('60000')
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  LLM_MAX_VALIDATION_RETRIES: z
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
  llm: {
    apiKey: parsed.data.OPENROUTER_API_KEY,
    baseUrl: parsed.data.OPENROUTER_BASE_URL,
    models: {
      default: parsed.data.LLM_MODEL,
      analyze: parsed.data.LLM_MODEL_ANALYZE ?? parsed.data.LLM_MODEL,
      resume: parsed.data.LLM_MODEL_RESUME ?? parsed.data.LLM_MODEL,
      proposal: parsed.data.LLM_MODEL_PROPOSAL ?? parsed.data.LLM_MODEL,
    },
    timeoutMs: parsed.data.LLM_TIMEOUT_MS,
    maxValidationRetries: parsed.data.LLM_MAX_VALIDATION_RETRIES,
  },
  rateLimit: {
    windowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    max: parsed.data.RATE_LIMIT_MAX,
  },
} as const;

export type AppConfig = typeof config;
