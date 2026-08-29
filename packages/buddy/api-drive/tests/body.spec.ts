import { describe, expect, it } from 'vitest'
import { readBoundedBody } from '../src/body.ts'
import { request } from './helpers.ts'

describe('readBoundedBody', () => {
  it('reads exact binary bytes and accepts a matching Content-Length', async () => {
    const data = Uint8Array.of(0, 1, 2, 255)
    await expect(readBoundedBody(request({
      body: data, headers: { 'content-length': String(data.length) },
    }), data.length)).resolves.toEqual(Buffer.from(data))
  })

  it.each(['-1', '+1', '01', '1.5', 'x'])(
    'rejects invalid Content-Length %j',
    async (value) => {
      await expect(readBoundedBody(request({ headers: { 'content-length': value } }), 10))
        .rejects.toMatchObject({ status: 400, code: 'invalid-content-length' })
    },
  )

  it('rejects declared and streamed bodies above the limit', async () => {
    await expect(readBoundedBody(request({ headers: { 'content-length': '11' } }), 10))
      .rejects.toMatchObject({ status: 413, code: 'upload-too-large' })
    await expect(readBoundedBody(request({ body: Uint8Array.of(1, 2, 3) }), 2))
      .rejects.toMatchObject({ status: 413, code: 'upload-too-large' })
  })

  it('rejects incomplete and failed streams as aborted uploads', async () => {
    await expect(readBoundedBody(request({ complete: false }), 10))
      .rejects.toMatchObject({ status: 400, code: 'upload-aborted' })
    const failed = request()
    queueMicrotask(() => { failed.destroy(new Error('stream failed')) })
    await expect(readBoundedBody(failed, 10))
      .rejects.toMatchObject({ status: 400, code: 'upload-aborted' })
  })
})
