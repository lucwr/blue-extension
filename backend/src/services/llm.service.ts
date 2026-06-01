/**
 * Thin wrapper around the OpenAI SDK pointed at OpenRouter.
 *
 * OpenRouter exposes an OpenAI-compatible API at `${OPENROUTER_BASE_URL}` and
 * routes to whichever underlying model you ask for (`<provider>/<model>`).
 * Centralizes:
 *   - per-route model + timeout config
 *   - JSON-mode response_format (universal across providers)
 *   - schema-aware retry loop (Zod issues fed back to the model)
 *   - structured logging + error mapping to our `HttpError`
 *
 * Notes on structured output across providers via OpenRouter:
 *   - `response_format: { type: 'json_object' }` is supported by every model
 *     OpenRouter routes to — guarantees parseable JSON but NOT schema shape.
 *   - Anthropic `cache_control` IS supported via OpenRouter for Anthropic
 *     models, but is not yet wired here (future work).
 *   - Schema conformance is therefore enforced in two layers:
 *       (a) the schema spec embedded in each prompt module's system prompt,
 *       (b) Zod validation + corrective retry below.
 */
import OpenAI from 'openai';
import type { ZodSchema, ZodTypeDef } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { PromptOutput } from '../prompts/index.js';
import { extractJson, JsonParseError } from '../utils/json.js';
import { logger } from '../utils/logger.js';

const client = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
  timeout: config.llm.timeoutMs,
  // OpenRouter optional headers — populate the leaderboard / let routing
  // identify the app. Harmless to send; required by some OpenRouter policies.
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/resume-maker',
    'X-Title': 'Resume Maker',
  },
});

export interface JsonCompletionArgs<TOut, TDef extends ZodTypeDef, TIn> {
  /** Friendly label for logs / observability. Use the prompt module's `version`. */
  label: string;
  /** Model id; defaults to `config.llm.models.default`. OpenRouter format: "<provider>/<model>". */
  model?: string;
  /** Built prompt from a `PromptModule.build()`. */
  prompt: PromptOutput;
  /** Zod schema for the response. */
  schema: ZodSchema<TOut, TDef, TIn>;
  /** Sampling temperature. Defaults to 0.3 for deterministic structured output. */
  temperature?: number;
  /** Hard ceiling on output tokens. */
  maxTokens?: number;
  /** Override retry budget for validation failures. Defaults to env. */
  maxValidationRetries?: number;
}

const DEFAULT_MAX_TOKENS = 4096;

function mapOpenAIError(err: unknown): HttpError {
  if (err instanceof OpenAI.APIError) {
    const status = typeof err.status === 'number' ? err.status : 500;
    if (status === 429) {
      return new HttpError(429, 'RATE_LIMITED', 'OpenRouter rate limit hit. Try again shortly.');
    }
    if (status === 401 || status === 403) {
      return new HttpError(
        500,
        'BACKEND_ERROR',
        'OpenRouter authentication failed — check OPENROUTER_API_KEY.',
      );
    }
    if (status === 400) {
      // Often: bad model id, malformed request, or unsupported feature for the routed provider.
      return new HttpError(400, 'BACKEND_ERROR', `OpenRouter 400: ${err.message}`);
    }
    if (status === 404) {
      return new HttpError(
        400,
        'BACKEND_ERROR',
        `OpenRouter 404: model not found. Check the LLM_MODEL_* values in .env against https://openrouter.ai/models`,
      );
    }
    return new HttpError(
      status >= 500 ? 502 : 500,
      'BACKEND_ERROR',
      `OpenRouter ${status}: ${err.message}`,
    );
  }
  return new HttpError(
    500,
    'BACKEND_ERROR',
    err instanceof Error ? err.message : 'Unknown OpenRouter SDK error',
  );
}

export async function jsonCompletion<TOut, TDef extends ZodTypeDef, TIn>(
  args: JsonCompletionArgs<TOut, TDef, TIn>,
): Promise<TOut> {
  const model = args.model ?? config.llm.models.default;
  let maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = args.temperature ?? 0.3;
  const maxAttempts = 1 + (args.maxValidationRetries ?? config.llm.maxValidationRetries);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: args.prompt.system },
    { role: 'user', content: args.prompt.user },
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    logger.debug({ label: args.label, attempt, model }, 'llm.jsonCompletion start');

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' },
        messages,
      });
    } catch (err) {
      throw mapOpenAIError(err);
    }

    const raw = response.choices[0]?.message?.content ?? '';

    // Cost telemetry. OpenRouter populates `usage` in OpenAI-compatible shape.
    logger.info(
      {
        label: args.label,
        attempt,
        model,
        finish_reason: response.choices[0]?.finish_reason,
        usage: response.usage,
      },
      'llm.jsonCompletion response',
    );

    if (response.choices[0]?.finish_reason === 'length') {
      // On the first attempt only, recover by bumping the token ceiling and
      // continuing the conversation with the partial assistant output. Any
      // truncation on a later attempt (or with no retries left) is fatal.
      if (attempt === 1 && attempt < maxAttempts) {
        const bumped = Math.floor(Math.min(maxTokens * 1.5, 8192));
        logger.warn(
          { label: args.label, attempt, previousMaxTokens: maxTokens, newMaxTokens: bumped },
          'llm.jsonCompletion truncated at max_tokens — bumping limit and retrying',
        );
        maxTokens = bumped;
        messages.push({ role: 'assistant', content: raw });
        continue;
      }
      throw new HttpError(
        422,
        'AI_INVALID_OUTPUT',
        `Model output hit max_tokens (${maxTokens}) and was truncated. Increase the limit and retry.`,
      );
    }

    // Step 1: parse JSON (forgiving — strips fences if the model added them).
    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new HttpError(
          422,
          'AI_INVALID_OUTPUT',
          `Model output was not valid JSON after ${attempt} attempts: ${(err as JsonParseError).message}`,
        );
      }
      logger.warn({ label: args.label, attempt }, 'JSON parse failed, will retry');
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content:
          'Your previous output was not valid JSON. Return ONLY a single JSON object — no prose, no markdown, no code fences.',
      });
      continue;
    }

    // Step 2: validate against the Zod schema.
    const validation = args.schema.safeParse(parsed);
    if (validation.success) {
      return validation.data;
    }

    if (attempt === maxAttempts) {
      logger.error(
        { label: args.label, attempt, issues: validation.error.flatten() },
        'llm.jsonCompletion exhausted validation retries',
      );
      throw new HttpError(
        422,
        'AI_INVALID_OUTPUT',
        `Output failed schema validation: ${validation.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    }

    logger.warn(
      { label: args.label, attempt, issues: validation.error.flatten() },
      'schema validation failed, retrying',
    );

    // Feed the failure back to the model with structured issues.
    // Bound the payload so it doesn't accumulate across retry attempts.
    const issuesSummary = validation.error.issues
      .slice(0, 5)
      .map((i) => `path: ${i.path.join('.')}; msg: ${i.message}`)
      .join('\n');
    messages.push({ role: 'assistant', content: raw });
    messages.push({
      role: 'user',
      content: [
        'Your previous output did not match the required schema. Fix every issue below and return a corrected JSON object.',
        'Output ONLY the JSON object — no prose, no markdown, no code fences.',
        '',
        'Validation issues:',
        issuesSummary,
      ].join('\n'),
    });
  }

  // Loop body always returns or throws; defensive only.
  throw new HttpError(500, 'BACKEND_ERROR', 'jsonCompletion exited unexpectedly');
}
