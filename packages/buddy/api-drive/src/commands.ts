/** Buddy Drive Remote command implementation and stable failure mapping. */

import type { Context } from '@deepseek-ai/cordis'
import { DriveError, DriveFileId, DriveFolderId } from '@sospink/dsh-buddy-drive'
import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import { driveBaseline, driveVersionView } from './feed.ts'
import type {
  DriveAuditValue,
  DriveBaseline,
  DriveCreateFolderRequest,
  DriveFileRequest,
  DriveFileValue,
  DriveFolderValue,
  DriveMoveFileRequest,
  DriveMoveFolderRequest,
  DriveRenameFileRequest,
  DriveRenameFolderRequest,
  DriveUpdateFileMetadataRequest,
  DriveVersionsValue,
} from './types.ts'

/** Implements unary browser mutations against the authoritative Drive service. */
export class DriveCommands {
  /** @param ctx - Host context containing the Drive provider. */
  constructor(private readonly ctx: Context) {}

  baseline(): DriveBaseline { return driveBaseline(this.ctx) }

  async createFolder(request: DriveCreateFolderRequest): Promise<DriveFolderValue> {
    return this.wrap(async () => ({
      folder: await this.ctx.drive.createFolder({
        libraryId: this.ctx.drive.library().id,
        name: request.name,
        ...(request.parentId === undefined ? {} : { parentId: DriveFolderId(request.parentId) }),
      }),
    }))
  }

  async renameFolder(request: DriveRenameFolderRequest): Promise<DriveFolderValue> {
    return this.wrap(async () => ({
      folder: await this.ctx.drive.renameFolder({ folderId: DriveFolderId(request.folderId), name: request.name }),
    }))
  }

  async moveFolder(request: DriveMoveFolderRequest): Promise<DriveFolderValue> {
    return this.wrap(async () => ({
      folder: await this.ctx.drive.moveFolder({
        folderId: DriveFolderId(request.folderId),
        ...(request.parentId === undefined ? {} : { parentId: DriveFolderId(request.parentId) }),
      }),
    }))
  }

  async renameFile(request: DriveRenameFileRequest): Promise<DriveFileValue> {
    return this.wrap(async () => ({
      file: await this.ctx.drive.renameFile({ fileId: DriveFileId(request.fileId), name: request.name }),
    }))
  }

  async moveFile(request: DriveMoveFileRequest): Promise<DriveFileValue> {
    return this.wrap(async () => ({
      file: await this.ctx.drive.moveFile({
        fileId: DriveFileId(request.fileId),
        ...(request.parentId === undefined ? {} : { parentId: DriveFolderId(request.parentId) }),
      }),
    }))
  }

  async updateFileMetadata(request: DriveUpdateFileMetadataRequest): Promise<DriveFileValue> {
    return this.wrap(async () => ({
      file: await this.ctx.drive.updateFileMetadata({
        fileId: DriveFileId(request.fileId), kind: request.kind,
        ...(request.tags === undefined ? {} : { tags: request.tags }),
      }),
    }))
  }

  async deleteFile(request: DriveFileRequest): Promise<DriveFileValue> {
    return this.wrap(async () => ({ file: await this.ctx.drive.deleteFile({ fileId: DriveFileId(request.fileId) }) }))
  }

  async restoreFile(request: DriveFileRequest): Promise<DriveFileValue> {
    return this.wrap(async () => ({ file: await this.ctx.drive.restoreFile({ fileId: DriveFileId(request.fileId) }) }))
  }

  versions(request: DriveFileRequest): Promise<DriveVersionsValue> {
    return this.wrap(() => ({ versions: this.ctx.drive.listVersions(DriveFileId(request.fileId)).map(driveVersionView) }))
  }

  audit(): Promise<DriveAuditValue> {
    return this.wrap(() => ({ events: this.ctx.drive.listAudit({ limit: 200 }) }))
  }

  private async wrap<T>(operation: () => T | Promise<T>): Promise<T> {
    try { return await operation() } catch (error) {
      if (error instanceof TypertRemoteFailure) throw error
      if (error instanceof DriveError) {
        throw new TypertRemoteFailure({ code: error.code, message: error.message, details: {} })
      }
      throw error
    }
  }
}
