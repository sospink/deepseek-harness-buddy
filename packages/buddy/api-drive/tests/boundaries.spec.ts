import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { DriveError } from '@sospink/dsh-buddy-drive'
import { DriveHttpError, readBoundedBody } from '../src/body.ts'
import { driveHttpError, parseRange } from '../src/http.ts'
import { request } from './helpers.ts'

describe('Buddy API Drive pure HTTP boundaries', () => {
  it('maps every Drive error family and unknown failures', () => {
    expect(driveHttpError(new DriveHttpError(400, 'direct', 'direct'))).toMatchObject({ status: 400, code: 'direct' })
    for (const code of ['FILE_TOO_LARGE', 'LIBRARY_QUOTA_EXCEEDED'] as const) {
      expect(driveHttpError(new DriveError(code, code))).toMatchObject({ status: 413, code })
    }
    for (const code of ['FILE_NOT_FOUND', 'BLOB_MISSING'] as const) {
      expect(driveHttpError(new DriveError(code, code))).toMatchObject({ status: 404, code })
    }
    for (const code of ['DUPLICATE_NAME', 'INVALID_MOVE', 'FILE_DELETED'] as const) {
      expect(driveHttpError(new DriveError(code, code))).toMatchObject({ status: 409, code })
    }
    for (const code of ['INVALID_NAME', 'UNSUPPORTED_FILE_TYPE', 'MEDIA_TYPE_MISMATCH'] as const) {
      expect(driveHttpError(new DriveError(code, code))).toMatchObject({ status: 400, code })
    }
    expect(driveHttpError(new DriveError('BLOB_CORRUPT', 'secret detail'))).toMatchObject({
      status: 500, code: 'BLOB_CORRUPT', message: 'Drive storage is unavailable.',
    })
    expect(driveHttpError(new Error('unknown'))).toMatchObject({ status: 500, code: 'internal' })
  })

  it('parses absent, complete, open, suffix, clamped, and invalid ranges', () => {
    expect(parseRange(undefined, 10)).toBeUndefined()
    expect(parseRange('bytes=0-0', 10)).toEqual({ start: 0, end: 0 })
    expect(parseRange('bytes=2-', 10)).toEqual({ start: 2, end: 9 })
    expect(parseRange('bytes=-99', 10)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=8-99', 10)).toEqual({ start: 8, end: 9 })
    for (const value of ['bytes=', 'items=0-1', 'bytes=-0', 'bytes=5-2', 'bytes=10-', 'bytes=a-b']) {
      expect(() => parseRange(value, 10)).toThrow(expect.objectContaining({ status: 416 }))
    }
  })

  it('rejects a decimal Content-Length beyond the safe integer range', async () => {
    await expect(readBoundedBody(request({
      headers: { 'content-length': '9007199254740992' },
    }), Number.MAX_SAFE_INTEGER)).rejects.toMatchObject({ status: 413, code: 'upload-too-large' })
  })

  it('accepts a string chunk from a generic IncomingMessage stream', async () => {
    const stream = Readable.from(['text']) as IncomingMessage
    Object.defineProperties(stream, {
      headers: { value: {}, configurable: true },
      complete: { value: true, configurable: true },
    })
    await expect(readBoundedBody(stream, 4)).resolves.toEqual(Buffer.from('text'))
  })
})
