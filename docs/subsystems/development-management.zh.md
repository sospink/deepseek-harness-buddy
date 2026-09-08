---
description: "Buddy 开发管理：角色授权需求、流式研发附件、真实 Git 交付审查和人工合并门槛。"
kind: "subsystem"
---

# 开发管理

[English](development-management.md) | 中文

开发管理是 Buddy 从产品经理需求到证据化代码交付的有人值守本地流程。Host 负责任务状态、角色鉴权、附件元数据、审计历史、Git 分析、检查执行和 Merge Request 证据。浏览器只是投影与命令界面；只修改浏览器状态不能推进任务。

## 所有权与边界

- `@sospink/dsh-buddy-development-management` 负责持久化生命周期、认证流式路由、仓库范围约束、Agent 交付报告和远程/人工合并证据。
- `@sospink/dsh-buddy-client-ui-development-management` 负责侧边栏入口和深色亚克力需求工作台。
- 产品经理负责创建、评审、指派与确认；每个研发专业只能操作与其角色匹配且已指派给自己的任务。
- 研发上传是完整仓库树。文件流式落盘，并接受路径、配额、重复、摘要、角色和任务状态校验；产品经理附件仍使用明确的文档/原型白名单。
- Git 分析真实发生在本地。仓库根目录属于部署策略；检查命令通过受管子进程接口执行，具有时间和输出限制。

交付报告会区分保守的疑似冲突信号与确认冲突。检查失败、发现疑似冲突或没有已提交分支差异时会暂缓合并。即使建议合并也不会自动提交：仍须产品经理确认，并获得已配置 GitLab 状态或真实人工 MR/PR URL 证据。

## 进一步阅读

- [Host 包](../../packages/buddy/development-management/README.zh.md)
- [浏览器包](../../packages/buddy/client-ui-development-management/README.zh.md)
- [验收台账](../buddy-development-management-ledger.zh.md)
- [实现决策](../../.agents/notes/implemented/feature/2026-09-07-development-management-delivery-loop.zh.md)

## 已知限制与延期工作

- 暂未实现自动创建 GitHub Pull Request。
- 命令输出在整次有人值守交付检查完成后展示，暂不逐命令实时流式输出。
- 附件替换、保留策略、恶意软件扫描、多用户身份与租户授权需要独立部署契约。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
