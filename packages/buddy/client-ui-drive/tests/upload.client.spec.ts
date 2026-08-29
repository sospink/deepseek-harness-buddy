// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveFileId, DriveLibraryId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import type { DriveFile } from '@sospink/dsh-buddy-api-drive/types'
import {
  DRIVE_UPLOAD_QUEUE_CONCURRENCY,
  DRIVE_UPLOAD_QUEUE_MAX_ITEMS,
  DRIVE_UPLOAD_TIMEOUT_MS,
  startDriveUpload,
} from '../src/client/upload.ts'

const now = '2026-08-29T00:00:00.000Z'
const file: DriveFile = {
  id: DriveFileId('file'), libraryId: DriveLibraryId('default'), name: 'file.md', kind: 'general',
  mediaType: 'text/markdown', currentVersionId: DriveVersionId('version'), tags: [],
  createdAt: now, updatedAt: now,
}

class FakeXhr {
  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  response: unknown = null
  responseText = ''
  responseType: XMLHttpRequestResponseType = ''
  timeout = 0
  status = 0
  readonly open = vi.fn()
  readonly setRequestHeader = vi.fn()
  readonly send = vi.fn()
  readonly abort = vi.fn(() => { this.onabort?.() })
}

const originalXhr = globalThis.XMLHttpRequest
afterEach(() => { vi.restoreAllMocks(); globalThis.XMLHttpRequest = originalXhr })

function request(xhr: FakeXhr, input: Parameters<typeof startDriveUpload>[0] = {
  uploadId: 'upload-id-1',
  file: new File(['abc'], 'role file.md', { type: 'text/markdown' }),
  kind: 'role-assignment', parentId: 'parent' as never, tags: ['a', 'b'],
}) {
  const progress = vi.fn()
  const value = startDriveUpload(input, progress, () => xhr as unknown as XMLHttpRequest)
  return { ...value, progress }
}

describe('startDriveUpload', () => {
  it('pins queue/timeout budgets, sends query/headers/body, reports progress, and resolves Host 201', async () => {
    expect(DRIVE_UPLOAD_QUEUE_MAX_ITEMS).toBe(100)
    expect(DRIVE_UPLOAD_QUEUE_CONCURRENCY).toBe(2)
    expect(DRIVE_UPLOAD_TIMEOUT_MS).toBe(120_000)
    const xhr = new FakeXhr()
    const value = request(xhr)
    expect(xhr.open).toHaveBeenCalledWith('POST', expect.stringContaining('name=role+file.md'))
    expect(xhr.open.mock.calls[0]?.[1]).toContain('parentId=parent')
    expect(xhr.open.mock.calls[0]?.[1]).toContain('tag=a&tag=b')
    expect(xhr.responseType).toBe('json')
    expect(xhr.timeout).toBe(120_000)
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('content-type', 'application/octet-stream')
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('x-buddy-drive-media-type', 'text/markdown')
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('x-buddy-drive-upload-id', 'upload-id-1')
    expect(xhr.send.mock.calls[0]?.[0]).toBeInstanceOf(File)
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 7, total: 3 } as ProgressEvent)
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 2, total: 0 } as ProgressEvent)
    expect(value.progress).toHaveBeenNthCalledWith(1, { loaded: 3, total: 3 })
    expect(value.progress).toHaveBeenNthCalledWith(2, { loaded: 2, total: 3 })
    xhr.status = 201
    xhr.response = { kind: 'file', file }
    xhr.onload?.()
    await expect(value.promise).resolves.toEqual(file)
  })

  it('uses the media fallback and default XMLHttpRequest constructor', () => {
    const xhr = new FakeXhr()
    const XhrConstructor = vi.fn(function xhrConstructor() { return xhr })
    globalThis.XMLHttpRequest = XhrConstructor as unknown as typeof XMLHttpRequest
    startDriveUpload({ uploadId: 'upload-id-2', file: new File(['x'], 'x.md'), kind: 'general' }, vi.fn())
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('x-buddy-drive-media-type', 'application/octet-stream')
  })

  it('reports HTTP/default/malformed success responses', async () => {
    for (const [response, responseText, expected] of [
      [{ error: { code: 'bad', message: 'rejected' } }, '', 'bad: rejected'],
      [null, JSON.stringify({ error: {} }), 'upload-failed: Upload failed.'],
      [null, '{broken', 'upload-failed: Upload failed.'],
      [null, '', 'upload-failed: Upload failed.'],
    ] as const) {
      const xhr = new FakeXhr()
      const value = request(xhr)
      xhr.status = 400
      xhr.response = response
      xhr.responseText = responseText
      xhr.onload?.()
      await expect(value.promise).rejects.toThrow(expected)
    }
    for (const response of [{ kind: 'other' }, { kind: 'file' }]) {
      const xhr = new FakeXhr()
      const value = request(xhr)
      xhr.status = 201
      xhr.response = response
      xhr.onload?.()
      await expect(value.promise).rejects.toThrow('invalid response')
    }
  })

  it('treats responseText access failures as malformed response bodies', async () => {
    const xhr = new FakeXhr()
    const value = request(xhr)
    Object.defineProperty(xhr, 'responseText', {
      configurable: true,
      get: () => { throw new DOMException('responseText is unavailable') },
    })
    xhr.status = 503
    xhr.response = null
    xhr.onload?.()
    await expect(value.promise).rejects.toThrow('upload-failed: Upload failed.')
  })

  it('reports network, timeout, and abort failures and exposes abort()', async () => {
    const cases = [
      ['error', 'Upload network request failed.'],
      ['timeout', 'Upload request timed out.'],
      ['abort', 'Upload cancelled.'],
    ] as const
    for (const [kind, message] of cases) {
      const xhr = new FakeXhr()
      const value = request(xhr)
      if (kind === 'error') xhr.onerror?.()
      else if (kind === 'timeout') xhr.ontimeout?.()
      else value.abort()
      await expect(value.promise).rejects.toThrow(message)
      if (kind === 'abort') expect(xhr.abort).toHaveBeenCalledOnce()
    }
  })
})
