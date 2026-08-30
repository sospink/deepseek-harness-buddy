// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DOCX_FRAME_CHANNEL } from '../src/client/docx-preview.ts'
import { zh } from '../src/client/locales.ts'

const mocks = vi.hoisted(() => ({
  loadBytes: vi.fn(), loadRuntime: vi.fn(), inspect: vi.fn(), frameHtml: vi.fn(), parse: vi.fn(),
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
}))
vi.mock('@deepseek-ai/dsh-util-crypto', () => ({ randomUUID: mocks.randomUUID }))
vi.mock('../src/client/docx-preview.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/docx-preview.ts')>()
  return {
    ...actual,
    loadBoundedBytes: mocks.loadBytes,
    loadDocxRuntime: mocks.loadRuntime,
    inspectDocxBuffer: mocks.inspect,
    docxFrameHtml: mocks.frameHtml,
    parseDocxFrameMessage: mocks.parse,
  }
})
import { DocxPreview } from '../src/client/DocxPreview.tsx'

const t = makeTranslate(zh)


function captureMessageListener(): {
  readonly listener: (event: MessageEvent<unknown>) => void
  readonly added: ReturnType<typeof vi.spyOn>
  readonly removed: ReturnType<typeof vi.spyOn>
} {
  let listener: ((event: MessageEvent<unknown>) => void) | undefined
  const added = vi.spyOn(window, 'addEventListener').mockImplementation((type, callback) => {
    if (type === 'message') listener = callback as (event: MessageEvent<unknown>) => void
  })
  const removed = vi.spyOn(window, 'removeEventListener').mockImplementation(() => undefined)
  return {
    get listener() {
      if (listener === undefined) throw new Error('message listener is not registered')
      return listener
    },
    added,
    removed,
  }
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); for (const mock of Object.values(mocks)) mock.mockReset() })

function successfulLoad() {
  mocks.loadBytes.mockResolvedValue(new Uint8Array([1, 2, 3]))
  mocks.loadRuntime.mockResolvedValue('runtime')
  mocks.inspect.mockResolvedValue({ buffer: new ArrayBuffer(4), entries: 4, expandedBytes: 40 })
  mocks.frameHtml.mockReturnValue('<!doctype html><p>frame</p>')
}

