/** Same-origin Buddy Drive XHR upload transport with bounded progress and cancellation. */

import type { DriveFile, DriveFileKind, DriveFolderId } from '@sospink/dsh-buddy-api-drive/types'
import { DRIVE_UPLOAD_PATH } from '@sospink/dsh-buddy-api-drive/paths'

/** Maximum retained queue rows; terminal rows must be cleared before adding more. */
export const DRIVE_UPLOAD_QUEUE_MAX_ITEMS = 100
/** Maximum requests concurrently sending bytes to the Host. */
export const DRIVE_UPLOAD_QUEUE_CONCURRENCY = 2
/** One upload request wall-clock budget. */
export const DRIVE_UPLOAD_TIMEOUT_MS = 120_000

export interface UploadDriveFileInput {
  readonly file: File
  readonly parentId?: DriveFolderId
  readonly kind: DriveFileKind
  readonly tags?: readonly string[]
}

export interface UploadTransportInput extends UploadDriveFileInput {
  readonly uploadId: string
}

export interface UploadProgress {
  readonly loaded: number
  readonly total: number
}

export interface UploadRequest {
  readonly promise: Promise<DriveFile>
  abort(): void
}

export type UploadTransport = (
  input: UploadTransportInput,
  onProgress: (progress: UploadProgress) => void,
) => UploadRequest

interface UploadFailureBody {
  readonly error?: { readonly code?: string; readonly message?: string }
}

function uploadQuery(input: UploadDriveFileInput): string {
  const params = new URLSearchParams({ name: input.file.name, kind: input.kind })
  if (input.parentId !== undefined) params.set('parentId', input.parentId)
  for (const tag of input.tags ?? []) params.append('tag', tag)
  return params.toString()
}

function responseValue(xhr: XMLHttpRequest): unknown {
  if (xhr.response !== null && xhr.response !== '') return xhr.response
  try {
    if (xhr.responseText === '') return undefined
    return JSON.parse(xhr.responseText)
  } catch {
    return undefined
  }
}

function uploadFailure(value: unknown): Error {
  const failure = value as UploadFailureBody | undefined
  return new Error(`${failure?.error?.code ?? 'upload-failed'}: ${failure?.error?.message ?? 'Upload failed.'}`)
}

/** Start one authenticated same-origin upload; Host `201` is the only success boundary. */
export function startDriveUpload(
  input: UploadTransportInput,
  onProgress: (progress: UploadProgress) => void,
  createXhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
): UploadRequest {
  const xhr = createXhr()
  const promise = new Promise<DriveFile>((resolve, reject) => {
    xhr.open('POST', `${DRIVE_UPLOAD_PATH}?${uploadQuery(input)}`)
    xhr.responseType = 'json'
    xhr.timeout = DRIVE_UPLOAD_TIMEOUT_MS
    xhr.setRequestHeader('content-type', 'application/octet-stream')
    xhr.setRequestHeader('x-buddy-drive-media-type', input.file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-buddy-drive-upload-id', input.uploadId)
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : input.file.size
      onProgress({ loaded: Math.min(event.loaded, total), total })
    }
    xhr.onload = () => {
      const value = responseValue(xhr)
      if (xhr.status !== 201) { reject(uploadFailure(value)); return }
      const uploaded = value as { readonly kind?: unknown; readonly file?: unknown } | undefined
      if (uploaded?.kind !== 'file' || uploaded.file === undefined) {
        reject(new Error('Upload returned an invalid response.'))
        return
      }
      resolve(uploaded.file as DriveFile)
    }
    xhr.onerror = () => { reject(new Error('Upload network request failed.')) }
    xhr.ontimeout = () => { reject(new Error('Upload request timed out.')) }
    xhr.onabort = () => { reject(new DOMException('Upload cancelled.', 'AbortError')) }
    xhr.send(input.file)
  })
  return { promise, abort: () => { xhr.abort() } }
}
