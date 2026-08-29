/** Buddy Drive Remote owner and authenticated binary HTTP routes. */

import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { DriveCommands } from './commands.ts'
import { DriveFeed } from './feed.ts'
import { createDriveContentRoute, createDrivePdfCMapRoute, createDrivePdfWorkerRoute, createDriveUploadRoute } from './http.ts'
import type {
  DriveAuditValue,
  DriveBaseline,
  DriveCreateFolderRequest,
  DriveFileRequest,
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
export { DRIVE_CONTENT_PATH, DRIVE_PDF_CMAP_PATH, DRIVE_PDF_WORKER_PATH, DRIVE_UPLOAD_PATH } from './paths.ts'

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
  }

  @Remote('baseline')
  baseline(): DriveBaseline { return this.commands.baseline() }

  @Remote('createFolder')
  createFolder(request: DriveCreateFolderRequest): Promise<DriveFolderValue> {
    return this.commands.createFolder(request)
  }

  @Remote('renameFolder')
  renameFolder(request: DriveRenameFolderRequest): Promise<DriveFolderValue> {
    return this.commands.renameFolder(request)
  }

  @Remote('moveFolder')
  moveFolder(request: DriveMoveFolderRequest): Promise<DriveFolderValue> {
    return this.commands.moveFolder(request)
  }

  @Remote('renameFile')
  renameFile(request: DriveRenameFileRequest): Promise<DriveFileValue> {
    return this.commands.renameFile(request)
  }

  @Remote('moveFile')
  moveFile(request: DriveMoveFileRequest): Promise<DriveFileValue> {
    return this.commands.moveFile(request)
  }

  @Remote('updateFileMetadata')
  updateFileMetadata(request: DriveUpdateFileMetadataRequest): Promise<DriveFileValue> {
    return this.commands.updateFileMetadata(request)
  }

  @Remote('deleteFile')
  deleteFile(request: DriveFileRequest): Promise<DriveFileValue> { return this.commands.deleteFile(request) }

  @Remote('restoreFile')
  restoreFile(request: DriveFileRequest): Promise<DriveFileValue> { return this.commands.restoreFile(request) }

  @Remote('versions')
  versions(request: DriveFileRequest): Promise<DriveVersionsValue> { return this.commands.versions(request) }

  @Remote('audit')
  audit(): Promise<DriveAuditValue> { return this.commands.audit() }

  @Remote({ mode: 'stream' })
  follow(signal: AbortSignal): AsyncIterable<DriveFollowFrame> { return this.feed.follow(signal) }
}

export default BuddyDriveController
