/** Development-management Remote controller, persistence, Git review, and authenticated uploads. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { DevelopmentManagementError } from './error.ts'
import { createDevelopmentArtifactRoute, createDevelopmentUploadRoute } from './http.ts'
import { DevelopmentManagementStore } from './service.ts'
import type { DevelopmentManagementConfig } from './service.ts'
import type {
  AddDevelopmentNoteRequest,
  AssignDevelopmentTaskRequest,
  ConfigureDeliveryRequest,
  ConfirmMergeRequestRequest,
  CreateDevelopmentTaskRequest,
  DeliveryReview,
  DeliveryTaskAndReview,
  DevelopmentBaseline,
  DevelopmentTask,
  DevelopmentTaskRequest,
  MergeDevelopmentRequest,
  ReviewAcceptanceRequest,
  SelectDevelopmentRoleRequest,
  SubmitAcceptanceRequest,
} from './types.ts'

export type * from './types.ts'
export { DEVELOPMENT_ARTIFACT_PATH, DEVELOPMENT_UPLOAD_PATH } from './paths.ts'
export { DevelopmentManagementError } from './error.ts'
export { DevelopmentManagementStore } from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { developmentManagement: DevelopmentManagementController }
  interface Events {
    /** One development-management mutation became durable. @mode emit */
    'development-management/changed'(): void
  }
}

/** Plugin configuration for private persistence, repository policy, checks, and optional remote integration. */
export interface Config {
  /** Private directory containing state and uploaded artifacts. */
  readonly root: string
  /** Canonical parent directories from which delivery repositories may be selected. */
  readonly repositoryRoots: string[]
  /** Maximum accepted bytes for one streamed artifact. */
  readonly maxFileBytes?: number
  /** Maximum aggregate artifact bytes retained for one task. */
  readonly maxTaskBytes?: number
  /** Maximum stdout or stderr bytes retained for each command. */
  readonly maxCommandOutputBytes?: number
  /** Maximum duration in milliseconds for each Git or check command. */
  readonly commandTimeoutMs?: number
  /** Shell commands run in order as delivery checks, tests, and builds. */
  readonly checkCommands?: string[]
  /** Remote integration used after Product Manager confirmation. */
  readonly integrationProvider?: 'none' | 'gitlab' | 'github'
  /** GitLab-compatible server base URL. */
  readonly integrationBaseUrl?: string
  /** GitLab project path or numeric project identifier. */
  readonly integrationProject?: string
  /** Private GitLab token used only by the Host integration. */
  readonly integrationToken?: string
}

const DEFAULT_FILE_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_TASK_BYTES = 20 * 1024 * 1024 * 1024
const DEFAULT_OUTPUT_BYTES = 256 * 1024
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000

/** Host Remote service backing the browser development-management workspace. */
export class DevelopmentManagementController extends TypertRemoteService {
  static inject = ['typert', 'webServer', 'connection', 'subprocess']
  static Config: z<Config> = z.object({
    root: z.string().required(), repositoryRoots: z.array(z.string()).required(),
    maxFileBytes: z.number().step(1).min(1).default(DEFAULT_FILE_BYTES),
    maxTaskBytes: z.number().step(1).min(1).default(DEFAULT_TASK_BYTES),
    maxCommandOutputBytes: z.number().step(1).min(1).default(DEFAULT_OUTPUT_BYTES),
    commandTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
    checkCommands: z.array(z.string()).default(['pnpm run typecheck', 'pnpm run test', 'pnpm run build']),
    integrationProvider: z.union([z.const('none'), z.const('gitlab'), z.const('github')]).default('none'),
    integrationBaseUrl: z.string(), integrationProject: z.string(), integrationToken: z.string(),
  })

  readonly store: DevelopmentManagementStore

  /** @param ctx - Host context. @param config - Validated plugin configuration. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'developmentManagement', { namespace: 'developmentManagement' })
    if (config.repositoryRoots.length === 0) throw new Error('development-management: repositoryRoots must not be empty')
    const resolved: DevelopmentManagementConfig = {
      root: config.root, repositoryRoots: config.repositoryRoots,
      maxFileBytes: config.maxFileBytes ?? DEFAULT_FILE_BYTES,
      maxTaskBytes: config.maxTaskBytes ?? DEFAULT_TASK_BYTES,
      maxCommandOutputBytes: config.maxCommandOutputBytes ?? DEFAULT_OUTPUT_BYTES,
      commandTimeoutMs: config.commandTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      checkCommands: config.checkCommands ?? ['pnpm run typecheck', 'pnpm run test', 'pnpm run build'],
      integrationProvider: config.integrationProvider ?? 'none',
      ...(config.integrationBaseUrl === undefined ? {} : { integrationBaseUrl: config.integrationBaseUrl }),
      ...(config.integrationProject === undefined ? {} : { integrationProject: config.integrationProject }),
      ...(config.integrationToken === undefined ? {} : { integrationToken: config.integrationToken }),
    }
    this.store = new DevelopmentManagementStore(ctx, resolved)
    ctx.effect(() => ctx.webServer.register(createDevelopmentUploadRoute(ctx, this.store)), 'development-management: upload route')
    ctx.effect(() => ctx.webServer.register(createDevelopmentArtifactRoute(ctx, this.store)), 'development-management: artifact route')
  }

  protected async [Service.init](): Promise<void> { await this.store.initialize() }

  /**
   * Return the complete current browser projection.
   * @returns The complete current browser projection.
   */
  @Remote('baseline') baseline(): DevelopmentBaseline { return this.store.baseline() }

