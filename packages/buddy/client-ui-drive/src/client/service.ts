/** React-free browser state and command service for the Buddy Drive UI. */

import { Service } from '@deepseek-ai/cordis'
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
import { DRIVE_CONTENT_PATH, DRIVE_UPLOAD_PATH } from '@sospink/dsh-buddy-api-drive/paths'

/** Client projection lifecycle and view state. */
export interface BuddyDriveSnapshot {
  open: boolean
  state: 'loading' | 'ready' | 'failed'
  data?: DriveBaseline
  error?: string
  uploading: boolean
}

export interface UploadDriveFileInput {
  readonly file: File
  readonly parentId?: DriveFolderId
  readonly kind: DriveFileKind
  readonly tags?: readonly string[]
}

export interface BuddyDriveSource {
  getSnapshot(): BuddyDriveSnapshot
  subscribe(listener: () => void): () => void
}

type DriveRemote = TypertClientRemote['drive']

type StreamOwner = Pick<ClientRemote, '$stream'> & { readonly drive: DriveRemote }

function failureMessage(failure: RemoteFailure): Error {
  return new Error(`${failure.code}: ${failure.message}`)
}

function query(input: UploadDriveFileInput): string {
  const params = new URLSearchParams({ name: input.file.name, kind: input.kind })
  if (input.parentId !== undefined) params.set('parentId', input.parentId)
  for (const tag of input.tags ?? []) params.append('tag', tag)
  return params.toString()
}

/** Browser state, Remote mutations, upload, and content-URL facade. */
export class BuddyDriveClient extends Service {
  readonly source: BuddyDriveSource
  private readonly store: SnapshotStore<BuddyDriveSnapshot>
  private opener: HTMLElement | undefined

  constructor(
    ctx: Context,
    private readonly remote: DriveRemote,
  ) {
    super(ctx, 'buddyDriveUi')
    this.store = createSnapshotStore<BuddyDriveSnapshot>({
      open: false,
      state: 'loading',
      uploading: false,
    })
    this.source = this.store
  }

  open(opener?: HTMLElement): void {
    this.opener = opener
    this.store.update((state) => { state.open = true })
  }

  close(): void {
    this.store.update((state) => { state.open = false })
    const opener = this.opener
    this.opener = undefined
    queueMicrotask(() => { opener?.focus() })
  }

  replace(data: DriveBaseline): void {
    this.store.update((state) => {
      state.data = data
      state.state = 'ready'
      delete state.error
    })
  }

  failed(error: unknown): void {
    this.store.update((state) => {
      state.state = 'failed'
      state.error = error instanceof Error ? error.message : String(error)
    })
  }

  async refresh(): Promise<void> {
    const result = await this.remote.baseline()
    if (!result.ok) throw failureMessage(result.error)
    this.replace(result.value)
  }

  async createFolder(name: string, parentId?: DriveFolderId): Promise<void> {
    const result = await this.remote.createFolder({ name, ...(parentId === undefined ? {} : { parentId }) })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  async updateMetadata(fileId: DriveFileId, kind: DriveFileKind, tags: readonly string[]): Promise<void> {
    const result = await this.remote.updateFileMetadata({ fileId, kind, tags })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  async deleteFile(fileId: DriveFileId): Promise<void> {
    const result = await this.remote.deleteFile({ fileId })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  async restoreFile(fileId: DriveFileId): Promise<void> {
    const result = await this.remote.restoreFile({ fileId })
    if (!result.ok) throw failureMessage(result.error)
    await this.refresh()
  }

  async upload(input: UploadDriveFileInput): Promise<DriveFile> {
    this.store.update((state) => { state.uploading = true; delete state.error })
    try {
      const response = await fetch(`${DRIVE_UPLOAD_PATH}?${query(input)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-buddy-drive-media-type': input.file.type || 'application/octet-stream',
        },
        body: input.file,
      })
      const value: unknown = await response.json()
      if (!response.ok) {
        const failure = value as { error?: { code?: string; message?: string } }
        throw new Error(`${failure.error?.code ?? 'upload-failed'}: ${failure.error?.message ?? 'Upload failed.'}`)
      }
      const uploaded = value as { kind?: string; file?: DriveFile }
      if (uploaded.kind !== 'file' || uploaded.file === undefined) throw new Error('Upload returned an invalid response.')
      await this.refresh()
      return uploaded.file
    } finally {
      this.store.update((state) => { state.uploading = false })
    }
  }

  contentUrl(file: Pick<DriveFile, 'currentVersionId'>): string {
    return `${DRIVE_CONTENT_PATH}/${encodeURIComponent(file.currentVersionId)}`
  }
}

/** Create the reconnecting full-snapshot stream for the Client service. */
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
