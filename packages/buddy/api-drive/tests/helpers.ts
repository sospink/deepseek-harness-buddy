import { EventEmitter } from 'node:events'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import LocalDriveStore from '../../drive-local/src/index.ts'

export interface DriveHarness {
  readonly ctx: Context
  readonly root: string
  readonly dispose: () => Promise<void>
}

/** Boot the real Drive provider over a persistent in-memory metadata backend. */
export async function driveHarness(options?: {
  rejection?: 401 | 403
  pool?: MemoryMediaPool
  root?: string
}): Promise<DriveHarness> {
  const root = options?.root ?? await mkdtemp(join(tmpdir(), 'buddy-api-drive-'))
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(options?.pool)
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('connection', {
    requestRejection: () => options?.rejection,
  } as never)
  await ctx.plugin(LocalDriveStore, {
    root,
    maxFileBytes: 1024 * 1024,
    maxLibraryBytes: 4 * 1024 * 1024,
    maxDocxEntries: 100,
    maxDocxExpandedBytes: 4 * 1024 * 1024,
    maxDocxCompressionRatio: 100,
    maxAuditEvents: 1000,
  })
  return {
    ctx,
    root,
    dispose: async () => {
      await ctx.fiber.dispose()
      if (options?.root === undefined) await rm(root, { recursive: true, force: true })
    },
  }
}

/** Node request fixture carrying an exact body and completed-stream state. */
export function request(input: {
  method?: string
  url?: string
  headers?: IncomingHttpHeaders
  body?: Uint8Array
  complete?: boolean
} = {}): IncomingMessage {
  const stream = Readable.from(input.body === undefined ? [] : [Buffer.from(input.body)]) as IncomingMessage
  Object.defineProperties(stream, {
    method: { value: input.method ?? 'GET', configurable: true },
    url: { value: input.url ?? '/', configurable: true },
    headers: { value: input.headers ?? {}, configurable: true },
    complete: { value: input.complete ?? true, configurable: true },
  })
  return stream
}

/** Captured response facts from a direct WebRoute invocation. */
export class ResponseCapture extends EventEmitter {
  status = 0
  readonly headers = new Map<string, string>()
  readonly chunks: Buffer[] = []
  headersSent = false
  writableEnded = false

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value))
    return this
  }

  getHeader(name: string): string | undefined { return this.headers.get(name.toLowerCase()) }

  writeHead(status: number, headers?: Readonly<Record<string, string>>): this {
    this.status = status
    this.headersSent = true
    for (const [name, value] of Object.entries(headers ?? {})) this.setHeader(name, value)
    return this
  }

  write(chunk: Uint8Array | string): boolean {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return true
  }

  end(chunk?: Uint8Array | string): this {
    if (chunk !== undefined) this.write(chunk)
    this.writableEnded = true
    this.emit('finish')
    return this
  }

  destroy(): this { return this }

  body(): Buffer { return Buffer.concat(this.chunks) }

  json(): unknown { return JSON.parse(this.body().toString('utf8')) as unknown }

  asServerResponse(): ServerResponse { return this as unknown as ServerResponse }
}