  /**
   * Persist the active operator role.
   * @param request - Role selection request.
   * @returns The refreshed durable projection.
   */
  @Remote('selectRole') selectRole(request: SelectDevelopmentRoleRequest): Promise<DevelopmentBaseline> { return this.wrap(() => this.store.selectRole(request.role)) }

  /**
   * Create one product requirement.
   * @param request - Requirement content and discipline.
   * @returns The created draft task.
   */
  @Remote('createTask') createTask(request: CreateDevelopmentTaskRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.createTask(request)) }

  /**
   * Submit a draft for review.
   * @param request - Task identifier.
   * @returns The task in pending-review state.
   */
  @Remote('submitReview') submitReview(request: DevelopmentTaskRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.submitReview(request)) }

  /**
   * Assign a reviewed task.
   * @param request - Task and discipline-compatible assignee.
   * @returns The assigned task.
   */
  @Remote('assignTask') assignTask(request: AssignDevelopmentTaskRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.assignTask(request)) }

  /**
   * Accept an assigned task.
   * @param request - Task identifier.
   * @returns The task in progress.
   */
  @Remote('startTask') startTask(request: DevelopmentTaskRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.startTask(request)) }

  /**
   * Submit uploaded engineering results for Product Manager acceptance.
   * @param request - Task identifier and result summary.
   * @returns The task awaiting result acceptance.
   */
  @Remote('submitAcceptance') submitAcceptance(request: SubmitAcceptanceRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.submitAcceptance(request)) }

  /**
   * Approve or return submitted engineering results.
   * @param request - Task identifier, decision, and optional review comment.
   * @returns The accepted or returned task.
   */
  @Remote('reviewAcceptance') reviewAcceptance(request: ReviewAcceptanceRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.reviewAcceptance(request)) }

  /**
   * Configure the local checkout and branch comparison.
   * @param request - Permitted repository path and Git refs.
   * @returns The task with repository configuration.
   */
  @Remote('configureDelivery') configureDelivery(request: ConfigureDeliveryRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.configureDelivery(request)) }

  /**
   * Mark a development task ready for Agent checks.
   * @param request - Task identifier.
   * @returns The task pending delivery review.
   */
  @Remote('requestDeliveryCheck') requestDeliveryCheck(request: DevelopmentTaskRequest): Promise<DevelopmentTask> { return this.wrap(() => this.store.requestDeliveryCheck(request)) }

  /**
   * Execute and persist the Agent delivery review.
   * @param request - Task identifier.
   * @returns The evidence-backed delivery review.
   */
  @Remote('runDeliveryCheck') runDeliveryCheck(request: DevelopmentTaskRequest): Promise<DeliveryReview> { return this.wrap(() => this.store.runDeliveryCheck(request)) }

  /**
   * Add a durable history note.
   * @param request - Task identifier and note text.
   */
  @Remote('addNote') addNote(request: AddDevelopmentNoteRequest): Promise<void> { return this.wrap(() => this.store.addNote(request)) }

  /**
   * Human-confirm and submit the generated MR.
   * @param request - Task identifier and optional manual MR URL.
   * @returns The review with submitted MR evidence.
   */
  @Remote('confirmMergeRequest') confirmMergeRequest(request: ConfirmMergeRequestRequest): Promise<DeliveryReview> { return this.wrap(() => this.store.confirmMergeRequest(request)) }

  /**
   * Merge a submitted MR using configured integration or manual evidence.
   * @param request - Task identifier and optional manual merged URL.
   * @returns The merged task and updated delivery review.
   */
  @Remote('mergeTask') mergeTask(request: MergeDevelopmentRequest): Promise<DeliveryTaskAndReview> { return this.wrap(() => this.store.mergeTask(request)) }

  private async wrap<T>(operation: () => T | Promise<T>): Promise<T> {
    try { return await operation() } catch (error) {
      if (error instanceof TypertRemoteFailure) throw error
      if (error instanceof DevelopmentManagementError) {
        throw new TypertRemoteFailure({ code: error.code, message: error.message, details: {} })
      }
      throw error
    }
  }
}

export default DevelopmentManagementController
