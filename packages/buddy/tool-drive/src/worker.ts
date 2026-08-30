/** One-shot extraction Worker for PDF.js and Mammoth. */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import mammoth from 'mammoth'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js'
import type { ExtractWorkerInput, ExtractWorkerOutput } from './protocol.ts'

const require = createRequire(import.meta.url)
const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'))

/** Keep a UTF-8 string within a byte budget without splitting a code point.
 * @param value - Text to bound.
 * @param maxBytes - Maximum UTF-8 byte length.
 * @returns Bounded text and whether bytes were removed.
 */
export function workerTextPrefix(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.byteLength <= maxBytes) return { text: value, truncated: false }
  let end = Math.min(maxBytes, bytes.byteLength)
  while (end > 0) {
    const next = bytes[end]
    if (next === undefined || (next & 0xc0) !== 0x80) break
    end -= 1
  }
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true }
}

/** Append one labeled PDF page to the extracted text.
 * @param current - Text extracted from prior pages.
 * @param pageNumber - One-based PDF page number.
 * @param body - Text extracted from the page.
 * @returns Text containing the prior pages and the new page.
 */
export function appendPdfPageText(current: string, pageNumber: number, body: string): string {
  return `${current}${current === '' ? '' : '\n\n'}[PDF page ${String(pageNumber)}]\n${body}`
}

/** Extract bounded text from a PDF in the extraction worker.
 * @param input - Worker extraction request.
 * @returns Extraction result or a structured failure.
 */
export async function extractPdfText(input: ExtractWorkerInput): Promise<ExtractWorkerOutput> {
  const task = getDocument({
    data: new Uint8Array(input.buffer),
    cMapUrl: join(pdfRoot, 'cmaps') + '/',
    cMapPacked: true,
    standardFontDataUrl: join(pdfRoot, 'standard_fonts') + '/',
    useWorkerFetch: false,
    useWasm: false,
    stopAtErrors: true,
    disableFontFace: true,
  })
  const document = await task.promise
  try {
    let text = ''
    let truncated = false
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const body = pdfPageText(content.items)
      const candidate = appendPdfPageText(text, pageNumber, body)
      const fitted = workerTextPrefix(candidate, input.maxTextBytes)
      text = fitted.text
      if (fitted.truncated) { truncated = true; break }
    }
    return { ok: true, text, truncated, warnings: [] }
  } finally {
    await task.destroy()
  }
}

/** Keep extraction warnings bounded for model-facing results.
 * @param messages - Warnings returned by the extraction library.
 * @returns At most ten warning messages.
 */
export function workerWarnings(messages: readonly { message: string }[]): string[] {
  return messages.slice(0, 10).map(message => message.message)
}

/** Join text-bearing PDF items while ignoring non-text items.
 * @param items - PDF.js content items.
 * @returns Text strings joined with spaces.
 */
export function pdfPageText(items: readonly unknown[]): string {
  return items.flatMap(item => typeof (item as TextItem).str === 'string' ? [(item as TextItem).str] : []).join(' ')
}

/** Extract bounded raw text from a DOCX in the extraction worker.
 * @param input - Worker extraction request.
 * @returns Extraction result or a structured failure.
 */
export async function extractDocxText(input: ExtractWorkerInput): Promise<ExtractWorkerOutput> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(input.buffer) })
  const fitted = workerTextPrefix(result.value, input.maxTextBytes)
  return {
    ok: true,
    text: fitted.text,
    truncated: fitted.truncated,
    warnings: workerWarnings(result.messages),
  }
}

/** Validate an extraction request and dispatch it to the supported media reader.
 * @param input - Worker extraction request.
 * @returns Extraction result or a structured validation failure.
 */
export async function runExtractionWorker(input: ExtractWorkerInput): Promise<ExtractWorkerOutput> {
  if (!(input.buffer instanceof ArrayBuffer) || !Number.isSafeInteger(input.maxTextBytes) || input.maxTextBytes < 1) {
    return { ok: false, message: 'Invalid extraction request.' }
  }
  if (input.mediaType === 'application/pdf') return extractPdfText(input)
  if (input.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocxText(input)
  return { ok: false, message: 'Unsupported extraction media type.' }
}

/* v8 ignore start -- one-statement Worker entry; pure extraction is covered in-process and built entry by e2e. */
const port = parentPort
if (port !== null) {
  void runExtractionWorker(workerData as ExtractWorkerInput).then(
    (result) => { port.postMessage(result) },
    (error) => {
      const message = error instanceof Error ? error.message : String(error)
      port.postMessage({ ok: false, message } satisfies ExtractWorkerOutput)
    },
  )
}
/* v8 ignore stop */
