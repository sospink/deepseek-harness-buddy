// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import {
  findPdfPage,
  pdfCanvasContext,
  pdfCanvasSize,
  pdfDocumentOptions,
  pdfExternalLinks,
  pdfText,
  pdfWorkerUrl,
  safePdfExternalUrl,
  PDF_MAX_CANVAS_BYTES,
  PDF_RANGE_CHUNK_BYTES,
  PDF_SEARCH_MAX_PAGES,
} from '../src/client/pdf-preview.ts'
import { zh } from '../src/client/locales.ts'

const runtime = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../src/client/pdf-runtime.ts', () => ({ loadPdfRuntime: runtime.load }))
import { PdfPreview } from '../src/client/PdfPreview.tsx'

const t = makeTranslate(zh)


type PageLoader = (pageNumber: number) => Promise<PDFPageProxy>

function pageLoader(document: PDFDocumentProxy): PageLoader {
  const implementation = (document.getPage as unknown as {
    getMockImplementation(): PageLoader | undefined
  }).getMockImplementation()
  if (implementation === undefined) throw new Error('PDF fixture has no page loader')
  return implementation
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); runtime.load.mockReset() })
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
})

describe('PDF preview policy', () => {
  it('pins bounded Range options and a same-origin worker', () => {
    expect(pdfDocumentOptions('/content/version')).toEqual(expect.objectContaining({
      url: '/content/version', withCredentials: true,
      disableRange: false, disableStream: true, disableAutoFetch: true,
      rangeChunkSize: PDF_RANGE_CHUNK_BYTES, enableXfa: false,
      cMapUrl: '/api/buddy-drive/assets/cmaps/', cMapPacked: true,
      useWorkerFetch: false, useWasm: false, stopAtErrors: true,
    }))
    expect(pdfWorkerUrl()).toBe('/api/buddy-drive/assets/pdf.worker-6.2.108.mjs')
  })

  it('requires a mounted Canvas and a 2D context', () => {
    expect(() => pdfCanvasContext(null)).toThrow('Canvas is unavailable.')
    const canvas = document.createElement('canvas')
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce({} as CanvasRenderingContext2D)
    expect(pdfCanvasContext(canvas)).toEqual({ canvas, context: expect.any(Object) })
  })

  it('bounds the backing canvas before allocation', () => {
    expect(pdfCanvasSize(100.9, 200.9, 2)).toEqual({ width: 201, height: 401 })
    expect(pdfCanvasSize(0.1, 0.1, 0.1)).toEqual({ width: 1, height: 1 })
    const side = Math.sqrt(PDF_MAX_CANVAS_BYTES / 4)
    expect(pdfCanvasSize(side, side, 1)).toEqual({ width: side, height: side })
    const invalid: [number, number, number][] = [
      [Infinity, 1, 1], [1, NaN, 1], [1, 1, 0], [side + 1, side + 1, 1],
    ]
    for (const [width, height, scale] of invalid) {
      expect(() => pdfCanvasSize(width, height, scale)).toThrow('canvas preview budget')
    }
  })

  it('allows only absolute HTTP(S) annotation URLs and deduplicates labels', () => {
    expect(safePdfExternalUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safePdfExternalUrl('http://example.com/a')).toBe('http://example.com/a')
    for (const value of ['javascript:alert(1)', 'mailto:a@example.com', '/relative', 1]) {
      expect(safePdfExternalUrl(value)).toBeUndefined()
    }
    expect(pdfExternalLinks([
      { url: 'https://example.com/a', titleObj: { str: '  Policy  ' } },
      { url: 'https://example.com/a', contentsObj: { str: 'duplicate' } },
      { url: 'https://example.com/b', contentsObj: { str: ' Reference ' } },
      { url: 'https://example.com/c' },
      { url: 'javascript:alert(1)', unsafeUrl: 'https://ignored.example' },
      { url: 42, titleObj: { str: 4 } },
    ])).toEqual([
      { url: 'https://example.com/a', label: 'Policy' },
      { url: 'https://example.com/b', label: 'Reference' },
      { url: 'https://example.com/c', label: 'https://example.com/c' },
    ])
  })

  it('projects text and searches with wrap, cap, empty-query, and abort semantics', async () => {
    expect(pdfText([{ str: 'Alpha' }, { type: 'beginMarkedContent' }, { str: 'Beta' }])).toBe('Alpha Beta')
    const seen: number[] = []
    const document = {
      numPages: PDF_SEARCH_MAX_PAGES + 10,
      getPage: async (page: number) => {
        seen.push(page)
        return { getTextContent: async () => ({ items: [{ str: page === 2 ? 'Target' : 'other' }] }) }
      },
    } as unknown as Pick<PDFDocumentProxy, 'numPages' | 'getPage'>
    await expect(findPdfPage(document, ' target ', 501, new AbortController().signal)).resolves.toBe(2)
    expect(seen[0]).toBe(500)
    await expect(findPdfPage(document, ' ', 1, new AbortController().signal)).resolves.toBeUndefined()
    const aborted = new AbortController(); aborted.abort(new Error('cancelled'))
    await expect(findPdfPage(document, 'x', 1, aborted.signal)).rejects.toThrow('cancelled')
    await expect(findPdfPage(document, 'x', 1, { aborted: true, reason: undefined } as AbortSignal)).rejects.toThrow('Aborted')
    const missing = { numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) } as never
    await expect(findPdfPage(missing, 'x', -10, new AbortController().signal)).resolves.toBeUndefined()
  })
})

