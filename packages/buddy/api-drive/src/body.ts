/** Bounded raw upload-body intake for Buddy Drive. */

import type { IncomingMessage } from 'node:http'

/** HTTP refusal safe to return without request data. */
export class DriveHttpError extends Error {
  override readonly name = 'DriveHttpError'

  constructor(
    readonly status: 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 416 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function contentLength(request: IncomingMessage): number | undefined {
  const value = request.headers['content-length']
  if (value === undefined) return undefined
  if (!/^(0|[1-9]\d*)$/u.test(value)) throw new DriveHttpError(400, 'invalid-content-length', 'Invalid Content-Length.')
  const length = Number(value)
  if (!Number.isSafeInteger(length)) throw new DriveHttpError(413, 'upload-too-large', 'Upload is too large.')
  return length
}

/** Read an exact bounded binary request body. */
export async function readBoundedBody(request: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const declared = contentLength(request)
  if (declared !== undefined && declared > maxBytes) {
    request.resume()
    throw new DriveHttpError(413, 'upload-too-large', 'Upload is too large.')
  }
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const raw of request) {
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as string)
      size += chunk.byteLength
      if (size > maxBytes) {
        request.resume()
        throw new DriveHttpError(413, 'upload-too-large', 'Upload is too large.')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof DriveHttpError) throw error
    throw new DriveHttpError(400, 'upload-aborted', 'Upload body was aborted.')
  }
  if (!request.complete) throw new DriveHttpError(400, 'upload-aborted', 'Upload body was aborted.')
  return Buffer.concat(chunks, size)
}
