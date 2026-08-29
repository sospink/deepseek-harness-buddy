/** Provider-neutral document-drive vocabulary. @module @sospink/dsh-buddy-drive/types */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one drive library. */
export type DriveLibraryId = Branded<'DriveLibraryId'>
/** Stable identity of one folder. */
export type DriveFolderId = Branded<'DriveFolderId'>
/** Stable identity of one logical file. */
export type DriveFileId = Branded<'DriveFileId'>
/** Stable identity of one immutable file version. */
export type DriveVersionId = Branded<'DriveVersionId'>
/** Stable identity of one immutable audit event. */
export type DriveAuditId = Branded<'DriveAuditId'>
/** Correlates every durable fact produced by one accepted mutation. */
export type DriveCorrelationId = Branded<'DriveCorrelationId'>
/** Content-addressed SHA-256 digest. */
export type DriveDigest = `sha256:${string}`

/** Human-meaningful document classification used by the first Buddy product. */
export type DriveFileKind =
  | 'role-assignment'
  | 'safety-protocol'
  | 'operating-rule'
  | 'reference'
  | 'general'

/** Closed first-release media vocabulary. */
export type DriveMediaType =
  | 'text/markdown'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** State of a derived preview for one immutable version. */
export type DrivePreviewStatus = 'pending' | 'ready' | 'unsupported' | 'failed'
/** Authority class responsible for one mutation. */
export type DriveActor = 'human' | 'agent'
/** How one immutable version entered the library. */
export type DriveVersionSource = 'upload' | 'agent-publication'

/** Durable operation vocabulary for the mutation audit. */
export type DriveAuditOperation =
  | 'library/create'
  | 'library/restore'
  | 'folder/create'
  | 'folder/rename'
  | 'folder/move'
  | 'file/import'
  | 'file/version'
  | 'file/rename'
  | 'file/move'
  | 'file/metadata'
  | 'file/delete'
  | 'file/restore'

/** Deployment-resolved admission and retention limits. */
export interface DriveLimits {
  /** Maximum encoded bytes accepted for one source document. */
  readonly maxFileBytes: number
  /** Maximum logical bytes retained across every immutable version. */
  readonly maxLibraryBytes: number
  /** Maximum number of central-directory entries accepted in one DOCX. */
  readonly maxDocxEntries: number
  /** Maximum aggregate uncompressed bytes declared by one DOCX. */
  readonly maxDocxExpandedBytes: number
  /** Maximum per-entry uncompressed/compressed ratio accepted in one DOCX. */
  readonly maxDocxCompressionRatio: number
  /** Maximum retained audit events before a mutation rejects. */
  readonly maxAuditEvents: number
}

/** One library. The first release exposes exactly one default instance. */
export interface DriveLibrary {
  readonly id: DriveLibraryId
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** One durable folder in a library-owned tree. */
export interface DriveFolder {
  readonly id: DriveFolderId
  readonly libraryId: DriveLibraryId
  readonly parentId?: DriveFolderId
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** One logical document whose current version can advance without changing identity. */
export interface DriveFile {
  readonly id: DriveFileId
  readonly libraryId: DriveLibraryId
  readonly parentId?: DriveFolderId
  readonly name: string
  readonly kind: DriveFileKind
  readonly mediaType: DriveMediaType
  readonly currentVersionId: DriveVersionId
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly deletedAt?: string
}

/** One immutable, content-addressed file version. */
export interface DriveVersion {
  readonly id: DriveVersionId
  readonly fileId: DriveFileId
  readonly digest: DriveDigest
  readonly bytes: number
  readonly createdAt: string
  readonly actor: DriveActor
  readonly source: DriveVersionSource
  readonly preview: DrivePreviewStatus
}

/** One immutable mutation audit event. */
export interface DriveAuditEvent {
  readonly id: DriveAuditId
  readonly correlationId: DriveCorrelationId
  readonly actor: DriveActor
  readonly operation: DriveAuditOperation
  readonly targetType: 'library' | 'folder' | 'file' | 'version'
  readonly targetId: string
  readonly createdAt: string
  readonly previousVersionId?: DriveVersionId
  readonly versionId?: DriveVersionId
}

/** Mutation attribution supplied by a trusted caller. */
export interface DriveMutationContext {
  readonly actor?: DriveActor
  readonly correlationId?: DriveCorrelationId
}

/** Create one folder under the library root or another folder. */
export interface CreateDriveFolderInput {
  readonly libraryId: DriveLibraryId
  readonly parentId?: DriveFolderId
  readonly name: string
  readonly mutation?: DriveMutationContext
}

/** Rename one existing folder. */
export interface RenameDriveFolderInput {
  readonly folderId: DriveFolderId
  readonly name: string
  readonly mutation?: DriveMutationContext
}

/** Move one existing folder under the root or another folder. */
export interface MoveDriveFolderInput {
  readonly folderId: DriveFolderId
  readonly parentId?: DriveFolderId
  readonly mutation?: DriveMutationContext
}

/** Import one new logical file and its first immutable version. */
export interface ImportDriveFileInput {
  readonly libraryId: DriveLibraryId
  /** Stable caller-owned key; equal replays return the first committed file. */
  readonly idempotencyKey?: string
  readonly parentId?: DriveFolderId
  readonly name: string
  readonly kind: DriveFileKind
  readonly tags?: readonly string[]
  readonly declaredMediaType?: string
  readonly data: Uint8Array
  readonly mutation?: DriveMutationContext
}

/** Append a new immutable version and make it current. */
export interface CreateDriveVersionInput {
  readonly fileId: DriveFileId
  readonly declaredMediaType?: string
  readonly data: Uint8Array
  readonly source?: DriveVersionSource
  readonly mutation?: DriveMutationContext
}

/** Rename one logical file without changing its current version. */
export interface RenameDriveFileInput {
  readonly fileId: DriveFileId
  readonly name: string
  readonly mutation?: DriveMutationContext
}

/** Move one logical file under the root or another folder. */
export interface MoveDriveFileInput {
  readonly fileId: DriveFileId
  readonly parentId?: DriveFolderId
  readonly mutation?: DriveMutationContext
}

/** Replace the user-owned classification and tag metadata of one logical file. */
export interface UpdateDriveFileMetadataInput {
  readonly fileId: DriveFileId
  readonly kind: DriveFileKind
  readonly tags?: readonly string[]
  readonly mutation?: DriveMutationContext
}

/** Soft-delete one logical file. */
export interface DeleteDriveFileInput {
  readonly fileId: DriveFileId
  readonly mutation?: DriveMutationContext
}

/** Restore one soft-deleted logical file. */
export interface RestoreDriveFileInput {
  readonly fileId: DriveFileId
  readonly mutation?: DriveMutationContext
}

/** Read result after digest and byte-length verification. */
export interface StoredDriveContent {
  readonly version: DriveVersion
  readonly data: Uint8Array
}

/** Filter for the immutable audit stream. */
export interface DriveAuditQuery {
  readonly limit?: number
  readonly targetId?: string
}
