/**
 * Type shim for `pdf-parse`. The package ships without TypeScript types and
 * the root `pdf-parse` module has a known bug where it tries to load a test
 * PDF at startup if `module.parent` is null — which breaks under ESM.
 *
 * We import the inner `lib/pdf-parse.js` directly to bypass that.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  export interface PdfData {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }
  function pdfParse(data: Buffer | Uint8Array, options?: unknown): Promise<PdfData>;
  export default pdfParse;
}