function pdfFixture(options: {
  documentActions?: object | null
  pageActions?: object | null
  annotations?: readonly object[]
  failRender?: unknown
} = {}) {
  const cancel = vi.fn()
  const cleanupPage = vi.fn()
  const page = (number: number): PDFPageProxy => ({
    getAnnotations: vi.fn(async () => options.annotations ?? []),
    getJSActions: vi.fn(async () => options.pageActions ?? null),
    getTextContent: vi.fn(async () => ({ items: [{ str: number === 2 ? 'safety target' : 'first page' }] })),
    getViewport: vi.fn(() => ({ width: 200, height: 300 })),
    render: vi.fn(() => ({
      promise: options.failRender === undefined ? Promise.resolve() : Promise.reject(options.failRender),
      cancel,
    } as unknown as RenderTask)),
    cleanup: cleanupPage,
  } as unknown as PDFPageProxy)
  const pages = new Map<number, PDFPageProxy>()
  const document = {
    numPages: 2,
    getJSActions: vi.fn(async () => options.documentActions ?? null),
    getPage: vi.fn(async (number: number) => {
      if (!pages.has(number)) pages.set(number, page(number))
      return pages.get(number)!
    }),
  } as unknown as PDFDocumentProxy
  let progress: ((value: { loaded: number; total: number }) => void) | undefined
  const destroy = vi.fn(async () => undefined)
  const task = {
    promise: Promise.resolve(document), destroy,
    set onProgress(value: typeof progress) { progress = value },
  } as unknown as PDFDocumentLoadingTask
  const workerOptions = { workerSrc: '' }
  const getDocument = vi.fn(() => task)
  runtime.load.mockResolvedValue({ GlobalWorkerOptions: workerOptions, getDocument })
  return {
    document, task, destroy, getDocument, workerOptions, pages, cancel, cleanupPage,
    progress: (value: { loaded: number; total: number }) => progress?.(value),
  }
}

