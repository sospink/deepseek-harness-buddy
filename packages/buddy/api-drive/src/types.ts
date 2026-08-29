/** Browser-safe Buddy Drive Remote and HTTP projection vocabulary. */

import type {
  DriveAuditEvent,
  DriveFile,
  DriveFileId,
  DriveFileKind,
  DriveFolder,
  DriveFolderId,
  DriveLibrary,
} from '@sospink/dsh-buddy-drive/types'
import type { DriveVersion } from '@sospink/dsh-buddy-drive/types'

export type {
  DriveAuditEvent,
  DriveFile,
  DriveFileId,
  DriveFileKind,
  DriveFolder,
  DriveFolderId,
  DriveLibrary,
} from '@sospink/dsh-buddy-drive/types'


/** Browser projection of one immutable version; digest is an opaque validated string on the wire. */
export interface DriveVersionView {
  readonly id: DriveVersion['id']
  readonly fileId: DriveVersion['fileId']
  readonly digest: string
  readonly bytes: number
  readonly createdAt: string
  readonly actor: DriveVersion['actor']
  readonly source: DriveVersion['source']
  readonly preview: DriveVersion['preview']
}

/** Complete reconnect baseline for the standalone drive UI. */
export interface DriveBaseline {
  readonly library: DriveLibrary
  readonly folders: readonly DriveFolder[]
  readonly files: readonly DriveFile[]
}

/** Folder create request. */
export interface DriveCreateFolderRequest {
  readonly parentId?: DriveFolderId
  readonly name: string
}

/** Folder mutation request returning one changed folder. */
export interface DriveRenameFolderRequest {
  readonly folderId: DriveFolderId
  readonly name: string
}

/** Folder move request; omitted parent moves to root. */
export interface DriveMoveFolderRequest {
  readonly folderId: DriveFolderId
  readonly parentId?: DriveFolderId
}

/** File rename request. */
export interface DriveRenameFileRequest {
  readonly fileId: DriveFileId
  readonly name: string
}

/** File move request; omitted parent moves to root. */
export interface DriveMoveFileRequest {
  readonly fileId: DriveFileId
  readonly parentId?: DriveFolderId
}

/** File classification/tag replacement request. */
export interface DriveUpdateFileMetadataRequest {
  readonly fileId: DriveFileId
  readonly kind: DriveFileKind
  readonly tags?: readonly string[]
}

/** One file identity request. */
export interface DriveFileRequest {
  readonly fileId: DriveFileId
}

/** One folder mutation result. */
export interface DriveFolderValue {
  readonly folder: DriveFolder
}

/** One file mutation result. */
export interface DriveFileValue {
  readonly file: DriveFile
}

/** One file's immutable versions. */
export interface DriveVersionsValue {
  readonly versions: readonly DriveVersionView[]
}

/** Recent immutable audit events. */
export interface DriveAuditValue {
  readonly events: readonly DriveAuditEvent[]
}

/** Upload HTTP success response. */
export type DriveUploadValue =
  | { readonly kind: 'file'; readonly file: DriveFile }
  | { readonly kind: 'version'; readonly version: DriveVersionView; readonly file: DriveFile }

/** Stable HTTP failure body. */
export interface DriveHttpFailure {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

/** Reconnect stream frame: a complete snapshot at open and after each accepted mutation. */
export type DriveFollowFrame =
  | { readonly type: 'baseline'; readonly value: DriveBaseline }
  | { readonly type: 'snapshot'; readonly value: DriveBaseline }
