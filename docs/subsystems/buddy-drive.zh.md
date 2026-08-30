---
description: "Buddy 分支自有资料云盘子系统：受控本地资料、浏览器传输、预览和只读模型证据。"
kind: "subsystem"
---

# Buddy Drive

[English](buddy-drive.md) | 中文

Buddy Drive 是定位安全 Agent 产品模式使用的分支自有资料库。它通过 `ctx.drive` 将提供方无关的元数据和不可变内容封装起来，通过独立的认证适配器提供浏览器操作，并且只通过有界的只读工具向模型提供资料。第一版是单本地资料库，不是企业身份、租户、分享、远程备份或正式低空安全协议实现。

## 所有权

- `@sospink/dsh-buddy-drive` 负责 Service Definition 和不可变资料库词汇。
- `@sospink/dsh-buddy-drive-local` 负责 Storage Domain 元数据、内容寻址 Blob、准入、本地备份/恢复和审计持久化。
- `@sospink/dsh-buddy-api-drive` 负责生成式 Remote 命令和认证二进制路由。
- `@sospink/dsh-buddy-client-ui-drive` 负责浏览器工作区和有界 Markdown/PDF/DOCX 预览。
- `@sospink/dsh-buddy-tool-drive` 负责 `drive_list`、`drive_search` 和 `drive_read`，不接受文件系统路径或修改操作。

## 边界

本地 Provider 在发出 `drive/changed` 前提交资料变更。浏览器状态是可重连投影，不会自动进入模型上下文。工具结果携带 File ID、Version ID、摘要、分类和有界证据文本；资料内容是不可信证据而不是指令。维护用备份和恢复方法是显式本地操作，不注册浏览器路由。

留存策略、硬删除、企业身份、租户授权、远程对象存储、恶意软件/CDR 扫描、OCR、索引检索和正式领域协议合规仍待外部契约提供。

## 进一步阅读

- [Buddy 包地图](../../packages/buddy/README.zh.md)
- [Drive 开发 TODO](../../BUDDY_DRIVE_TODO.md)
- [Drive Service Definition](../../packages/buddy/drive/README.zh.md)
- [本地 Provider](../../packages/buddy/drive-local/README.zh.md)
- [只读工具](../../packages/buddy/tool-drive/README.zh.md)

## 模型体验

### 受控证据

#### 模型看到什么

只有显式选择定位安全模式的 Session 才会收到三个只读 Drive 工具 Schema 和固定证据说明。资料不会自动注入。成功读取会包含有界文本和不可变来源信息。

#### Token 影响

固定说明和 Schema 只增加小段稳定前缀；工具结果只增加模型请求的有界元数据行、摘要和行窗口。

#### KV Cache 影响

Preset 说明保持稳定。资料内容作为 Tool Result 追加，并随不可变版本变化，不会重写稳定的系统提示前缀。

## 已知限制与延期工作

- 本地 Provider 只有一个资料库，没有按用户分享或租户授权。
- 浏览器预览、模型提取、备份/恢复和留存属于不同契约，不是一个泛化文件服务。
- 搜索是对当前版本的有界线性检查；实现索引检索前必须先完成文档级授权和删除传播。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

保持 Service Definition 不包含文件系统和浏览器关注点。模型可见能力应在 `tool-drive` 中增加，并携带不可变来源和明确预算；不得暴露 Provider 路径或静默把资料注入 Prompt。

</details>

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbuddydrivecontroller--buddydrivecontroller"></a>

### `ctx.buddyDriveController` — `BuddyDriveController`

Host service backing the generated `ctx.remote.drive` namespace.

