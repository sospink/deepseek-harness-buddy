/** React-free browser state and command facade for Development Management. */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@sospink/dsh-buddy-development-management/remote'
import { DEVELOPMENT_ARTIFACT_PATH, DEVELOPMENT_UPLOAD_PATH } from '@sospink/dsh-buddy-development-management/paths'
import type {
  AssignDevelopmentTaskRequest,
  ConfigureDeliveryRequest,
  ConfirmMergeRequestRequest,
  CreateDevelopmentTaskRequest,
  DevelopmentBaseline,
  DevelopmentRole,
  DevelopmentTaskRequest,
  MergeDevelopmentRequest,
  ReviewAcceptanceRequest,
  SubmitAcceptanceRequest,
} from '@sospink/dsh-buddy-development-management/types'

type DevelopmentRemote = TypertClientRemote['developmentManagement']

/** Browser view state. */
export interface DevelopmentManagementSnapshot {
  open: boolean
  state: 'loading' | 'ready' | 'failed'
  data?: DevelopmentBaseline
  error?: string
  busy: boolean
  uploadProgress: number
}

interface DevelopmentMutationFailure {
  readonly code: string
  readonly message: string
}

interface DevelopmentUploadOperation {
  readonly taskId: string
  readonly role: DevelopmentRole
  readonly rootName: string
  readonly relativePath: string
  readonly file: File
  readonly onProgress: (bytes: number) => void
}

function failure(result: { readonly code: string; readonly message: string }): Error {
  return new Error(`${result.code}: ${result.message}`)
}

function isRepositoryMetadata(file: File): boolean {
  const path = file.webkitRelativePath || file.name
  return path.split('/').includes('.git')
}

/** Browser facade for all real Development Management writes. */
export class DevelopmentManagementClient extends Service {
  readonly source: Pick<SnapshotStore<DevelopmentManagementSnapshot>, 'getSnapshot' | 'subscribe'>
  private readonly store: SnapshotStore<DevelopmentManagementSnapshot>
  private opener: HTMLElement | undefined

  /** @param ctx - Client context. @param remote - Generated Remote namespace. */
  constructor(ctx: Context, private readonly remote: DevelopmentRemote) {
    super(ctx, 'buddyDevelopmentManagementUi')
    this.store = createSnapshotStore({ open: false, state: 'loading', busy: false, uploadProgress: 0 })
    this.source = this.store
  }

  /** Open the workspace and remember its trigger for focus restoration. */
  open(opener?: HTMLElement): void {
    this.opener = opener
    this.store.update((state) => {
      state.open = true
      state.state = 'loading'
      delete state.data
      delete state.error
    })
  }

  /** Close the workspace and restore focus. */
  close(): void {
    this.store.update((state) => { state.open = false })
    const opener = this.opener
    this.opener = undefined
    queueMicrotask(() => opener?.focus())
  }

  /** Publish a visible failure. */
  failed(error: unknown): void {
    this.store.update((state) => {
      state.state = 'failed'
      state.error = error instanceof Error ? error.message : String(error)
      state.busy = false
    })
  }

  /** Refresh the authoritative baseline. */
  async refresh(): Promise<void> {
    const result = await this.remote.baseline()
    if (!result.ok) throw failure(result.error)
    this.store.update((state) => {
      state.data = result.value
      state.state = 'ready'
      delete state.error
    })
  }

  /** Run one Remote write, then refresh. */
  async mutate(
    operation: (remote: DevelopmentRemote) => Promise<{ readonly ok: boolean; readonly error?: DevelopmentMutationFailure }>,
  ): Promise<void> {
    this.store.update((state) => { state.busy = true; delete state.error })
    try {
      const result = await operation(this.remote)
      if (!result.ok) throw failure(result.error as { readonly code: string; readonly message: string })
      await this.refresh()
    } finally {
      this.store.update((state) => { state.busy = false })
    }
  }

