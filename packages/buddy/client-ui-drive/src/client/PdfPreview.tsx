/** Bounded single-page PDF.js viewer with Range loading, search, and inert annotations. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  OnProgressParameters,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist'
import { Button, Input, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DriveOverlayProps } from './DriveOverlay.tsx'
import {
  findPdfPage,
  pdfCanvasContext,
  pdfCanvasSize,
  pdfDocumentOptions,
  pdfExternalLinks,
  pdfWorkerUrl,
  PDF_SEARCH_MAX_PAGES,
  type PdfExternalLink,
} from './pdf-preview.ts'
import { loadPdfRuntime } from './pdf-runtime.ts'
import css from './DriveOverlay.module.css'

interface PdfReadyState {
  readonly state: 'ready'
  readonly document: PDFDocumentProxy
  readonly scriptsBlocked: boolean
}

type PdfState =
  | { readonly state: 'loading'; readonly progress?: number }
  | PdfReadyState
  | { readonly state: 'failed'; readonly message: string }

/** PDF.js viewer that keeps only one canvas page resident at a time. */
export function PdfPreview({ url, t }: { url: string; t: DriveOverlayProps['t'] }) {
  const [revision, setRevision] = useState(0)
  const [pdf, setPdf] = useState<PdfState>({ state: 'loading' })

  useEffect(() => {
    let task: PDFDocumentLoadingTask | undefined
    let disposed = false
    let documentReady = false
    setPdf({ state: 'loading' })
    void loadPdfRuntime().then((runtime) => {
      if (disposed) return
      runtime.GlobalWorkerOptions.workerSrc = pdfWorkerUrl()
      task = runtime.getDocument(pdfDocumentOptions(url))
      task.onProgress = ({ loaded, total }: OnProgressParameters) => {
        if (disposed || documentReady) return
        setPdf({ state: 'loading', ...(total > 0 ? { progress: Math.min(100, Math.round(loaded / total * 100)) } : {}) })
      }
      return task.promise.then((document) => {
        documentReady = true
        if (!disposed) setPdf({ state: 'ready', document, scriptsBlocked: false })
      })
    }).catch((error: unknown) => {
      if (!disposed) setPdf({ state: 'failed', message: error instanceof Error ? error.message : String(error) })
    })
    return () => {
      disposed = true
      if (task !== undefined) void task.destroy()
    }
  }, [revision, url])

  return (
    <section className={css.pdfPreview} aria-label={t('pdf.title')}>
      {pdf.state === 'loading' && <div className={css.previewStatus}>{t('pdf.loading')}{pdf.progress === undefined ? '' : ` ${String(pdf.progress)}%`}</div>}
      {pdf.state === 'failed' && (
        <div className={css.previewStatus}>
          <span>{t('pdf.failed')}</span><small>{pdf.message}</small>
          <Button size="sm" variant="outline" onClick={() => { setRevision(value => value + 1) }}>{t('retry')}</Button>
        </div>
      )}
      {pdf.state === 'ready' && <PdfReadyView ready={pdf} t={t} />}
    </section>
  )
}

