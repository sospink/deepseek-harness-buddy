/** Local durable implementation of the Buddy Drive seam. */

import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DriveAuditId,
  DriveCorrelationId,
  DriveError,
  DriveFileId,
  DriveFolderId,
  DriveLibraryId,
  DriveStore,
  DriveVersionId,
} from '@sospink/dsh-buddy-drive'
import type {
  CreateDriveFolderInput,
  CreateDriveVersionInput,
  DeleteDriveFileInput,
  DriveActor,
  DriveAuditEvent,
  DriveAuditOperation,
  DriveAuditQuery,
  DriveCorrelationId as DriveCorrelationIdType,
  DriveFile,
  DriveFileId as DriveFileIdType,
  DriveFolder,
  DriveFolderId as DriveFolderIdType,
  DriveLibrary,
  DriveLimits,
  DriveMutationContext,
  DriveVersion,
  DriveVersionId as DriveVersionIdType,
  ImportDriveFileInput,
  MoveDriveFileInput,
  MoveDriveFolderInput,
  PurgeDriveFilesInput,
  RenameDriveFileInput,
  RenameDriveFolderInput,
  RestoreDriveFileInput,
  StoredDriveContent,
  UpdateDriveFileMetadataInput,
} from '@sospink/dsh-buddy-drive'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { admitDriveDocument, normalizeDriveName, normalizeDriveTags } from './admission.ts'
import {
  createDriveBackup,
  inspectDriveBackup,
  isEmptyDriveState,
  restoreDriveBackupContent,
  restoredSummary,
  stateAfterDriveBackupRestore,
} from './backup.ts'
import type { DriveBackupSummary, DriveRestoreSummary, RestoreDriveBackupInput } from './backup.ts'
import { digestBytes, publishBlob, readBlob, reconcileBlobs } from './blob.ts'
import { compareDriveNamed, compareDriveVersions } from './ordering.ts'
import { driveDomainSpec } from './spec.ts'
import type { LocalDriveAuditEvent } from './spec.ts'
import { validateDriveState } from './state.ts'
import type { DriveState } from './spec.ts'

export type { DriveBackupBlob, DriveBackupSummary, DriveRestoreSummary, RestoreDriveBackupInput } from './backup.ts'

const DEFAULT_LIMITS: DriveLimits = Object.freeze({
  maxFileBytes: 50 * 1024 * 1024,
  maxLibraryBytes: 2 * 1024 * 1024 * 1024,
  maxDocxEntries: 2_000,
  maxDocxExpandedBytes: 250 * 1024 * 1024,
  maxDocxCompressionRatio: 100,
  maxAuditEvents: 100_000,
})

/** Local provider configuration. */
export interface Config {
  /** Private provider-owned root; never a Workspace path. */
  root: string
  /** Maximum size of one admitted file in bytes. */
  maxFileBytes?: number
  /** Maximum aggregate size of one library in bytes. */
  maxLibraryBytes?: number
  /** Maximum number of entries accepted from one DOCX archive. */
  maxDocxEntries?: number
  /** Maximum expanded size of one DOCX archive in bytes. */
  maxDocxExpandedBytes?: number
  /** Maximum allowed DOCX compression ratio. */
  maxDocxCompressionRatio?: number
  /** Maximum number of audit events retained by the local provider. */
  maxAuditEvents?: number
}

function freezeTags(tags: readonly string[]): readonly string[] {
  return Object.freeze([...tags])
}

function folderSnapshot(folder: DriveFolder): DriveFolder {
  return Object.freeze({ ...folder })
}

function fileSnapshot(file: DriveFile): DriveFile {
  return Object.freeze({ ...file, tags: freezeTags(file.tags) })
}

function versionSnapshot(version: DriveVersion): DriveVersion {
  return Object.freeze({ ...version })
}

function auditSnapshot(event: LocalDriveAuditEvent): DriveAuditEvent {
  const { idempotencyKey: _idempotencyKey, requestDigest: _requestDigest, ...publicEvent } = event
  return Object.freeze(publicEvent)
}

function librarySnapshot(library: DriveLibrary): DriveLibrary {
  return Object.freeze({ ...library })
}

function sameParent(left: DriveFolderIdType | undefined, right: DriveFolderIdType | undefined): boolean {
  return left === right
}

function nameKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('en-US')
}