describe('PdfPreview', () => {
  it('loads lazily, renders one page without annotations, navigates, zooms, searches, and exposes safe links', async () => {
    const fixture = pdfFixture({
      documentActions: { OpenAction: ['app.alert'] },
      annotations: [
        { url: 'https://example.com/policy', titleObj: { str: 'Policy' } },
        { url: 'javascript:alert(1)', titleObj: { str: 'Unsafe' } },
      ],
    })
    const view = render(<PdfPreview url="/content/pdf" t={t} />)
    expect(screen.getByText('正在按需加载 PDF…')).not.toBeNull()
    await waitFor(() => { expect(fixture.getDocument).toHaveBeenCalled() })
    expect(fixture.workerOptions.workerSrc).toBe('/api/buddy-drive/assets/pdf.worker-6.2.108.mjs')
    expect(fixture.getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: '/content/pdf', disableStream: true }))
    expect(await screen.findByText('PDF 内嵌脚本已阻止')).not.toBeNull()
    const link = await screen.findByRole('link', { name: 'Policy' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByText('Unsafe')).toBeNull()
    await waitFor(() => { expect(view.container.querySelector('canvas')).not.toBeNull() })
    const first = fixture.pages.get(1)!
    expect(first.render).toHaveBeenCalledWith(expect.objectContaining({ annotationMode: 0 }))

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('页 2 / 2')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    expect(await screen.findByText('页 1 / 2')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('页 2 / 2')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('125%')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '−' }))
    expect(screen.getByText('100%')).not.toBeNull()
    fireEvent.change(screen.getByPlaceholderText('搜索 PDF 文本'), { target: { value: 'target' } })
    fireEvent.click(screen.getByRole('button', { name: '查找' }))
    expect(await screen.findByText('已跳转到下一处匹配页面')).not.toBeNull()

    view.unmount()
    expect(fixture.destroy).toHaveBeenCalled()
    expect(fixture.cancel).toHaveBeenCalled()
    expect(fixture.cleanupPage).toHaveBeenCalled()
  })

  it('shows progress, page script detection, bounded-search notice, missing search, and zoom/page limits', async () => {
    const fixture = pdfFixture({ pageActions: { AA: ['action'] } })
    Object.defineProperty(fixture.document, 'numPages', { value: PDF_SEARCH_MAX_PAGES + 1 })
    let resolveDocument!: (document: PDFDocumentProxy) => void
    const deferred = new Promise<PDFDocumentProxy>((resolve) => { resolveDocument = resolve })
    Object.defineProperty(fixture.task, 'promise', { value: deferred })
    render(<PdfPreview url="/content/pdf" t={t} />)
    await waitFor(() => { expect(fixture.getDocument).toHaveBeenCalled() })
    fixture.progress({ loaded: 5, total: 10 })
    expect(await screen.findByText(/50%/)).not.toBeNull()
    resolveDocument(fixture.document)
    expect(await screen.findByText('PDF 内嵌脚本已阻止')).not.toBeNull()
    fixture.progress({ loaded: 10, total: 10 })
    expect(screen.queryByText('正在按需加载 PDF… 100%')).toBeNull()
    expect(screen.getByText('单次搜索最多检查前 500 页')).not.toBeNull()
    for (let index = 0; index < 8; index += 1) fireEvent.click(screen.getByRole('button', { name: '−' }))
    expect(screen.getByText('50%')).not.toBeNull()
    expect((screen.getByRole('button', { name: '−' }) as HTMLButtonElement).disabled).toBe(true)
    for (let index = 0; index < 8; index += 1) fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('200%')).not.toBeNull()
    expect((screen.getByRole('button', { name: '+' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('搜索 PDF 文本'), { target: { value: 'absent' } })
    fireEvent.submit(screen.getByPlaceholderText('搜索 PDF 文本').closest('form')!)
    expect(await screen.findByText('在搜索预算内未找到匹配内容')).not.toBeNull()
  })

  it('reports lazy-load and render failures and retries', async () => {
    runtime.load.mockRejectedValueOnce('runtime failed')
    const view = render(<PdfPreview url="/content/pdf" t={t} />)
    expect(await screen.findByText('runtime failed')).not.toBeNull()
    const recovered = pdfFixture({ failRender: new Error('render failed') })
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('render failed')).not.toBeNull()
    expect(recovered.getDocument).toHaveBeenCalled()
    view.unmount()
  })
})

