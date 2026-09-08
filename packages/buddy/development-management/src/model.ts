/** Development-management state validation and role/status policy. */

import { z } from 'zod'
import type {
  DevelopmentDiscipline,
  DevelopmentArtifact,
  DevelopmentAuditEvent,
  DeliveryReview,
  DevelopmentRole,
  DevelopmentTask,
  DevelopmentTaskStatus,
} from './types.ts'

/** Current local durable format. */
export const DEVELOPMENT_STATE_VERSION = 1 as const

/** Every operator role exposed by the product. */
export const DEVELOPMENT_ROLES = [
  'product-manager',
  'blockchain-architect-engineer',
  'algorithm-engineer',
  'agent-application-development-engineer',
] as const satisfies readonly DevelopmentRole[]

/** Required assignee for each development discipline. */
export const DISCIPLINE_ASSIGNEE = {
  blockchain: 'blockchain-architect-engineer',
  algorithm: 'algorithm-engineer',
  'agent-application': 'agent-application-development-engineer',
} as const satisfies Record<DevelopmentDiscipline, Exclude<DevelopmentRole, 'product-manager'>>

const role = z.enum(DEVELOPMENT_ROLES)
const discipline = z.enum(['blockchain', 'algorithm', 'agent-application'])
const status = z.enum([
  'draft', 'pending-review', 'assigned', 'in-progress', 'pending-acceptance', 'acceptance-approved',
  'acceptance-rejected', 'pending-delivery-check', 'checking',
  'awaiting-human-confirmation', 'mr-submitted', 'merged', 'merge-paused',
])
const timestamp = z.iso.datetime()
const nonEmpty = z.string().trim().min(1).max(20_000)
const artifact = z.object({
  id: z.string().min(1), taskId: z.string().min(1), uploaderRole: role,
  rootName: z.string().min(1), relativePath: z.string().min(1), name: z.string().min(1),
  mediaType: z.string(), bytes: z.number().int().nonnegative(), digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  createdAt: timestamp,
}).strict()
const audit = z.object({
  id: z.string().min(1), taskId: z.string().min(1), actorRole: z.union([role, z.literal('delivery-agent')]),
  action: z.string().min(1), detail: z.string(), createdAt: timestamp,
}).strict()
const task = z.object({
  id: z.string().min(1), sequence: z.number().int().positive(), title: nonEmpty,
  discipline, priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), status,
  description: nonEmpty, acceptanceCriteria: nonEmpty, creatorRole: z.literal('product-manager'),
  assigneeRole: role.exclude(['product-manager']).optional(), reviewerRole: z.literal('product-manager'),
  phase: z.string(),
  repository: z.object({ path: z.string().min(1), sourceRef: z.string().min(1), targetRef: z.string().min(1) }).strict().optional(),
  acceptanceSubmission: z.object({ summary: nonEmpty, submittedAt: timestamp }).strict().optional(),
  acceptanceReview: z.object({
    decision: z.enum(['approve', 'reject']), comment: z.string().max(20_000), reviewedAt: timestamp,
  }).strict().optional(),
  latestReviewId: z.string().min(1).optional(), createdAt: timestamp, updatedAt: timestamp,
}).strict()
const changedFile = z.object({
  path: z.string(), status: z.string(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative(),
}).strict()
const conflict = z.object({ path: z.string(), reason: z.string(), suggestion: z.string() }).strict()
const check = z.object({
  label: z.string(), command: z.string(), status: z.enum(['passed', 'failed', 'skipped']),
  exitCode: z.number().int().nullable(), stdout: z.string(), stderr: z.string(), durationMs: z.number().int().nonnegative(),
}).strict()
const mergeRequest = z.object({
  title: z.string(), description: z.string(), sourceRef: z.string(), targetRef: z.string(),
  provider: z.enum(['none', 'gitlab', 'github', 'manual']), status: z.enum(['draft', 'submitted', 'merged']),
  remoteId: z.string().optional(), remoteUrl: z.url().optional(),
}).strict()
const review = z.object({
  id: z.string().min(1), taskId: z.string().min(1), repositoryPath: z.string().min(1), currentBranch: z.string(),
  workingTreeChanges: z.array(z.string()), changedFiles: z.array(changedFile), suspectedConflicts: z.array(conflict),
  checks: z.array(check), summary: z.string(), conclusion: z.enum(['recommend-merge', 'pause-merge']),
  mergeRequest, createdAt: timestamp,
}).strict()

/** Complete persisted state schema. */
export const developmentStateSchema = z.object({
  version: z.literal(DEVELOPMENT_STATE_VERSION),
  activeRole: role,
  nextSequence: z.number().int().positive(),
  tasks: z.array(task), artifacts: z.array(artifact), reviews: z.array(review), audit: z.array(audit),
}).strict()

/** Complete persisted state. */
export interface DevelopmentState {
  readonly version: typeof DEVELOPMENT_STATE_VERSION
  readonly activeRole: DevelopmentRole
  readonly nextSequence: number
  readonly tasks: DevelopmentTask[]
  readonly artifacts: DevelopmentArtifact[]
  readonly reviews: DeliveryReview[]
  readonly audit: DevelopmentAuditEvent[]
}

/** Initial empty state for one attended local deployment. */
export function initialDevelopmentState(): DevelopmentState {
  return {
    version: DEVELOPMENT_STATE_VERSION,
    activeRole: 'product-manager',
    nextSequence: 1,
    tasks: [], artifacts: [], reviews: [], audit: [],
  }
}

/** Phase label derived from the authoritative status. */
export function phaseForStatus(value: DevelopmentTaskStatus): string {
  switch (value) {
    case 'draft': return '需求编制'
    case 'pending-review': return '需求评审'
    case 'assigned': return '待开发'
    case 'in-progress': return '研发中'
    case 'pending-acceptance': return '待成果验收'
    case 'acceptance-approved': return '验收通过'
    case 'acceptance-rejected': return '验收退回'
    case 'pending-delivery-check': return '待交付检查'
    case 'checking': return '智能体检查中'
    case 'awaiting-human-confirmation': return '人工确认'
    case 'mr-submitted': return '合并请求审查'
    case 'merged': return '已交付'
    case 'merge-paused': return '已暂缓'
  }
}

/** Whether a task may accept files from the current role. */
export function roleMayUpload(roleValue: DevelopmentRole, taskValue: DevelopmentState['tasks'][number]): boolean {
  if (roleValue === 'product-manager') {
    return ['draft', 'pending-review', 'assigned'].includes(taskValue.status)
  }
  return taskValue.assigneeRole === roleValue && ['assigned', 'in-progress', 'acceptance-rejected', 'merge-paused'].includes(taskValue.status)
}
