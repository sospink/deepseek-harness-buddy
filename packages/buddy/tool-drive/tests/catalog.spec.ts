import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DriveFileId, DriveFolderId, DriveLibraryId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import { driveCatalog, driveToolSource, fileId, folderById, resolveCatalogFile } from '../src/catalog.ts'
import { FakeDrive, fixtureFile } from './helpers.ts'

const now = '2026-08-29T00:00:00.000Z'
const folders = [
  { id: DriveFolderId('b'), libraryId: DriveLibraryId('default'), name: 'B', createdAt: now, updatedAt: now },
  { id: DriveFolderId('a'), libraryId: DriveLibraryId('default'), name: 'A', createdAt: now, updatedAt: now },
  { id: DriveFolderId('nested'), libraryId: DriveLibraryId('default'), parentId: DriveFolderId('a'), name: 'N', createdAt: now, updatedAt: now },
]

describe('Buddy Drive catalog projection', () => {
  it('traverses stable provider order, derives paths, excludes deleted files, and projects provenance', () => {
    const root = fixtureFile({ id: 'root', name: 'root.md', text: 'r' })
    const nested = fixtureFile({ id: 'nested-file', name: 'n.md', text: 'n', parentId: 'nested', tags: ['x'] })
    const deleted = fixtureFile({ id: 'deleted', name: 'd.md', text: 'd', deleted: true })
    const drive = new FakeDrive(new Context(), [root, nested, deleted], folders)
    const catalog = driveCatalog(drive, 10, 10)
    expect(catalog.complete).toBe(true)
    expect(catalog.files.map(item => [item.file.id, item.folderPath])).toEqual([
      ['root', '/'], ['nested-file', '/A/N'],
    ])
    expect(driveToolSource(catalog.files[1]!)).toMatchObject({
      fileId: 'nested-file', versionId: 'nested-file-v1', folderPath: '/A/N', tags: ['x'],
    })
    expect(folderById(folders, DriveFolderId('a'))?.name).toBe('A')
    expect(fileId('x')).toBe(DriveFileId('x'))
  })

  it('reports file/folder caps and broken current-version relations', () => {
    const drive = new FakeDrive(new Context(), [
      fixtureFile({ id: 'one', name: 'one.md', text: '1' }),
      fixtureFile({ id: 'two', name: 'two.md', text: '2' }),
    ], folders)
    expect(driveCatalog(drive, 10, 1).complete).toBe(false)
    expect(driveCatalog(drive, 1, 10).complete).toBe(false)
    const broken = fixtureFile({ id: 'broken', name: 'broken.md', text: 'x' })
    const brokenDrive = new FakeDrive(new Context(), [{
      ...broken, file: { ...broken.file, currentVersionId: DriveVersionId('missing') },
    }])
    expect(() => driveCatalog(brokenDrive, 10, 10)).toThrow('has no current version')
  })

  it('requires visible non-deleted file/version ownership and complete path resolution', () => {
    const good = fixtureFile({ id: 'good', name: 'good.md', text: 'ok', parentId: 'a' })
    const other = fixtureFile({ id: 'other', name: 'other.md', text: 'other' })
    const deleted = fixtureFile({ id: 'deleted', name: 'deleted.md', text: 'x', deleted: true })
    const drive = new FakeDrive(new Context(), [good, other, deleted], folders)
    expect(resolveCatalogFile(drive, good.file.id, good.version.id, 10, 10).folderPath).toBe('/A')
    expect(() => resolveCatalogFile(drive, DriveFileId('missing'), good.version.id, 10, 10)).toThrow('file not found')
    expect(() => resolveCatalogFile(drive, deleted.file.id, deleted.version.id, 10, 10)).toThrow('is deleted')
    expect(() => resolveCatalogFile(drive, good.file.id, 'missing', 10, 10)).toThrow('version not found')
    expect(() => resolveCatalogFile(drive, good.file.id, other.version.id, 10, 10)).toThrow('does not belong')
    expect(() => resolveCatalogFile(drive, good.file.id, good.version.id, 0, 1)).toThrow('traversal limit')
  })
})

describe('catalog visibility edge', () => {
  it('rejects a file lookup that is not present in a complete visible catalog', () => {
    const file = fixtureFile({ id: 'hidden', name: 'hidden.md', text: 'x' })
    class HiddenDrive extends FakeDrive {
      override listFiles(): readonly never[] { return [] }
    }
    const drive = new HiddenDrive(new Context(), [file])
    expect(() => resolveCatalogFile(drive, file.file.id, file.version.id, 10, 10)).toThrow('not visible')
  })
})
