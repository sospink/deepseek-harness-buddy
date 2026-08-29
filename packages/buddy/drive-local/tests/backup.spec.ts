import { afterEach, describe, expect, it } from 'vitest'
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import type { StorageBackend } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { DriveLibraryId } from '@sospink/dsh-buddy-drive'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import LocalDriveStore from '../src/index.ts'
import { blobPath } from '../src/blob.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

interface HarnessOptions {
  readonly pool?: MemoryMediaPool
  readonly backend?: StorageBackend
  readonly root?: string
}

async function harness(options: HarnessOptions = {}) {
  const pool = options.pool ?? new MemoryMediaPool()
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'buddy-drive-backup-root-'))
  if (!roots.includes(root)) roots.push(root)
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = options.backend ?? new MemoryStorageBackend(pool)
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(LocalDriveStore, {
    root,
    maxFileBytes: 1024 * 1024,
    maxLibraryBytes: 4 * 1024 * 1024,
    maxDocxEntries: 100,
    maxDocxExpandedBytes: 4 * 1024 * 1024,
    maxDocxCompressionRatio: 100,
    maxAuditEvents: 1_000,
  })
  return { ctx, fiber: ctx.fiber, pool, root, drive: ctx.drive as LocalDriveStore }
}

async function backupFixture() {
  const source = await harness()
  const folder = await source.drive.createFolder({ libraryId: DriveLibraryId('default'), name: '资料' })
  const file = await source.drive.importFile({
    libraryId: DriveLibraryId('default'),
    parentId: folder.id,
    name: '规则.md',
    kind: 'safety-protocol',
    data: new TextEncoder().encode('# 规则\n保持可恢复。'),
  })
  const backupParent = await mkdtemp(join(tmpdir(), 'buddy-drive-backup-'))
  roots.push(backupParent)
  const backupPath = join(backupParent, 'snapshot')
  const summary = await source.drive.createBackup(backupPath)
  return { source, folder, file, backupParent, backupPath, summary }
}

