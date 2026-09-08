---
description: "Buddy Development Management: role-authorized requirements, streamed engineering artifacts, real Git delivery review, and human merge gates."
kind: "subsystem"
---

# Development Management

English | [中文](development-management.zh.md)

Development Management is Buddy's attended local workflow from a Product Manager requirement to an evidence-backed code delivery. The Host owns task state, role authorization, artifact metadata, audit history, Git analysis, check execution, and Merge Request evidence. The browser is a projection and command surface; changing browser state alone cannot advance a task.

## Ownership and boundaries

- `@sospink/dsh-buddy-development-management` owns the durable lifecycle, authenticated streaming routes, repository confinement, Agent delivery report, and remote/manual merge evidence.
- `@sospink/dsh-buddy-client-ui-development-management` owns the sidebar entry and dark acrylic requirement workbench.
- Product Managers create, review, assign, and confirm. Each engineering discipline can act only on compatible tasks assigned to its role.
- Engineering uploads are complete repository trees. Files stream to disk with path, quota, duplicate, digest, role, and task-state checks; Product Manager attachments retain an explicit document/prototype allowlist.
- Git analysis is local and real. Repository roots are deployment policy. Check commands run through the managed subprocess seam with bounded time and output.

A delivery report distinguishes conservative suspected-conflict signals from confirmed conflicts. Failed checks, suspected conflicts, or no committed branch difference yield pause merge. A recommendation never submits by itself: Product Manager confirmation and either configured GitLab state or real manual MR/PR URL evidence remain mandatory.

## Further reading

- [Host package](../../packages/buddy/development-management/README.md)
- [Browser package](../../packages/buddy/client-ui-development-management/README.md)
- [Acceptance ledger](../buddy-development-management-ledger.md)
- [Implementation decision](../../.agents/notes/implemented/feature/2026-09-07-development-management-delivery-loop.md)

## Known Limitations and Deferred Work

- Automatic GitHub Pull Request creation is not implemented.
- Command output appears after the attended delivery-check operation completes rather than streaming per command.
- Artifact replacement, retention, malware scanning, multi-user identity, and tenant authorization require separate deployment contracts.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdevelopmentmanagement--developmentmanagementcontroller"></a>

### `ctx.developmentManagement` — `DevelopmentManagementController`

Host Remote service backing the browser development-management workspace.

```ts cordis-catalog
/**
 * Return the complete current browser projection.
 * @returns The complete current browser projection.
 */
@Remote('baseline') baseline(): DevelopmentBaseline

/**
 * Persist the active operator role.
 * @param request - Role selection request.
 * @returns The refreshed durable projection.
 */
@Remote('selectRole') selectRole(request: SelectDevelopmentRoleRequest): Promise<DevelopmentBaseline>

/**
 * Create one product requirement.
 * @param request - Requirement content and discipline.
 * @returns The created draft task.
 */
@Remote('createTask') createTask(request: CreateDevelopmentTaskRequest): Promise<DevelopmentTask>

/**
 * Submit a draft for review.
 * @param request - Task identifier.
 * @returns The task in pending-review state.
 */
@Remote('submitReview') submitReview(request: DevelopmentTaskRequest): Promise<DevelopmentTask>

/**
 * Assign a reviewed task.
 * @param request - Task and discipline-compatible assignee.
 * @returns The assigned task.
 */
@Remote('assignTask') assignTask(request: AssignDevelopmentTaskRequest): Promise<DevelopmentTask>

/**
 * Accept an assigned task.
 * @param request - Task identifier.
 * @returns The task in progress.
 */
@Remote('startTask') startTask(request: DevelopmentTaskRequest): Promise<DevelopmentTask>

/**
 * Configure the local checkout and branch comparison.
 * @param request - Permitted repository path and Git refs.
 * @returns The task with repository configuration.
 */
@Remote('configureDelivery') configureDelivery(request: ConfigureDeliveryRequest): Promise<DevelopmentTask>

/**
 * Mark a development task ready for Agent checks.
 * @param request - Task identifier.
 * @returns The task pending delivery review.
 */
@Remote('requestDeliveryCheck') requestDeliveryCheck(request: DevelopmentTaskRequest): Promise<DevelopmentTask>

/**
 * Execute and persist the Agent delivery review.
 * @param request - Task identifier.
 * @returns The evidence-backed delivery review.
 */
@Remote('runDeliveryCheck') runDeliveryCheck(request: DevelopmentTaskRequest): Promise<DeliveryReview>

/**
 * Add a durable history note.
 * @param request - Task identifier and note text.
 */
@Remote('addNote') addNote(request: AddDevelopmentNoteRequest): Promise<void>

/**
 * Human-confirm and submit the generated MR.
 * @param request - Task identifier and optional manual MR URL.
 * @returns The review with submitted MR evidence.
 */
@Remote('confirmMergeRequest') confirmMergeRequest(request: ConfirmMergeRequestRequest): Promise<DeliveryReview>

/**
 * Merge a submitted MR using configured integration or manual evidence.
 * @param request - Task identifier and optional manual merged URL.
 * @returns The merged task and updated delivery review.
 */
@Remote('mergeTask') mergeTask(request: MergeDevelopmentRequest): Promise<DeliveryTaskAndReview>
```

Source: [`packages/buddy/development-management/src/index.ts`](../../packages/buddy/development-management/src/index.ts)

<a id="development-management-events"></a>

### `development-management/*` events

<a id="development-managementchanged--emit"></a>

#### `development-management/changed` — emit

One development-management mutation became durable. @mode emit

```ts cordis-catalog
/** One development-management mutation became durable. @mode emit */
'development-management/changed'(): void
```

Source: [`packages/buddy/development-management/src/index.ts`](../../packages/buddy/development-management/src/index.ts)
<!-- END GENERATED cordis-surface -->
