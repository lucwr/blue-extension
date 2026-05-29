/**
 * Resume PDF → MasterProfile pipeline.
 *
 *   base64 PDF ──► pdf-parse (text) ──► LLM (structured JSON) ──► Zod-valid MasterProfile
 *
 * Errors are mapped to HttpError so the controller doesn't need to know about
 * pdf-parse's exception shapes.
 *
 * NOTE on the pdf-parse import: the package's index.js has a known
 * test-fixture bug that breaks under ESM (it tries to read a sample PDF at
 * module load time). Importing the inner `lib/pdf-parse.js` skips that
 * code path entirely.
 */
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { config } from '../config.js';
import { HttpError } from '../middleware/errorHandler.js';
import { parseResumePrompt } from '../prompts/index.js';
import { MasterProfileSchema, type MasterProfile } from '../schemas/resume.schema.js';
import { logger } from '../utils/logger.js';
import { jsonCompletion } from './llm.service.js';

const MIN_RESUME_CHARS = 200;

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ') // non-breaking spaces
    .replace(/[​-‍﻿]/g, '') // zero-width chars
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseResumePdf(pdfBase64: string): Promise<MasterProfile> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(pdfBase64, 'base64');
  } catch {
    throw new HttpError(400, 'BACKEND_ERROR', 'PDF payload is not valid base64.');
  }

  if (buffer.length < 100) {
    throw new HttpError(400, 'BACKEND_ERROR', 'Uploaded file is empty or too small to be a PDF.');
  }

  // Quick sanity check: PDFs start with "%PDF-"
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new HttpError(
      400,
      'BACKEND_ERROR',
      'File does not look like a PDF (missing %PDF- header).',
    );
  }

  let text: string;
  try {
    const result = await pdfParse(buffer);
    text = cleanExtractedText(result.text ?? '');
    logger.info(
      { pages: result.numpages, chars: text.length },
      'parseResumePdf: extracted text',
    );
  } catch (err) {
    throw new HttpError(
      400,
      'BACKEND_ERROR',
      `Failed to extract text from PDF: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }

  if (text.length < MIN_RESUME_CHARS) {
    throw new HttpError(
      400,
      'BACKEND_ERROR',
      'Extracted text was too short. The PDF may be image-based (scanned) or encrypted — try exporting a text-based PDF from your word processor.',
    );
  }

  return jsonCompletion({
    label: parseResumePrompt.version,
    model: config.llm.models.default,
    prompt: parseResumePrompt.build(text),
    schema: MasterProfileSchema,
    temperature: 0.2,
    maxTokens: 8192,
  });
}
