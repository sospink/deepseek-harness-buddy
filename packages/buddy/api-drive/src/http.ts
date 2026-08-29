/** Authenticated binary upload and content routes for Buddy Drive. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { DriveError, DriveFileId, DriveFolderId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { DriveHttpError, readBoundedBody } from './body.ts'
import { driveVersionView } from './feed.ts'
import { DRIVE_CONTENT_PATH, DRIVE_UPLOAD_PATH } from './paths.ts'
import type { DriveFileKind, DriveHttpFailure, DriveUploadValue } from './types.ts'

const DOCX_MEDIA = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function fail(response: ServerResponse, error: DriveHttpError): void {
  json(response, error.status, { error: { code: error.code, message: error.message } } satisfies DriveHttpFailure)
}

function oneParam(url: URL, name: string, required = false): string | undefined {
  const values = url.searchParams.getAll(name)
  if (values.length > 1 || (required && values.length !== 1) || values[0] === '') {
    throw new DriveHttpError(400, 'bad-request', `Query parameter ${name} is invalid.`)
  }
  return values[0]
}

function assertParams(url: URL, allowed: ReadonlySet<string>): void {
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw new DriveHttpError(400, 'bad-request', `Unknown query parameter ${key}.`)
  }
}

export function driveHttpError(error: unknown): DriveHttpError {
  if (error instanceof DriveHttpError) return error
  if (error instanceof DriveError) {
    if (error.code === 'FILE_TOO_LARGE' || error.code === 'LIBRARY_QUOTA_EXCEEDED') {
      return new DriveHttpError(413, error.code, error.message)
    }
    if (error.code.endsWith('_NOT_FOUND') || error.code === 'BLOB_MISSING') {
      return new DriveHttpError(404, error.code, error.message)
    }
    if (error.code === 'DUPLICATE_NAME' || error.code === 'INVALID_MOVE' || error.code === 'FILE_DELETED') {
      return new DriveHttpError(409, error.code, error.message)
    }
    if (error.code.startsWith('INVALID_') || error.code === 'UNSUPPORTED_FILE_TYPE'
      || error.code === 'MEDIA_TYPE_MISMATCH') {
      return new DriveHttpError(400, error.code, error.message)
    }
    return new DriveHttpError(500, error.code, 'Drive storage is unavailable.')
  }
  return new DriveHttpError(500, 'internal', 'Drive request failed.')
}

function authenticate(ctx: Context, request: IncomingMessage): void {
  const rejection = ctx.connection.requestRejection(request)
  if (rejection !== undefined) {
    throw new DriveHttpError(rejection, rejection === 401 ? 'unauthorized' : 'forbidden', rejection === 401 ? 'Unauthorized.' : 'Forbidden.')
  }
}

function mediaTypeHeader(request: IncomingMessage): string | undefined {
  const value = request.headers['x-buddy-drive-media-type']
  if (Array.isArray(value)) throw new DriveHttpError(400, 'bad-request', 'Media type header is ambiguous.')
  return value
}

/** Create the exact authenticated upload route. */
export function createDriveUploadRoute(ctx: Context): WebRoute {
  return {
    kind: 'exact',
    path: DRIVE_UPLOAD_PATH,
    handler: async (request, response) => {
      try {
        authenticate(ctx, request)
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST')
          throw new DriveHttpError(405, 'method-not-allowed', 'Method not allowed.')
        }
        const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
        if (contentType !== 'application/octet-stream') {
          throw new DriveHttpError(415, 'unsupported-content-type', 'Content-Type must be application/octet-stream.')
        }
        const url = new URL(request.url ?? DRIVE_UPLOAD_PATH, 'http://dsh.internal')
        assertParams(url, new Set(['fileId', 'name', 'kind', 'parentId', 'tag']))
        const data = await readBoundedBody(request, ctx.drive.limits.maxFileBytes)
        const declaredMediaType = mediaTypeHeader(request)
        const fileId = oneParam(url, 'fileId')
        let value: DriveUploadValue
        if (fileId !== undefined) {
          if (url.searchParams.has('name') || url.searchParams.has('kind')
            || url.searchParams.has('parentId') || url.searchParams.has('tag')) {
            throw new DriveHttpError(400, 'bad-request', 'Version upload accepts only fileId.')
          }
          const version = await ctx.drive.createVersion({
            fileId: DriveFileId(fileId), data,
            ...(declaredMediaType === undefined ? {} : { declaredMediaType }),
          })
          const file = ctx.drive.getFile(version.fileId)
          if (file === undefined) throw new DriveHttpError(500, 'internal', 'Committed file is unavailable.')
          value = { kind: 'version', version: driveVersionView(version), file }
        } else {
          const name = oneParam(url, 'name', true) as string
          const kind = oneParam(url, 'kind', true) as DriveFileKind
          const parentId = oneParam(url, 'parentId')
          const file = await ctx.drive.importFile({
            libraryId: ctx.drive.library().id,
            name,
            kind,
            data,
            tags: url.searchParams.getAll('tag'),
            ...(parentId === undefined ? {} : { parentId: DriveFolderId(parentId) }),
            ...(declaredMediaType === undefined ? {} : { declaredMediaType }),
          })
          value = { kind: 'file', file }
        }
        json(response, 201, value)
      } catch (error) {
        fail(response, driveHttpError(error))
      }
    },
  }
}