```ts cordis-catalog
/**
 * Return the current complete Drive projection.
 * @returns The current Drive baseline.
 */
@Remote('baseline') baseline(): DriveBaseline

/**
 * Create a folder through the browser Remote.
 * @param request - Folder creation request.
 * @returns The committed folder value.
 */
@Remote('createFolder') createFolder(request: DriveCreateFolderRequest): Promise<DriveFolderValue>

/**
 * Rename a folder through the browser Remote.
 * @param request - Folder rename request.
 * @returns The committed folder value.
 */
@Remote('renameFolder') renameFolder(request: DriveRenameFolderRequest): Promise<DriveFolderValue>

/**
 * Move a folder through the browser Remote.
 * @param request - Folder move request.
 * @returns The committed folder value.
 */
@Remote('moveFolder') moveFolder(request: DriveMoveFolderRequest): Promise<DriveFolderValue>

/**
 * Rename a file through the browser Remote.
 * @param request - File rename request.
 * @returns The committed file value.
 */
@Remote('renameFile') renameFile(request: DriveRenameFileRequest): Promise<DriveFileValue>

/**
 * Move a file through the browser Remote.
 * @param request - File move request.
 * @returns The committed file value.
 */
@Remote('moveFile') moveFile(request: DriveMoveFileRequest): Promise<DriveFileValue>

/**
 * Update file classification and tags through the browser Remote.
 * @param request - Metadata update request.
 * @returns The committed file value.
 */
@Remote('updateFileMetadata') updateFileMetadata(request: DriveUpdateFileMetadataRequest): Promise<DriveFileValue>

/**
 * Soft-delete a file through the browser Remote.
 * @param request - File identity request.
 * @returns The committed file value.
 */
@Remote('deleteFile') deleteFile(request: DriveFileRequest): Promise<DriveFileValue>

/** Permanently remove selected files through the browser Remote.
 * @param request - File identities to remove.
 * @returns The number of files removed.
 */
@Remote('purgeFiles') purgeFiles(request: DrivePurgeFilesRequest): Promise<{ count: number }>

/**
 * Restore a soft-deleted file through the browser Remote.
 * @param request - File identity request.
 * @returns The committed file value.
 */
@Remote('restoreFile') restoreFile(request: DriveFileRequest): Promise<DriveFileValue>

/**
 * Return immutable versions through the browser Remote.
 * @param request - File identity request.
 * @returns The file's version values.
 */
@Remote('versions') versions(request: DriveFileRequest): Promise<DriveVersionsValue>

/**
 * Return recent Drive audit events.
 * @returns The recent audit projection.
 */
@Remote('audit') audit(): Promise<DriveAuditValue>

/**
 * Follow committed Drive projections.
 * @param signal - Cancellation signal for the stream.
 * @returns A reconnectable Drive frame stream.
 */
@Remote({ mode: 'stream' }) follow(signal: AbortSignal): AsyncIterable<DriveFollowFrame>
```

Source: [`packages/buddy/api-drive/src/index.ts`](../../packages/buddy/api-drive/src/index.ts)

<a id="ctxdrive--drivestore-abstract-seam"></a>

### `ctx.drive` — `DriveStore` (abstract seam)

Provider-neutral document library service. Implementations own media and durable metadata together.

