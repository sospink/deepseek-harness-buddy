---
description: "The fork-owned Buddy Drive subsystem: governed local documents, browser transport, previews, and read-only model evidence."
kind: "subsystem"
---

# Buddy Drive

English | [中文](buddy-drive.zh.md)

Buddy Drive is the fork-owned document library used by the Positioning Safety Agent product mode. It keeps provider-neutral metadata and immutable content behind `ctx.drive`, exposes browser operations through a separate authenticated adapter, and exposes model access only through bounded read-only tools. The first deployment is one local library; it is not an enterprise identity, tenant, sharing, remote-backup, or formal aviation-safety protocol implementation.

## Ownership

- `@sospink/dsh-buddy-drive` owns the Service Definition and immutable library vocabulary.
- `@sospink/dsh-buddy-drive-local` owns Storage Domain metadata, content-addressed blobs, admission, local backup/restore, and audit persistence.
- `@sospink/dsh-buddy-api-drive` owns generated Remote commands and authenticated binary routes.
- `@sospink/dsh-buddy-client-ui-drive` owns the browser workspace and bounded Markdown/PDF/DOCX previews.
- `@sospink/dsh-buddy-tool-drive` owns `drive_list`, `drive_search`, and `drive_read`; it never accepts a filesystem path or mutation operation.

## Boundaries

Drive mutations are committed by the local provider before `drive/changed` is emitted. Browser state is a reconnectable projection and does not become model context automatically. Tool results carry File ID, Version ID, digest, classification, and bounded evidence text; document contents are untrusted evidence rather than instructions. Maintenance backup and restore methods are explicit local operations and are not browser routes.

Retention policy, hard deletion, enterprise identity, tenant authorization, remote object storage, malware/CDR scanning, OCR, indexed retrieval, and formal domain-protocol compliance remain deferred until their external contracts are supplied.

## Further reading

- [Buddy package map](../../packages/buddy/README.md)
- [Drive delivery TODO](../../BUDDY_DRIVE_TODO.md)
- [Drive Service Definition](../../packages/buddy/drive/README.md)
- [Local provider](../../packages/buddy/drive-local/README.md)
- [Read-only tools](../../packages/buddy/tool-drive/README.md)

## Model Experience

### Governed evidence

#### What the model sees

Only a selected Positioning Safety session receives the three read-only Drive tool schemas and their fixed evidence guidance. No document is injected automatically. A successful read contains bounded text plus immutable provenance.

#### Token effect

The fixed guidance and schemas add a small stable prefix. Tool results add only the bounded metadata rows, snippets, and line windows requested by the model.

#### KV Cache effect

The preset guidance is stable. Document content is appended as tool results and varies by immutable version, so it does not rewrite the stable system-prompt prefix.

## Known Limitations and Deferred Work

- The local provider exposes one library and has no per-user sharing or tenant authorization.
- Browser preview, model extraction, backup/restore, and retention are separate contracts rather than one generalized file service.
- Search is bounded linear inspection of current versions; indexed retrieval requires document-level authorization and deletion propagation first.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep the Service Definition free of filesystem and browser concerns. Add model-visible capabilities in `tool-drive` with immutable provenance and explicit budgets; do not expose provider paths or silently inject documents into prompts.

</details>

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
