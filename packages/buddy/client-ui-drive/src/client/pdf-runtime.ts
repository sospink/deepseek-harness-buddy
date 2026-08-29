/** Lazy PDF.js runtime boundary: ordinary Drive and Markdown views never initialize PDF globals. */

/** Load the browser PDF.js runtime only after the user selects a PDF file. */
export async function loadPdfRuntime(): Promise<typeof import('pdfjs-dist')> {
  return import('pdfjs-dist')
}
