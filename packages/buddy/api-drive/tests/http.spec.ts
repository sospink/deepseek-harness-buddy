import { afterEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { DriveFile, DriveVersion } from '@sospink/dsh-buddy-drive'
import {
  createDriveContentRoute,
  createDriveUploadRoute,
  DRIVE_CONTENT_PATH,
  DRIVE_UPLOAD_PATH,
} from '../src/http.ts'
import type { DriveHarness } from './helpers.ts'
import { driveHarness, request, ResponseCapture } from './helpers.ts'

let active: DriveHarness[] = []
afterEach(async () => {
  await Promise.all(active.map(item => item.dispose()))
  active = []
})

async function harness(rejection?: 401 | 403): Promise<DriveHarness> {
  const value = await driveHarness(rejection === undefined ? {} : { rejection })
  active.push(value)
  return value
}

async function invoke(
  handler: ReturnType<typeof createDriveUploadRoute>['handler'],
  req: ReturnType<typeof request>,
): Promise<ResponseCapture> {
  const response = new ResponseCapture()
  await handler(req, response.asServerResponse())
  return response
}

function uploadedFile(value: unknown): DriveFile {
  const record = value as { kind?: unknown; file?: unknown }
  expect(record.kind).toBe('file')
  return record.file as DriveFile
}

function uploadedVersion(value: unknown): { version: DriveVersion; file: DriveFile } {
  const record = value as { kind?: unknown; version?: unknown; file?: unknown }
  expect(record.kind).toBe('version')
  return { version: record.version as DriveVersion, file: record.file as DriveFile }
}

describe('Buddy Drive upload route', () => {
  it('authenticates and imports Markdown, PDF, and DOCX source bytes', async () => {
    const { ctx } = await harness()
    const route = createDriveUploadRoute(ctx)
    const parent = await ctx.drive.createFolder({ libraryId: ctx.drive.library().id, name: 'Uploaded' })
    const markdown = strToU8('# 角色分工')
    const markdownResponse = await invoke(route.handler, request({
      method: 'POST',
      url: `${DRIVE_UPLOAD_PATH}?name=${encodeURIComponent('角色分工.md')}&kind=role-assignment&parentId=${parent.id}&tag=${encodeURIComponent('低空安全')}`,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(markdown.length),
        'x-buddy-drive-media-type': 'text/markdown',
      },
      body: markdown,
    }))
    expect(markdownResponse.status).toBe(201)
    expect(uploadedFile(markdownResponse.json())).toMatchObject({
      name: '角色分工.md', kind: 'role-assignment', tags: ['低空安全'], mediaType: 'text/markdown',
    })

    const pdfResponse = await invoke(route.handler, request({
      method: 'POST',
      url: `${DRIVE_UPLOAD_PATH}?name=protocol.pdf&kind=safety-protocol`,
      headers: { 'content-type': 'application/octet-stream' },
      body: strToU8('%PDF-1.7\n'),
    }))
    expect(uploadedFile(pdfResponse.json()).mediaType).toBe('application/pdf')

    const docx = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8('<w:document/>'),
    }, { level: 0 })
    const docxResponse = await invoke(route.handler, request({
      method: 'POST',
      url: `${DRIVE_UPLOAD_PATH}?name=roles.docx&kind=role-assignment`,
      headers: { 'content-type': 'application/octet-stream' },
      body: docx,
    }))
    expect(uploadedFile(docxResponse.json()).mediaType).toContain('officedocument')
    expect(ctx.drive.listFiles()).toHaveLength(2)
    expect(ctx.drive.listFiles(parent.id)).toHaveLength(1)
  })

  it('appends an immutable version and rejects ambiguous version parameters', async () => {
    const { ctx } = await harness()
    const route = createDriveUploadRoute(ctx)
    const file = await ctx.drive.importFile({
      libraryId: ctx.drive.library().id, name: 'version.md', kind: 'general',
      data: strToU8('# v1'),
    })
    const response = await invoke(route.handler, request({
      method: 'POST', url: `${DRIVE_UPLOAD_PATH}?fileId=${file.id}`,
      headers: {
        'content-type': 'application/octet-stream', 'x-buddy-drive-media-type': 'text/markdown',
      }, body: strToU8('# v2'),
    }))
    expect(response.status).toBe(201)
    const value = uploadedVersion(response.json())
    expect(value.version.id).not.toBe(file.currentVersionId)
    expect(value.file.currentVersionId).toBe(value.version.id)

    const originalGetFile = ctx.drive.getFile.bind(ctx.drive)
    ctx.drive.getFile = () => undefined
    const missingProjection = await invoke(route.handler, request({
      method: 'POST', url: `${DRIVE_UPLOAD_PATH}?fileId=${file.id}`,
      headers: { 'content-type': 'application/octet-stream' }, body: strToU8('# v-missing'),
    }))
    expect(missingProjection.status).toBe(500)
    ctx.drive.getFile = originalGetFile

    const ambiguous = await invoke(route.handler, request({
      method: 'POST', url: `${DRIVE_UPLOAD_PATH}?fileId=${file.id}&name=bad.md`,
      headers: { 'content-type': 'application/octet-stream' }, body: strToU8('# v3'),
    }))
    expect(ambiguous.status).toBe(400)
    expect(ambiguous.json()).toMatchObject({ error: { code: 'bad-request' } })
  })

  it('rejects authentication, methods, content types, parameters, admission, and body limits', async () => {
    const forbidden = createDriveUploadRoute((await harness(403)).ctx)
    expect((await invoke(forbidden.handler, request({ method: 'POST' }))).status).toBe(403)
    const unauthorized = createDriveUploadRoute((await harness(401)).ctx)
    expect((await invoke(unauthorized.handler, request({ method: 'POST' }))).status).toBe(401)

    const route = createDriveUploadRoute((await harness()).ctx)
    const method = await invoke(route.handler, request({ method: 'GET' }))
    expect(method.status).toBe(405)
    expect(method.getHeader('allow')).toBe('POST')
    expect((await invoke(route.handler, request({
      method: 'POST', headers: { 'content-type': 'text/plain' },
    }))).status).toBe(415)
    expect((await invoke(route.handler, request({
      method: 'POST', headers: {
        'content-type': 'application/octet-stream',
        'x-buddy-drive-media-type': ['text/markdown', 'application/pdf'],
      }, body: strToU8('# x'),
    }))).json()).toMatchObject({ error: { code: 'bad-request' } })
    expect((await invoke(route.handler, request({
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: strToU8('# x'),
    }))).status).toBe(400)
    const noUploadUrl = request({
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: strToU8('# x'),
    })
    Object.defineProperty(noUploadUrl, 'url', { value: undefined })
    expect((await invoke(route.handler, noUploadUrl)).status).toBe(400)
    expect((await invoke(route.handler, request({
      method: 'POST', url: `${DRIVE_UPLOAD_PATH}?unknown=x`,
      headers: { 'content-type': 'application/octet-stream' },
    }))).status).toBe(400)
    expect((await invoke(route.handler, request({
      method: 'POST', url: `${DRIVE_UPLOAD_PATH}?name=a.md&name=b.md&kind=general`,
      headers: { 'content-type': 'application/octet-stream' }, body: strToU8('# x'),
    }))).status).toBe(400)
    expect((await invoke(route.handler, request({
      method: 'POST', url: `${DRIVE_UPLOAD_PATH}?name=bad.exe&kind=general`,
      headers: { 'content-type': 'application/octet-stream' }, body: strToU8('bad'),
    }))).json()).toMatchObject({ error: { code: 'UNSUPPORTED_FILE_TYPE' } })
    expect((await invoke(route.handler, request({
      method: 'POST', url: `${DRIVE_UPLOAD_PATH}?name=large.md&kind=general`,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(2 * 1024 * 1024) },
    }))).status).toBe(413)
  })
})

