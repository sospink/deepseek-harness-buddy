import { afterEach, describe, expect, it } from 'vitest'
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
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
  const input = {
    libraryId: DriveLibraryId('default'),
    parentId: folder.id,
    name: '规则.md',
    kind: 'safety-protocol' as const,
    data: new TextEncoder().encode('# 规则\n保持可恢复。'),
    idempotencyKey: 'backup-fixture-import',
  }
  const file = await source.drive.importFile(input)
  const backupParent = await mkdtemp(join(tmpdir(), 'buddy-drive-backup-'))
  roots.push(backupParent)
  const backupPath = join(backupParent, 'snapshot')
  const summary = await source.drive.createBackup(backupPath)
  return { source, folder, file, input, backupParent, backupPath, summary }
}

async function backupVariant(
  fixture: Awaited<ReturnType<typeof backupFixture>>,
  name: string,
): Promise<string> {
  const variant = join(fixture.backupParent, name)
  await cp(fixture.backupPath, variant, { recursive: true })
  return variant
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
    const replay = await target.drive.importFile({
      ...fixture.input,
      mutation: { actor: 'agent', correlationId: 'replayed-after-restore' as never },
    })
    expect(replay).toEqual(fixture.file)
    expect(target.drive.listFiles(fixture.folder.id)).toHaveLength(1)
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

  it('backs up and restores an empty library without inventing content', async () => {
    const source = await harness()
    const backupParent = await mkdtemp(join(tmpdir(), 'buddy-drive-empty-backup-'))
    roots.push(backupParent)
    const backupPath = join(backupParent, 'empty')
    const summary = await source.drive.createBackup(backupPath)
    expect(summary.blobs).toEqual([])
    expect(summary.folderCount).toBe(0)
    expect(summary.fileCount).toBe(0)
    await source.fiber.dispose()

    const target = await harness()
    const restored = await target.drive.restoreBackup({ source: backupPath })
    expect(restored.replaced).toBe(false)
    expect(target.drive.listFolders()).toEqual([])
    expect(target.drive.listFiles()).toEqual([])
    expect(target.drive.listAudit({ limit: 1 })[0]?.operation).toBe('library/restore')
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

  it('rejects missing blobs, symlinked blobs, redundant objects, and redundant prefixes', async () => {
    const fixture = await backupFixture()
    await fixture.source.fiber.dispose()
    const digest = fixture.summary.blobs[0]?.digest
    if (digest === undefined) throw new Error('fixture did not produce a blob')
    const object = blobPath(fixture.backupPath, digest)
    const variants = [
      ['missing', async (variant: string) => { await rm(blobPath(variant, digest)) }],
      ['symlink', async (variant: string) => {
        await rm(blobPath(variant, digest))
        await symlink(fixture.backupPath, blobPath(variant, digest))
      }],
      ['redundant-object', async (variant: string) => {
        await writeFile(join(variant, 'blobs', 'sha256', digest.slice(7, 9), '0'.repeat(64)), Buffer.from('extra'), { mode: 0o600 })
      }],
      ['redundant-prefix', async (variant: string) => {
        const usedPrefix = digest.slice(7, 9)
        const prefix = usedPrefix === '00' ? '01' : '00'
        await mkdir(join(variant, 'blobs', 'sha256', prefix), { mode: 0o700 })
      }],
    ] as const
    for (const [name, mutate] of variants) {
      const variant = await backupVariant(fixture, name)
      await mutate(variant)
      const result = await harness()
      await expect(result.drive.inspectBackup(variant)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
      await result.fiber.dispose()
    }
    await expect(lstat(object)).resolves.toBeDefined()
  })

  it('rejects manifest version changes, path traversal, and extra top-level entries', async () => {
    const fixture = await backupFixture()
    await fixture.source.fiber.dispose()
    const original = JSON.parse(await readFile(join(fixture.backupPath, 'manifest.json'), 'utf8')) as Record<string, unknown>
    const variants = [
      ['version', { ...original, version: 2 }],
      ['path-traversal', { ...original, metadata: { ...(original.metadata as Record<string, unknown>), path: '../metadata.json' } }],
    ] as const
    for (const [name, manifest] of variants) {
      const variant = await backupVariant(fixture, name)
      await writeFile(join(variant, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
      const result = await harness()
      await expect(result.drive.inspectBackup(variant)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
      await result.fiber.dispose()
    }
    const extra = await backupVariant(fixture, 'extra-top-level')
    await writeFile(join(extra, 'unexpected'), Buffer.from('unexpected'), { mode: 0o600 })
    const result = await harness()
    await expect(result.drive.inspectBackup(extra)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    await result.fiber.dispose()
  })

  it('rejects nested backup destinations and does not replace a target on invalid restore', async () => {
    const fixture = await backupFixture()
    await expect(fixture.source.drive.createBackup(join(fixture.source.root, 'nested-backup')))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    await fixture.source.fiber.dispose()

    const target = await harness()
    const existing = await target.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'existing.md', kind: 'general', data: new TextEncoder().encode('# existing'),
    })
    const broken = await backupVariant(fixture, 'broken-for-restore')
    await rm(join(broken, 'metadata.json'))
    await expect(target.drive.restoreBackup({ source: broken, replace: true }))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    expect(target.drive.getFile(existing.id)).toEqual(existing)
    await target.fiber.dispose()
  })

  it('preserves the order of multiple missing destination path segments', async () => {
    const source = await harness()
    const sibling = join(dirname(source.root), `${basename(source.root)}-sibling`)
    roots.push(sibling)
    const destination = join(sibling, basename(source.root))
    const summary = await source.drive.createBackup(destination)
    expect(summary.path).toBe(destination)
    await source.fiber.dispose()
  })

  it('rejects unsafe permissions and a symlink used as the backup root', async () => {
    const fixture = await backupFixture()
    await fixture.source.fiber.dispose()

    const permissions = await backupVariant(fixture, 'unsafe-permissions')
    await chmod(join(permissions, 'metadata.json'), 0o644)
    const permissionCheck = await harness()
    await expect(permissionCheck.drive.inspectBackup(permissions))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    await permissionCheck.fiber.dispose()

    const link = join(fixture.backupParent, 'backup-link')
    await symlink(fixture.backupPath, link)
    const linkCheck = await harness()
    await expect(linkCheck.drive.inspectBackup(link))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    await linkCheck.fiber.dispose()
  })

  it('rejects a destination that is the same physical directory through a macOS alias', async () => {
    if (process.platform !== 'darwin') return
    const fixture = await backupFixture()
    const aliasPath = `/private${fixture.source.root}`
    await expect(fixture.source.drive.createBackup(join(aliasPath, 'nested', 'deeper', 'source-alias')))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' })
  })
})
