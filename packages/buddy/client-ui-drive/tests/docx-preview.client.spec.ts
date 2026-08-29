// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOCX_FRAME_CHANNEL,
  DOCX_PREFLIGHT_TIMEOUT_MS,
  DOCX_PREVIEW_MAX_BYTES,
  DOCX_RENDER_TIMEOUT_MS,
  DOCX_RUNTIME_MAX_BYTES,
  docxFrameHtml,
  inspectDocxBuffer,
  loadBoundedBytes,
  loadDocxRuntime,
  parseDocxFrameMessage,
} from '../src/client/docx-preview.ts'

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly postMessage = vi.fn()
  readonly terminate = vi.fn()
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

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

describe('DOCX bounded loading', () => {
  it('loads streamed bytes at the exact budget', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([
      new Uint8Array([1, 2]), new Uint8Array([3]),
    ], { 'content-length': '3' }))
    await expect(loadBoundedBytes('/docx', new AbortController().signal, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]))
    expect(DOCX_PREVIEW_MAX_BYTES).toBe(20 * 1024 * 1024)
    expect(DOCX_RUNTIME_MAX_BYTES).toBe(512 * 1024)
    expect(DOCX_PREFLIGHT_TIMEOUT_MS).toBe(10_000)
    expect(DOCX_RENDER_TIMEOUT_MS).toBe(15_000)
  })

  it('rejects HTTP and declared/streamed oversized responses', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockResolvedValueOnce(new Response('missing', { status: 404 }))
    await expect(loadBoundedBytes('/missing', new AbortController().signal, 3)).rejects.toThrow('(404)')
    fetch.mockResolvedValueOnce(streamResponse([new Uint8Array([1])], { 'content-length': '4' }))
    await expect(loadBoundedBytes('/declared', new AbortController().signal, 3)).rejects.toThrow('exceeds 3 bytes')

    let cancelled = false
    fetch.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])) },
      cancel() { cancelled = true },
    }), { headers: { 'content-length': 'invalid' } }))
    await expect(loadBoundedBytes('/streamed', new AbortController().signal, 3)).rejects.toThrow('exceeds 3 bytes')
    expect(cancelled).toBe(true)
  })

  it('handles body-less bytes and preserves stream errors when cancellation fails', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockResolvedValueOnce({
      ok: true, status: 200, body: null, headers: new Headers(),
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    } as Response)
    await expect(loadBoundedBytes('/bodyless', new AbortController().signal, 2)).resolves.toEqual(new Uint8Array([1, 2]))
    fetch.mockResolvedValueOnce({
      ok: true, status: 200, body: null, headers: new Headers(),
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    } as Response)
    await expect(loadBoundedBytes('/bodyless-large', new AbortController().signal, 1)).rejects.toThrow('exceeds 1 bytes')

    const reader = {
      read: vi.fn().mockRejectedValue(new Error('stream failed')),
      cancel: vi.fn().mockRejectedValue(new Error('cancel failed')),
      releaseLock: vi.fn(),
    }
    fetch.mockResolvedValueOnce({
      ok: true, status: 200, headers: new Headers(), body: { getReader: () => reader },
    } as unknown as Response)
    await expect(loadBoundedBytes('/broken', new AbortController().signal, 4)).rejects.toThrow('stream failed')
    expect(reader.cancel).toHaveBeenCalled()
    expect(reader.releaseLock).toHaveBeenCalled()
  })

  it('loads and fatally decodes the pinned iframe runtime', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('self.docx = {}'))
    await expect(loadDocxRuntime(new AbortController().signal)).resolves.toBe('self.docx = {}')
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(streamResponse([new Uint8Array([0xff])]))
    await expect(loadDocxRuntime(new AbortController().signal)).rejects.toThrow()
  })
})

