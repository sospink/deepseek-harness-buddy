/** Durable local service and delivery-analysis engine. */

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import type { SubprocessOutcome, SubprocessOutputReader } from '@deepseek-ai/dsh-subprocess'
import { DevelopmentManagementError } from './error.ts'
import {
  DEVELOPMENT_ROLES,
  DISCIPLINE_ASSIGNEE,
  developmentStateSchema,
  initialDevelopmentState,
  phaseForStatus,
  roleMayUpload,
} from './model.ts'
import type { DevelopmentState } from './model.ts'
import type {
  AddDevelopmentNoteRequest,
  AssignDevelopmentTaskRequest,
  ConfigureDeliveryRequest,
  ConfirmMergeRequestRequest,
  CreateDevelopmentTaskRequest,
  DeliveryChangedFile,
  DeliveryCheckResult,
  DeliveryConflictRisk,
  DeliveryReview,
  DeliveryTaskAndReview,
  DevelopmentArtifact,
  DevelopmentAuditEvent,
  DevelopmentBaseline,
  DevelopmentIntegrationStatus,
  DevelopmentRole,
  DevelopmentTask,
  DevelopmentTaskRequest,
  DevelopmentTaskStatus,
  MergeDevelopmentRequest,
  MergeRequestDraft,
  ReviewAcceptanceRequest,
  SubmitAcceptanceRequest,
} from './types.ts'

/** Resolved provider limits and integration settings. */
export interface DevelopmentManagementConfig {
  readonly root: string
  readonly repositoryRoots: readonly string[]
  readonly maxFileBytes: number
  readonly maxTaskBytes: number
  readonly maxCommandOutputBytes: number
  readonly commandTimeoutMs: number
  readonly checkCommands: readonly string[]
  readonly integrationProvider: 'none' | 'gitlab' | 'github'
  readonly integrationBaseUrl?: string
  readonly integrationProject?: string
  readonly integrationToken?: string
}

/** Metadata admitted before one streaming upload begins. */
export interface DevelopmentUploadInput {
  readonly taskId: string
  readonly role: DevelopmentRole
  readonly rootName: string
  readonly relativePath: string
  readonly name: string
  readonly mediaType: string
  readonly declaredBytes: number
}

/** Writable artifact transaction with explicit commit/abort. */
export interface DevelopmentUploadTransaction {
  readonly temporaryPath: string
  commit(digest: string, bytes: number): Promise<DevelopmentArtifact>
  abort(): Promise<void>
}

const ROLE_SET = new Set<DevelopmentRole>(DEVELOPMENT_ROLES)
const MAX_TEXT = 20_000
const SAFE_REF = /^[A-Za-z0-9._/@+-]{1,200}$/u
const SAFE_SEGMENT = /^(?!\.\.?$)[^/\\\0]{1,255}$/u
const HASH_RE = /^sha256:[0-9a-f]{64}$/u

function cleanText(value: string, label: string, max = MAX_TEXT): string {
  const clean = value.normalize('NFC').trim()
  if (clean === '' || clean.length > max) throw new DevelopmentManagementError('invalid-input', `${label}不能为空且长度不能超过 ${String(max)}。`)
  return clean
}

function safeSegment(value: string, label: string): string {
  const clean = value.normalize('NFC').trim()
  if (!SAFE_SEGMENT.test(clean)) throw new DevelopmentManagementError('invalid-upload-path', `${label}包含不安全路径。`)
  return clean
}

function safeRelativePath(value: string): string {
  const clean = value.replaceAll('\\', '/').normalize('NFC')
  if (clean.startsWith('/') || clean.split('/').some(segment => !SAFE_SEGMENT.test(segment))) {
    throw new DevelopmentManagementError('invalid-upload-path', '上传文件的相对路径不安全。')
  }
  if (clean.split('/').includes('.git')) {
    throw new DevelopmentManagementError('repository-metadata-not-allowed', '不允许上传 .git 仓库元数据。')
  }
  return clean
}

function within(root: string, candidate: string): boolean {
  const child = relative(root, candidate)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}

function taskSnapshot(task: DevelopmentTask): DevelopmentTask {
  return Object.freeze({
    ...task,
    ...(task.repository === undefined ? {} : { repository: Object.freeze({ ...task.repository }) }),
    ...(task.acceptanceSubmission === undefined ? {} : { acceptanceSubmission: Object.freeze({ ...task.acceptanceSubmission }) }),
    ...(task.acceptanceReview === undefined ? {} : { acceptanceReview: Object.freeze({ ...task.acceptanceReview }) }),
  })
}

function reviewSnapshot(review: DeliveryReview): DeliveryReview {
  return Object.freeze({
    ...review,
    workingTreeChanges: Object.freeze([...review.workingTreeChanges]),
    changedFiles: Object.freeze(review.changedFiles.map(value => Object.freeze({ ...value }))),
    suspectedConflicts: Object.freeze(review.suspectedConflicts.map(value => Object.freeze({ ...value }))),
    checks: Object.freeze(review.checks.map(value => Object.freeze({ ...value }))),
    mergeRequest: Object.freeze({ ...review.mergeRequest }),
  })
}

function timestampAfter(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
}

function statusAction(next: DevelopmentTaskStatus): string {
  return `task/status/${next}`
}

function output(reader: SubprocessOutputReader | undefined): string {
  return reader?.readFrom(0).text ?? ''
}

