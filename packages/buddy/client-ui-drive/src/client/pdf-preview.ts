/** Bounded PDF.js document options, search, and annotation projection. */

import type { PDFDocumentProxy } from 'pdfjs-dist'
import { DRIVE_PDF_CMAP_PATH, DRIVE_PDF_WORKER_PATH } from '@sospink/dsh-buddy-api-drive/paths'

/** PDF.js range request quantum matching the Host's single-range route. */
export const PDF_RANGE_CHUNK_BYTES = 64 * 1024
/** Maximum pages visited by one explicit search operation. */
export const PDF_SEARCH_MAX_PAGES = 500
/** Maximum decoded image pixels accepted from one PDF image. */
export const PDF_MAX_IMAGE_PIXELS = 16_000_000
/** Maximum canvas backing-store area in bytes. */
export const PDF_MAX_CANVAS_BYTES = 64 * 1024 * 1024



/** Require the mounted Canvas and its non-alpha 2D context. */
export function pdfCanvasContext(canvas: HTMLCanvasElement | null): {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
} {
  if (canvas === null) throw new Error('Canvas is unavailable.')
  const context = canvas.getContext('2d', { alpha: false })
  if (context === null) throw new Error('Canvas is unavailable.')
  return { canvas, context }
}

/** Compute a bounded canvas backing store before allocating browser pixels. */
export function pdfCanvasSize(width: number, height: number, outputScale: number): { width: number; height: number } {
  const canvasWidth = Math.max(1, Math.floor(width * outputScale))
  const canvasHeight = Math.max(1, Math.floor(height * outputScale))
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(outputScale)
    || width <= 0 || height <= 0 || outputScale <= 0
    || canvasWidth * canvasHeight * 4 > PDF_MAX_CANVAS_BYTES) {
    throw new Error('PDF page exceeds the canvas preview budget.')
  }
  return { width: canvasWidth, height: canvasHeight }
}

export interface PdfExternalLink {
  readonly url: string
  readonly label: string
}

interface PdfAnnotation {
  readonly url?: unknown
  readonly unsafeUrl?: unknown
  readonly titleObj?: { readonly str?: unknown }
  readonly contentsObj?: { readonly str?: unknown }
}

interface PdfTextItem {
  readonly str?: unknown
}

/** Browser load options that forbid background prefetch and auxiliary remote resources. */
export function pdfDocumentOptions(url: string) {
  return {
    url,
    withCredentials: true,
    disableRange: false,
    disableStream: true,
    disableAutoFetch: true,
    rangeChunkSize: PDF_RANGE_CHUNK_BYTES,
    stopAtErrors: true,
    maxImageSize: PDF_MAX_IMAGE_PIXELS,
    canvasMaxAreaInBytes: PDF_MAX_CANVAS_BYTES,
    enableXfa: false,
    cMapUrl: `${DRIVE_PDF_CMAP_PATH}/`,
    cMapPacked: true,
    useWorkerFetch: false,
    useWasm: false,
    useSystemFonts: true,
  } as const
}

/** Pinned same-origin worker URL; the Host route authenticates it like document content. */
export function pdfWorkerUrl(): string { return DRIVE_PDF_WORKER_PATH }

/** Accept only explicit absolute HTTP(S) annotation links. */
export function safePdfExternalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** Project annotations into deduplicated, inert external-link rows. */
export function pdfExternalLinks(annotations: readonly PdfAnnotation[]): PdfExternalLink[] {
  const links = new Map<string, PdfExternalLink>()
  for (const annotation of annotations) {
    const url = safePdfExternalUrl(annotation.url)
    if (url === undefined || links.has(url)) continue
    const title = typeof annotation.titleObj?.str === 'string' ? annotation.titleObj.str : undefined
    const contents = typeof annotation.contentsObj?.str === 'string' ? annotation.contentsObj.str : undefined
    links.set(url, { url, label: title?.trim() || contents?.trim() || url })
  }
  return [...links.values()]
}

/** Plain searchable text projection from PDF.js TextContent items. */
export function pdfText(items: readonly unknown[]): string {
  return items.flatMap(item => typeof (item as PdfTextItem).str === 'string' ? [(item as PdfTextItem).str as string] : []).join(' ')
}

/** Find the first matching page, wrapping once from the current page. */
export async function findPdfPage(
  document: Pick<PDFDocumentProxy, 'numPages' | 'getPage'>,
  query: string,
  startPage: number,
  signal: AbortSignal,
): Promise<number | undefined> {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return undefined
  const count = Math.min(document.numPages, PDF_SEARCH_MAX_PAGES)
  for (let offset = 0; offset < count; offset += 1) {
    if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    const pageNumber = ((Math.max(1, Math.min(startPage, count)) - 1 + offset) % count) + 1
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    if (pdfText(content.items).toLocaleLowerCase().includes(needle)) return pageNumber
  }
  return undefined
}
