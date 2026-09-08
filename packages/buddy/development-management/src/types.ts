/** Browser-safe development-management vocabulary. */

/** Human role selected for development-management writes. */
export type DevelopmentRole =
  | 'product-manager'
  | 'blockchain-architect-engineer'
  | 'algorithm-engineer'
  | 'agent-application-development-engineer'

/** Development task discipline and its required assignee role. */
export type DevelopmentDiscipline = 'blockchain' | 'algorithm' | 'agent-application'

/** Durable development-task lifecycle. */
export type DevelopmentTaskStatus =
  | 'draft'
  | 'pending-review'
  | 'assigned'
  | 'in-progress'
  | 'pending-acceptance'
  | 'acceptance-approved'
  | 'acceptance-rejected'
  | 'pending-delivery-check'
  | 'checking'
  | 'awaiting-human-confirmation'
  | 'mr-submitted'
  | 'merged'
  | 'merge-paused'

/** Stable priority vocabulary matching the requirement list. */
export type DevelopmentPriority = 1 | 2 | 3 | 4

/** One repository prepared for delivery analysis. */
export interface DeliveryRepository {
  readonly path: string
  readonly sourceRef: string
  readonly targetRef: string
}

/** One durable product or source artifact uploaded to a task. */
export interface DevelopmentArtifact {
  readonly id: string
  readonly taskId: string
  readonly uploaderRole: DevelopmentRole
  readonly rootName: string
  readonly relativePath: string
  readonly name: string
  readonly mediaType: string
  readonly bytes: number
  readonly digest: string
  readonly createdAt: string
}

/** One audit/history entry visible on a task. */
export interface DevelopmentAuditEvent {
  readonly id: string
  readonly taskId: string
  readonly actorRole: DevelopmentRole | 'delivery-agent'
  readonly action: string
  readonly detail: string
  readonly createdAt: string
}

/** One requirement or development task. */
export interface DevelopmentTask {
  readonly id: string
  readonly sequence: number
  readonly title: string
  readonly discipline: DevelopmentDiscipline
  readonly priority: DevelopmentPriority
  readonly status: DevelopmentTaskStatus
  readonly description: string
  readonly acceptanceCriteria: string
  readonly creatorRole: 'product-manager'
  readonly assigneeRole?: Exclude<DevelopmentRole, 'product-manager'> | undefined
  readonly reviewerRole: 'product-manager'
  readonly phase: string
  readonly repository?: DeliveryRepository | undefined
  readonly acceptanceSubmission?: {
    readonly summary: string
    readonly submittedAt: string
  } | undefined
  readonly acceptanceReview?: {
    readonly decision: 'approve' | 'reject'
    readonly comment: string
    readonly reviewedAt: string
  } | undefined
  readonly latestReviewId?: string | undefined
  readonly createdAt: string
  readonly updatedAt: string
}

/** File-level branch difference. */
export interface DeliveryChangedFile {
  readonly path: string
  readonly status: string
  readonly additions: number
  readonly deletions: number
}

/** One file with a credible merge-conflict risk. */
export interface DeliveryConflictRisk {
  readonly path: string
  readonly reason: string
  readonly suggestion: string
}

/** Actual command execution recorded by a delivery check. */
export interface DeliveryCheckResult {
  readonly label: string
  readonly command: string
  readonly status: 'passed' | 'failed' | 'skipped'
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
}

/** Generated merge-request content and remote submission facts. */
export interface MergeRequestDraft {
  readonly title: string
  readonly description: string
  readonly sourceRef: string
  readonly targetRef: string
  readonly provider: 'none' | 'gitlab' | 'github' | 'manual'
  readonly status: 'draft' | 'submitted' | 'merged'
  readonly remoteId?: string | undefined
  readonly remoteUrl?: string | undefined
}

/** Complete durable delivery review. */
export interface DeliveryReview {
  readonly id: string
  readonly taskId: string
  readonly repositoryPath: string
  readonly currentBranch: string
  readonly workingTreeChanges: readonly string[]
  readonly changedFiles: readonly DeliveryChangedFile[]
  readonly suspectedConflicts: readonly DeliveryConflictRisk[]
  readonly checks: readonly DeliveryCheckResult[]
  readonly summary: string
  readonly conclusion: 'recommend-merge' | 'pause-merge'
  readonly mergeRequest: MergeRequestDraft
  readonly createdAt: string
}

/** Safe integration status projected to the browser. */
export interface DevelopmentIntegrationStatus {
  readonly provider: 'none' | 'gitlab' | 'github'
  readonly configured: boolean
  readonly label: string
}

/** Complete reconnect baseline. */
export interface DevelopmentBaseline {
  readonly activeRole: DevelopmentRole
  readonly tasks: readonly DevelopmentTask[]
  readonly artifacts: readonly DevelopmentArtifact[]
  readonly reviews: readonly DeliveryReview[]
  readonly audit: readonly DevelopmentAuditEvent[]
  readonly integration: DevelopmentIntegrationStatus
  readonly uploadLimits: {
    readonly maxFileBytes: number
    readonly maxTaskBytes: number
  }
}

/** Change the current operator role. */
export interface SelectDevelopmentRoleRequest { readonly role: DevelopmentRole }

/** Create one product requirement. */
export interface CreateDevelopmentTaskRequest {
  readonly title: string
  readonly discipline: DevelopmentDiscipline
  readonly priority: DevelopmentPriority
  readonly description: string
  readonly acceptanceCriteria: string
}

/** Identify one development task. */
export interface DevelopmentTaskRequest { readonly taskId: string }

/** Assign a requirement to its compatible engineering role. */
export interface AssignDevelopmentTaskRequest extends DevelopmentTaskRequest {
  readonly assigneeRole: Exclude<DevelopmentRole, 'product-manager'>
}

/** Configure the local checkout used for branch analysis and checks. */
export interface ConfigureDeliveryRequest extends DevelopmentTaskRequest {
  readonly repositoryPath: string
  readonly sourceRef: string
  readonly targetRef: string
}

/** Submit uploaded engineering results for Product Manager acceptance. */
export interface SubmitAcceptanceRequest extends DevelopmentTaskRequest {
  readonly summary: string
}

/** Approve or return one submitted engineering result. */
export interface ReviewAcceptanceRequest extends DevelopmentTaskRequest {
  readonly decision: 'approve' | 'reject'
  readonly comment?: string
}

/** Add a human-visible task history note. */
export interface AddDevelopmentNoteRequest extends DevelopmentTaskRequest { readonly note: string }

/** Confirm generated MR content and either create it remotely or cite a manually created URL. */
export interface ConfirmMergeRequestRequest extends DevelopmentTaskRequest { readonly manualRemoteUrl?: string }

/** Confirm a remote/manual MR was merged when automatic merge is unavailable. */
export interface MergeDevelopmentRequest extends DevelopmentTaskRequest { readonly manualMergedUrl?: string }

/** Combined task and review returned after a merge is durably recorded. */
export interface DeliveryTaskAndReview {
  readonly task: DevelopmentTask
  readonly review: DeliveryReview
}

/** One committed upload response. */
export interface DevelopmentUploadValue { readonly artifact: DevelopmentArtifact }

/** Stable HTTP failure body. */
export interface DevelopmentHttpFailure {
  readonly error: { readonly code: string; readonly message: string }
}