describe('PdfPreview lifecycle and failure containment', () => {
  it('does not construct a document when the lazy runtime resolves after unmount', async () => {
    let resolveRuntime!: (value: { GlobalWorkerOptions: { workerSrc: string }; getDocument: ReturnType<typeof vi.fn> }) => void
    const getDocument = vi.fn()
    runtime.load.mockReturnValue(new Promise((resolve) => { resolveRuntime = resolve }))
    const view = render(<PdfPreview url="/content/late-runtime" t={t} />)
    view.unmount()
    resolveRuntime({ GlobalWorkerOptions: { workerSrc: '' }, getDocument })
    await Promise.resolve()
    expect(getDocument).not.toHaveBeenCalled()
  })

  it('ignores progress, document completion, and runtime rejection after unmount', async () => {
    const fixture = pdfFixture()
    let resolveDocument!: (document: PDFDocumentProxy) => void
    Object.defineProperty(fixture.task, 'promise', {
      value: new Promise<PDFDocumentProxy>((resolve) => { resolveDocument = resolve }),
    })
    const view = render(<PdfPreview url="/content/late-document" t={t} />)
    await waitFor(() => { expect(fixture.getDocument).toHaveBeenCalled() })
    fixture.progress({ loaded: 1, total: 0 })
    expect(screen.getByText('正在按需加载 PDF…')).not.toBeNull()
    view.unmount()
    fixture.progress({ loaded: 5, total: 10 })
    resolveDocument(fixture.document)
    await Promise.resolve()
    expect(fixture.destroy).toHaveBeenCalled()

    let rejectRuntime!: (reason: unknown) => void
    runtime.load.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRuntime = reject }))
    const rejected = render(<PdfPreview url="/content/late-error" t={t} />)
    rejected.unmount()
    rejectRuntime(new Error('ignored'))
    await Promise.resolve()
    expect(screen.queryByText('ignored')).toBeNull()
  })

  it('reports Error runtime failures as their message', async () => {
    runtime.load.mockRejectedValueOnce(new Error('runtime error'))
    render(<PdfPreview url="/content/error" t={t} />)
    expect(await screen.findByText('runtime error')).not.toBeNull()
  })

  it('does not block rendering when document JavaScript scanning fails or settles after unmount', async () => {
    const active = pdfFixture()
    ;(active.document.getJSActions as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('action scan failed'))
    render(<PdfPreview url="/content/action-scan" t={t} />)
    expect(await screen.findByText('页 1 / 2')).not.toBeNull()
    expect(screen.queryByText('action scan failed')).toBeNull()
    cleanup()

    let resolveActions!: (value: object | null) => void
    const disposed = pdfFixture()
    ;(disposed.document.getJSActions as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveActions = resolve }))
    const view = render(<PdfPreview url="/content/late-actions" t={t} />)
    await screen.findByText('页 1 / 2')
    view.unmount()
    resolveActions({ OpenAction: ['ignored'] })
    await Promise.resolve()
    expect(screen.queryByText('PDF 内嵌脚本已阻止')).toBeNull()
  })

  it('contains active and disposed page-metadata failures', async () => {
    const active = pdfFixture()
    const activePage = await pageLoader(active.document)(1)
    ;(activePage.getAnnotations as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('metadata failed'))
    render(<PdfPreview url="/content/metadata" t={t} />)
    await waitFor(() => { expect(activePage.getAnnotations).toHaveBeenCalled() })

    cleanup()
    let rejectAnnotations!: (reason: unknown) => void
    const disposed = pdfFixture()
    const disposedPage = await pageLoader(disposed.document)(1)
    ;(disposedPage.getAnnotations as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((_resolve, reject) => { rejectAnnotations = reject }),
    )
    const view = render(<PdfPreview url="/content/disposed-page" t={t} />)
    await waitFor(() => { expect(disposedPage.getAnnotations).toHaveBeenCalled() })
    view.unmount()
    rejectAnnotations(new Error('late metadata failure'))
    await Promise.resolve()
    expect(screen.queryByText('late metadata failure')).toBeNull()
  })

  it('aborts an overlapping search and ignores its late completion', async () => {
    const fixture = pdfFixture()
    const original = pageLoader(fixture.document)
    let delayedCalls = 0
    let resolveFirst!: (value: Awaited<ReturnType<PDFPageProxy['getTextContent']>>) => void
    ;(fixture.document.getPage as ReturnType<typeof vi.fn>).mockImplementation(async (number: number) => {
      const page = await original(number)
      if (number !== 2) return page
      delayedCalls += 1
      if (delayedCalls === 1) {
        return { ...page, getTextContent: () => new Promise((resolve) => { resolveFirst = resolve }) } as PDFPageProxy
      }
      return { ...page, getTextContent: async () => ({ items: [{ str: 'second result' }] }) } as PDFPageProxy
    })
    render(<PdfPreview url="/content/search-overlap" t={t} />)
    await screen.findByText('页 1 / 2')
    const input = screen.getByPlaceholderText('搜索 PDF 文本')
    fireEvent.change(input, { target: { value: 'first result' } })
    const form = input.closest('form')!
    fireEvent.submit(form)
    await waitFor(() => { expect(delayedCalls).toBe(1) })
    fireEvent.change(input, { target: { value: 'second result' } })
    fireEvent.submit(form)
    expect(await screen.findByText('已跳转到下一处匹配页面')).not.toBeNull()
    resolveFirst({ items: [{ str: 'first result', dir: 'ltr', transform: [], width: 1, height: 1, fontName: 'sans', hasEOL: false }], styles: {}, lang: null })
    await Promise.resolve()
    expect(screen.getByText('页 2 / 2')).not.toBeNull()
  })

  it('ignores an aborted search rejection after a replacement search starts', async () => {
    const fixture = pdfFixture()
    const original = pageLoader(fixture.document)
    let rejectFirst!: (reason: unknown) => void
    let searches = 0
    ;(fixture.document.getPage as ReturnType<typeof vi.fn>).mockImplementation(async (number: number) => {
      const page = await original(number)
      if (number !== 2) return page
      searches += 1
      if (searches === 1) {
        return { ...page, getTextContent: () => new Promise((_resolve, reject) => { rejectFirst = reject }) } as PDFPageProxy
      }
      return { ...page, getTextContent: async () => ({ items: [{ str: 'replacement' }] }) } as PDFPageProxy
    })
    render(<PdfPreview url="/content/abort-search" t={t} />)
    await screen.findByText('页 1 / 2')
    const input = screen.getByPlaceholderText('搜索 PDF 文本')
    const form = input.closest('form')!
    fireEvent.change(input, { target: { value: 'old' } })
    fireEvent.submit(form)
    await waitFor(() => { expect(searches).toBe(1) })
    fireEvent.change(input, { target: { value: 'replacement' } })
    fireEvent.submit(form)
    rejectFirst(new Error('aborted old search'))
    expect(await screen.findByText('已跳转到下一处匹配页面')).not.toBeNull()
    expect(screen.queryByText('aborted old search')).toBeNull()
  })

  it('reports active search errors for Error and non-Error failures', async () => {
    for (const failure of [new Error('search error'), 'string search error']) {
      const fixture = pdfFixture()
      const original = pageLoader(fixture.document)
      let calls = 0
      ;(fixture.document.getPage as ReturnType<typeof vi.fn>).mockImplementation(async (number: number) => {
        const page = await original(number)
        calls += 1
        if (calls <= 2) return page
        return { ...page, getTextContent: async () => { throw failure } } as unknown as PDFPageProxy
      })
      render(<PdfPreview url="/content/search-error" t={t} />)
      await screen.findByText('页 1 / 2')
      fireEvent.change(screen.getByPlaceholderText('搜索 PDF 文本'), { target: { value: 'query' } })
      fireEvent.submit(screen.getByPlaceholderText('搜索 PDF 文本').closest('form')!)
      expect(await screen.findByText(failure instanceof Error ? failure.message : failure)).not.toBeNull()
      cleanup()
    }
  })

  it('contains missing canvas, non-Error render failure, DPR scaling, and late page resolution', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null)
    pdfFixture()
    render(<PdfPreview url="/content/no-canvas" t={t} />)
    expect(await screen.findByText('Canvas is unavailable.')).not.toBeNull()
    cleanup()

    pdfFixture({ failRender: 'render string' })
    render(<PdfPreview url="/content/render-string" t={t} />)
    expect(await screen.findByText('render string')).not.toBeNull()
    cleanup()

    Object.defineProperty(globalThis, 'devicePixelRatio', { value: 2, configurable: true })
    const scaled = pdfFixture()
    render(<PdfPreview url="/content/scaled" t={t} />)
    await waitFor(() => { expect(scaled.pages.get(1)?.render).toHaveBeenCalled() })
    expect(scaled.pages.get(1)?.render).toHaveBeenCalledWith(expect.objectContaining({ transform: [2, 0, 0, 2, 0, 0] }))
    cleanup()
    Object.defineProperty(globalThis, 'devicePixelRatio', { value: 0, configurable: true })
    const fallbackScale = pdfFixture()
    render(<PdfPreview url="/content/fallback-scale" t={t} />)
    await waitFor(() => { expect(fallbackScale.pages.get(1)?.render).toHaveBeenCalled() })
    expect(fallbackScale.pages.get(1)?.render).toHaveBeenCalledWith(expect.objectContaining({ transform: undefined }))
    cleanup()

    let resolvePage!: (page: PDFPageProxy) => void
    const late = pdfFixture()
    const originalPage = pageLoader(late.document)
    const validPage = await originalPage(1)
    ;(late.document.getPage as ReturnType<typeof vi.fn>).mockClear().mockReturnValue(new Promise((resolve) => { resolvePage = resolve }))
    const view = render(<PdfPreview url="/content/late-canvas" t={t} />)
    await waitFor(() => { expect(late.document.getPage).toHaveBeenCalled() })
    view.unmount()
    resolvePage(validPage)
    await Promise.resolve()

    let rejectRender!: (reason: unknown) => void
    const lateRender = pdfFixture()
    const lateRenderPage = await pageLoader(lateRender.document)(1)
    ;(lateRenderPage.render as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: new Promise((_resolve, reject) => { rejectRender = reject }),
      cancel: vi.fn(),
    } as unknown as RenderTask)
    const rendering = render(<PdfPreview url="/content/late-render" t={t} />)
    await waitFor(() => { expect(lateRenderPage.render).toHaveBeenCalled() })
    rendering.unmount()
    rejectRender(new Error('late render failure'))
    await Promise.resolve()
    expect(screen.queryByText('late render failure')).toBeNull()
  })
})