describe('Buddy Drive content route', () => {
  async function fileFixture(): Promise<{ harness: DriveHarness; file: DriveFile; data: Uint8Array }> {
    const value = await harness()
    const data = strToU8('0123456789')
    const file = await value.ctx.drive.importFile({
      libraryId: value.ctx.drive.library().id, name: 'range.md', kind: 'reference', data,
    })
    return { harness: value, file, data }
  }

  it('serves complete GET and HEAD responses with defensive headers', async () => {
    const { harness: value, file, data } = await fileFixture()
    const route = createDriveContentRoute(value.ctx)
    const get = await invoke(route.handler, request({
      method: 'GET', url: `${DRIVE_CONTENT_PATH}/${file.currentVersionId}`,
    }))
    expect(get.status).toBe(200)
    expect(get.body()).toEqual(Buffer.from(data))
    expect(get.getHeader('content-type')).toBe('text/markdown')
    expect(get.getHeader('accept-ranges')).toBe('bytes')
    expect(get.getHeader('x-content-type-options')).toBe('nosniff')
    expect(get.getHeader('content-security-policy')).toContain('sandbox')
    expect(get.getHeader('content-disposition')).toContain('range.md')
    expect(get.getHeader('etag')).toMatch(/^"sha256:/)

    const head = await invoke(route.handler, request({
      method: 'HEAD', url: `${DRIVE_CONTENT_PATH}/${file.currentVersionId}`,
    }))
    expect(head.status).toBe(200)
    expect(head.body()).toHaveLength(0)
    expect(head.getHeader('content-length')).toBe(String(data.length))
  })

  it('serves DOCX with its verified Office media type', async () => {
    const value = await harness()
    const docx = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w:d/>'),
    }, { level: 0 })
    const file = await value.ctx.drive.importFile({
      libraryId: value.ctx.drive.library().id, name: 'preview.docx', kind: 'reference', data: docx,
    })
    const response = await invoke(createDriveContentRoute(value.ctx).handler, request({
      method: 'GET', url: `${DRIVE_CONTENT_PATH}/${file.currentVersionId}`,
    }))
    expect(response.status).toBe(200)
    expect(response.getHeader('content-type')).toContain('officedocument')
  })

  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-99', '89', 'bytes 8-9/10'],
  ])('serves one byte range %s', async (range, expected, contentRange) => {
    const { harness: value, file } = await fileFixture()
    const response = await invoke(createDriveContentRoute(value.ctx).handler, request({
      method: 'GET', url: `${DRIVE_CONTENT_PATH}/${file.currentVersionId}`, headers: { range },
    }))
    expect(response.status).toBe(206)
    expect(response.body().toString()).toBe(expected)
    expect(response.getHeader('content-range')).toBe(contentRange)
  })

  it.each(['bytes=', 'items=0-1', 'bytes=5-2', 'bytes=99-', 'bytes=-0', 'bytes=a-b'])(
    'rejects invalid range %s with a complete-size marker',
    async (range) => {
      const { harness: value, file } = await fileFixture()
      const response = await invoke(createDriveContentRoute(value.ctx).handler, request({
        method: 'GET', url: `${DRIVE_CONTENT_PATH}/${file.currentVersionId}`, headers: { range },
      }))
      expect(response.status).toBe(416)
      expect(response.getHeader('content-range')).toBe('bytes */10')
    },
  )

  it('rejects authentication, methods, malformed paths, and unknown versions', async () => {
    const forbidden = createDriveContentRoute((await harness(403)).ctx)
    expect((await invoke(forbidden.handler, request({ method: 'GET' }))).status).toBe(403)
    const routeContext = (await harness()).ctx
    const route = createDriveContentRoute(routeContext)
    const method = await invoke(route.handler, request({ method: 'POST' }))
    expect(method.status).toBe(405)
    expect(method.getHeader('allow')).toBe('GET, HEAD')
    expect((await invoke(route.handler, request({ method: 'GET' }))).status).toBe(404)
    const noContentUrl = request({ method: 'GET' })
    Object.defineProperty(noContentUrl, 'url', { value: undefined })
    expect((await invoke(route.handler, noContentUrl)).status).toBe(404)
    expect((await invoke(route.handler, request({
      method: 'GET', url: `${DRIVE_CONTENT_PATH}/bad/path`,
    }))).status).toBe(404)
    expect((await invoke(route.handler, request({
      method: 'GET', url: `${DRIVE_CONTENT_PATH}/00000000-0000-4000-8000-000000000000`,
    }))).status).toBe(404)
    const projected = await routeContext.drive.importFile({
      libraryId: routeContext.drive.library().id, name: 'projection.md', kind: 'general',
      data: strToU8('# projection'),
    })
    const originalGetFile = routeContext.drive.getFile.bind(routeContext.drive)
    routeContext.drive.getFile = () => undefined
    expect((await invoke(route.handler, request({
      method: 'GET', url: `${DRIVE_CONTENT_PATH}/${projected.currentVersionId}`,
    }))).status).toBe(500)
    routeContext.drive.getFile = originalGetFile
  })
})
