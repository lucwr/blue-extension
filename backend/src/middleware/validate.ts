import type { RequestHandler } from 'express';
import type { ZodSchema, ZodTypeDef } from 'zod';

/**
 * Validates `req.body` against a Zod schema and replaces it with the parsed,
 * type-narrowed value so downstream handlers can rely on the shape.
 *
 * Pair with a typed handler like:
 *
 *   const Body = z.object({ ... });
 *   router.post('/x', validateBody(Body), (req, res) => {
 *     const body = req.body as z.infer<typeof Body>;
 *   });
 */
export function validateBody<TOut, TDef extends ZodTypeDef, TIn>(
  schema: ZodSchema<TOut, TDef, TIn>,
): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    req.body = parsed.data;
    next();
  };
}
