/** Complete Buddy Drive durable-state validation, independent of Cordis lifecycle. */

import { DriveError } from '@sospink/dsh-buddy-drive'
import type {
  DriveFileId,
  DriveFolderId,
  DriveLimits,
  DriveVersionId,
} from '@sospink/dsh-buddy-drive'
import type { DriveState } from './spec.ts'

function nameKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('en-US')
}

function validateFolderChain(state: DriveState, start: DriveFolderId): void {
  const byId = new Map(state.folders.map(folder => [folder.id, folder]))
  const seen = new Set<DriveFolderId>()
  let cursor: DriveFolderId | undefined = start
  while (cursor !== undefined) {
    if (seen.has(cursor)) throw new DriveError('STORAGE_INCONSISTENT', 'Drive folder tree contains a cycle.')
    seen.add(cursor)
    cursor = byId.get(cursor)?.parentId
  }
}

/** Validate every cross-record identity, tree, current-version, quota, and visible-name relation. */
export function validateDriveState(state: DriveState, limits: DriveLimits): void {
  const folderIds = new Set<DriveFolderId>()
  for (const folder of state.folders) {
    if (folder.libraryId !== state.library.id || folderIds.has(folder.id)) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive folder metadata is inconsistent.')
    }
    folderIds.add(folder.id)
  }
  for (const folder of state.folders) {
    if (folder.parentId !== undefined && !folderIds.has(folder.parentId)) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive folder references an unknown parent.')
    }
    validateFolderChain(state, folder.id)
  }
  const fileIds = new Set<DriveFileId>()
  const versionIds = new Set<DriveVersionId>()
  for (const file of state.files) {
    if (file.libraryId !== state.library.id || fileIds.has(file.id)
      || (file.parentId !== undefined && !folderIds.has(file.parentId))) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive file metadata is inconsistent.')
    }
    fileIds.add(file.id)
  }
  for (const version of state.versions) {
    if (!fileIds.has(version.fileId) || versionIds.has(version.id)) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive version metadata is inconsistent.')
    }
    versionIds.add(version.id)
  }
  for (const file of state.files) {
    const current = state.versions.find(version => version.id === file.currentVersionId)
    if (current?.fileId !== file.id) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive file references an invalid current version.')
    }
  }
  const used = state.versions.reduce((sum, version) => sum + version.bytes, 0)
  if (used > limits.maxLibraryBytes || state.audit.length > limits.maxAuditEvents) {
    throw new DriveError('STORAGE_INCONSISTENT', 'Drive durable limits are exceeded.')
  }
  const names = new Set<string>()
  for (const folder of state.folders) {
    const key = `${folder.parentId ?? ''}:${nameKey(folder.name)}`
    if (names.has(key)) throw new DriveError('STORAGE_INCONSISTENT', 'Drive siblings contain duplicate names.')
    names.add(key)
  }
  for (const file of state.files.filter(file => file.deletedAt === undefined)) {
    const key = `${file.parentId ?? ''}:${nameKey(file.name)}`
    if (names.has(key)) throw new DriveError('STORAGE_INCONSISTENT', 'Drive siblings contain duplicate names.')
    names.add(key)
  }
}