```ts cordis-catalog
/**
 * Return the one default library.
 * @returns The current library snapshot.
 */
abstract library(): DriveLibrary

/**
 * Return folders in stable name/id order, optionally scoped to one parent.
 * @param parentId - Parent folder, or the library root when omitted.
 * @returns Matching folder snapshots.
 */
abstract listFolders(parentId?: DriveFolderIdBrand): readonly DriveFolder[]

/**
 * Return files in stable name/id order, excluding soft-deleted rows unless requested.
 * @param parentId - Parent folder, or the library root when omitted.
 * @param includeDeleted - Whether to include soft-deleted files.
 * @returns Matching file snapshots.
 */
abstract listFiles(parentId?: DriveFolderIdBrand, includeDeleted?: boolean): readonly DriveFile[]

/**
 * Look up one logical file.
 * @param fileId - File identity.
 * @returns The file, or undefined when absent.
 */
abstract getFile(fileId: DriveFileIdBrand): DriveFile | undefined

/**
 * Look up one immutable version.
 * @param versionId - Version identity.
 * @returns The version, or undefined when absent.
 */
abstract getVersion(versionId: DriveVersionIdBrand): DriveVersion | undefined

/**
 * Return all immutable versions of one file, newest first.
 * @param fileId - File identity.
 * @returns Immutable versions belonging to the file.
 */
abstract listVersions(fileId: DriveFileIdBrand): readonly DriveVersion[]

/**
 * Return recent immutable audit events, newest first.
 * @param query - Optional result and time filters.
 * @returns Matching audit events.
 */
abstract listAudit(query?: DriveAuditQuery): readonly DriveAuditEvent[]

/**
 * Create one folder.
 * @param input - Folder creation request.
 * @returns The committed folder.
 */
abstract createFolder(input: CreateDriveFolderInput): Promise<DriveFolder>

/**
 * Rename one folder.
 * @param input - Folder rename request.
 * @returns The committed folder.
 */
abstract renameFolder(input: RenameDriveFolderInput): Promise<DriveFolder>

/**
 * Move one folder while preserving an acyclic tree.
 * @param input - Folder move request.
 * @returns The committed folder.
 */
abstract moveFolder(input: MoveDriveFolderInput): Promise<DriveFolder>

/**
 * Import one file and its first immutable version.
 * @param input - File import request.
 * @returns The committed file.
 */
abstract importFile(input: ImportDriveFileInput): Promise<DriveFile>

/**
 * Append one immutable version and advance the logical file.
 * @param input - Version creation request.
 * @returns The committed version.
 */
abstract createVersion(input: CreateDriveVersionInput): Promise<DriveVersion>

/**
 * Rename one logical file.
 * @param input - File rename request.
 * @returns The committed file.
 */
abstract renameFile(input: RenameDriveFileInput): Promise<DriveFile>

/**
 * Move one logical file.
 * @param input - File move request.
 * @returns The committed file.
 */
abstract moveFile(input: MoveDriveFileInput): Promise<DriveFile>

/**
 * Replace one logical file's classification and tags.
 * @param input - Metadata update request.
 * @returns The committed file.
 */
abstract updateFileMetadata(input: UpdateDriveFileMetadataInput): Promise<DriveFile>

/**
 * Soft-delete one logical file; repeated deletion is idempotent.
 * @param input - File deletion request.
 * @returns The committed file.
 */
abstract deleteFile(input: DeleteDriveFileInput): Promise<DriveFile>

/** Permanently remove files and reclaim blobs no longer referenced by any version.
 * @param input - File identities and trusted mutation attribution.
 * @returns The number of files permanently removed.
 */
abstract purgeFiles(input: PurgeDriveFilesInput): Promise<number>

/**
 * Restore one soft-deleted logical file; repeated restoration is idempotent.
 * @param input - File restore request.
 * @returns The committed file.
 */
abstract restoreFile(input: RestoreDriveFileInput): Promise<DriveFile>

/**
 * Read and verify one immutable version.
 * @param versionId - Version identity.
 * @param signal - Optional cancellation signal.
 * @returns Verified immutable content.
 */
abstract readVersion(versionId: DriveVersionIdBrand, signal?: AbortSignal): Promise<StoredDriveContent>
```

Source: [`packages/buddy/drive/src/index.ts`](../../packages/buddy/drive/src/index.ts)

<a id="drive-events"></a>

### `drive/*` events

<a id="drivechanged--emit"></a>

#### `drive/changed` — emit

One accepted Drive mutation became durable and visible through `ctx.drive`. Listeners may refresh projections that derive from the committed snapshot.

```ts cordis-catalog
/**
 * One accepted Drive mutation became durable and visible through `ctx.drive`.
 * Listeners may refresh projections that derive from the committed snapshot.
 * @mode emit
 */
'drive/changed'(): void
```

Source: [`packages/buddy/drive/src/index.ts`](../../packages/buddy/drive/src/index.ts)
<!-- END GENERATED cordis-surface -->
