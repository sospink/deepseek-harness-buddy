/** Host owner of cancellable, heap- and wall-bounded document extraction workers. */

import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import type { DriveMediaType } from '@sospink/dsh-buddy-drive'
import { normalizeText } from './budget.ts'
import { parseWorkerOutput, type ExtractWorkerInput } from './protocol.ts'

/* v8 ignore next -- built-lib worker path is exercised by a dedicated e2e. */
const WORKER_PATH = fileURLToPath(new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './worker.ts' : './worker.cjs', import.meta.url))

export interface ExtractConfig {
  readonly maxSourceBytes: number
  readonly maxTextBytes: number
  readonly timeoutMs: number
  readonly maxOldGenerationSizeMb: number
}

export interface ExtractedText {
  readonly text: string
  readonly truncated: boolean
  readonly warnings: readonly string[]
}

interface WorkerLike {
  once(event: 'message', listener: (value: unknown) => void): this
  once(event: 'error', listener: (error: Error) => void): this
  once(event: 'exit', listener: (code: number) => void): this
  terminate(): Promise<number>
}

interface ExtractOptions {
  readonly createWorker?: (input: ExtractWorkerInput) => WorkerLike
}

/** Extract text from one admitted immutable source, isolating complex formats in a one-shot Worker. */
export async function extractDriveText(input: {
  readonly mediaType: DriveMediaType
  readonly data: Uint8Array
  readonly signal: AbortSignal
  readonly config: ExtractConfig
  readonly options?: ExtractOptions
}): Promise<ExtractedText> {
  if (input.data.byteLength > input.config.maxSourceBytes) {
    throw new Error(`Drive source exceeds extraction limit (${String(input.config.maxSourceBytes)} bytes).`)
  }
  if (input.mediaType === 'text/markdown') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(input.data)
    return { text: normalizeText(text), truncated: false, warnings: [] }
  }
  const buffer = new ArrayBuffer(input.data.byteLength)
  new Uint8Array(buffer).set(input.data)
  const workerInput: ExtractWorkerInput = { mediaType: input.mediaType, buffer, maxTextBytes: input.config.maxTextBytes }
  const worker = input.options?.createWorker?.(workerInput) ?? new Worker(WORKER_PATH, {
    workerData: workerInput,
    transferList: [buffer],
    env: {},
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: input.config.maxOldGenerationSizeMb },
  })
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (operation: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      input.signal.removeEventListener('abort', abort)
      void worker.terminate()
      operation()
    }
    const abort = (): void => { finish(() => { reject(input.signal.reason ?? new DOMException('Aborted', 'AbortError')) }) }
    const timer = setTimeout(() => { finish(() => { reject(new Error('Drive document extraction timed out.')) }) }, input.config.timeoutMs)
    worker.once('message', (value) => {
      const result = parseWorkerOutput(value)
      if (result === undefined) { finish(() => { reject(new Error('Drive extraction Worker returned an invalid response.')) }); return }
      if (!result.ok) { finish(() => { reject(new Error(result.message)) }); return }
      finish(() => { resolve({ text: normalizeText(result.text), truncated: result.truncated, warnings: result.warnings }) })
    })
    worker.once('error', (error) => { finish(() => { reject(error) }) })
    worker.once('exit', (code) => { if (code !== 0) finish(() => { reject(new Error(`Drive extraction Worker exited with code ${String(code)}.`)) }) })
    if (input.signal.aborted) abort()
    else input.signal.addEventListener('abort', abort, { once: true })
  })
}