describe('DocxPreview', () => {
  it('loads, preflights, mounts an opaque iframe, sends once, and accepts ready metadata', async () => {
    successfulLoad()
    mocks.parse.mockImplementation((value: unknown) => value)
    const messages = captureMessageListener()
    const view = render(<DocxPreview url="/content/docx" t={t} />)
    expect(screen.getByText('正在读取 DOCX…')).not.toBeNull()
    const iframe = await screen.findByTitle('隔离 DOCX 文档预览')
    await waitFor(() => { expect(messages.added).toHaveBeenCalledWith('message', expect.any(Function)) })
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('srcdoc')).toContain('frame')
    const contentWindow = (iframe as HTMLIFrameElement).contentWindow
    if (contentWindow === null) throw new Error('iframe has no contentWindow')
    const post = vi.spyOn(contentWindow, 'postMessage')
    messages.listener(new MessageEvent('message', {
      source: window, data: { channel: DOCX_FRAME_CHANNEL, nonce: 'bad', type: 'boot' },
    }))
    expect(post).not.toHaveBeenCalled()
    messages.listener(new MessageEvent('message', {
      source: contentWindow, data: { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'boot' },
    }))
    await waitFor(() => { expect(mocks.parse).toHaveBeenCalled() })
    await waitFor(() => { expect(post).toHaveBeenCalledOnce() })
    expect(post.mock.calls[0]?.[0]).toMatchObject({ type: 'render' })
    await Promise.resolve()
    messages.listener(new MessageEvent('message', {
      source: contentWindow, data: { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'boot' },
    }))
    await waitFor(() => { expect(mocks.parse).toHaveBeenCalled() })
    await waitFor(() => { expect(post).toHaveBeenCalledOnce() })
    messages.listener(new MessageEvent('message', {
      source: contentWindow, data: { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'ready', pages: 3 },
    }))
    expect(await screen.findByText(/3 页/)).not.toBeNull()
    view.unmount()
    expect(messages.removed).toHaveBeenCalledWith('message', messages.listener)
  })

  it('shows Worker progress before preflight completion', async () => {
    mocks.loadBytes.mockResolvedValue(new Uint8Array([1, 2, 3]))
    mocks.loadRuntime.mockResolvedValue('runtime')
    let resolveInspect!: (value: { buffer: ArrayBuffer; entries: number; expandedBytes: number }) => void
    mocks.inspect.mockImplementation((_buffer: ArrayBuffer, _signal: AbortSignal, options: {
      onProgress(progress: { checked: number; total: number }): void
    }) => {
      options.onProgress({ checked: 2, total: 5 })
      return new Promise((resolve) => { resolveInspect = resolve })
    })
    mocks.frameHtml.mockReturnValue('<p>frame</p>')
    mocks.randomUUID.mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    render(<DocxPreview url="/content/progress" t={t} />)
    expect(await screen.findByText('2 / 5')).not.toBeNull()
    resolveInspect({ buffer: new ArrayBuffer(2), entries: 2, expandedBytes: 20 })
    expect(await screen.findByTitle('隔离 DOCX 文档预览')).not.toBeNull()
  })

  it('ignores preflight completion and rejection after selection cancellation', async () => {
    mocks.loadBytes.mockResolvedValue(new Uint8Array([1]))
    mocks.loadRuntime.mockResolvedValue('runtime')
    let resolveInspect!: (value: { buffer: ArrayBuffer; entries: number; expandedBytes: number }) => void
    mocks.inspect.mockImplementation(() => new Promise((resolve) => { resolveInspect = resolve }))
    const view = render(<DocxPreview url="/content/old-preflight" t={t} />)
    await waitFor(() => { expect(mocks.inspect).toHaveBeenCalled() })
    view.rerender(<DocxPreview url="/content/new-preflight" t={t} />)
    resolveInspect({ buffer: new ArrayBuffer(1), entries: 1, expandedBytes: 1 })
    await Promise.resolve()
    expect(screen.queryByTitle('隔离 DOCX 文档预览')).toBeNull()

    let rejectOld!: (reason: unknown) => void
    let oldSignal!: AbortSignal
    mocks.loadBytes.mockImplementationOnce((_url: string, signal: AbortSignal) => {
      oldSignal = signal
      return new Promise((_resolve, reject) => { rejectOld = reject })
    }).mockImplementation(() => new Promise(() => undefined))
    mocks.loadRuntime.mockResolvedValue('runtime')
    view.rerender(<DocxPreview url="/content/old-download" t={t} />)
    await waitFor(() => { expect(oldSignal).toBeDefined() })
    view.rerender(<DocxPreview url="/content/new-download" t={t} />)
    await waitFor(() => { expect(oldSignal.aborted).toBe(true) })
    rejectOld(new Error('late cancelled failure'))
    await Promise.resolve()
    expect(screen.queryByText('late cancelled failure')).toBeNull()
  })

  it('handles frame failure/default failure and ignores invalid or foreign messages', async () => {
    for (const message of ['frame failed', undefined]) {
      successfulLoad()
      mocks.parse.mockImplementation((value: unknown) => value)
      const messages = captureMessageListener()
      render(<DocxPreview url="/content/docx" t={t} />)
      const iframe = await screen.findByTitle('隔离 DOCX 文档预览') as HTMLIFrameElement
      await waitFor(() => { expect(messages.added).toHaveBeenCalledWith('message', expect.any(Function)) })
      const contentWindow = iframe.contentWindow
      if (contentWindow === null) throw new Error('iframe has no contentWindow')
      mocks.parse.mockReturnValueOnce(undefined)
      messages.listener(new MessageEvent('message', { source: contentWindow, data: {} }))
      expect(screen.queryByText('DOCX 预览失败')).toBeNull()
      mocks.parse.mockReturnValueOnce({ channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'failure', ...(message === undefined ? {} : { message }) })
      messages.listener(new MessageEvent('message', { source: contentWindow, data: {} }))
      expect(await screen.findByText(message ?? t('docx.renderFailed'))).not.toBeNull()
      cleanup()
    }
  })

  it('reports load Error/string failures, retries, and aborts selection changes', async () => {
    const firstController: AbortSignal[] = []
    mocks.loadBytes.mockImplementation((_url: string, signal: AbortSignal) => {
      firstController.push(signal)
      return Promise.reject(new Error('download failed'))
    })
    mocks.loadRuntime.mockResolvedValue('runtime')
    const view = render(<DocxPreview url="/content/one" t={t} />)
    expect(await screen.findByText('download failed')).not.toBeNull()
    mocks.loadBytes.mockRejectedValueOnce('string failure')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('string failure')).not.toBeNull()
    mocks.loadBytes.mockImplementation(() => new Promise(() => undefined))
    view.rerender(<DocxPreview url="/content/two" t={t} />)
    await waitFor(() => { expect(firstController[0]?.aborted).toBe(true) })
  })

  it('times out rendering and does not time out after ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    successfulLoad()
    mocks.parse.mockImplementation((value: unknown) => value)
    const timed = render(<DocxPreview url="/content/timeout" t={t} />)
    await screen.findByTitle('隔离 DOCX 文档预览')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(screen.getByText(t('docx.timeout'))).not.toBeNull()
    timed.unmount()

    successfulLoad()
    const messages = captureMessageListener()
    render(<DocxPreview url="/content/ready" t={t} />)
    const readyFrame = await screen.findByTitle('隔离 DOCX 文档预览') as HTMLIFrameElement
    await waitFor(() => { expect(messages.added).toHaveBeenCalledWith('message', expect.any(Function)) })
    const contentWindow = readyFrame.contentWindow
    if (contentWindow === null) throw new Error('iframe has no contentWindow')
    messages.listener(new MessageEvent('message', {
      source: contentWindow, data: { channel: DOCX_FRAME_CHANNEL, nonce: 'n', type: 'ready' },
    }))
    expect(await screen.findByText('已在无网络的隔离环境中渲染')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(screen.queryByText(t('docx.timeout'))).toBeNull()
  })
})
