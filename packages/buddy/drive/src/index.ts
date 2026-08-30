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

/** Brand one raw string as a drive library id.
 * @param id - Raw library identifier.
 * @returns The identifier with the library-id brand.
 */
export function DriveLibraryId(id: string): DriveLibraryIdBrand { return id as DriveLibraryIdBrand }
/** Brand one raw string as a drive folder id.
 * @param id - Raw folder identifier.
 * @returns The identifier with the folder-id brand.
 */
export function DriveFolderId(id: string): DriveFolderIdBrand { return id as DriveFolderIdBrand }
/** Brand one raw string as a drive file id.
 * @param id - Raw file identifier.
 * @returns The identifier with the file-id brand.
 */
export function DriveFileId(id: string): DriveFileIdBrand { return id as DriveFileIdBrand }
/** Brand one raw string as a drive version id.
 * @param id - Raw version identifier.
 * @returns The identifier with the version-id brand.
 */
export function DriveVersionId(id: string): DriveVersionIdBrand { return id as DriveVersionIdBrand }
/** Brand one raw string as a drive audit id.
 * @param id - Raw audit identifier.
 * @returns The identifier with the audit-id brand.
 */
export function DriveAuditId(id: string): DriveAuditIdBrand { return id as DriveAuditIdBrand }
/** Brand one raw string as a drive mutation correlation id.
 * @param id - Raw correlation identifier.
 * @returns The identifier with the correlation-id brand.
 */
export function DriveCorrelationId(id: string): DriveCorrelationIdBrand { return id as DriveCorrelationIdBrand }

declare module '@deepseek-ai/cordis' {
  interface Context {
    drive: DriveStore
  }
  interface Events {
    /**
     * One accepted Drive mutation became durable and visible through `ctx.drive`.
     * Listeners may refresh projections that derive from the committed snapshot.
     * @mode emit
     */
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
}

export default DriveStore