interface ByteRange { readonly start: number; readonly end: number }

export function parseRange(value: string | undefined, size: number): ByteRange | undefined {
  if (value === undefined) return undefined
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value)
  if (match === null || (match[1] === '' && match[2] === '')) throw new DriveHttpError(416, 'invalid-range', 'Range is invalid.')
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new DriveHttpError(416, 'invalid-range', 'Range is invalid.')
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)
    || start < 0 || requestedEnd < start || start >= size) {
    throw new DriveHttpError(416, 'invalid-range', 'Range is invalid.')
  }
  return { start, end: Math.min(requestedEnd, size - 1) }
}

function contentDisposition(name: string): string {
  return `inline; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Create the authenticated version-content prefix route. */
export function createDriveContentRoute(ctx: Context): WebRoute {
  return {
    kind: 'prefix',
    path: DRIVE_CONTENT_PATH,
    handler: async (request, response) => {
      try {
        authenticate(ctx, request)
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('allow', 'GET, HEAD')
          throw new DriveHttpError(405, 'method-not-allowed', 'Method not allowed.')
        }
        const pathname = new URL(request.url ?? DRIVE_CONTENT_PATH, 'http://dsh.internal').pathname
        const suffix = pathname.slice(DRIVE_CONTENT_PATH.length)
        if (!/^\/[A-Za-z0-9-]+$/u.test(suffix)) throw new DriveHttpError(404, 'version-not-found', 'Drive version not found.')
        const versionId = DriveVersionId(decodeURIComponent(suffix.slice(1)))
        const version = ctx.drive.getVersion(versionId)
        if (version === undefined) throw new DriveHttpError(404, 'version-not-found', 'Drive version not found.')
        const file = ctx.drive.getFile(version.fileId)
        if (file === undefined) throw new DriveHttpError(500, 'internal', 'Drive file is unavailable.')
        const stored = await ctx.drive.readVersion(versionId)
        let range: ByteRange | undefined
        try { range = parseRange(request.headers.range, stored.data.byteLength) } catch (error) {
          response.setHeader('content-range', `bytes */${String(stored.data.byteLength)}`)
          throw error
        }
        const body = range === undefined ? stored.data : stored.data.subarray(range.start, range.end + 1)
        const status = range === undefined ? 200 : 206
        const headers: Record<string, string> = {
          'content-type': file.mediaType === DOCX_MEDIA ? DOCX_MEDIA : file.mediaType,
          'content-length': String(body.byteLength),
          'content-disposition': contentDisposition(file.name),
          'accept-ranges': 'bytes',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "sandbox; default-src 'none'",
          etag: `"${version.digest}"`,
        }
        if (range !== undefined) headers['content-range'] = `bytes ${String(range.start)}-${String(range.end)}/${String(stored.data.byteLength)}`
        response.writeHead(status, headers)
        response.end(request.method === 'HEAD' ? undefined : Buffer.from(body))
      } catch (error) {
        fail(response, driveHttpError(error))
      }
    },
  }
}