interface CommandRun { readonly outcome: SubprocessOutcome; readonly stdout: string; readonly stderr: string; readonly durationMs: number }

/** Role-aware, atomically persisted development workflow service. */
export class DevelopmentManagementStore {
  private readonly root: string
  private readonly statePath: string
  private readonly artifactRoot: string
  private state = initialDevelopmentState()
  private operationTail: Promise<void> = Promise.resolve()

  /** @param ctx - Harness context with the managed subprocess provider. @param config - Validated local configuration. */
  constructor(private readonly ctx: Context, readonly config: DevelopmentManagementConfig) {
    this.root = resolve(config.root)
    this.statePath = join(this.root, 'state.json')
    this.artifactRoot = join(this.root, 'artifacts')
  }

  /** Load and validate durable state before serving requests. */
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await mkdir(this.artifactRoot, { recursive: true, mode: 0o700 })
    try {
      this.state = developmentStateSchema.parse(JSON.parse(await readFile(this.statePath, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new DevelopmentManagementError('storage-inconsistent', '开发管理持久化数据损坏或版本不兼容。')
      }
      await this.commit(initialDevelopmentState())
    }
  }

  /** Complete detached browser projection. */
  baseline(): DevelopmentBaseline {
    return {
      activeRole: this.state.activeRole,
      tasks: this.state.tasks.map(taskSnapshot),
      artifacts: this.state.artifacts.map(value => Object.freeze({ ...value })),
      reviews: this.state.reviews.map(reviewSnapshot),
      audit: this.state.audit.map(value => Object.freeze({ ...value })),
      integration: this.integrationStatus(),
      uploadLimits: { maxFileBytes: this.config.maxFileBytes, maxTaskBytes: this.config.maxTaskBytes },
    }
  }

  /** Select the active attended-local operator role and persist the choice. */
  selectRole(role: DevelopmentRole): Promise<DevelopmentBaseline> {
    return this.enqueue(async () => {
      if (!ROLE_SET.has(role)) throw new DevelopmentManagementError('invalid-role', '未知开发角色。')
      if (this.state.activeRole !== role) await this.commit({ ...this.state, activeRole: role })
      return this.baseline()
    })
  }

  /** Create a durable requirement as Product Manager. */
  createTask(request: CreateDevelopmentTaskRequest): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      this.requireRole('product-manager')
      if (!(request.discipline in DISCIPLINE_ASSIGNEE) || ![1, 2, 3, 4].includes(request.priority)) {
        throw new DevelopmentManagementError('invalid-input', '研发类型或优先级无效。')
      }
      const createdAt = new Date().toISOString()
      const id = randomUUID()
      const task: DevelopmentTask = {
        id, sequence: this.state.nextSequence,
        title: cleanText(request.title, '需求名称', 200), discipline: request.discipline,
        priority: request.priority, status: 'draft',
        description: cleanText(request.description, '需求描述'),
        acceptanceCriteria: cleanText(request.acceptanceCriteria, '验收标准'),
        creatorRole: 'product-manager', reviewerRole: 'product-manager', phase: phaseForStatus('draft'),
        createdAt, updatedAt: createdAt,
      }
      await this.commit({
        ...this.state, nextSequence: this.state.nextSequence + 1,
        tasks: [...this.state.tasks, task],
        audit: [...this.state.audit, this.audit(id, 'product-manager', 'task/create', `创建研发需求“${task.title}”。`, createdAt)],
      })
      this.changed()
      return taskSnapshot(task)
    })
  }

  /** Submit a draft requirement for review. */
  submitReview(request: DevelopmentTaskRequest): Promise<DevelopmentTask> {
    return this.transition(request.taskId, 'product-manager', ['draft'], 'pending-review', '提交需求评审。')
  }

  /** Assign a reviewed requirement to its discipline-compatible engineer. */
  assignTask(request: AssignDevelopmentTaskRequest): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      this.requireRole('product-manager')
      const task = this.requireTask(request.taskId)
      if (task.status !== 'pending-review') throw new DevelopmentManagementError('invalid-status', '仅待评审需求可以指派。')
      if (DISCIPLINE_ASSIGNEE[task.discipline] !== request.assigneeRole) {
        throw new DevelopmentManagementError('role-mismatch', '指派角色与研发任务类型不匹配。')
      }
      const updated = this.withStatus({ ...task, assigneeRole: request.assigneeRole }, 'assigned')
      await this.replaceTask(updated, 'product-manager', 'task/assign', `指派给${request.assigneeRole}。`)
      return taskSnapshot(updated)
    })
  }

  /** Accept an assigned task as its engineer. */
  startTask(request: DevelopmentTaskRequest): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      const task = this.requireTask(request.taskId)
      if (task.assigneeRole === undefined) throw new DevelopmentManagementError('unassigned', '任务尚未指派。')
      this.requireRole(task.assigneeRole)
      if (task.status !== 'assigned') throw new DevelopmentManagementError('invalid-status', '仅已指派任务可以开始开发。')
      const updated = this.withStatus(task, 'in-progress')
      await this.replaceTask(updated, task.assigneeRole, statusAction('in-progress'), '接收研发任务并开始开发。')
      return taskSnapshot(updated)
    })
  }

  /** Submit uploaded engineering results for Product Manager acceptance. */
  submitAcceptance(request: SubmitAcceptanceRequest): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      const task = this.requireTask(request.taskId)
      if (task.assigneeRole === undefined) throw new DevelopmentManagementError('unassigned', '任务尚未指派。')
      this.requireRole(task.assigneeRole)
      if (!['in-progress', 'acceptance-rejected'].includes(task.status)) {
        throw new DevelopmentManagementError('invalid-status', '仅开发中或验收退回的任务可以提交验收。')
      }
      if (!this.state.artifacts.some(artifact => artifact.taskId === task.id && artifact.uploaderRole === task.assigneeRole)) {
        throw new DevelopmentManagementError('artifacts-required', '请先上传至少一个研发成果文件。')
      }
      const summary = cleanText(request.summary, '成果说明')
      const submittedAt = timestampAfter(task.updatedAt)
      const updated = this.withStatus({
        ...task,
        acceptanceSubmission: { summary, submittedAt },
        acceptanceReview: undefined,
      }, 'pending-acceptance')
      await this.replaceTask(updated, task.assigneeRole, 'acceptance/submit', `提交成果验收：${summary}`)
      return taskSnapshot(updated)
    })
  }

  /** Review submitted engineering results as Product Manager. */
  reviewAcceptance(request: ReviewAcceptanceRequest): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      this.requireRole('product-manager')
      const task = this.requireTask(request.taskId)
      if (task.status !== 'pending-acceptance' || task.acceptanceSubmission === undefined) {
        throw new DevelopmentManagementError('invalid-status', '仅待成果验收的任务可以审核。')
      }
      const comment = request.decision === 'reject'
        ? cleanText(request.comment ?? '', '退回原因')
        : (request.comment?.normalize('NFC').trim() ?? '')
      if (comment.length > MAX_TEXT) throw new DevelopmentManagementError('invalid-input', `审核意见长度不能超过 ${String(MAX_TEXT)}。`)
      const reviewedAt = timestampAfter(task.updatedAt)
      const status: DevelopmentTaskStatus = request.decision === 'approve' ? 'acceptance-approved' : 'acceptance-rejected'
      const updated = this.withStatus({
        ...task,
        acceptanceReview: { decision: request.decision, comment, reviewedAt },
      }, status)
      const detail = request.decision === 'approve'
        ? `成果验收通过${comment === '' ? '。' : `：${comment}`}`
        : `成果验收退回：${comment}`
      await this.replaceTask(updated, 'product-manager', `acceptance/${request.decision}`, detail)
      return taskSnapshot(updated)
    })
  }

  /** Mark uploaded development work ready for delivery analysis. */
  requestDeliveryCheck(request: DevelopmentTaskRequest): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      const task = this.requireTask(request.taskId)
      if (task.assigneeRole === undefined) throw new DevelopmentManagementError('unassigned', '任务尚未指派。')
      this.requireRole(task.assigneeRole)
      if (!['acceptance-approved', 'merge-paused'].includes(task.status)) throw new DevelopmentManagementError('invalid-status', '仅成果验收通过或暂缓合并的任务可以申请交付检查。')
      if (!this.state.artifacts.some(artifact => artifact.taskId === task.id && artifact.uploaderRole === task.assigneeRole)) {
        throw new DevelopmentManagementError('artifacts-required', '请先上传完整研发代码或仓库文件。')
      }
      if (task.repository === undefined) throw new DevelopmentManagementError('repository-required', '请先配置用于检查的本地代码仓库。')
      const updated = this.withStatus(task, 'pending-delivery-check')
      await this.replaceTask(updated, task.assigneeRole, statusAction('pending-delivery-check'), '研发完成，申请智能体交付检查。')
      return taskSnapshot(updated)
    })
  }

  /** Configure a real local Git repository for analysis. */
  configureDelivery(request: ConfigureDeliveryRequest): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      const task = this.requireTask(request.taskId)
      if (task.assigneeRole === undefined) throw new DevelopmentManagementError('unassigned', '任务尚未指派。')
      this.requireRole(task.assigneeRole)
      if (!['assigned', 'in-progress', 'pending-acceptance', 'acceptance-approved', 'acceptance-rejected', 'merge-paused'].includes(task.status)) {
        throw new DevelopmentManagementError('invalid-status', '当前状态不能配置交付仓库。')
      }
      const repositoryPath = await this.resolveRepository(request.repositoryPath)
      const sourceRef = this.cleanRef(request.sourceRef)
      const targetRef = this.cleanRef(request.targetRef)
      await this.git(repositoryPath, ['rev-parse', '--verify', sourceRef])
      await this.git(repositoryPath, ['rev-parse', '--verify', targetRef])
      const updated: DevelopmentTask = {
        ...task,
        repository: { path: repositoryPath, sourceRef, targetRef },
        updatedAt: timestampAfter(task.updatedAt),
      }
      await this.replaceTask(updated, task.assigneeRole, 'task/repository', `配置代码仓库 ${repositoryPath}，比较 ${sourceRef} → ${targetRef}。`)
      return taskSnapshot(updated)
    })
  }

  /** Add one durable human note. */
  addNote(request: AddDevelopmentNoteRequest): Promise<void> {
    return this.enqueue(async () => {
      this.requireTask(request.taskId)
      const note = cleanText(request.note, '备注', 2_000)
      const createdAt = new Date().toISOString()
      await this.commit({ ...this.state, audit: [...this.state.audit, this.audit(request.taskId, this.state.activeRole, 'task/note', note, createdAt)] })
      this.changed()
    })
  }

  /** Execute Git analysis and configured checks, persist the report, and gate human confirmation. */
  runDeliveryCheck(request: DevelopmentTaskRequest): Promise<DeliveryReview> {
    return this.enqueue(async () => {
      const task = this.requireTask(request.taskId)
      if (task.assigneeRole === undefined) throw new DevelopmentManagementError('unassigned', '任务尚未指派。')
      this.requireRole(task.assigneeRole)
      if (task.status !== 'pending-delivery-check') throw new DevelopmentManagementError('invalid-status', '任务尚未进入待交付检查。')
      if (task.repository === undefined) throw new DevelopmentManagementError('repository-required', '未配置交付仓库。')
      const checking = this.withStatus(task, 'checking')
      await this.replaceTask(checking, 'delivery-agent', statusAction('checking'), '智能体开始读取任务、代码变更并执行交付检查。')
      try {
        const review = await this.analyze(checking)
        const nextStatus: DevelopmentTaskStatus = review.conclusion === 'recommend-merge' ? 'awaiting-human-confirmation' : 'merge-paused'
        const updated = this.withStatus({ ...checking, latestReviewId: review.id }, nextStatus)
        await this.commit({
          ...this.state,
          tasks: this.state.tasks.map(value => value.id === task.id ? updated : value),
          reviews: [...this.state.reviews, review],
          audit: [...this.state.audit, this.audit(task.id, 'delivery-agent', 'delivery/review', `${review.summary} 结论：${review.conclusion}。`, review.createdAt)],
        })
        this.changed()
        return reviewSnapshot(review)
      } catch (error) {
        const failed = this.withStatus(checking, 'merge-paused')
        await this.replaceTask(failed, 'delivery-agent', 'delivery/failure', `交付检查未完成：${error instanceof Error ? error.message : String(error)}`)
        throw error
      }
    })
  }

  /** Human confirmation gate; optionally creates a real remote MR when configured. */
  confirmMergeRequest(request: ConfirmMergeRequestRequest): Promise<DeliveryReview> {
    return this.enqueue(async () => {
      this.requireRole('product-manager')
      const task = this.requireTask(request.taskId)
      if (task.status !== 'awaiting-human-confirmation' || task.latestReviewId === undefined) {
        throw new DevelopmentManagementError('confirmation-required', '仅“待人工确认”的检查结果可以提交合并请求。')
      }
      const review = this.requireReview(task.latestReviewId)
      let mergeRequest: MergeRequestDraft
      if (request.manualRemoteUrl !== undefined) {
        mergeRequest = { ...review.mergeRequest, provider: 'manual', status: 'submitted', remoteUrl: this.cleanRemoteUrl(request.manualRemoteUrl) }
      } else if (this.config.integrationProvider === 'none') {
        throw new DevelopmentManagementError('integration-not-configured', '未配置 GitLab/GitHub；请粘贴人工创建的 Merge Request URL，或配置远程集成。')
      } else {
        mergeRequest = await this.createRemoteMergeRequest(review)
      }
      const accepted: DeliveryReview = { ...review, mergeRequest }
      const updated = this.withStatus(task, 'mr-submitted')
      await this.commit({
        ...this.state,
        tasks: this.state.tasks.map(value => value.id === task.id ? updated : value),
        reviews: this.state.reviews.map(value => value.id === review.id ? accepted : value),
        audit: [...this.state.audit, this.audit(task.id, 'product-manager', 'merge-request/confirm', `人工确认并提交合并请求：${mergeRequest.remoteUrl ?? mergeRequest.remoteId ?? '已提交'}。`, updated.updatedAt)],
      })
      this.changed()
      return reviewSnapshot(accepted)
    })
  }

  /** Mark a submitted MR merged through configured provider evidence or a supplied manual URL. */
  mergeTask(request: MergeDevelopmentRequest): Promise<DeliveryTaskAndReview> {
    return this.enqueue(async () => {
      this.requireRole('product-manager')
      const task = this.requireTask(request.taskId)
      if (task.status !== 'mr-submitted' || task.latestReviewId === undefined) throw new DevelopmentManagementError('invalid-status', '任务尚未提交合并请求。')
      const review = this.requireReview(task.latestReviewId)
      let mergeRequest: MergeRequestDraft
      if (request.manualMergedUrl !== undefined) {
        mergeRequest = { ...review.mergeRequest, provider: review.mergeRequest.provider === 'none' ? 'manual' : review.mergeRequest.provider, status: 'merged', remoteUrl: this.cleanRemoteUrl(request.manualMergedUrl) }
      } else if (review.mergeRequest.provider === 'gitlab' && review.mergeRequest.remoteId !== undefined) {
        mergeRequest = await this.mergeRemoteGitLab(review)
      } else {
        throw new DevelopmentManagementError('merge-evidence-required', '当前集成无法自动合并，请提供已合并的 MR/PR URL。')
      }
      const mergedReview: DeliveryReview = { ...review, mergeRequest }
      const mergedTask = this.withStatus(task, 'merged')
      await this.commit({
        ...this.state,
        tasks: this.state.tasks.map(value => value.id === task.id ? mergedTask : value),
        reviews: this.state.reviews.map(value => value.id === review.id ? mergedReview : value),
        audit: [...this.state.audit, this.audit(task.id, 'product-manager', 'merge-request/merged', `确认合并完成：${mergeRequest.remoteUrl ?? ''}。`, mergedTask.updatedAt)],
      })
      this.changed()
      return { task: taskSnapshot(mergedTask), review: reviewSnapshot(mergedReview) }
    })
  }

  /** Validate upload authorization and allocate a private temporary file. */
  beginUpload(input: DevelopmentUploadInput): Promise<DevelopmentUploadTransaction> {
    return this.enqueue(async () => {
      const task = this.requireTask(input.taskId)
      this.requireRole(input.role)
      if (input.role !== this.state.activeRole || !roleMayUpload(input.role, task)) {
        throw new DevelopmentManagementError('forbidden', '当前角色不能向此任务上传文件。')
      }
      if (!Number.isSafeInteger(input.declaredBytes) || input.declaredBytes < 0 || input.declaredBytes > this.config.maxFileBytes) {
        throw new DevelopmentManagementError('file-too-large', '文件超过单文件上传限制。')
      }
      const used = this.state.artifacts.filter(value => value.taskId === task.id).reduce((sum, value) => sum + value.bytes, 0)
      if (used + input.declaredBytes > this.config.maxTaskBytes) throw new DevelopmentManagementError('task-quota-exceeded', '任务附件总容量超过限制。')
      const rootName = safeSegment(input.rootName, '目录名')
      if (rootName === '.git') {
        throw new DevelopmentManagementError('repository-metadata-not-allowed', '不允许上传 .git 仓库元数据。')
      }
      const relativePath = safeRelativePath(input.relativePath)
      const name = safeSegment(input.name, '文件名')
      this.assertFileType(input.role, name, input.mediaType)
      const directory = join(this.artifactRoot, task.id)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const temporaryPath = join(directory, `.${randomUUID()}.upload`)
      const transaction: DevelopmentUploadTransaction = {
        temporaryPath,
        commit: (digest, bytes) => this.finalizeUpload({ ...input, rootName, relativePath, name }, temporaryPath, digest, bytes),
        abort: () => rm(temporaryPath, { force: true }),
      }
      return transaction
    })
  }

  /** Resolve one artifact path for authenticated download. */
  artifactPath(artifactId: string): { artifact: DevelopmentArtifact; path: string } {
    const artifact = this.state.artifacts.find(value => value.id === artifactId)
    if (artifact === undefined) throw new DevelopmentManagementError('artifact-not-found', '附件不存在。')
    return { artifact: Object.freeze({ ...artifact }), path: join(this.artifactRoot, artifact.taskId, artifact.id) }
  }

  private async finalizeUpload(
    input: DevelopmentUploadInput,
    temporaryPath: string,
    digest: string,
    bytes: number,
  ): Promise<DevelopmentArtifact> {
    return this.enqueue(async () => {
      if (!HASH_RE.test(digest) || bytes !== input.declaredBytes) throw new DevelopmentManagementError('upload-mismatch', '上传字节数或摘要不一致。')
      const task = this.requireTask(input.taskId)
      this.requireRole(input.role)
      if (input.role !== this.state.activeRole || !roleMayUpload(input.role, task)) {
        throw new DevelopmentManagementError('forbidden', '上传提交时角色或任务状态已变化。')
      }
      const used = this.state.artifacts.filter(value => value.taskId === task.id).reduce((sum, value) => sum + value.bytes, 0)
      if (bytes > this.config.maxFileBytes) throw new DevelopmentManagementError('file-too-large', '文件超过单文件上传限制。')
      if (used + bytes > this.config.maxTaskBytes) throw new DevelopmentManagementError('task-quota-exceeded', '任务附件总容量超过限制。')
      const duplicate = this.state.artifacts.find(value => value.taskId === task.id
        && value.rootName === input.rootName
        && value.relativePath === input.relativePath)
      if (duplicate !== undefined) throw new DevelopmentManagementError('duplicate-artifact', '同一任务中已存在相同目录路径的文件。')
      const id = randomUUID()
      const finalPath = join(this.artifactRoot, task.id, id)
      await rename(temporaryPath, finalPath)
      const createdAt = new Date().toISOString()
      const artifact: DevelopmentArtifact = {
        id, taskId: task.id, uploaderRole: input.role, rootName: input.rootName,
        relativePath: input.relativePath, name: input.name, mediaType: input.mediaType,
        bytes, digest, createdAt,
      }
      const updated = task.status === 'assigned' && input.role !== 'product-manager' ? this.withStatus(task, 'in-progress') : task
      try {
        await this.commit({
          ...this.state,
          tasks: this.state.tasks.map(value => value.id === task.id ? updated : value),
          artifacts: [...this.state.artifacts, artifact],
          audit: [...this.state.audit, this.audit(task.id, input.role, 'artifact/upload', `上传 ${input.rootName}/${input.relativePath}（${String(bytes)} bytes）。`, createdAt)],
        })
      } catch (error) {
        await rm(finalPath, { force: true })
        throw error
      }
      this.changed()
      return Object.freeze({ ...artifact })
    })
  }

  private async analyze(task: DevelopmentTask): Promise<DeliveryReview> {
    const repository = task.repository
    if (repository === undefined) throw new DevelopmentManagementError('repository-required', '未配置交付仓库。')
    const currentBranch = (await this.git(repository.path, ['branch', '--show-current'])).stdout.trim() || '(detached)'
    const workingTreeChanges = (await this.git(repository.path, ['status', '--short'])).stdout.split('\n').filter(Boolean)
    const nameStatus = await this.git(repository.path, ['diff', '--name-status', `${repository.targetRef}...${repository.sourceRef}`])
    const numstat = await this.git(repository.path, ['diff', '--numstat', `${repository.targetRef}...${repository.sourceRef}`])
    const changedFiles = this.changedFiles(nameStatus.stdout, numstat.stdout)
    const conflicts = await this.conflictRisks(repository.path, repository.targetRef, repository.sourceRef)
    const checks: DeliveryCheckResult[] = []
    for (const command of this.config.checkCommands) checks.push(await this.runCheck(repository.path, command))
    const failedChecks = checks.filter(check => check.status === 'failed')
    const conclusion = conflicts.length === 0 && failedChecks.length === 0 && changedFiles.length > 0 ? 'recommend-merge' : 'pause-merge'
    const summary = changedFiles.length === 0
      ? '目标分支与当前交付分支之间没有可交付的提交差异。'
      : `共分析 ${String(changedFiles.length)} 个变更文件，发现 ${String(conflicts.length)} 个疑似冲突，${String(failedChecks.length)} 项检查失败。`
    const mergeRequest: MergeRequestDraft = {
      title: `[研发需求 #${String(task.sequence)}] ${task.title}`,
      description: this.mergeRequestDescription(task, summary, changedFiles, conflicts, checks, conclusion),
      sourceRef: repository.sourceRef, targetRef: repository.targetRef,
      provider: this.config.integrationProvider, status: 'draft',
    }
    return {
      id: randomUUID(), taskId: task.id, repositoryPath: repository.path, currentBranch,
      workingTreeChanges, changedFiles, suspectedConflicts: conflicts, checks, summary, conclusion,
      mergeRequest, createdAt: new Date().toISOString(),
    }
  }

  private changedFiles(nameStatus: string, numstat: string): DeliveryChangedFile[] {
    const counts = new Map<string, { additions: number; deletions: number }>()
    for (const line of numstat.split('\n')) {
      const [added, deleted, path] = line.split('\t')
      if (path === undefined) continue
      counts.set(path, { additions: added === '-' ? 0 : Number(added), deletions: deleted === '-' ? 0 : Number(deleted) })
    }
    return nameStatus.split('\n').filter(Boolean).map((line) => {
      const parts = line.split('\t')
      const status = parts[0] ?? '?'
      const path = parts.at(-1) ?? ''
      return { path, status, ...(counts.get(path) ?? { additions: 0, deletions: 0 }) }
    })
  }

  private async conflictRisks(path: string, targetRef: string, sourceRef: string): Promise<DeliveryConflictRisk[]> {
    const mergeBase = (await this.git(path, ['merge-base', targetRef, sourceRef])).stdout.trim()
    const [target, source, mergeTree] = await Promise.all([
      this.git(path, ['diff', '--name-only', `${mergeBase}..${targetRef}`]),
      this.git(path, ['diff', '--name-only', `${mergeBase}..${sourceRef}`]),
      this.git(path, ['merge-tree', mergeBase, targetRef, sourceRef], true),
    ])
    const targetFiles = new Set(target.stdout.split('\n').filter(Boolean))
    const sourceFiles = new Set(source.stdout.split('\n').filter(Boolean))
    const overlap = [...sourceFiles].filter(file => targetFiles.has(file))
    const textual = new Set<string>()
    const lines = mergeTree.stdout.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index]?.includes('changed in both') || lines[index]?.includes('added in both')) {
        const candidate = lines
          .slice(index, index + 8)
          .flatMap(line => line.trim().split(/\s+/u))
          .find(token => sourceFiles.has(token) || targetFiles.has(token))
        if (candidate !== undefined) textual.add(candidate)
      }
    }
    return overlap.map(pathName => ({
      path: pathName,
      reason: textual.has(pathName) ? '目标分支与交付分支都修改了该文件，merge-tree 检测到内容级冲突迹象。' : '目标分支与交付分支自共同基线后都修改了该文件，需要重点复核。',
      suggestion: '先拉取目标分支，在交付分支中按需求语义完成合并并重新执行测试与构建。',
    }))
  }

  private async runCheck(path: string, command: string): Promise<DeliveryCheckResult> {
    const trimmed = command.trim()
    if (trimmed === '') return { label: '未配置检查', command, status: 'skipped', exitCode: null, stdout: '', stderr: '', durationMs: 0 }
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh'
    const args = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', trimmed] : ['-c', trimmed]
    const run = await this.runCommand(path, [shell, ...args], true)
    return {
      label: trimmed, command: trimmed, status: run.outcome.exitCode === 0 ? 'passed' : 'failed',
      exitCode: run.outcome.exitCode, stdout: run.stdout, stderr: run.stderr, durationMs: run.durationMs,
    }
  }

  private git(path: string, args: readonly string[], allowFailure = false): Promise<CommandRun> {
    return this.runCommand(path, ['git', ...args], allowFailure)
  }

  private async runCommand(path: string, argv: readonly string[], allowFailure: boolean): Promise<CommandRun> {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort('development-management command timeout')
    }, this.config.commandTimeoutMs)
    const started = Date.now()
    try {
      const handle = this.ctx.subprocess.spawn({
        argv, cwd: path, stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: this.config.maxCommandOutputBytes },
          stderr: { maxBytes: this.config.maxCommandOutputBytes },
        }, graceMs: 1_000, signal: controller.signal,
      })
      const outcome = await handle.done
      const result = {
        outcome,
        stdout: output(handle.collected.stdout),
        stderr: output(handle.collected.stderr),
        durationMs: Date.now() - started,
      }
      if (!allowFailure && outcome.exitCode !== 0) throw new DevelopmentManagementError('command-failed', `${argv.join(' ')} 执行失败：${result.stderr || result.stdout}`)
      return result
    } finally {
      clearTimeout(timer)
    }
  }

  private mergeRequestDescription(task: DevelopmentTask, summary: string, files: readonly DeliveryChangedFile[], conflicts: readonly DeliveryConflictRisk[], checks: readonly DeliveryCheckResult[], conclusion: DeliveryReview['conclusion']): string {
    return [
      `## 研发需求\n\n${task.description}`,
      `## 验收标准\n\n${task.acceptanceCriteria}`,
      `## 代码变更\n\n${summary}\n\n${files.map(file => `- \`${file.status}\` ${file.path} (+${String(file.additions)}/-${String(file.deletions)})`).join('\n') || '- 无提交差异'}`,
      `## 疑似冲突\n\n${conflicts.map(value => `- **${value.path}**：${value.reason} ${value.suggestion}`).join('\n') || '- 未发现共同修改文件'}`,
      `## 检查、测试与构建\n\n${checks.map(value => `- ${value.status === 'passed' ? '✅' : value.status === 'failed' ? '❌' : '⏭️'} \`${value.command}\`（退出码 ${String(value.exitCode)}）`).join('\n') || '- 未配置检查命令'}`,
      `## Agent 结论\n\n${conclusion === 'recommend-merge' ? '建议合并。人工确认后方可提交 Merge Request。' : '暂缓合并。请解决冲突或失败检查后重新提交。'}`,
    ].join('\n\n')
  }

  private async createRemoteMergeRequest(review: DeliveryReview): Promise<MergeRequestDraft> {
    if (this.config.integrationProvider === 'gitlab') return this.createGitLabMergeRequest(review)
    throw new DevelopmentManagementError('integration-not-configured', 'GitHub 自动创建 PR 尚未配置；请提供人工创建的 PR URL。')
  }

  private async createGitLabMergeRequest(review: DeliveryReview): Promise<MergeRequestDraft> {
    const { integrationBaseUrl, integrationProject, integrationToken } = this.config
    if (integrationBaseUrl === undefined || integrationProject === undefined || integrationToken === undefined) {
      throw new DevelopmentManagementError('integration-not-configured', 'GitLab 集成配置不完整。')
    }
    const url = new URL(`/api/v4/projects/${encodeURIComponent(integrationProject)}/merge_requests`, integrationBaseUrl)
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'private-token': integrationToken },
      body: JSON.stringify({
        source_branch: review.mergeRequest.sourceRef,
        target_branch: review.mergeRequest.targetRef,
        title: review.mergeRequest.title,
        description: review.mergeRequest.description,
      }),
    })
    const body = await response.json() as { iid?: number; web_url?: string; message?: unknown }
    if (!response.ok || body.iid === undefined || body.web_url === undefined) throw new DevelopmentManagementError('remote-mr-failed', `GitLab 创建 Merge Request 失败：${JSON.stringify(body.message ?? response.status)}`)
    return { ...review.mergeRequest, provider: 'gitlab', status: 'submitted', remoteId: String(body.iid), remoteUrl: body.web_url }
  }

  private async mergeRemoteGitLab(review: DeliveryReview): Promise<MergeRequestDraft> {
    const { integrationBaseUrl, integrationProject, integrationToken } = this.config
    if (integrationBaseUrl === undefined || integrationProject === undefined || integrationToken === undefined || review.mergeRequest.remoteId === undefined) throw new DevelopmentManagementError('integration-not-configured', 'GitLab 合并配置不完整。')
    const url = new URL(`/api/v4/projects/${encodeURIComponent(integrationProject)}/merge_requests/${encodeURIComponent(review.mergeRequest.remoteId)}/merge`, integrationBaseUrl)
    const response = await fetch(url, { method: 'PUT', headers: { 'private-token': integrationToken } })
    const body = await response.json() as { state?: string; web_url?: string; message?: unknown }
    if (!response.ok || body.state !== 'merged') throw new DevelopmentManagementError('remote-merge-failed', `GitLab 合并失败：${JSON.stringify(body.message ?? response.status)}`)
    return { ...review.mergeRequest, status: 'merged', ...(body.web_url === undefined ? {} : { remoteUrl: body.web_url }) }
  }

  private integrationStatus(): DevelopmentIntegrationStatus {
    const provider = this.config.integrationProvider
    const configured = provider === 'gitlab' && this.config.integrationBaseUrl !== undefined && this.config.integrationProject !== undefined && this.config.integrationToken !== undefined
    const label = configured
      ? 'GITLAB 远程集成已配置'
      : provider === 'github'
        ? 'GitHub 自动创建尚未实现；请回填真实 PR URL'
        : '未配置远程 Git 集成；支持生成 MR 内容和人工回填 URL'
    return { provider, configured, label }
  }

  private cleanRemoteUrl(value: string): string {
    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
      return url.href
    } catch {
      throw new DevelopmentManagementError('invalid-url', 'MR/PR URL 必须是有效的 HTTP(S) 地址。')
    }
  }

  private cleanRef(value: string): string {
    const clean = value.trim()
    if (!SAFE_REF.test(clean) || clean.startsWith('-') || clean.includes('..') || clean.endsWith('.lock')) throw new DevelopmentManagementError('invalid-ref', 'Git 分支或引用名称无效。')
    return clean
  }

  private async resolveRepository(value: string): Promise<string> {
    if (!isAbsolute(value)) throw new DevelopmentManagementError('repository-outside-roots', '代码仓库必须使用已允许根目录内的绝对路径。')
    let canonical: string
    try { canonical = await realpath(resolve(value)) } catch { throw new DevelopmentManagementError('repository-not-found', '代码仓库目录不存在。') }
    const roots = await Promise.all(this.config.repositoryRoots.map(async (root) => {
      try { return await realpath(resolve(root)) } catch { return resolve(root) }
    }))
    if (!roots.some(root => within(root, canonical))) throw new DevelopmentManagementError('repository-outside-roots', '代码仓库不在允许的根目录中。')
    const info = await lstat(canonical)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new DevelopmentManagementError('repository-not-found', '代码仓库路径不是普通目录。')
    const inside = await this.runCommand(canonical, ['git', 'rev-parse', '--is-inside-work-tree'], true)
    if (inside.outcome.exitCode !== 0 || inside.stdout.trim() !== 'true') throw new DevelopmentManagementError('not-git-repository', '选择的目录不是 Git 工作树。')
    return canonical
  }

  private assertFileType(role: DevelopmentRole, name: string, mediaType: string): void {
    const extension = name.toLocaleLowerCase().split('.').at(-1) ?? ''
    if (mediaType.includes('\0')) throw new DevelopmentManagementError('unsupported-file-type', '文件媒体类型无效。')
    if (role === 'product-manager') {
      if (!['png', 'pdf', 'html', 'htm', 'md', 'txt', 'docx'].includes(extension)) throw new DevelopmentManagementError('unsupported-file-type', '产品经理仅可上传 PNG、PDF、HTML、Markdown、文本或 DOCX 需求/原型文件。')
    }
    // Engineering deliveries are complete source trees, not a curated document
    // collection. Extension allowlists would silently omit assets, build
    // wrappers, lockfiles, model sidecars, and extensionless repository files.
    // Role/status checks, path confinement, byte quotas, and regular-file HTTP
    // streaming remain the admission boundary.
  }

  private requireRole(role: DevelopmentRole): void {
    if (this.state.activeRole !== role) throw new DevelopmentManagementError('forbidden', `当前角色不是 ${role}，无权执行此操作。`)
  }

  private requireTask(id: string): DevelopmentTask {
    const task = this.state.tasks.find(value => value.id === id)
    if (task === undefined) throw new DevelopmentManagementError('task-not-found', '研发任务不存在。')
    return task
  }

  private requireReview(id: string): DeliveryReview {
    const review = this.state.reviews.find(value => value.id === id)
    if (review === undefined) throw new DevelopmentManagementError('review-not-found', '交付检查结果不存在。')
    return review
  }

  private withStatus(task: DevelopmentTask, status: DevelopmentTaskStatus): DevelopmentTask {
    return { ...task, status, phase: phaseForStatus(status), updatedAt: timestampAfter(task.updatedAt) }
  }

  private transition(
    taskId: string,
    role: DevelopmentRole,
    from: readonly DevelopmentTaskStatus[],
    to: DevelopmentTaskStatus,
    detail: string,
  ): Promise<DevelopmentTask> {
    return this.enqueue(async () => {
      this.requireRole(role)
      const task = this.requireTask(taskId)
      if (!from.includes(task.status)) throw new DevelopmentManagementError('invalid-status', `任务当前状态 ${task.status} 不能转为 ${to}。`)
      const updated = this.withStatus(task, to)
      await this.replaceTask(updated, role, statusAction(to), detail)
      return taskSnapshot(updated)
    })
  }

  private async replaceTask(task: DevelopmentTask, actor: DevelopmentAuditEvent['actorRole'], action: string, detail: string): Promise<void> {
    await this.commit({
      ...this.state,
      tasks: this.state.tasks.map(value => value.id === task.id ? task : value),
      audit: [...this.state.audit, this.audit(task.id, actor, action, detail, task.updatedAt)],
    })
    this.changed()
  }

  private audit(taskId: string, actorRole: DevelopmentAuditEvent['actorRole'], action: string, detail: string, createdAt: string): DevelopmentAuditEvent {
    return { id: randomUUID(), taskId, actorRole, action, detail, createdAt }
  }

  private changed(): void { this.ctx.emit('development-management/changed') }

  private async commit(next: DevelopmentState): Promise<void> {
    const parsed = developmentStateSchema.parse(next)
    await withFileLock(this.statePath, async () => {
      await writeFileAtomic(this.statePath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
    }, { waitMs: 10_000 })
    this.state = parsed
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationTail.then(operation, operation)
    this.operationTail = run.then(() => undefined, () => undefined)
    return run
  }
}

/** Stream a temporary artifact file into SHA-256 without buffering it in memory. */
export async function digestArtifactFile(path: string): Promise<{ digest: string; bytes: number }> {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    hash.update(buffer)
  }
  return { digest: `sha256:${hash.digest('hex')}`, bytes }
}

/** Allocate a private exclusive file handle for an upload route. */
export function openUploadTarget(path: string) { return open(path, 'wx', 0o600) }
