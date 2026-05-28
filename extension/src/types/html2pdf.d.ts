/**
 * `html2pdf.js` ships without TypeScript types. Declare the chained-API
 * surface we actually use; expand as needed.
 */
declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: 'jpeg' | 'png'; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: { mode?: string[] };
  }

  interface Html2PdfChain {
    set(opts: Html2PdfOptions): Html2PdfChain;
    from(source: HTMLElement | string): Html2PdfChain;
    save(filename?: string): Promise<void>;
    output(type?: string, options?: unknown): Promise<unknown>;
    outputPdf(type?: string): Promise<Blob>;
    then<T>(onFulfilled?: (value: unknown) => T | PromiseLike<T>): Promise<T>;
  }

  function html2pdf(): Html2PdfChain;
  export default html2pdf;
}
