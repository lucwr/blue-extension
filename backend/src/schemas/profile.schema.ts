import { z } from 'zod';

/**
 * Request body for `POST /api/profile/import-pdf`.
 *
 * The PDF is sent as base64-encoded bytes in JSON. We don't use multipart
 * because the extension already routes everything through one JSON message
 * bus, and JSON keeps schema validation uniform across the API.
 *
 * 20MB base64 ≈ 14MB raw PDF — comfortable headroom for any normal résumé.
 */
export const ImportPdfRequestSchema = z.object({
  pdfBase64: z.string().min(1).max(20_000_000),
});

export type ImportPdfRequest = z.infer<typeof ImportPdfRequestSchema>;