function optionalParent<T extends { parentId?: DriveFolderIdType }>(value: T, parentId: DriveFolderIdType | undefined): T {
  const { parentId: _old, ...rest } = value
  return (parentId === undefined ? rest : { ...rest, parentId }) as T
}

interface LocalAuditDetails {
  readonly previousVersionId?: DriveVersion['id']
  readonly versionId?: DriveVersion['id']
  readonly idempotencyKey?: string
  readonly requestDigest?: DriveVersion['digest']
}

function mutationContext(mutation: DriveMutationContext | undefined): {
  actor: DriveActor
  correlationId: DriveCorrelationIdType
} {
  const actor: unknown = mutation?.actor ?? 'human'
  if (actor !== 'human' && actor !== 'agent') {
    throw new DriveError('INVALID_METADATA', 'Drive mutation actor is invalid.')
  }
  const correlationId = mutation?.correlationId ?? DriveCorrelationId(randomUUID())
  if (correlationId.trim() === '') {
    throw new DriveError('INVALID_METADATA', 'Drive mutation correlation id must not be blank.')
  }
  return { actor, correlationId }
}

const DRIVE_FILE_KINDS = new Set<DriveFile['kind']>([
  'role-assignment', 'safety-protocol', 'operating-rule', 'reference', 'general',
])

function requireFileKind(kind: unknown): DriveFile['kind'] {
  if (typeof kind !== 'string' || !DRIVE_FILE_KINDS.has(kind as DriveFile['kind'])) {
    throw new DriveError('INVALID_METADATA', 'Drive file classification is invalid.')
  }
  return kind as DriveFile['kind']
}

function requireVersionSource(source: unknown): DriveVersion['source'] {
  if (source !== 'upload' && source !== 'agent-publication') {
    throw new DriveError('INVALID_METADATA', 'Drive version source is invalid.')
  }
  return source
}

function nowAfter(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
}

function importRequestDigest(input: {
  readonly libraryId: string
  readonly parentId?: string
  readonly name: string
  readonly kind: DriveFile['kind']
  readonly mediaType: DriveFile['mediaType']
  readonly tags: readonly string[]
  readonly contentDigest: string
}): DriveVersion['digest'] {
  const canonical = JSON.stringify([
    input.libraryId,
    input.parentId ?? null,
    input.name,
    input.kind,
    input.mediaType,
    [...input.tags],
    input.contentDigest,
  ])
  return digestBytes(new TextEncoder().encode(canonical))
}

