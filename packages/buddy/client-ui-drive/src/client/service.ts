/** React-free browser state and command service for the Buddy Drive UI. */

import { Service } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { RemoteSnapshotStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type { RemoteFailure, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@sospink/dsh-buddy-api-drive/remote'
import type {
  DriveBaseline,
  DriveFile,
  DriveFileId,
  DriveFileKind,
  DriveFolderId,
  DriveFollowFrame,
} from '@sospink/dsh-buddy-api-drive/types'
import { DRIVE_CONTENT_PATH } from '@sospink/dsh-buddy-api-drive/paths'
import {
  DRIVE_UPLOAD_QUEUE_CONCURRENCY,
  DRIVE_UPLOAD_QUEUE_MAX_ITEMS,
  startDriveUpload,
  type UploadDriveFileInput,
  type UploadRequest,
  type UploadTransport,
  type UploadTransportInput,
} from './upload.ts'

/** Lifecycle state of one browser upload queue entry. */
export type DriveUploadStatus = 'queued' | 'uploading' | 'succeeded' | 'failed' | 'cancelled'

/** Browser-visible progress and result state for one upload. */
export interface DriveUploadItem {
  readonly id: string
  readonly name: string
  readonly bytes: number
  readonly loaded: number
  readonly total: number
  readonly status: DriveUploadStatus
  readonly error?: string
  readonly fileId?: DriveFileId
}

/** Client projection lifecycle and view state. */
export interface BuddyDriveSnapshot {
  open: boolean
  state: 'loading' | 'ready' | 'failed'
  data?: DriveBaseline
  error?: string
  uploading: boolean
  uploadQueue: readonly DriveUploadItem[]
}

/** Read-only subscription source exposed to Drive UI components. */
export interface BuddyDriveSource {
  getSnapshot(): BuddyDriveSnapshot
  subscribe(listener: () => void): () => void
}

type DriveRemote = TypertClientRemote['drive']

type StreamOwner = Pick<ClientRemote, '$stream'> & { readonly drive: DriveRemote }

function failureMessage(failure: RemoteFailure): Error {
  return new Error(`${failure.code}: ${failure.message}`)
}



interface UploadJob {
  readonly input: UploadTransportInput
  attempt: number
  request?: UploadRequest
}

export interface BuddyDriveClientOptions {
  readonly uploadTransport?: UploadTransport
  readonly createUploadId?: () => string
}

/** Browser state, Remote mutations, upload, and content-URL facade. */
export class BuddyDriveClient extends Service {
  /** Snapshot source consumed by React or other browser presenters. */
  readonly source: BuddyDriveSource
  private readonly store: SnapshotStore<BuddyDriveSnapshot>
  private opener: HTMLElement | undefined
  private readonly uploadJobs = new Map<string, UploadJob>()
  private readonly activeUploads = new Set<string>()
  private readonly createUploadId: () => string
  private refreshAfterUploads = false
  private uploadRefreshRunning = false
  private readonly uploadTransport: UploadTransport

  constructor(
    ctx: Context,
    private readonly remote: DriveRemote,
    options: BuddyDriveClientOptions = {},
  ) {
    super(ctx, 'buddyDriveUi')
    this.uploadTransport = options.uploadTransport ?? startDriveUpload
    this.createUploadId = options.createUploadId ?? randomUUID
    this.store = createSnapshotStore<BuddyDriveSnapshot>({
      open: false,
      state: 'loading',
      uploading: false,
      uploadQueue: [],
    })
    this.source = this.store
  }

  /** Open the Drive surface and remember an optional focus-restoration target.
   * @param opener - Element to focus when the surface closes.
   */
  open(opener?: HTMLElement): void {
    this.opener = opener
    this.store.update((state) => { state.open = true })
  }

  /** Close the Drive surface and restore focus to its opener on the next microtask. */
  close(): void {
    this.store.update((state) => { state.open = false })
    const opener = this.opener
    this.opener = undefined
    queueMicrotask(() => { opener?.focus() })
  }

  /** Replace the browser projection with a committed Drive baseline.
   * @param data - Committed Drive baseline.
   */
  replace(data: DriveBaseline): void {
    this.store.update((state) => {
      state.data = data
      state.state = 'ready'
      delete state.error
    })
  }

  /** Publish a stream or Remote failure to the browser projection.
   * @param error - Failure value to expose in the browser state.
   */
  failed(error: unknown): void {
    this.store.update((state) => {
      state.state = 'failed'
      state.error = error instanceof Error ? error.message : String(error)
    })
  }

  /** Fetch and publish the current Drive baseline. */
  async refresh(): Promise<void> {
    const result = await this.remote.baseline()
    if (!result.ok) throw failureMessage(result.error)
    this.replace(result.value)
  }

  /** Create a folder through the authenticated Remote and refresh the projection.
   * @param name - Folder name.
   * @param parentId - Optional parent folder id.
   */
  async createFolder(name: string, parentId?: DriveFolderId): Promise<void> {
    const result = await this.remote.createFolder({ name, ...(parentId === undefined ? {} : { parentId }) })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  /** Replace a file's classification and tags through the Remote.
   * @param fileId - File identity.
   * @param kind - New file classification.
   * @param tags - New file tags.
   */
  async updateMetadata(fileId: DriveFileId, kind: DriveFileKind, tags: readonly string[]): Promise<void> {
    const result = await this.remote.updateFileMetadata({ fileId, kind, tags })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  /** Soft-delete a file through the Remote and refresh the projection.
   * @param fileId - File identity.
   */
  async deleteFile(fileId: DriveFileId): Promise<void> {
    const result = await this.remote.deleteFile({ fileId })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  /** Restore a soft-deleted file through the Remote and refresh the projection.
   * @param fileId - File identity.
   */
  async restoreFile(fileId: DriveFileId): Promise<void> {
    const result = await this.remote.restoreFile({ fileId })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  /** Permanently remove selected files through the authenticated Remote.
   * @param fileIds - File identities to remove.
   */
  async purgeFiles(fileIds: readonly DriveFileId[]): Promise<void> {
    const result = await this.remote.purgeFiles({ fileIds })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  /** Add files to the bounded upload queue and start available requests.
   * @param inputs - Files and metadata to enqueue.
   * @returns Generated upload ids in input order.
   */
  enqueueUploads(inputs: readonly UploadDriveFileInput[]): readonly string[] {
    if (inputs.length === 0) return []
    const retained = this.store.getSnapshot().uploadQueue.length
    if (retained + inputs.length > DRIVE_UPLOAD_QUEUE_MAX_ITEMS) {
      throw new Error(`Upload queue accepts at most ${String(DRIVE_UPLOAD_QUEUE_MAX_ITEMS)} items.`)
    }
    const ids = inputs.map((input) => {
      const id = this.createUploadId()
      this.uploadJobs.set(id, { input: { ...input, uploadId: id }, attempt: 0 })
      return id
    })
    this.store.update((state) => {
      delete state.error
      state.uploadQueue = [...state.uploadQueue, ...ids.map((id, index): DriveUploadItem => {
        const input = inputs[index] as UploadDriveFileInput
        return {
          id,
          name: input.file.name,
          bytes: input.file.size,
          loaded: 0,
          total: input.file.size,
          status: 'queued',
        }
      })]
      state.uploading = true
    })
    this.pumpUploads()
    return ids
  }

  /** Cancel a queued or active upload without removing its terminal queue row.
   * @param id - Upload queue entry id.
   */
  cancelUpload(id: string): void {
    const item = this.uploadItem(id)
    const job = this.uploadJobs.get(id)
    if (item === undefined || job === undefined || (item.status !== 'queued' && item.status !== 'uploading')) return
    job.attempt += 1
    const request = job.request
    delete job.request
    this.activeUploads.delete(id)
    this.updateUpload(id, { status: 'cancelled', loaded: 0, clearError: true, clearFileId: true })
    request?.abort()
    this.pumpUploads()
  }

  /** Requeue one failed or cancelled upload.
   * @param id - Upload queue entry id.
   */
  retryUpload(id: string): void {
    const item = this.uploadItem(id)
    const job = this.uploadJobs.get(id)
    if (item === undefined || job === undefined || (item.status !== 'failed' && item.status !== 'cancelled')) return
    this.updateUpload(id, {
      status: 'queued', loaded: 0, total: job.input.file.size, clearError: true, clearFileId: true,
    })
    this.pumpUploads()
  }

  /** Remove successful and cancelled entries from the upload queue. */
  clearFinishedUploads(): void {
    const removable = new Set(this.store.getSnapshot().uploadQueue
      .filter(item => item.status === 'succeeded' || item.status === 'cancelled')
      .map(item => item.id))
    if (removable.size === 0) return
    for (const id of removable) this.uploadJobs.delete(id)
    this.store.update((state) => {
      state.uploadQueue = state.uploadQueue.filter(item => !removable.has(item.id))
      this.syncUploading(state)
    })
  }

  private uploadItem(id: string): DriveUploadItem | undefined {
    return this.store.getSnapshot().uploadQueue.find(item => item.id === id)
  }

  private updateUpload(id: string, patch: {
    readonly status?: DriveUploadStatus
    readonly loaded?: number
    readonly total?: number
    readonly error?: string
    readonly fileId?: DriveFileId
    readonly clearError?: boolean
    readonly clearFileId?: boolean
  }): void {
    this.store.update((state) => {
      state.uploadQueue = state.uploadQueue.map((item) => {
        if (item.id !== id) return item
        const next = { ...item }
        if (patch.status !== undefined) next.status = patch.status
        if (patch.loaded !== undefined) next.loaded = patch.loaded
        if (patch.total !== undefined) next.total = patch.total
        if (patch.clearError === true) delete next.error
        else if (patch.error !== undefined) next.error = patch.error
        if (patch.clearFileId === true) delete next.fileId
        else if (patch.fileId !== undefined) next.fileId = patch.fileId
        return next
      })
      this.syncUploading(state)
    })
  }

  private syncUploading(state: BuddyDriveSnapshot): void {
    state.uploading = state.uploadQueue.some(item => item.status === 'queued' || item.status === 'uploading')
  }

  private pumpUploads(): void {
    while (this.activeUploads.size < DRIVE_UPLOAD_QUEUE_CONCURRENCY) {
      const queued = this.store.getSnapshot().uploadQueue.find(item => item.status === 'queued')
      if (queued === undefined) break
      this.startQueuedUpload(queued.id)
    }
    this.maybeRefreshAfterUploads()
  }

  private startQueuedUpload(id: string): void {
    const job = this.uploadJobs.get(id) as UploadJob
    job.attempt += 1
    const attempt = job.attempt
    this.activeUploads.add(id)
    this.updateUpload(id, {
      status: 'uploading', loaded: 0, total: job.input.file.size, clearError: true, clearFileId: true,
    })
    let request: UploadRequest
    try {
      request = this.uploadTransport(job.input, ({ loaded, total }) => {
        if (job.attempt !== attempt || !this.activeUploads.has(id)) return
        this.updateUpload(id, { loaded, total })
      })
    } catch (error) {
      this.finishUploadFailure(id, attempt, error)
      return
    }
    job.request = request
    void request.promise.then(
      (file) => { this.finishUploadSuccess(id, attempt, file) },
      (error: unknown) => { this.finishUploadFailure(id, attempt, error) },
    )
  }

  private finishUploadSuccess(id: string, attempt: number, file: DriveFile): void {
    const job = this.uploadJobs.get(id)
    if (job === undefined || job.attempt !== attempt) return
    delete job.request
    this.activeUploads.delete(id)
    this.refreshAfterUploads = true
    this.updateUpload(id, {
      status: 'succeeded',
      loaded: job.input.file.size,
      total: job.input.file.size,
      clearError: true,
      fileId: file.id,
    })
    this.pumpUploads()
  }

  private finishUploadFailure(id: string, attempt: number, error: unknown): void {
    const job = this.uploadJobs.get(id)
    if (job === undefined || job.attempt !== attempt) return
    delete job.request
    this.activeUploads.delete(id)
    this.updateUpload(id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      clearFileId: true,
    })
    this.pumpUploads()
  }

  private maybeRefreshAfterUploads(): void {
    if (!this.refreshAfterUploads || this.uploadRefreshRunning || this.activeUploads.size > 0
      || this.store.getSnapshot().uploadQueue.some(item => item.status === 'queued')) return
    this.refreshAfterUploads = false
    this.uploadRefreshRunning = true
    void this.refresh().catch((error: unknown) => {
      this.store.update((state) => { state.error = error instanceof Error ? error.message : String(error) })
    }).finally(() => {
      this.uploadRefreshRunning = false
      this.maybeRefreshAfterUploads()
    })
  }


  /** Build the authenticated content URL for an immutable current version.
   * @param file - File-like value carrying the current version id.
   * @returns Same-origin content URL for the version.
   */
  contentUrl(file: Pick<DriveFile, 'currentVersionId'>): string {
    return `${DRIVE_CONTENT_PATH}/${encodeURIComponent(file.currentVersionId)}`
  }
}

/** Create the reconnecting full-snapshot stream for the Client service.
 * @param remote - Client transport and Drive Remote namespace.
 * @param client - Browser state service receiving baseline frames and failures.
 * @returns A stream adapter that requires a baseline before accepting updates.
 */
export function createBuddyDriveStream(
  remote: StreamOwner,
  client: BuddyDriveClient,
): RemoteSnapshotStream<
  Extract<DriveFollowFrame, { type: 'baseline' }>,
  Extract<DriveFollowFrame, { type: 'snapshot' }>
> {
  const stream = remote.$stream<DriveFollowFrame>({
    name: 'Buddy Drive state stream',
    open: signal => remote.drive.follow(signal),
    ended: accepted => new Error(accepted
      ? 'Buddy Drive state stream ended after its baseline'
      : 'Buddy Drive state stream ended before its baseline'),
  })
  return new RemoteSnapshotStream(stream, {
    name: 'Buddy Drive state stream',
    isSnapshot: (frame): frame is Extract<DriveFollowFrame, { type: 'baseline' }> => frame.type === 'baseline',
    replace: (frame) => { client.replace(frame.value) },
    update: (frame) => { client.replace(frame.value) },
    failed: (error) => { client.failed(error) },
  })
}
