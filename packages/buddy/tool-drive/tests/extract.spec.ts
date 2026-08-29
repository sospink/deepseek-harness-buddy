import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { extractDriveText, type ExtractConfig } from '../src/extract.ts'
import type { ExtractWorkerInput } from '../src/protocol.ts'

const config: ExtractConfig = {
  maxSourceBytes: 100,
  maxTextBytes: 50,
  timeoutMs: 20,
  maxOldGenerationSizeMb: 32,
}

class FakeWorker extends EventEmitter {
  readonly terminate = vi.fn(async () => 0)
}

function binaryInput(worker: FakeWorker, signal = new AbortController().signal) {
  return extractDriveText({
    mediaType: 'application/pdf',
    data: new Uint8Array([1, 2, 3]),
    signal,
    config,
    options: { createWorker: (input: ExtractWorkerInput) => {
      expect(input.mediaType).toBe('application/pdf')
      expect(input.maxTextBytes).toBe(50)
      expect(new Uint8Array(input.buffer)).toEqual(new Uint8Array([1, 2, 3]))
      return worker
    } },
  })
}

describe('Buddy Drive Host extraction owner', () => {
  it('decodes and normalizes Markdown on the Host path', async () => {
    await expect(extractDriveText({
      mediaType: 'text/markdown',
      data: new TextEncoder().encode('a\r\nb\0'),
      signal: new AbortController().signal,
      config,
    })).resolves.toEqual({ text: 'a\nb', truncated: false, warnings: [] })
    await expect(extractDriveText({
      mediaType: 'text/markdown', data: new Uint8Array([0xff]),
      signal: new AbortController().signal, config,
    })).rejects.toThrow()
  })

  it('rejects source bytes before constructing a Worker', async () => {
    const createWorker = vi.fn()
    await expect(extractDriveText({
      mediaType: 'application/pdf', data: new Uint8Array(101),
      signal: new AbortController().signal, config, options: { createWorker },
    })).rejects.toThrow('exceeds extraction limit')
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('resolves validated Worker success and ignores later terminal signals', async () => {
    const worker = new FakeWorker()
    const promise = binaryInput(worker)
    worker.emit('message', { ok: true, text: 'a\r\nb', truncated: true, warnings: ['w'] })
    await expect(promise).resolves.toEqual({ text: 'a\nb', truncated: true, warnings: ['w'] })
    worker.emit('error', new Error('late'))
    worker.emit('exit', 1)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects Worker authored and invalid outcomes', async () => {
    for (const value of [
      { ok: false, message: 'extract failed' },
      { ok: true, text: 4, truncated: false, warnings: [] },
      null,
    ]) {
      const worker = new FakeWorker()
      const promise = binaryInput(worker)
      worker.emit('message', value)
      await expect(promise).rejects.toThrow(value && 'message' in value ? 'extract failed' : 'invalid response')
    }
  })

  it('rejects Worker errors, non-zero exits, timeout, active abort, and pre-abort', async () => {
    const errorWorker = new FakeWorker()
    const error = binaryInput(errorWorker)
    errorWorker.emit('error', new Error('worker boom'))
    await expect(error).rejects.toThrow('worker boom')

    const exitWorker = new FakeWorker()
    const exit = binaryInput(exitWorker)
    exitWorker.emit('exit', 9)
    await expect(exit).rejects.toThrow('code 9')
    const zeroWorker = new FakeWorker()
    const zero = binaryInput(zeroWorker)
    zeroWorker.emit('exit', 0)
    zeroWorker.emit('message', { ok: false, message: 'after zero' })
    await expect(zero).rejects.toThrow('after zero')

    vi.useFakeTimers()
    const timedWorker = new FakeWorker()
    const timed = binaryInput(timedWorker)
    const timedExpected = expect(timed).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(20)
    await timedExpected
    vi.useRealTimers()

    const controller = new AbortController()
    const abortedWorker = new FakeWorker()
    const aborted = binaryInput(abortedWorker, controller.signal)
    const abortedExpected = expect(aborted).rejects.toThrow('selection changed')
    controller.abort(new Error('selection changed'))
    await abortedExpected

    const pre = new AbortController(); pre.abort()
    const preWorker = new FakeWorker()
    await expect(binaryInput(preWorker, pre.signal)).rejects.toThrow()
  })
})

describe('default extraction Worker', () => {
  it('extracts through the real unbuilt Worker entry and supports no-reason pre-abort', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')
    await expect(extractDriveText({
      mediaType: 'application/pdf', data: pdf,
      signal: new AbortController().signal, config,
    })).rejects.toThrow()

    const noReasonSignal = {
      aborted: true, reason: undefined,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } as unknown as AbortSignal
    const worker = new FakeWorker()
    await expect(binaryInput(worker, noReasonSignal)).rejects.toThrow('Aborted')
  })
})