describe('DOCX Worker preflight protocol', () => {
  it('rejects non-object Worker frames and supports the default Worker constructor', async () => {
    class BrowserWorker extends FakeWorker {
      readonly url: string
      constructor(url: string) { super(); this.url = url; created.push(this) }
    }
    const created: BrowserWorker[] = []
    vi.stubGlobal('Worker', BrowserWorker)
    const promise = inspectDocxBuffer(new ArrayBuffer(1), new AbortController().signal)
    expect(created[0]?.url).toBe('/api/buddy-drive/assets/docx-preflight-0.4.0.js')
    created[0]?.onmessage?.({ data: null } as MessageEvent)
    await expect(promise).rejects.toThrow('invalid response')
    vi.unstubAllGlobals()

    const worker = new FakeWorker()
    const invalid = inspectDocxBuffer(new ArrayBuffer(1), new AbortController().signal, { createWorker: () => worker })
    worker.onmessage?.({ data: 'bad' } as MessageEvent)
    await expect(invalid).rejects.toThrow('invalid response')
  })

  it('forwards progress and resolves only a valid safe transferred buffer', async () => {
    const worker = new FakeWorker()
    const progress = vi.fn()
    const original = new ArrayBuffer(3)
    const promise = inspectDocxBuffer(original, new AbortController().signal, {
      createWorker: () => worker, onProgress: progress,
    })
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'inspect', buffer: original }, [original])
    worker.onmessage?.({ data: { type: 'progress', checked: 1, total: 2 } } as MessageEvent)
    expect(progress).toHaveBeenCalledWith({ checked: 1, total: 2 })
    worker.onmessage?.({ data: { type: 'safe', buffer: new ArrayBuffer(4), entries: 9, expandedBytes: 44 } } as MessageEvent)
    await expect(promise).resolves.toMatchObject({ entries: 9, expandedBytes: 44 })
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.onmessage?.({ data: { type: 'failure', message: 'ignored after settle' } } as MessageEvent)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects explicit/default failures, invalid responses, and Worker errors', async () => {
    for (const [data, message] of [
      [{ type: 'failure', message: 'unsafe OOXML' }, 'unsafe OOXML'],
      [{ type: 'failure', message: 4 }, 'DOCX preflight failed.'],
      [{ type: 'safe', buffer: 'bad', entries: 1, expandedBytes: 1 }, 'invalid response'],
      [{ type: 'progress', checked: 1.5, total: 2 }, 'invalid response'],
    ] as const) {
      const worker = new FakeWorker()
      const promise = inspectDocxBuffer(new ArrayBuffer(1), new AbortController().signal, { createWorker: () => worker })
      worker.onmessage?.({ data } as MessageEvent)
      await expect(promise).rejects.toThrow(message)
      expect(worker.terminate).toHaveBeenCalledOnce()
    }

    for (const text of ['worker boom', '']) {
      const worker = new FakeWorker()
      const promise = inspectDocxBuffer(new ArrayBuffer(1), new AbortController().signal, { createWorker: () => worker })
      worker.onerror?.({ message: text } as ErrorEvent)
      await expect(promise).rejects.toThrow(text || 'DOCX preflight Worker failed.')
    }
  })

  it('terminates on timeout, active abort, and pre-aborted input', async () => {
    vi.useFakeTimers()
    const timed = new FakeWorker()
    const timeout = inspectDocxBuffer(new ArrayBuffer(1), new AbortController().signal, {
      createWorker: () => timed, timeoutMs: 10,
    })
    const timeoutExpected = expect(timeout).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10)
    await timeoutExpected
    expect(timed.terminate).toHaveBeenCalledOnce()

    const activeController = new AbortController()
    const active = new FakeWorker()
    const activePromise = inspectDocxBuffer(new ArrayBuffer(1), activeController.signal, { createWorker: () => active })
    const activeExpected = expect(activePromise).rejects.toThrow('selection changed')
    activeController.abort(new Error('selection changed'))
    await activeExpected
    expect(active.terminate).toHaveBeenCalledOnce()

    const preController = new AbortController(); preController.abort()
    const pre = new FakeWorker()
    await expect(inspectDocxBuffer(new ArrayBuffer(1), preController.signal, { createWorker: () => pre })).rejects.toThrow()
    const noReason = new FakeWorker()
    const noReasonSignal = {
      aborted: true,
      reason: undefined,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal
    await expect(inspectDocxBuffer(
      new ArrayBuffer(1), noReasonSignal, { createWorker: () => noReason },
    )).rejects.toThrow('Aborted')
    expect(pre.postMessage).not.toHaveBeenCalled()
    expect(pre.terminate).toHaveBeenCalledOnce()
  })
})

describe('DOCX opaque iframe protocol', () => {
  it('builds a restrictive no-network srcdoc and escapes script terminators', () => {
    const html = docxFrameHtml('self.docx={};</script><script>bad()</script>', 'nonce-1')
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("object-src 'none'")
    expect(html).toContain('renderAltChunks:false')
    expect(html).toContain('useBase64URL:true')
    expect(html).toContain('new ResizeObserver(scheduleFit).observe(body)')
    expect(html).toContain('requestAnimationFrame')
    expect(html).toContain('content-visibility:auto')
    expect(html).toContain('contain-intrinsic-size:816px 1056px')
    expect(html).toContain("section.style.transform='scale('")
    expect(html).toContain("holder.className='buddy-docx-page'")
    expect(html).toContain('message.buffer instanceof ArrayBuffer')
    expect(html).toContain('event.source!==parent')
    expect(html).toContain('<\\/script><script>bad()<\\/script>')
    expect(html).not.toContain('allow-same-origin')
  })

  it('accepts only nonce-bound metadata messages with valid payloads', () => {
    expect(parseDocxFrameMessage({ channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'boot' }, 'n')).toMatchObject({ type: 'boot' })
    expect(parseDocxFrameMessage({ channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'ready', pages: 2 }, 'n')).toMatchObject({ pages: 2 })
    expect(parseDocxFrameMessage({ channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'failure', message: 'bad' }, 'n')).toMatchObject({ message: 'bad' })
    for (const value of [
      null,
      { channel: 'other', nonce: 'n', type: 'boot' },
      { channel: DOCX_FRAME_CHANNEL, nonce: 'other', type: 'boot' },
      { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 1 },
      { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'unknown' },
      { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'ready', pages: -1 },
      { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'ready', pages: 1.5 },
      { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'failure', message: 4 },
    ]) expect(parseDocxFrameMessage(value, 'n')).toBeUndefined()
  })
})
