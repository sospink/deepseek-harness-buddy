/** Document-drive capability seam (`ctx.drive`). @module @sospink/dsh-buddy-drive */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  CreateDriveFolderInput,
  CreateDriveVersionInput,
  DeleteDriveFileInput,
  DriveAuditEvent,
  DriveAuditId as DriveAuditIdBrand,
  DriveAuditQuery,
  DriveCorrelationId as DriveCorrelationIdBrand,
  DriveFile,
  DriveFileId as DriveFileIdBrand,
  DriveFolder,
  DriveFolderId as DriveFolderIdBrand,
  DriveLibrary,
  DriveLibraryId as DriveLibraryIdBrand,
  DriveLimits,
  DriveVersion,
  DriveVersionId as DriveVersionIdBrand,
  ImportDriveFileInput,
  MoveDriveFileInput,
  MoveDriveFolderInput,
  RenameDriveFileInput,
  RenameDriveFolderInput,
  RestoreDriveFileInput,
  StoredDriveContent,
  UpdateDriveFileMetadataInput,
} from './types.ts'

export { DriveError } from './error.ts'
export type { DriveErrorCode } from './error.ts'
export type {
  CreateDriveFolderInput,
  CreateDriveVersionInput,
  DeleteDriveFileInput,
  DriveActor,
  DriveAuditEvent,
  DriveAuditOperation,
  DriveAuditQuery,
  DriveDigest,
  DriveFile,
  DriveFileKind,
  DriveFolder,
  DriveLibrary,
  DriveLimits,
  DriveMediaType,
  DriveMutationContext,
  DrivePreviewStatus,
  DriveVersion,
  DriveVersionSource,
  ImportDriveFileInput,
  MoveDriveFileInput,
  MoveDriveFolderInput,
  RenameDriveFileInput,
  RenameDriveFolderInput,
  RestoreDriveFileInput,
  StoredDriveContent,
  UpdateDriveFileMetadataInput,
} from './types.ts'

/** Public library-id type paired with the zero-cost factory below. */
export type DriveLibraryId = DriveLibraryIdBrand
/** Public folder-id type paired with the zero-cost factory below. */
export type DriveFolderId = DriveFolderIdBrand
/** Public file-id type paired with the zero-cost factory below. */
export type DriveFileId = DriveFileIdBrand
/** Public version-id type paired with the zero-cost factory below. */
export type DriveVersionId = DriveVersionIdBrand
/** Public audit-id type paired with the zero-cost factory below. */
export type DriveAuditId = DriveAuditIdBrand
/** Public mutation-correlation type paired with the zero-cost factory below. */
export type DriveCorrelationId = DriveCorrelationIdBrand

/** Brand one raw string as a drive library id. */
export function DriveLibraryId(id: string): DriveLibraryIdBrand { return id as DriveLibraryIdBrand }
/** Brand one raw string as a drive folder id. */
export function DriveFolderId(id: string): DriveFolderIdBrand { return id as DriveFolderIdBrand }
/** Brand one raw string as a drive file id. */
export function DriveFileId(id: string): DriveFileIdBrand { return id as DriveFileIdBrand }
/** Brand one raw string as a drive version id. */
export function DriveVersionId(id: string): DriveVersionIdBrand { return id as DriveVersionIdBrand }
/** Brand one raw string as a drive audit id. */
export function DriveAuditId(id: string): DriveAuditIdBrand { return id as DriveAuditIdBrand }
/** Brand one raw string as a drive mutation correlation id. */
export function DriveCorrelationId(id: string): DriveCorrelationIdBrand { return id as DriveCorrelationIdBrand }

declare module '@deepseek-ai/cordis' {
  interface Context {
    drive: DriveStore
  }
  interface Events {
    /** One accepted drive mutation became durable and visible through ctx.drive. */
    'drive/changed'(): void
  }
}

/** Provider-neutral document library service. Implementations own media and durable metadata together. */
export abstract class DriveStore extends Service {
  constructor(ctx: Context) {
    super(ctx, 'drive')
  }

  /** Deployment-resolved admission, retention, and audit limits. */
  abstract readonly limits: DriveLimits

  /** Return the one default library. */
  abstract library(): DriveLibrary
  /** Return folders in stable name/id order, optionally scoped to one parent. */
  abstract listFolders(parentId?: DriveFolderIdBrand): readonly DriveFolder[]
  /** Return files in stable name/id order, excluding soft-deleted rows unless requested. */
  abstract listFiles(parentId?: DriveFolderIdBrand, includeDeleted?: boolean): readonly DriveFile[]
  /** Look up one logical file. */
  abstract getFile(fileId: DriveFileIdBrand): DriveFile | undefined
  /** Look up one immutable version. */
  abstract getVersion(versionId: DriveVersionIdBrand): DriveVersion | undefined
  /** Return all immutable versions of one file, newest first. */
  abstract listVersions(fileId: DriveFileIdBrand): readonly DriveVersion[]
  /** Return recent immutable audit events, newest first. */
  abstract listAudit(query?: DriveAuditQuery): readonly DriveAuditEvent[]
  /** Create one folder. */
  abstract createFolder(input: CreateDriveFolderInput): Promise<DriveFolder>
  /** Rename one folder. */
  abstract renameFolder(input: RenameDriveFolderInput): Promise<DriveFolder>
  /** Move one folder while preserving an acyclic tree. */
  abstract moveFolder(input: MoveDriveFolderInput): Promise<DriveFolder>
  /** Import one file and its first immutable version. */
  abstract importFile(input: ImportDriveFileInput): Promise<DriveFile>
  /** Append one immutable version and advance the logical file. */
  abstract createVersion(input: CreateDriveVersionInput): Promise<DriveVersion>
  /** Rename one logical file. */
  abstract renameFile(input: RenameDriveFileInput): Promise<DriveFile>
  /** Move one logical file. */
  abstract moveFile(input: MoveDriveFileInput): Promise<DriveFile>
  /** Replace one logical file's classification and tags. */
  abstract updateFileMetadata(input: UpdateDriveFileMetadataInput): Promise<DriveFile>
  /** Soft-delete one logical file; repeated deletion is idempotent. */
  abstract deleteFile(input: DeleteDriveFileInput): Promise<DriveFile>
  /** Restore one soft-deleted logical file; repeated restoration is idempotent. */
  abstract restoreFile(input: RestoreDriveFileInput): Promise<DriveFile>
  /** Read and verify one immutable version. */
  abstract readVersion(versionId: DriveVersionIdBrand, signal?: AbortSignal): Promise<StoredDriveContent>
}

export default DriveStore
