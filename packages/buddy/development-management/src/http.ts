/** Authenticated streaming upload and artifact download routes. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { DevelopmentManagementError } from './error.ts'
import { DEVELOPMENT_ARTIFACT_PATH, DEVELOPMENT_UPLOAD_PATH } from './paths.ts'
import { digestArtifactFile, openUploadTarget } from './service.ts'
import type { DevelopmentManagementStore } from './service.ts'
import type { DevelopmentHttpFailure, DevelopmentRole, DevelopmentUploadValue } from './types.ts'

const QUERY = new Set(['taskId', 'role', 'rootName', 'relativePath', 'name'])

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function authenticate(ctx: Context, request: IncomingMessage): void {
  const rejection = ctx.connection.requestRejection(request)
  if (rejection !== undefined) throw new DevelopmentManagementError(rejection === 401 ? 'unauthorized' : 'forbidden', rejection === 401 ? 'Unauthorized.' : 'Forbidden.')
}

function failureStatus(error: DevelopmentManagementError): number {
  if (error.code === 'unauthorized') return 401
  if (error.code === 'forbidden') return 403
  if (error.code.endsWith('-not-found')) return 404
  if (error.code === 'file-too-large' || error.code === 'task-quota-exceeded') return 413
  if (error.code === 'duplicate-artifact' || error.code === 'upload-mismatch') return 409
  return 400
}

function fail(response: ServerResponse, value: unknown): void {
  const error = value instanceof DevelopmentManagementError
    ? value
    : new DevelopmentManagementError('internal', '开发管理请求失败。')
  json(response, value instanceof DevelopmentManagementError ? failureStatus(error) : 500, {
    error: { code: error.code, message: error.message },
  } satisfies DevelopmentHttpFailure)
}

function one(url: URL, name: string): string {
  const values = url.searchParams.getAll(name)
  if (values.length !== 1 || values[0] === '') throw new DevelopmentManagementError('invalid-input', `查询参数 ${name} 无效。`)
  return values[0] as string
}

function contentLength(request: IncomingMessage): number {
  const value = request.headers['content-length']
  if (Array.isArray(value) || value === undefined || !/^\d+$/u.test(value)) throw new DevelopmentManagementError('length-required', '上传必须提供有效 Content-Length。')
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new DevelopmentManagementError('length-required', 'Content-Length 无效。')
  return number
}

async function streamRequest(request: IncomingMessage, handle: FileHandle, maxBytes: number): Promise<number> {
  let bytes = 0
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.byteLength
      if (bytes > maxBytes) throw new DevelopmentManagementError('file-too-large', '文件超过单文件上传限制。')
      await handle.write(buffer)
    }
    await handle.sync()
    return bytes
  } finally {
    await handle.close()
  }
}

/** Create the exact authenticated streaming artifact upload route. */
export function createDevelopmentUploadRoute(ctx: Context, store: DevelopmentManagementStore): WebRoute {
  return {
    kind: 'exact', path: DEVELOPMENT_UPLOAD_PATH,
    handler: async (request, response) => {
      let transaction
      try {
        authenticate(ctx, request)
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST')
          throw new DevelopmentManagementError('method-not-allowed', 'Method not allowed.')
        }
        const url = new URL(request.url ?? DEVELOPMENT_UPLOAD_PATH, 'http://dsh.internal')
        for (const key of url.searchParams.keys()) if (!QUERY.has(key)) throw new DevelopmentManagementError('invalid-input', `未知查询参数 ${key}。`)
        const declaredBytes = contentLength(request)
        transaction = await store.beginUpload({
          taskId: one(url, 'taskId'), role: one(url, 'role') as DevelopmentRole,
          rootName: one(url, 'rootName'), relativePath: one(url, 'relativePath'), name: one(url, 'name'),
          mediaType: request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() ?? 'application/octet-stream',
          declaredBytes,
        })
        const handle = await openUploadTarget(transaction.temporaryPath)
        const bytes = await streamRequest(request, handle, store.config.maxFileBytes)
        const digest = await digestArtifactFile(transaction.temporaryPath)
        if (digest.bytes !== bytes) throw new DevelopmentManagementError('upload-mismatch', '上传文件在提交前发生变化。')
        const artifact = await transaction.commit(digest.digest, bytes)
        json(response, 201, { artifact } satisfies DevelopmentUploadValue)
      } catch (error) {
        await transaction?.abort()
        fail(response, error)
      }
    },
  }
}

/** Create the authenticated artifact download route. */
export function createDevelopmentArtifactRoute(ctx: Context, store: DevelopmentManagementStore): WebRoute {
  return {
    kind: 'prefix', path: DEVELOPMENT_ARTIFACT_PATH,
    handler: (request, response) => {
      try {
        authenticate(ctx, request)
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD')
          throw new DevelopmentManagementError('method-not-allowed', 'Method not allowed.')
        }
        const pathname = new URL(request.url ?? DEVELOPMENT_ARTIFACT_PATH, 'http://dsh.internal').pathname
        const suffix = pathname.slice(DEVELOPMENT_ARTIFACT_PATH.length)
        if (!/^\/[0-9a-f-]{36}$/u.test(suffix)) throw new DevelopmentManagementError('artifact-not-found', '附件不存在。')
        const { artifact, path } = store.artifactPath(suffix.slice(1))
        response.writeHead(200, {
          'content-type': artifact.mediaType || 'application/octet-stream', 'content-length': String(artifact.bytes),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
          'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
        })
        if (request.method === 'HEAD') response.end()
        else createReadStream(path).on('error', () => { response.destroy() }).pipe(response)
      } catch (error) { fail(response, error) }
    },
  }
}