function PdfReadyView({ ready, t }: { ready: PdfReadyState; t: DriveOverlayProps['t'] }) {
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<'found' | 'missing' | undefined>(undefined)
  const [links, setLinks] = useState<readonly PdfExternalLink[]>([])
  const [scriptsBlocked, setScriptsBlocked] = useState(ready.scriptsBlocked)
  const [pageFailure, setPageFailure] = useState<string | undefined>(undefined)
  const searchController = useRef<AbortController | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    void ready.document.getJSActions().then((actions) => {
      if (!disposed && actions !== null && Object.keys(actions).length > 0) setScriptsBlocked(true)
    }).catch(() => undefined)
    return () => { disposed = true }
  }, [ready.document])

  useEffect(() => {
    let disposed = false
    void ready.document.getPage(pageNumber).then(async (page) => {
      const annotations = await page.getAnnotations({ intent: 'display' })
      const actions = await page.getJSActions() as object | null
      if (disposed) return
      setLinks(pdfExternalLinks(annotations))
      if (actions !== null && Object.keys(actions).length > 0) setScriptsBlocked(true)
    }).catch(() => { if (!disposed) setLinks([]) })
    return () => { disposed = true }
  }, [pageNumber, ready.document])

  useEffect(() => () => { searchController.current?.abort() }, [])

  const search = async (): Promise<void> => {
    searchController.current?.abort()
    const controller = new AbortController()
    searchController.current = controller
    setSearching(true)
    setSearchResult(undefined)
    try {
      const found = await findPdfPage(ready.document, query, pageNumber + 1, controller.signal)
      if (controller.signal.aborted) return
      setSearchResult(found === undefined ? 'missing' : 'found')
      if (found !== undefined) setPageNumber(found)
    } catch (error) {
      if (!controller.signal.aborted) setPageFailure(error instanceof Error ? error.message : String(error))
    } finally {
      if (searchController.current === controller) {
        searchController.current = undefined
        setSearching(false)
      }
    }
  }

  const failPage = useCallback((message: string) => { setPageFailure(message) }, [])
  if (pageFailure !== undefined) return <div className={css.previewStatus}><span>{t('pdf.failed')}</span><small>{pageFailure}</small></div>

  return (
    <>
      <div className={css.pdfToolbar}>
        <button type="button" disabled={pageNumber <= 1} onClick={() => { setPageNumber(value => Math.max(1, value - 1)) }}>{t('pdf.previous')}</button>
        <span>{t('pdf.page')} {String(pageNumber)} / {String(ready.document.numPages)}</span>
        <button type="button" disabled={pageNumber >= ready.document.numPages} onClick={() => { setPageNumber(value => Math.min(ready.document.numPages, value + 1)) }}>{t('pdf.next')}</button>
        <button type="button" disabled={zoom <= 0.5} onClick={() => { setZoom(value => Math.max(0.5, value - 0.25)) }}>−</button>
        <span>{String(Math.round(zoom * 100))}%</span>
        <button type="button" disabled={zoom >= 2} onClick={() => { setZoom(value => Math.min(2, value + 0.25)) }}>+</button>
      </div>
      <form className={css.pdfSearch} onSubmit={(event) => { event.preventDefault(); void search() }}>
        <Input icon={<IconSearchOutline16 size={16} />} value={query} placeholder={t('pdf.search')} onChange={(event) => { setQuery(event.target.value); setSearchResult(undefined) }} />
        <Button size="sm" type="submit" disabled={searching || query.trim() === ''}>{searching ? t('pdf.searching') : t('pdf.find')}</Button>
      </form>
      {ready.document.numPages > PDF_SEARCH_MAX_PAGES && <small className={css.pdfNotice}>{t('pdf.searchLimited')}</small>}
      {searchResult !== undefined && <small className={css.pdfNotice}>{searchResult === 'found' ? t('pdf.found') : t('pdf.notFound')}</small>}
      {scriptsBlocked && <small className={css.pdfBlocked}>{t('pdf.scriptsBlocked')}</small>}
      <PdfPageCanvas document={ready.document} pageNumber={pageNumber} zoom={zoom} onFailure={failPage} />
      {links.length > 0 && (
        <div className={css.pdfLinks}>
          <strong>{t('pdf.links')}</strong>
          {links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}
        </div>
      )}
    </>
  )
}

function PdfPageCanvas({ document, pageNumber, zoom, onFailure }: {
  document: PDFDocumentProxy
  pageNumber: number
  zoom: number
  onFailure: (message: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let disposed = false
    let page: PDFPageProxy | undefined
    let renderTask: RenderTask | undefined
    void document.getPage(pageNumber).then(async (loadedPage) => {
      page = loadedPage
      if (disposed) return
      const { canvas, context } = pdfCanvasContext(canvasRef.current)
      const viewport = page.getViewport({ scale: 0.75 * zoom })
      const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2)
      const size = pdfCanvasSize(viewport.width, viewport.height, outputScale)
      canvas.width = size.width
      canvas.height = size.height
      canvas.style.width = `${String(Math.floor(viewport.width))}px`
      canvas.style.height = `${String(Math.floor(viewport.height))}px`
      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: 0, // PDF.js AnnotationMode.DISABLE: no annotation or scripting layer enters the DOM.
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      })
      await renderTask.promise
    }).catch((error: unknown) => {
      if (!disposed) onFailure(error instanceof Error ? error.message : String(error))
    })
    return () => {
      disposed = true
      renderTask?.cancel()
      page?.cleanup()
    }
  }, [document, onFailure, pageNumber, zoom])
  return <div className={css.pdfCanvasViewport}><canvas ref={canvasRef} aria-label={`PDF page ${String(pageNumber)}`} /></div>
}