  selectRole(role: DevelopmentRole): Promise<void> { return this.mutate(remote => remote.selectRole({ role })) }
  createTask(request: CreateDevelopmentTaskRequest): Promise<void> { return this.mutate(remote => remote.createTask(request)) }
  submitReview(request: DevelopmentTaskRequest): Promise<void> { return this.mutate(remote => remote.submitReview(request)) }
  assignTask(request: AssignDevelopmentTaskRequest): Promise<void> { return this.mutate(remote => remote.assignTask(request)) }
  startTask(request: DevelopmentTaskRequest): Promise<void> { return this.mutate(remote => remote.startTask(request)) }
  submitAcceptance(request: SubmitAcceptanceRequest): Promise<void> { return this.mutate(remote => remote.submitAcceptance(request)) }
  reviewAcceptance(request: ReviewAcceptanceRequest): Promise<void> { return this.mutate(remote => remote.reviewAcceptance(request)) }
  configureDelivery(request: ConfigureDeliveryRequest): Promise<void> { return this.mutate(remote => remote.configureDelivery(request)) }
  requestDeliveryCheck(request: DevelopmentTaskRequest): Promise<void> {
    return this.mutate(remote => remote.requestDeliveryCheck(request))
  }
  runDeliveryCheck(request: DevelopmentTaskRequest): Promise<void> { return this.mutate(remote => remote.runDeliveryCheck(request)) }
  addNote(taskId: string, note: string): Promise<void> { return this.mutate(remote => remote.addNote({ taskId, note })) }
  confirmMergeRequest(request: ConfirmMergeRequestRequest): Promise<void> {
    return this.mutate(remote => remote.confirmMergeRequest(request))
  }
  mergeTask(request: MergeDevelopmentRequest): Promise<void> { return this.mutate(remote => remote.mergeTask(request)) }

  /** Upload a flattened directory/file selection sequentially with real byte progress. */
  async upload(taskId: string, role: DevelopmentRole, files: readonly File[]): Promise<void> {
    const sourceFiles = files.filter(file => !isRepositoryMetadata(file))
    if (sourceFiles.length === 0) return
    const total = sourceFiles.reduce((sum, file) => sum + file.size, 0)
    let completed = 0
    this.store.update((state) => {
      state.busy = true
      state.uploadProgress = 0
      delete state.error
    })
    try {
      for (const file of sourceFiles) {
        const path = file.webkitRelativePath || file.name
        const pieces = path.split('/').filter(Boolean)
        const rootName = pieces.length > 1 ? pieces[0] as string : 'files'
        const relativePath = pieces.length > 1 ? pieces.slice(1).join('/') : file.name
        await this.uploadOne({ taskId, role, rootName, relativePath, file, onProgress: (loaded) => {
          this.store.update((state) => {
            state.uploadProgress = total === 0 ? 100 : Math.round(((completed + loaded) / total) * 100)
          })
        } })
        completed += file.size
      }
      await this.refresh()
    } finally {
      this.store.update((state) => { state.busy = false; state.uploadProgress = 0 })
    }
  }

  /** Authenticated artifact download URL. */
  artifactUrl(artifactId: string): string { return `${DEVELOPMENT_ARTIFACT_PATH}/${encodeURIComponent(artifactId)}` }

  private uploadOne(input: DevelopmentUploadOperation): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = new URLSearchParams({
        taskId: input.taskId,
        role: input.role,
        rootName: input.rootName,
        relativePath: input.relativePath,
        name: input.file.name,
      })
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${DEVELOPMENT_UPLOAD_PATH}?${query.toString()}`)
      xhr.setRequestHeader('content-type', input.file.type || 'application/octet-stream')
      xhr.upload.onprogress = (event) => { input.onProgress(event.loaded) }
      xhr.onerror = () => { reject(new Error('network-error: 上传连接失败')) }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(); return }
        try {
          const body = JSON.parse(xhr.responseText) as { readonly error?: { readonly code?: string; readonly message?: string } }
          reject(new Error(`${body.error?.code ?? `http-${String(xhr.status)}`}: ${body.error?.message ?? '上传失败'}`))
        } catch { reject(new Error(`http-${String(xhr.status)}: 上传失败`)) }
      }
      xhr.send(input.file)
    })
  }
}
