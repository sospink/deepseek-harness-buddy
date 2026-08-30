/** Buddy Drive Remote owner and authenticated binary HTTP routes. */

import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { DriveCommands } from './commands.ts'
import { DriveFeed } from './feed.ts'
import {
  createDriveContentRoute, createDriveDocxRuntimeRoute, createDriveDocxWorkerRoute,
  createDrivePdfCMapRoute, createDrivePdfWorkerRoute, createDriveUploadRoute,
} from './http.ts'
import type {
  DriveAuditValue,
  DriveBaseline,
  DriveCreateFolderRequest,
  DriveFileRequest,
  DrivePurgeFilesRequest,
  DriveFileValue,
  DriveFolderValue,
  DriveFollowFrame,
  DriveMoveFileRequest,
  DriveMoveFolderRequest,
  DriveRenameFileRequest,
  DriveRenameFolderRequest,
  DriveUpdateFileMetadataRequest,
  DriveVersionsValue,
} from './types.ts'

export type * from './types.ts'
export {
  DRIVE_CONTENT_PATH, DRIVE_DOCX_RUNTIME_PATH, DRIVE_DOCX_WORKER_PATH, DRIVE_PDF_CMAP_PATH,
  DRIVE_PDF_WORKER_PATH, DRIVE_UPLOAD_PATH,
} from './paths.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    buddyDriveController: BuddyDriveController
  }
}

/** Host service backing the generated `ctx.remote.drive` namespace. */
export class BuddyDriveController extends TypertRemoteService {
  static inject = ['typert', 'drive', 'webServer', 'connection']

  private readonly commands: DriveCommands
  private readonly feed: DriveFeed

  constructor(ctx: Context) {
    super(ctx, 'buddyDriveController', { namespace: 'drive' })
    this.commands = new DriveCommands(ctx)
    this.feed = new DriveFeed(ctx)
    ctx.effect(() => ctx.webServer.register(createDriveUploadRoute(ctx)), 'buddy-api-drive: upload route')
    ctx.effect(() => ctx.webServer.register(createDriveContentRoute(ctx)), 'buddy-api-drive: content route')
    ctx.effect(() => ctx.webServer.register(createDrivePdfWorkerRoute(ctx)), 'buddy-api-drive: PDF worker route')
    ctx.effect(() => ctx.webServer.register(createDrivePdfCMapRoute(ctx)), 'buddy-api-drive: PDF CMap route')
    ctx.effect(() => ctx.webServer.register(createDriveDocxWorkerRoute(ctx)), 'buddy-api-drive: DOCX Worker route')
    ctx.effect(() => ctx.webServer.register(createDriveDocxRuntimeRoute(ctx)), 'buddy-api-drive: DOCX runtime route')
  }

  /**
   * Return the current complete Drive projection.
   * @returns The current Drive baseline.
   */
  @Remote('baseline')
  baseline(): DriveBaseline { return this.commands.baseline() }

  /**
   * Create a folder through the browser Remote.
   * @param request - Folder creation request.
   * @returns The committed folder value.
   */
  @Remote('createFolder')
  createFolder(request: DriveCreateFolderRequest): Promise<DriveFolderValue> {
    return this.commands.createFolder(request)
  }

  /**
   * Rename a folder through the browser Remote.
   * @param request - Folder rename request.
   * @returns The committed folder value.
   */
  @Remote('renameFolder')
  renameFolder(request: DriveRenameFolderRequest): Promise<DriveFolderValue> {
    return this.commands.renameFolder(request)
  }

  /**
   * Move a folder through the browser Remote.
   * @param request - Folder move request.
   * @returns The committed folder value.
   */
  @Remote('moveFolder')
  moveFolder(request: DriveMoveFolderRequest): Promise<DriveFolderValue> {
    return this.commands.moveFolder(request)
  }

  /**
   * Rename a file through the browser Remote.
   * @param request - File rename request.
   * @returns The committed file value.
   */
  @Remote('renameFile')
  renameFile(request: DriveRenameFileRequest): Promise<DriveFileValue> {
    return this.commands.renameFile(request)
  }

  /**
   * Move a file through the browser Remote.
   * @param request - File move request.
   * @returns The committed file value.
   */
  @Remote('moveFile')
  moveFile(request: DriveMoveFileRequest): Promise<DriveFileValue> {
    return this.commands.moveFile(request)
  }

  /**
   * Update file classification and tags through the browser Remote.
   * @param request - Metadata update request.
   * @returns The committed file value.
   */
  @Remote('updateFileMetadata')
  updateFileMetadata(request: DriveUpdateFileMetadataRequest): Promise<DriveFileValue> {
    return this.commands.updateFileMetadata(request)
  }

  /**
   * Soft-delete a file through the browser Remote.
   * @param request - File identity request.
   * @returns The committed file value.
   */
  @Remote('deleteFile')
  deleteFile(request: DriveFileRequest): Promise<DriveFileValue> { return this.commands.deleteFile(request) }

  /** Permanently remove selected files through the browser Remote.
   * @param request - File identities to remove.
   * @returns The number of files removed.
   */
  @Remote('purgeFiles')
  purgeFiles(request: DrivePurgeFilesRequest): Promise<{ count: number }> { return this.commands.purgeFiles(request) }

  /**
   * Restore a soft-deleted file through the browser Remote.
   * @param request - File identity request.
   * @returns The committed file value.
   */
  @Remote('restoreFile')
  restoreFile(request: DriveFileRequest): Promise<DriveFileValue> { return this.commands.restoreFile(request) }

  /**
   * Return immutable versions through the browser Remote.
   * @param request - File identity request.
   * @returns The file's version values.
   */
  @Remote('versions')
  versions(request: DriveFileRequest): Promise<DriveVersionsValue> { return this.commands.versions(request) }

  /**
   * Return recent Drive audit events.
   * @returns The recent audit projection.
   */
  @Remote('audit')
  audit(): Promise<DriveAuditValue> { return this.commands.audit() }

  /**
   * Follow committed Drive projections.
   * @param signal - Cancellation signal for the stream.
   * @returns A reconnectable Drive frame stream.
   */
  @Remote({ mode: 'stream' })
  follow(signal: AbortSignal): AsyncIterable<DriveFollowFrame> { return this.feed.follow(signal) }
}

export default BuddyDriveController
