import { EventEmitter } from 'node:events'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevelopmentArtifactRoute, createDevelopmentUploadRoute } from '../src/http.ts'
import { DevelopmentManagementStore } from '../src/service.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function request(input: { method?: string; url: string; headers?: IncomingHttpHeaders; body?: Uint8Array }): IncomingMessage {
  const stream = Readable.from(input.body === undefined ? [] : [Buffer.from(input.body)]) as IncomingMessage
  Object.defineProperties(stream, {
    method: { value: input.method ?? 'GET' }, url: { value: input.url }, headers: { value: input.headers ?? {} }, complete: { value: true },
  })
  return stream
}

class ResponseCapture extends EventEmitter {
  status = 0
  readonly headers = new Map<string, string>()
  readonly chunks: Buffer[] = []
  headersSent = false
  writableEnded = false

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value))
    return this
  }
  writeHead(status: number, headers?: Readonly<Record<string, string>>): this {
    this.status = status
    this.headersSent = true
    for (const [name, value] of Object.entries(headers ?? {})) this.setHeader(name, value)
    return this
  }
  write(chunk: Uint8Array | string): boolean { this.chunks.push(Buffer.from(chunk)); return true }
  end(chunk?: Uint8Array | string): this {
    if (chunk !== undefined) this.write(chunk)
    this.writableEnded = true
    this.emit('finish')
    return this
  }
  destroy(): this { return this }
  body(): Buffer { return Buffer.concat(this.chunks) }
  json(): unknown { return JSON.parse(this.body().toString('utf8')) as unknown }
  asResponse(): ServerResponse { return this as unknown as ServerResponse }
}

async function fixture(rejection?: 401 | 403) {
  const root = await mkdtemp(join(tmpdir(), 'buddy-development-http-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  ctx.provide('connection', { requestRejection: () => rejection } as never)
  const store = new DevelopmentManagementStore(ctx, {
    root, repositoryRoots: [root], maxFileBytes: 1024 * 1024, maxTaskBytes: 4 * 1024 * 1024,
    maxCommandOutputBytes: 64 * 1024, commandTimeoutMs: 10_000, checkCommands: [], integrationProvider: 'none',
  })
  await store.initialize()
  const task = await store.createTask({
    title: '原型文件', discipline: 'agent-application', priority: 2,
    description: '上传原型。', acceptanceCriteria: '文件可以安全下载。',
  })
  return { ctx, store, task, upload: createDevelopmentUploadRoute(ctx, store), artifact: createDevelopmentArtifactRoute(ctx, store) }
}

async function invoke(
  handler: (request: IncomingMessage, response: ServerResponse) => unknown,
  req: IncomingMessage,
): Promise<ResponseCapture> {
  const response = new ResponseCapture()
  await handler(req, response.asResponse())
  return response
}

function uploadUrl(taskId: string, relativePath = 'prototype.html'): string {
  return `/api/buddy/development-management/upload?${new URLSearchParams({ taskId, role: 'product-manager', rootName: 'requirements', relativePath, name: relativePath }).toString()}`
}

describe('development-management HTTP routes', () => {
  it('streams an upload to durable storage and serves GET/HEAD downloads', async () => {
    const value = await fixture()
    const body = Buffer.from('<main>低空原型</main>')
    const uploaded = await invoke(value.upload.handler, request({
      method: 'POST', url: uploadUrl(value.task.id),
      headers: { 'content-length': String(body.byteLength), 'content-type': 'text/html' }, body,
    }))
    expect(uploaded.status).toBe(201)
    const artifact = (uploaded.json() as { artifact: { id: string; digest: string } }).artifact
    expect(artifact.digest).toMatch(/^sha256:/u)

    const path = `/api/buddy/development-management/artifact/${artifact.id}`
    const downloaded = await invoke(value.artifact.handler, request({ method: 'GET', url: path }))
    await new Promise<void>(resolve => downloaded.once('finish', resolve))
    expect(downloaded.status).toBe(200)
    expect(downloaded.body()).toEqual(body)
    expect(downloaded.headers.get('content-disposition')).toContain('prototype.html')

    const headed = await invoke(value.artifact.handler, request({ method: 'HEAD', url: path }))
    expect(headed.status).toBe(200)
    expect(headed.body()).toHaveLength(0)
  })

  it('rejects unauthenticated uploads before allocating storage', async () => {
    const value = await fixture(401)
    const response = await invoke(value.upload.handler, request({
      method: 'POST', url: uploadUrl(value.task.id), headers: { 'content-length': '1' }, body: Buffer.from('x'),
    }))
    expect(response.status).toBe(401)
    expect(response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized.' } })
    expect(value.store.baseline().artifacts).toHaveLength(0)
  })

  it('rejects byte mismatches and duplicate task paths without publishing an artifact', async () => {
    const value = await fixture()
    const mismatch = await invoke(value.upload.handler, request({
      method: 'POST', url: uploadUrl(value.task.id), headers: { 'content-length': '8', 'content-type': 'text/html' }, body: Buffer.from('short'),
    }))
    expect(mismatch.status).toBe(409)
    expect(mismatch.json()).toMatchObject({ error: { code: 'upload-mismatch' } })
    expect(value.store.baseline().artifacts).toHaveLength(0)

    const body = Buffer.from('<main />')
    const first = await invoke(value.upload.handler, request({
      method: 'POST', url: uploadUrl(value.task.id), headers: { 'content-length': String(body.length), 'content-type': 'text/html' }, body,
    }))
    expect(first.status).toBe(201)
    const duplicate = await invoke(value.upload.handler, request({
      method: 'POST', url: uploadUrl(value.task.id), headers: { 'content-length': String(body.length), 'content-type': 'text/html' }, body,
    }))
    expect(duplicate.status).toBe(409)
    expect(duplicate.json()).toMatchObject({ error: { code: 'duplicate-artifact' } })
    expect(value.store.baseline().artifacts).toHaveLength(1)
  })
})
