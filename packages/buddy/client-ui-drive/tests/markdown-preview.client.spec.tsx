// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { MarkdownPreview } from '../src/client/MarkdownPreview.tsx'
import {
  deactivateMarkdownImages,
  loadMarkdownSource,
  MARKDOWN_PREVIEW_MAX_BYTES,
} from '../src/client/markdown-preview.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function streamResponse(chunks: readonly Uint8Array[], headers?: HeadersInit): Response {
  let index = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++]
      if (chunk === undefined) controller.close()
      else controller.enqueue(chunk)
    },
  }), headers === undefined ? {} : { headers })
}

describe('loadMarkdownSource', () => {
  it('loads a bounded UTF-8 stream and accepts an exact declared limit', async () => {
    const encoder = new TextEncoder()
    const chunks = [encoder.encode('# 角色'), encoder.encode('\n安全')]
    const bytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(chunks, { 'content-length': String(bytes) }))
    await expect(loadMarkdownSource('/content', new AbortController().signal, bytes)).resolves.toBe('# 角色\n安全')
  })

  it('rejects HTTP failures and declared oversized documents before reading', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockResolvedValueOnce(new Response('missing', { status: 404 }))
    await expect(loadMarkdownSource('/missing', new AbortController().signal)).rejects.toThrow('(404)')
    fetch.mockResolvedValueOnce(streamResponse([new Uint8Array([1])], { 'content-length': '4' }))
    await expect(loadMarkdownSource('/large', new AbortController().signal, 3)).rejects.toThrow('exceeds 3 bytes')
  })

  it('cancels a stream that crosses the complete preview budget', async () => {
    let cancelled = false
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4]))
      },
      cancel() { cancelled = true },
    }), { headers: { 'content-length': 'not-a-number' } })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    await expect(loadMarkdownSource('/large', new AbortController().signal, 3)).rejects.toThrow('exceeds 3 bytes')
    expect(cancelled).toBe(true)
  })

  it('preserves the original stream failure even when reader cancellation also fails', async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error('stream failed')),
      cancel: vi.fn().mockRejectedValue(new Error('cancel failed')),
      releaseLock: vi.fn(),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response)
    await expect(loadMarkdownSource('/broken', new AbortController().signal)).rejects.toThrow('stream failed')
    expect(reader.cancel).toHaveBeenCalled()
    expect(reader.releaseLock).toHaveBeenCalled()
  })

  it('supports a body-less response and rejects invalid UTF-8', async () => {
    const bodyless = {
      ok: true,
      status: 200,
      body: null,
      headers: new Headers(),
      arrayBuffer: async () => new TextEncoder().encode('plain').buffer,
    } as Response
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(bodyless)
    await expect(loadMarkdownSource('/plain', new AbortController().signal, 5)).resolves.toBe('plain')
    fetch.mockResolvedValueOnce(streamResponse([new Uint8Array([0xff])]))
    await expect(loadMarkdownSource('/invalid', new AbortController().signal)).rejects.toThrow()
    expect(MARKDOWN_PREVIEW_MAX_BYTES).toBe(2 * 1024 * 1024)
  })

  it('rejects a body-less response whose complete value exceeds the budget', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      headers: new Headers(),
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    } as Response)
    await expect(loadMarkdownSource('/large', new AbortController().signal, 1)).rejects.toThrow('exceeds 1 bytes')
  })
})

describe('deactivateMarkdownImages', () => {
  it('escapes parsed inline and reference images without changing code literals', () => {
    const source = [
      '![remote](https://example.com/a.png)',
      '',
      '![reference][logo]',
      '',
      '`![inline](https://example.com/code.png)`',
      '',
      '```md',
      '![fenced](https://example.com/fenced.png)',
      '```',
      '',
      '[logo]: https://example.com/logo.png',
    ].join('\n')
    const safe = deactivateMarkdownImages(source)
    expect(safe).toContain('\\![remote](https://example.com/a.png)')
    expect(safe).toContain('\\![reference][logo]')
    expect(safe).toContain('`![inline](https://example.com/code.png)`')
    expect(safe).toContain('\n![fenced](https://example.com/fenced.png)\n```')
  })
})

describe('MarkdownPreview', () => {
  it('renders through Harness MarkdownText, blocks image elements, and preserves original source mode', async () => {
    const source = '# 角色分工\n\n![tracking](https://example.com/pixel.png)\n\n<script>alert(1)</script>'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(source, { headers: { 'content-type': 'text/markdown' } }))
    const view = render(<MarkdownPreview url="/content/version" t={t} />)
    expect(screen.getByText('正在加载 Markdown…')).not.toBeNull()
    expect(await screen.findByRole('heading', { name: '角色分工' })).not.toBeNull()
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '源码' }))
    expect(view.container.querySelector('pre')?.textContent).toBe(source)
    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    expect(screen.getByText('远程图片已阻止')).not.toBeNull()
  })

  it('reports a failed request and retries the same immutable URL', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('failure', { status: 500 }))
      .mockResolvedValueOnce(new Response('# recovered'))
    render(<MarkdownPreview url="/content/version" t={t} />)
    expect(await screen.findByText('Markdown 预览失败')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: 'recovered' })).not.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reports a non-Error load failure and ignores a rejection after cancellation', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce('string failure')
    const first = render(<MarkdownPreview url="/content/failure" t={t} />)
    expect(await screen.findByText('string failure')).not.toBeNull()
    first.unmount()

    let reject!: (reason: unknown) => void
    fetch.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    const cancelled = render(<MarkdownPreview url="/content/cancelled" t={t} />)
    cancelled.unmount()
    reject(new Error('late failure'))
    await Promise.resolve()
    expect(screen.queryByText('late failure')).toBeNull()
  })

  it('aborts an outstanding request when the selected version changes', async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      signals.push(init?.signal as AbortSignal)
      return new Promise(() => undefined)
    })
    const view = render(<MarkdownPreview url="/content/one" t={t} />)
    view.rerender(<MarkdownPreview url="/content/two" t={t} />)
    await waitFor(() => { expect(signals).toHaveLength(2) })
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    view.unmount()
    expect(signals[1]?.aborted).toBe(true)
  })
})
