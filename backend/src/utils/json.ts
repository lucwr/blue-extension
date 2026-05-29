/**
 * Forgiving JSON extraction for LLM output. Models occasionally wrap JSON in
 * ```json fences``` or prefix it with a sentence even when asked not to —
 * strip that defensively before parsing.
 */
export class JsonParseError extends Error {
  override readonly name = 'JsonParseError';
  constructor(message: string, readonly raw: string) {
    super(message);
  }
}

export function extractJson<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== 'string') {
    throw new JsonParseError('Empty model output', String(raw));
  }

  // 1. Try a direct parse — happens when response_format=json_object is honored.
  try {
    return JSON.parse(raw) as T;
  } catch {
    /* fall through */
  }

  // 2. Strip fenced ```json blocks.
  const fence = raw.match(/```json\s*([\s\S]+?)```/i) ?? raw.match(/```\s*([\s\S]+?)```/);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]) as T;
    } catch {
      /* fall through */
    }
  }

  // 3. Find the largest balanced object substring.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = raw.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch (err) {
      throw new JsonParseError(
        `Could not parse JSON from model output: ${(err as Error).message}`,
        raw,
      );
    }
  }

  throw new JsonParseError('No JSON object found in model output', raw);
}