/** Durable local document drive with one atomic metadata document and content-addressed blobs. */
export class LocalDriveStore extends DriveStore {
  static inject = ['storageDomain']
  static Config: z<Config> = z.object({
    root: z.string().required(),
    maxFileBytes: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxFileBytes),
    maxLibraryBytes: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxLibraryBytes),
    maxDocxEntries: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxDocxEntries),
    maxDocxExpandedBytes: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxDocxExpandedBytes),
    maxDocxCompressionRatio: z.number().min(1).default(DEFAULT_LIMITS.maxDocxCompressionRatio),
    maxAuditEvents: z.number().step(1).min(1).default(DEFAULT_LIMITS.maxAuditEvents),
  })

  /** Resolved provider-owned root containing Drive blobs and metadata. */
  readonly root: string
  readonly limits: DriveLimits
  private global?: DomainGlobal<DriveState>
  private state?: DriveState
  private operationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.root = resolve(config.root)
    this.limits = Object.freeze({
      maxFileBytes: config.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes,
      maxLibraryBytes: config.maxLibraryBytes ?? DEFAULT_LIMITS.maxLibraryBytes,
      maxDocxEntries: config.maxDocxEntries ?? DEFAULT_LIMITS.maxDocxEntries,
      maxDocxExpandedBytes: config.maxDocxExpandedBytes ?? DEFAULT_LIMITS.maxDocxExpandedBytes,
      maxDocxCompressionRatio: config.maxDocxCompressionRatio ?? DEFAULT_LIMITS.maxDocxCompressionRatio,
      maxAuditEvents: config.maxAuditEvents ?? DEFAULT_LIMITS.maxAuditEvents,
    })
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(driveDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'buddy-drive.domain-close')
    this.global = domain.global
    let state = domain.global.get()
    if (state.library.createdAt === '1970-01-01T00:00:00.000Z') {
      const createdAt = new Date().toISOString()
      const library: DriveLibrary = {
        id: DriveLibraryId('default'), title: '资料云盘', createdAt, updatedAt: createdAt,
      }
      state = {
        library,
        folders: [],
        files: [],
        versions: [],
        audit: [{
          id: DriveAuditId(randomUUID()),
          correlationId: DriveCorrelationId(randomUUID()),
          actor: 'human',
          operation: 'library/create',
          targetType: 'library',
          targetId: library.id,
          createdAt,
        }],
      }
      await domain.global.set(state)
    }
    validateDriveState(state, this.limits)
    await reconcileBlobs(this.root, new Map(state.versions.map(version => [version.digest, version.bytes])))
    this.state = state
  }

  library(): DriveLibrary { return librarySnapshot(this.requireState().library) }

  listFolders(parentId?: DriveFolderIdType): readonly DriveFolder[] {
    return this.requireState().folders.filter(folder => sameParent(folder.parentId, parentId))
      .sort(compareDriveNamed).map(folderSnapshot)
  }

  listFiles(parentId?: DriveFolderIdType, includeDeleted = false): readonly DriveFile[] {
    return this.requireState().files
      .filter(file => sameParent(file.parentId, parentId) && (includeDeleted || file.deletedAt === undefined))
      .sort(compareDriveNamed).map(fileSnapshot)
  }

  getFile(fileId: DriveFileIdType): DriveFile | undefined {
    const file = this.requireState().files.find(candidate => candidate.id === fileId)
    return file === undefined ? undefined : fileSnapshot(file)
  }

  getVersion(versionId: DriveVersionIdType): DriveVersion | undefined {
    const version = this.requireState().versions.find(candidate => candidate.id === versionId)
    return version === undefined ? undefined : versionSnapshot(version)
  }

  listVersions(fileId: DriveFileIdType): readonly DriveVersion[] {
    this.requireFile(fileId)
    return this.requireState().versions.filter(version => version.fileId === fileId)
      .sort(compareDriveVersions)
      .map(versionSnapshot)
  }

  listAudit(query?: DriveAuditQuery): readonly DriveAuditEvent[] {
    const limit = Math.max(0, Math.min(query?.limit ?? 100, this.limits.maxAuditEvents))
    if (limit === 0) return []
    return this.requireState().audit
      .filter(event => query?.targetId === undefined || event.targetId === query.targetId)
      .slice(-limit).reverse().map(auditSnapshot)
  }

  createFolder(input: CreateDriveFolderInput): Promise<DriveFolder> {
    return this.enqueue(async () => {
      this.requireLibrary(input.libraryId)
      this.requireParent(input.parentId)
      const name = normalizeDriveName(input.name)
      this.assertNameAvailable(input.parentId, name)
      const mutation = mutationContext(input.mutation)
      const createdAt = nowAfter(this.requireState().library.updatedAt)
      const folder: DriveFolder = {
        id: DriveFolderId(randomUUID()), libraryId: input.libraryId,
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
        name, createdAt, updatedAt: createdAt,
      }
      const audit = this.audit(mutation, 'folder/create', 'folder', folder.id, createdAt)
      await this.commit({
        ...this.requireState(),
        library: { ...this.requireState().library, updatedAt: createdAt },
        folders: [...this.requireState().folders, folder],
        audit: [...this.requireState().audit, audit],
      })
      return folderSnapshot(folder)
    })
  }

  renameFolder(input: RenameDriveFolderInput): Promise<DriveFolder> {
    return this.enqueue(async () => {
      const current = this.requireFolder(input.folderId)
      const name = normalizeDriveName(input.name)
      this.assertNameAvailable(current.parentId, name, { folderId: current.id })
      if (name === current.name) return folderSnapshot(current)
      const updatedAt = nowAfter(current.updatedAt)
      const folder = { ...current, name, updatedAt }
      const mutation = mutationContext(input.mutation)
      await this.commit({
        ...this.requireState(),
        library: { ...this.requireState().library, updatedAt },
        folders: this.requireState().folders.map(candidate => candidate.id === folder.id ? folder : candidate),
        audit: [...this.requireState().audit, this.audit(mutation, 'folder/rename', 'folder', folder.id, updatedAt)],
      })
      return folderSnapshot(folder)
    })
  }

  moveFolder(input: MoveDriveFolderInput): Promise<DriveFolder> {
    return this.enqueue(async () => {
      const current = this.requireFolder(input.folderId)
      this.requireParent(input.parentId)
      if (input.parentId === current.id || this.isFolderDescendant(input.parentId, current.id)) {
        throw new DriveError('INVALID_MOVE', 'A folder cannot move under itself or its descendant.')
      }
      this.assertNameAvailable(input.parentId, current.name, { folderId: current.id })
      if (sameParent(current.parentId, input.parentId)) return folderSnapshot(current)
      const updatedAt = nowAfter(current.updatedAt)
      const folder = optionalParent({ ...current, updatedAt }, input.parentId)
      const mutation = mutationContext(input.mutation)
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt },
        folders: this.requireState().folders.map(candidate => candidate.id === folder.id ? folder : candidate),
        audit: [...this.requireState().audit, this.audit(mutation, 'folder/move', 'folder', folder.id, updatedAt)],
      })
      return folderSnapshot(folder)
    })
  }

  importFile(input: ImportDriveFileInput): Promise<DriveFile> {
    const data = Uint8Array.from(input.data)
    const admitted = admitDriveDocument({
      name: input.name, data,
      ...(input.declaredMediaType === undefined ? {} : { declaredMediaType: input.declaredMediaType }),
      limits: this.limits,
    })
    const tags = normalizeDriveTags(input.tags)
    const contentDigest = digestBytes(data)
    return this.enqueue(async () => {
      this.requireLibrary(input.libraryId)
      this.requireParent(input.parentId)
      const kind = requireFileKind(input.kind)
      const requestDigest = importRequestDigest({
        libraryId: input.libraryId,
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
        name: admitted.normalizedName,
        kind,
        mediaType: admitted.mediaType,
        tags,
        contentDigest,
      })
      const mutation = mutationContext(input.mutation)
      const idempotencyKey = input.idempotencyKey
      if (idempotencyKey !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/u.test(idempotencyKey)) {
        throw new DriveError('INVALID_METADATA', 'Drive import idempotency key is invalid.')
      }
      const replay = idempotencyKey === undefined ? undefined : this.requireState().audit.find(event => (
        event.operation === 'file/import' && event.idempotencyKey === idempotencyKey
      ))
      if (replay !== undefined) {
        if (replay.requestDigest !== requestDigest) {
          throw new DriveError('IDEMPOTENCY_CONFLICT', 'Drive upload id was already used for different input.')
        }
        const existing = this.requireState().files.find(candidate => candidate.id === replay.targetId)
        if (existing === undefined) {
          throw new DriveError('STORAGE_INCONSISTENT', 'Drive upload replay references a missing file.')
        }
        return fileSnapshot(existing)
      }
      this.assertNameAvailable(input.parentId, admitted.normalizedName)
      this.assertQuota(data.byteLength)
      const createdAt = nowAfter(this.requireState().library.updatedAt)
      const fileId = DriveFileId(randomUUID())
      const version: DriveVersion = {
        id: DriveVersionId(randomUUID()), fileId,
        digest: contentDigest, bytes: data.byteLength, createdAt,
        actor: mutation.actor, source: 'upload', preview: 'pending',
      }
      await publishBlob(this.root, version.digest, data)
      const file: DriveFile = {
        id: fileId, libraryId: input.libraryId,
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
        name: admitted.normalizedName, kind, mediaType: admitted.mediaType,
        currentVersionId: version.id, tags, createdAt, updatedAt: createdAt,
      }
      const audit = this.audit(mutation, 'file/import', 'file', file.id, createdAt, {
        versionId: version.id,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey, requestDigest }),
      })
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt: createdAt },
        files: [...this.requireState().files, file],
        versions: [...this.requireState().versions, version],
        audit: [...this.requireState().audit, audit],
      })
      return fileSnapshot(file)
    })
  }

  createVersion(input: CreateDriveVersionInput): Promise<DriveVersion> {
    const data = Uint8Array.from(input.data)
    return this.enqueue(async () => {
      const file = this.requireActiveFile(input.fileId)
      admitDriveDocument({
        name: file.name, data,
        ...(input.declaredMediaType === undefined ? {} : { declaredMediaType: input.declaredMediaType }),
        limits: this.limits,
      })
      this.assertQuota(data.byteLength)
      const mutation = mutationContext(input.mutation)
      const createdAt = nowAfter(file.updatedAt)
      const version: DriveVersion = {
        id: DriveVersionId(randomUUID()), fileId: file.id,
        digest: digestBytes(data), bytes: data.byteLength, createdAt,
        actor: mutation.actor, source: requireVersionSource(input.source ?? 'upload'), preview: 'pending',
      }
      await publishBlob(this.root, version.digest, data)
      const updated = { ...file, currentVersionId: version.id, updatedAt: createdAt }
      const audit = this.audit(mutation, 'file/version', 'version', version.id, createdAt, {
        previousVersionId: file.currentVersionId, versionId: version.id,
      })
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt: createdAt },
        files: this.requireState().files.map(candidate => candidate.id === file.id ? updated : candidate),
        versions: [...this.requireState().versions, version],
        audit: [...this.requireState().audit, audit],
      })
      return versionSnapshot(version)
    })
  }

  renameFile(input: RenameDriveFileInput): Promise<DriveFile> {
    return this.enqueue(async () => {
      const current = this.requireActiveFile(input.fileId)
      const name = normalizeDriveName(input.name)
      const lower = name.toLowerCase()
      const matches = current.mediaType === 'text/markdown'
        ? lower.endsWith('.md') || lower.endsWith('.markdown')
        : current.mediaType === 'application/pdf' ? lower.endsWith('.pdf') : lower.endsWith('.docx')
      if (!matches) throw new DriveError('MEDIA_TYPE_MISMATCH', 'File extension must match the logical media type.')
      this.assertNameAvailable(current.parentId, name, { fileId: current.id })
      if (name === current.name) return fileSnapshot(current)
      const updatedAt = nowAfter(current.updatedAt)
      const file = { ...current, name, updatedAt }
      const mutation = mutationContext(input.mutation)
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt },
        files: this.requireState().files.map(candidate => candidate.id === file.id ? file : candidate),
        audit: [...this.requireState().audit, this.audit(mutation, 'file/rename', 'file', file.id, updatedAt)],
      })
      return fileSnapshot(file)
    })
  }

  moveFile(input: MoveDriveFileInput): Promise<DriveFile> {
    return this.enqueue(async () => {
      const current = this.requireActiveFile(input.fileId)
      this.requireParent(input.parentId)
      this.assertNameAvailable(input.parentId, current.name, { fileId: current.id })
      if (sameParent(current.parentId, input.parentId)) return fileSnapshot(current)
      const updatedAt = nowAfter(current.updatedAt)
      const file = optionalParent({ ...current, updatedAt }, input.parentId)
      const mutation = mutationContext(input.mutation)
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt },
        files: this.requireState().files.map(candidate => candidate.id === file.id ? file : candidate),
        audit: [...this.requireState().audit, this.audit(mutation, 'file/move', 'file', file.id, updatedAt)],
      })
      return fileSnapshot(file)
    })
  }

  updateFileMetadata(input: UpdateDriveFileMetadataInput): Promise<DriveFile> {
    const tags = normalizeDriveTags(input.tags)
    return this.enqueue(async () => {
      const current = this.requireActiveFile(input.fileId)
      if (current.kind === input.kind
        && current.tags.length === tags.length
        && current.tags.every((tag, index) => tag === tags[index])) return fileSnapshot(current)
      const updatedAt = nowAfter(current.updatedAt)
      const file: DriveFile = { ...current, kind: requireFileKind(input.kind), tags, updatedAt }
      const mutation = mutationContext(input.mutation)
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt },
        files: this.requireState().files.map(candidate => candidate.id === file.id ? file : candidate),
        audit: [...this.requireState().audit, this.audit(mutation, 'file/metadata', 'file', file.id, updatedAt)],
      })
      return fileSnapshot(file)
    })
  }

  deleteFile(input: DeleteDriveFileInput): Promise<DriveFile> {
    return this.enqueue(async () => {
      const current = this.requireFile(input.fileId)
      if (current.deletedAt !== undefined) return fileSnapshot(current)
      const deletedAt = nowAfter(current.updatedAt)
      const file = { ...current, updatedAt: deletedAt, deletedAt }
      const mutation = mutationContext(input.mutation)
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt: deletedAt },
        files: this.requireState().files.map(candidate => candidate.id === file.id ? file : candidate),
        audit: [...this.requireState().audit, this.audit(mutation, 'file/delete', 'file', file.id, deletedAt)],
      })
      return fileSnapshot(file)
    })
  }

  /** Permanently remove files and reclaim blobs that no longer have references.
   * @param input - File identities and trusted mutation attribution.
   * @returns The number of files permanently removed.
   */
  purgeFiles(input: PurgeDriveFilesInput): Promise<number> {
    return this.enqueue(async () => {
      const fileIds = [...new Set(input.fileIds)]
      if (fileIds.length === 0) throw new DriveError('PURGE_EMPTY', 'Drive purge requires at least one file.')
      const state = this.requireState()
      const files = fileIds.map(fileId => this.requireFile(fileId))
      const fileIdSet = new Set(fileIds)
      const remainingVersions = state.versions.filter(version => !fileIdSet.has(version.fileId))
      const mutation = mutationContext(input.mutation)
      const updatedAt = new Date(Math.max(Date.now(), ...files.map(file => Date.parse(file.updatedAt) + 1))).toISOString()
      const audit = files.map(file => this.audit(mutation, 'file/purge', 'file', file.id, updatedAt))
      await this.commit({
        ...state,
        library: { ...state.library, updatedAt },
        files: state.files.filter(file => !fileIdSet.has(file.id)),
        versions: remainingVersions,
        audit: [...state.audit, ...audit],
      })
      await reconcileBlobs(this.root, new Map(remainingVersions.map(version => [version.digest, version.bytes])))
      return files.length
    })
  }

  restoreFile(input: RestoreDriveFileInput): Promise<DriveFile> {
    return this.enqueue(async () => {
      const current = this.requireFile(input.fileId)
      if (current.deletedAt === undefined) return fileSnapshot(current)
      this.assertNameAvailable(current.parentId, current.name, { fileId: current.id })
      const updatedAt = nowAfter(current.updatedAt)
      const { deletedAt: _deletedAt, ...rest } = current
      const file: DriveFile = { ...rest, updatedAt }
      const mutation = mutationContext(input.mutation)
      await this.commit({
        ...this.requireState(), library: { ...this.requireState().library, updatedAt },
        files: this.requireState().files.map(candidate => candidate.id === file.id ? file : candidate),
        audit: [...this.requireState().audit, this.audit(mutation, 'file/restore', 'file', file.id, updatedAt)],
      })
      return fileSnapshot(file)
    })
  }

  async readVersion(versionId: DriveVersionIdType, signal?: AbortSignal): Promise<StoredDriveContent> {
    const version = this.requireVersion(versionId)
    const data = await readBlob(this.root, version.digest, version.bytes, signal)
    return Object.freeze({ version: versionSnapshot(version), data })
  }

  /** Create an immutable, owner-only backup outside the provider root.
   * @param destination - New backup directory path outside the Drive root.
   * @returns The created backup summary.
   */
  createBackup(destination: string): Promise<DriveBackupSummary> {
    return this.enqueue(() => createDriveBackup(this.root, this.requireState(), this.limits, destination))
  }

  /** Verify a backup without changing the provider or its metadata.
   * @param source - Backup directory to inspect.
   * @returns The verified backup summary.
   */
  async inspectBackup(source: string): Promise<DriveBackupSummary> {
    return (await inspectDriveBackup(source, this.limits)).summary
  }

  /** Restore a verified backup, optionally replacing a non-empty library.
   * @param input - Backup source and explicit replacement request.
   * @returns The restore summary, including whether existing data was replaced.
   */
  restoreBackup(input: RestoreDriveBackupInput): Promise<DriveRestoreSummary> {
    return this.enqueue(async () => {
      const mutation = mutationContext(input.mutation)
      const backup = await inspectDriveBackup(input.source, this.limits)
      this.requireLibrary(backup.state.library.id)
      const replaced = !isEmptyDriveState(this.requireState())
      if (replaced && input.replace !== true) {
        throw new DriveError('RESTORE_TARGET_NOT_EMPTY', 'Drive restore requires explicit replacement of a non-empty library.')
      }
      const restored = stateAfterDriveBackupRestore(backup.state, this.limits, mutation)
      await restoreDriveBackupContent(backup, this.root)
      await this.commit(restored)
      return restoredSummary(backup.summary, replaced)
    })
  }

  private requireState(): DriveState {
    if (this.state === undefined) throw new Error('Buddy Drive is not started yet.')
    return this.state
  }

  private requireLibrary(libraryId: string): void {
    if (this.requireState().library.id !== libraryId) throw new DriveError('LIBRARY_NOT_FOUND', 'Drive library is unknown.')
  }

  private requireParent(parentId: DriveFolderIdType | undefined): void {
    if (parentId !== undefined) this.requireFolder(parentId)
  }

  private requireFolder(folderId: DriveFolderIdType): DriveFolder {
    const folder = this.requireState().folders.find(candidate => candidate.id === folderId)
    if (folder === undefined) throw new DriveError('FOLDER_NOT_FOUND', 'Drive folder is unknown.')
    return folder
  }

  private requireFile(fileId: DriveFileIdType): DriveFile {
    const file = this.requireState().files.find(candidate => candidate.id === fileId)
    if (file === undefined) throw new DriveError('FILE_NOT_FOUND', 'Drive file is unknown.')
    return file
  }

  private requireActiveFile(fileId: DriveFileIdType): DriveFile {
    const file = this.requireFile(fileId)
    if (file.deletedAt !== undefined) throw new DriveError('FILE_DELETED', 'Drive file is deleted.')
    return file
  }

  private requireVersion(versionId: DriveVersionIdType): DriveVersion {
    const version = this.requireState().versions.find(candidate => candidate.id === versionId)
    if (version === undefined) throw new DriveError('VERSION_NOT_FOUND', 'Drive version is unknown.')
    return version
  }

  private assertNameAvailable(
    parentId: DriveFolderIdType | undefined,
    name: string,
    exclude?: { folderId?: DriveFolderIdType; fileId?: DriveFileIdType },
  ): void {
    const key = nameKey(name)
    const folderConflict = this.requireState().folders.some(folder =>
      folder.id !== exclude?.folderId && sameParent(folder.parentId, parentId) && nameKey(folder.name) === key)
    const fileConflict = this.requireState().files.some(file =>
      file.id !== exclude?.fileId && file.deletedAt === undefined
      && sameParent(file.parentId, parentId) && nameKey(file.name) === key)
    if (folderConflict || fileConflict) throw new DriveError('DUPLICATE_NAME', 'A visible sibling already uses this name.')
  }

  private assertQuota(additionalBytes: number): void {
    const used = this.requireState().versions.reduce((sum, version) => sum + version.bytes, 0)
    if (used + additionalBytes > this.limits.maxLibraryBytes) {
      throw new DriveError('LIBRARY_QUOTA_EXCEEDED', 'Drive library quota would be exceeded.')
    }
  }

  private isFolderDescendant(candidate: DriveFolderIdType | undefined, ancestor: DriveFolderIdType): boolean {
    let cursor = candidate
    while (cursor !== undefined) {
      if (cursor === ancestor) return true
      cursor = this.requireFolder(cursor).parentId
    }
    return false
  }

  private audit(
    mutation: { actor: DriveActor; correlationId: DriveCorrelationIdType },
    operation: DriveAuditOperation,
    targetType: DriveAuditEvent['targetType'],
    targetId: string,
    createdAt: string,
    versions?: LocalAuditDetails,
  ): LocalDriveAuditEvent {
    if (this.requireState().audit.length >= this.limits.maxAuditEvents) {
      throw new DriveError('AUDIT_LIMIT_EXCEEDED', 'Drive audit retention limit has been reached.')
    }
    return {
      id: DriveAuditId(randomUUID()), correlationId: mutation.correlationId, actor: mutation.actor,
      operation, targetType, targetId, createdAt,
      ...(versions?.previousVersionId === undefined ? {} : { previousVersionId: versions.previousVersionId }),
      ...(versions?.versionId === undefined ? {} : { versionId: versions.versionId }),
      ...(versions?.idempotencyKey === undefined ? {} : { idempotencyKey: versions.idempotencyKey }),
      ...(versions?.requestDigest === undefined ? {} : { requestDigest: versions.requestDigest }),
    }
  }

  private async commit(state: DriveState): Promise<void> {
    validateDriveState(state, this.limits)
    await (this.global as DomainGlobal<DriveState>).set(state)
    this.state = state
    this.ctx.emit('drive/changed')
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }

}

export default LocalDriveStore
