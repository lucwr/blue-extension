/**
 * Anthropic SDK wrapper. Centralizes:
 *   - model + timeout config
 *   - structured outputs via `messages.parse()` + `zodOutputFormat()`
 *     (Claude validates structure server-side; the SDK validates Zod's stricter
 *     client-side constraints — min/max length etc. — after the response)
 *   - prompt caching (system prompt + opt-in user blocks)
 *   - bounded retry loop for `parsed_output === null` (Zod client-side failure)
 *   - typed error mapping into our `HttpError` shape
 *
 * Why `messages.parse()` instead of `messages.create()`:
 *   It returns `parsed_output: T | null`, already typed via the Zod schema.
 *   When server-side structural enforcement combined with client-side Zod
 *   refinements produce a valid value, no parsing or schema validation in user
 *   code is required.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ZodSchema, ZodTypeDef } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { PromptOutput } from '../prompts/index.js';
import { logger } from '../utils/logger.js';

const client = new Anthropic({
  apiKey: config.anthropic.apiKey,
  timeout: config.anthropic.timeoutMs,
});

/**
 * Effort levels for `output_config.effort`. Supported on Opus 4.5/4.6/4.7 and
 * Sonnet 4.6 (errors on Haiku 4.5). `max` is Opus-tier only; `xhigh` is
 * Opus 4.7 only.
 */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface JsonCompletionArgs<TOut, TDef extends ZodTypeDef, TIn> {
  /** Friendly label for logs / cache audit. Use the prompt module's `version`. */
  label: string;
  /** Model id; defaults to `config.anthropic.models.default`. */
  model?: string;
  /** Built prompt from a `PromptModule.build()`. */
  prompt: PromptOutput;
  /** Zod schema for the response. */
  schema: ZodSchema<TOut, TDef, TIn>;
  /** Effort knob. Omit to use the model's default (`high` on 4.6+). */
  effort?: Effort;
  /** Hard ceiling on output tokens. */
  maxTokens?: number;
  /** Override retry budget for Zod validation failures. Defaults to env. */
  maxValidationRetries?: number;
}

const DEFAULT_MAX_TOKENS = 4096;

function mapAnthropicError(err: unknown): HttpError {
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, 'RATE_LIMITED', 'Anthropic rate limit hit. Try again shortly.', {
      upstream: true,
    });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new HttpError(
      500,
      'BACKEND_ERROR',
      'Anthropic authentication failed — check ANTHROPIC_API_KEY.',
    );
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new HttpError(400, 'BACKEND_ERROR', `Anthropic 400: ${err.message}`);
  }
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : 500;
    return new HttpError(
      status >= 500 ? 502 : 500,
      'BACKEND_ERROR',
      `Anthropic ${status}: ${err.message}`,
    );
  }
  return new HttpError(
    500,
    'BACKEND_ERROR',
    err instanceof Error ? err.message : 'Unknown Anthropic SDK error',
  );
}

/**
 * Re-validate a failed-parse response to surface the Zod issues to the model
 * for its retry attempt. We do this manually because `messages.parse()` only
 * exposes `parsed_output: null` on validation failure, not the issue list.
 */
function explainValidationFailure<TOut, TDef extends ZodTypeDef, TIn>(
  schema: ZodSchema<TOut, TDef, TIn>,
  responseText: string,
): { issues: unknown; rawJson: string } {
  try {
    const parsed = JSON.parse(responseText);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return { issues: result.error.flatten(), rawJson: responseText };
    }
    // Parsed cleanly here but parsed_output was null upstream — surface a
    // generic message so the retry still makes progress.
    return { issues: { generic: 'schema validation failed' }, rawJson: responseText };
  } catch (err) {
    return {
      issues: { parseError: err instanceof Error ? err.message : 'JSON parse failed' },
      rawJson: responseText,
    };
  }
}

function extractResponseText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export async function jsonCompletion<TOut, TDef extends ZodTypeDef, TIn>(
  args: JsonCompletionArgs<TOut, TDef, TIn>,
): Promise<TOut> {
  const model = args.model ?? config.anthropic.models.default;
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxAttempts = 1 + (args.maxValidationRetries ?? config.anthropic.maxValidationRetries);

  // System prompt: always cached. Sized check is implicit — Anthropic silently
  // skips caching prefixes below the model's minimum (2048 tokens on Sonnet
  // 4.6, 4096 on Opus 4.7); a low-traffic dev call simply pays full price.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: args.prompt.system,
      cache_control: { type: 'ephemeral' },
    },
  ];

  // Initial user message: opt-in caching per block. The last block marked
  // `cache: true` becomes the breakpoint; everything after rides uncached.
  const initialUserContent: Anthropic.TextBlockParam[] = args.prompt.userBlocks.map(
    (b) => ({
      type: 'text',
      text: b.text,
      ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }),
  );

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: initialUserContent },
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    logger.debug({ label: args.label, attempt, model }, 'claude.jsonCompletion start');

    let response: Awaited<ReturnType<typeof client.messages.parse>>;
    try {
      response = await client.messages.parse({
        model,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: {
          format: zodOutputFormat(args.schema),
          ...(args.effort ? { effort: args.effort } : {}),
        },
      });
    } catch (err) {
      throw mapAnthropicError(err);
    }

    // Cache + cost telemetry. If cache_read_input_tokens stays at 0 across
    // repeated identical-prefix requests, a silent invalidator is at work
    // (timestamp in system prompt, non-deterministic JSON ordering, etc.).
    logger.info(
      {
        label: args.label,
        attempt,
        stop_reason: response.stop_reason,
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cache_read: response.usage.cache_read_input_tokens,
          cache_creation: response.usage.cache_creation_input_tokens,
        },
      },
      'claude.jsonCompletion response',
    );

    if (response.stop_reason === 'refusal') {
      throw new HttpError(
        422,
        'AI_INVALID_OUTPUT',
        'The model refused this request. Try adjusting the prompt or input.',
        { stop_details: response.stop_details },
      );
    }

    if (response.stop_reason === 'max_tokens') {
      throw new HttpError(
        422,
        'AI_INVALID_OUTPUT',
        `Model output hit max_tokens (${maxTokens}) and was truncated. Increase the limit and retry.`,
      );
    }

    if (response.parsed_output !== null) {
      return response.parsed_output;
    }

    // parsed_output === null → Zod validation failed (likely on min/max length
    // or another constraint Claude can't see). Surface specifics on retry.
    if (attempt === maxAttempts) {
      logger.error(
        { label: args.label, attempt },
        'claude.jsonCompletion exhausted validation retries',
      );
      throw new HttpError(
        422,
        'AI_INVALID_OUTPUT',
        'Model output failed schema validation after retries.',
      );
    }

    const responseText = extractResponseText(response.content);
    const { issues } = explainValidationFailure(args.schema, responseText);

    logger.warn(
      { label: args.label, attempt, issues },
      'claude.jsonCompletion validation failed, retrying',
    );

    // Append the prior turn + a corrective user message. Cached prefix
    // (system + cached user blocks) is unchanged, so cache hits continue.
    messages.push({ role: 'assistant', content: responseText });
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            'Your previous output did not satisfy all field constraints (length limits, required entries, allowed enum values, etc.).',
            'Return a corrected response that fixes the issues below. Keep everything else the same.',
            '',
            'Validation issues:',
            '```json',
            JSON.stringify(issues, null, 2),
            '```',
          ].join('\n'),
        },
      ],
    });
  }

  // Loop body always returns or throws; this is defensive only.
  throw new HttpError(500, 'BACKEND_ERROR', 'jsonCompletion exited unexpectedly');
}