describe('LocalDriveStore backups and restores', () => {
  it('creates and independently verifies a backup, then restores it across restart', async () => {
    const fixture = await backupFixture()
    expect(fixture.summary).toMatchObject({
      format: 'dsh-buddy-drive-backup',
      version: 1,
      libraryId: 'default',
      folderCount: 1,
      fileCount: 1,
      versionCount: 1,
    })
    await expect(fixture.source.drive.createBackup(fixture.backupPath))
      .rejects.toMatchObject({ code: 'BACKUP_EXISTS' })
    expect(await fixture.source.drive.inspectBackup(fixture.backupPath)).toEqual(fixture.summary)
    await fixture.source.fiber.dispose()

    const target = await harness({ root: await mkdtemp(join(tmpdir(), 'buddy-drive-restore-root-')), pool: new MemoryMediaPool() })
    roots.push(target.root)
    const restored = await target.drive.restoreBackup({
      source: fixture.backupPath,
      mutation: { actor: 'agent', correlationId: 'restore-test' as never },
    })
    expect(restored.replaced).toBe(false)
    expect(restored.auditCount).toBe(fixture.summary.auditCount + 1)
    expect(target.drive.listFolders()).toHaveLength(1)
    expect(target.drive.listFiles(fixture.folder.id)).toHaveLength(1)
    expect(new TextDecoder().decode((await target.drive.readVersion(fixture.file.currentVersionId)).data))
      .toContain('保持可恢复')
    expect(target.drive.listAudit({ limit: 1 })[0]).toMatchObject({
      operation: 'library/restore', correlationId: 'restore-test', actor: 'agent',
    })
    const targetPool = target.pool
    await target.fiber.dispose()

    const restarted = await harness({ root: target.root, pool: targetPool })
    expect(restarted.drive.listFolders()).toHaveLength(1)
    expect(restarted.drive.listFiles(fixture.folder.id)).toHaveLength(1)
    expect(restarted.drive.listAudit({ limit: 1 })[0]?.operation).toBe('library/restore')
    await restarted.fiber.dispose()
  })

  it('refuses a non-empty target unless replacement is explicit', async () => {
    const fixture = await backupFixture()
    await fixture.source.fiber.dispose()
    const target = await harness({ root: await mkdtemp(join(tmpdir(), 'buddy-drive-replace-root-')) })
    roots.push(target.root)
    const existing = await target.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'existing.md', kind: 'general', data: new TextEncoder().encode('# existing'),
    })
    await expect(target.drive.restoreBackup({ source: fixture.backupPath }))
      .rejects.toMatchObject({ code: 'RESTORE_TARGET_NOT_EMPTY' })
    expect(target.drive.getFile(existing.id)).toEqual(existing)
    const restored = await target.drive.restoreBackup({ source: fixture.backupPath, replace: true })
    expect(restored.replaced).toBe(true)
    expect(target.drive.getFile(existing.id)).toBeUndefined()
    expect(target.drive.getFile(fixture.file.id)).toBeDefined()
    await target.fiber.dispose()
  })

  it('replaces deterministically when the same backup is explicitly restored again', async () => {
    const fixture = await backupFixture()
    await fixture.source.fiber.dispose()
    const target = await harness({ root: await mkdtemp(join(tmpdir(), 'buddy-drive-repeat-root-')) })
    roots.push(target.root)
    await target.drive.restoreBackup({ source: fixture.backupPath })
    const before = target.drive.listAudit({ limit: 1 })[0]
    const repeated = await target.drive.restoreBackup({ source: fixture.backupPath, replace: true })
    expect(repeated.replaced).toBe(true)
    expect(target.drive.listFiles(fixture.folder.id)).toHaveLength(1)
    expect(target.drive.listAudit({ limit: 1 })[0]?.operation).toBe('library/restore')
    expect(target.drive.listAudit({ limit: 1 })[0]?.id).not.toBe(before?.id)
    expect(target.drive.listAudit({ targetId: fixture.file.id })).toHaveLength(1)
    await target.fiber.dispose()
  })

  it('keeps old metadata authoritative when the restore metadata write fails', async () => {
    const fixture = await backupFixture()
    await fixture.source.fiber.dispose()
    const targetRoot = await mkdtemp(join(tmpdir(), 'buddy-drive-failure-root-'))
    roots.push(targetRoot)
    const pool = new MemoryMediaPool()
    const target = await harness({ root: targetRoot, pool })
    const existing = await target.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'existing.md', kind: 'general', data: new TextEncoder().encode('# existing'),
    })
    pool.failNextWrites = 1
    await expect(target.drive.restoreBackup({ source: fixture.backupPath, replace: true }))
      .rejects.toThrow('injected write failure')
    expect(target.drive.getFile(existing.id)).toEqual(existing)
    expect(target.drive.getFile(fixture.file.id)).toBeUndefined()
    await target.fiber.dispose()

    const restarted = await harness({ root: targetRoot, pool })
    expect(restarted.drive.getFile(existing.id)).toEqual(existing)
    expect(restarted.drive.getFile(fixture.file.id)).toBeUndefined()
    const orphanDigest = fixture.summary.blobs[0]?.digest
    if (orphanDigest !== undefined) await expect(lstat(blobPath(targetRoot, orphanDigest))).rejects.toMatchObject({ code: 'ENOENT' })
    await restarted.fiber.dispose()
  })

  it('rejects changed manifest, metadata, and blob content', async () => {
    const fixture = await backupFixture()
    await fixture.source.fiber.dispose()

    const manifest = await readFile(join(fixture.backupPath, 'manifest.json'))
    await writeFile(join(fixture.backupPath, 'manifest.json'), Buffer.from('{}'), { mode: 0o600 })
    const invalidManifest = await harness()
    await expect(invalidManifest.drive.inspectBackup(fixture.backupPath))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    await invalidManifest.fiber.dispose()
    await writeFile(join(fixture.backupPath, 'manifest.json'), manifest, { mode: 0o600 })

    const metadata = await readFile(join(fixture.backupPath, 'metadata.json'))
    await writeFile(join(fixture.backupPath, 'metadata.json'), Buffer.concat([metadata, Buffer.from(' ')]) , { mode: 0o600 })
    const invalidMetadata = await harness()
    await expect(invalidMetadata.drive.inspectBackup(fixture.backupPath))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    await invalidMetadata.fiber.dispose()
    await writeFile(join(fixture.backupPath, 'metadata.json'), metadata, { mode: 0o600 })

    const digest = fixture.summary.blobs[0]?.digest
    if (digest === undefined) throw new Error('fixture did not produce a blob')
    const object = blobPath(fixture.backupPath, digest)
    const bytes = await readFile(object)
    await writeFile(object, Buffer.concat([bytes, Buffer.from('x')]), { mode: 0o600 })
    const invalidBlob = await harness()
    await expect(invalidBlob.drive.inspectBackup(fixture.backupPath))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    await invalidBlob.fiber.dispose()
  })

  it('rejects a destination that is the same physical directory through a macOS alias', async () => {
    if (process.platform !== 'darwin') return
    const fixture = await backupFixture()
    const privatePath = `/private${fixture.backupParent}`
    const aliasPath = `/tmp${relative('/private', privatePath)}`
    await expect(fixture.source.drive.createBackup(join(aliasPath, 'source-alias')))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
  })
})
