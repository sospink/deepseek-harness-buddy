import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  DriveFileId, DriveFolderId, DriveLibraryId, DriveStore, DriveVersionId,
  type CreateDriveFolderInput, type CreateDriveVersionInput, type DeleteDriveFileInput,
  type DriveAuditEvent, type DriveAuditQuery, type DriveFile, type DriveFolder,
  type DriveLibrary, type DriveLimits, type DriveVersion, type ImportDriveFileInput,
  type MoveDriveFileInput, type MoveDriveFolderInput, type RenameDriveFileInput,
  type RenameDriveFolderInput, type RestoreDriveFileInput, type StoredDriveContent,
  type UpdateDriveFileMetadataInput,
} from '@sospink/dsh-buddy-drive'
import * as ToolDrive from '../src/index.ts'

const NOW = '2026-08-29T00:00:00.000Z'

export interface FixtureFile {
  readonly file: DriveFile
  readonly version: DriveVersion
  readonly data: Uint8Array
}

export function fixtureFile(input: {
  id: string
  name: string
  text: string
  parentId?: string
  kind?: DriveFile['kind']
  mediaType?: DriveFile['mediaType']
  versionId?: string
  deleted?: boolean
  tags?: string[]
}): FixtureFile {
  const fileId = DriveFileId(input.id)
  const versionId = DriveVersionId(input.versionId ?? `${input.id}-v1`)
  const data = new TextEncoder().encode(input.text)
  return {
    file: {
      id: fileId,
      libraryId: DriveLibraryId('default'),
      ...(input.parentId === undefined ? {} : { parentId: DriveFolderId(input.parentId) }),
      name: input.name,
      kind: input.kind ?? 'general',
      mediaType: input.mediaType ?? 'text/markdown',
      currentVersionId: versionId,
      tags: input.tags ?? [],
      createdAt: NOW,
      updatedAt: NOW,
      ...(input.deleted ? { deletedAt: NOW } : {}),
    },
    version: {
      id: versionId,
      fileId,
      digest: `sha256:${input.id.padEnd(64, '0').slice(0, 64)}`,
      bytes: data.byteLength,
      createdAt: NOW,
      actor: 'human',
      source: 'upload',
      preview: 'ready',
    },
    data,
  }
}

export class FakeDrive extends DriveStore {
  readonly limits: DriveLimits = {
    maxFileBytes: 50 * 1024 * 1024,
    maxLibraryBytes: 2 * 1024 * 1024 * 1024,
    maxDocxEntries: 2_000,
    maxDocxExpandedBytes: 250 * 1024 * 1024,
    maxDocxCompressionRatio: 100,
    maxAuditEvents: 100_000,
  }
  readonly libraryValue: DriveLibrary = {
    id: DriveLibraryId('default'), title: '资料云盘', createdAt: NOW, updatedAt: NOW,
  }
  readonly folders: DriveFolder[]
  readonly fixtures: FixtureFile[]
  readonly readFailures = new Set<string>()
  beforeRead?: () => void

  constructor(ctx: Context, fixtures: FixtureFile[] = [], folders: DriveFolder[] = []) {
    super(ctx)
    this.fixtures = fixtures
    this.folders = folders
  }

  library(): DriveLibrary { return this.libraryValue }
  listFolders(parentId?: DriveFolder['parentId']): readonly DriveFolder[] {
    return this.folders.filter(folder => folder.parentId === parentId)
  }
  listFiles(parentId?: DriveFolder['parentId'], includeDeleted = false): readonly DriveFile[] {
    return this.fixtures
      .map(item => item.file)
      .filter(file => file.parentId === parentId && (includeDeleted || file.deletedAt === undefined))
  }
  getFile(fileId: DriveFile['id']): DriveFile | undefined { return this.fixtures.find(item => item.file.id === fileId)?.file }
  getVersion(versionId: DriveVersion['id']): DriveVersion | undefined { return this.fixtures.find(item => item.version.id === versionId)?.version }
  listVersions(fileId: DriveFile['id']): readonly DriveVersion[] { return this.fixtures.filter(item => item.file.id === fileId).map(item => item.version) }
  listAudit(_query?: DriveAuditQuery): readonly DriveAuditEvent[] { return [] }
  async readVersion(versionId: DriveVersion['id'], signal?: AbortSignal): Promise<StoredDriveContent> {
    this.beforeRead?.()
    signal?.throwIfAborted()
    if (this.readFailures.has(versionId)) throw new Error('selected extraction failure')
    const found = this.fixtures.find(item => item.version.id === versionId)
    if (found === undefined) throw new Error('missing fixture version')
    return { version: found.version, data: found.data }
  }

  createFolder(_input: CreateDriveFolderInput): Promise<DriveFolder> { throw new Error('read-only fixture') }
  renameFolder(_input: RenameDriveFolderInput): Promise<DriveFolder> { throw new Error('read-only fixture') }
  moveFolder(_input: MoveDriveFolderInput): Promise<DriveFolder> { throw new Error('read-only fixture') }
  importFile(_input: ImportDriveFileInput): Promise<DriveFile> { throw new Error('read-only fixture') }
  createVersion(_input: CreateDriveVersionInput): Promise<DriveVersion> { throw new Error('read-only fixture') }
  renameFile(_input: RenameDriveFileInput): Promise<DriveFile> { throw new Error('read-only fixture') }
  moveFile(_input: MoveDriveFileInput): Promise<DriveFile> { throw new Error('read-only fixture') }
  updateFileMetadata(_input: UpdateDriveFileMetadataInput): Promise<DriveFile> { throw new Error('read-only fixture') }
  deleteFile(_input: DeleteDriveFileInput): Promise<DriveFile> { throw new Error('read-only fixture') }
  purgeFiles(_input: { fileIds: readonly DriveFileId[] }): Promise<number> { throw new Error('read-only fixture') }
  restoreFile(_input: RestoreDriveFileInput): Promise<DriveFile> { throw new Error('read-only fixture') }
}

export async function toolHarness(fixtures: FixtureFile[] = [], folders: DriveFolder[] = [], config: ToolDrive.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const drive = new FakeDrive(ctx, fixtures, folders)
  await ctx.plugin(ToolDrive, config)
  return { ctx, drive }
}
