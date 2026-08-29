/** Stable bounded catalog traversal over the provider-neutral Drive seam. */

import type {
  DriveFile, DriveFileId, DriveFolder, DriveFolderId, DriveStore, DriveVersion,
} from '@sospink/dsh-buddy-drive'
import type { DriveToolSource } from './types.ts'

export interface CatalogFile {
  readonly file: DriveFile
  readonly version: DriveVersion
  readonly folderPath: string
}

/** Collect current non-deleted files and their immutable versions in stable folder traversal order. */
export function driveCatalog(drive: DriveStore, maxFolders: number, maxFiles: number): {
  readonly files: readonly CatalogFile[]
  readonly complete: boolean
} {
  const files: CatalogFile[] = []
  const queue: { readonly id?: DriveFolderId; readonly path: string }[] = [{ path: '/' }]
  let folders = 0
  for (const current of queue) {
    for (const file of drive.listFiles(current.id, false)) {
      const version = drive.getVersion(file.currentVersionId)
      if (version === undefined) throw new Error(`Drive file ${file.id} has no current version ${file.currentVersionId}.`)
      files.push({ file, version, folderPath: current.path })
      if (files.length >= maxFiles) return { files, complete: false }
    }
    const children = drive.listFolders(current.id)
    for (const folder of children) {
      folders += 1
      if (folders > maxFolders) return { files, complete: false }
      queue.push({ id: folder.id, path: `${current.path === '/' ? '' : current.path}/${folder.name}` })
    }
  }
  return { files, complete: true }
}

/** Resolve one current file/version pair and its folder path through the bounded catalog. */
export function resolveCatalogFile(
  drive: DriveStore,
  fileId: DriveFileId,
  versionId: string,
  maxFolders: number,
  maxFiles: number,
): CatalogFile {
  const file = drive.getFile(fileId)
  if (file === undefined) throw new Error(`Drive file not found: ${fileId}`)
  if (file.deletedAt !== undefined) throw new Error(`Drive file is deleted: ${fileId}`)
  const version = drive.getVersion(versionId as never)
  if (version === undefined) throw new Error(`Drive version not found: ${versionId}`)
  if (version.fileId !== file.id) throw new Error(`Drive version ${versionId} does not belong to file ${fileId}.`)
  const catalog = driveCatalog(drive, maxFolders, maxFiles)
  const found = catalog.files.find(candidate => candidate.file.id === file.id)
  if (found === undefined) {
    if (!catalog.complete) throw new Error('Drive catalog traversal limit prevented resolving the file folder path.')
    throw new Error(`Drive file is not visible in the current catalog: ${fileId}`)
  }
  return { ...found, version }
}

/** Project one catalog row into immutable model-facing provenance. */
export function driveToolSource(item: CatalogFile): DriveToolSource {
  return {
    fileId: item.file.id,
    versionId: item.version.id,
    digest: item.version.digest,
    name: item.file.name,
    kind: item.file.kind,
    mediaType: item.file.mediaType,
    folderPath: item.folderPath,
    tags: [...item.file.tags],
  }
}

/** Narrow raw string ids at the tool boundary without exposing path addressing. */
export function fileId(value: string): DriveFileId { return value as DriveFileId }

/** Folder lookup used only for validation tests and future selectors. */
export function folderById(folders: readonly DriveFolder[], id: DriveFolderId): DriveFolder | undefined {
  return folders.find(folder => folder.id === id)
}
