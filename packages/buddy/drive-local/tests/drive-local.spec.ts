import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { strToU8, zipSync } from 'fflate'
import Storage from '@deepseek-ai/dsh-storage'
import type { StorageBackend } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { DriveFileId, DriveFolderId, DriveLibraryId } from '@sospink/dsh-buddy-drive'
import type { DriveFile } from '@sospink/dsh-buddy-drive'
import LocalDriveStore from '../src/index.ts'
import { blobPath, digestBytes } from '../src/blob.ts'

let roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  roots = []
})

interface HarnessOptions {
  pool?: MemoryMediaPool
  backend?: StorageBackend
  root?: string
  maxLibraryBytes?: number
  maxAuditEvents?: number
}

async function harness(options: HarnessOptions = {}) {
  const pool = options.pool ?? new MemoryMediaPool()
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'buddy-drive-'))
  if (!roots.includes(root)) roots.push(root)
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = options.backend ?? new MemoryStorageBackend(pool)
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const fiber = await ctx.plugin(LocalDriveStore, {
    root,
    maxFileBytes: 1024 * 1024,
    maxLibraryBytes: options.maxLibraryBytes ?? 4 * 1024 * 1024,
    maxDocxEntries: 100,
    maxDocxExpandedBytes: 4 * 1024 * 1024,
    maxDocxCompressionRatio: 100,
    maxAuditEvents: options.maxAuditEvents ?? 1_000,
  })
  return { ctx, fiber, pool, root, drive: ctx.drive }
}

function failingGlobalBackend(pool: MemoryMediaPool, failAt: number): StorageBackend {
  const inner = new MemoryStorageBackend(pool)
  let writes = 0
  return {
    kv: {
      open: async (descriptor) => {
        const unit = await inner.kv.open(descriptor)
        return {
          loadAll: () => unit.loadAll(),
          putRecord: (table, key, value) => unit.putRecord(table, key, value),
          deleteRecord: (table, key) => unit.deleteRecord(table, key),
          setGlobal: async (value) => {
            writes += 1
            if (writes === failAt) throw new Error('selected drive metadata failure')
            await unit.setGlobal(value)
          },
          close: () => unit.close(),
        }
      },
    },
    close: () => inner.close(),
  }
}

describe('LocalDriveStore lifecycle and durable flow', () => {
  it('rejects reads before Service initialization and resolves default limits through plugin config', async () => {
    const direct = new LocalDriveStore(new Context(), { root: '/tmp/not-started' })
    expect(() => direct.library()).toThrow(/not started/)
    const base = await mkdtemp(join(tmpdir(), 'buddy-drive-defaults-'))
    roots.push(base)
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend())
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    await ctx.plugin(LocalDriveStore, { root: base })
    expect(ctx.drive.limits).toMatchObject({ maxFileBytes: 50 * 1024 * 1024, maxAuditEvents: 100_000 })
    await ctx.fiber.dispose()
  })

  it('creates a default library and survives folder/file/delete/restore restart', async () => {
    const first = await harness()
    expect(first.drive.library()).toMatchObject({ id: DriveLibraryId('default'), title: '资料云盘' })
    const folder = await first.drive.createFolder({
      libraryId: DriveLibraryId('default'), name: '角色资料',
    })
    const file = await first.drive.importFile({
      libraryId: DriveLibraryId('default'), parentId: folder.id,
      name: '角色分工.md', kind: 'role-assignment', tags: ['低空安全', '角色'],
      declaredMediaType: 'text/markdown; charset=utf-8',
      data: new TextEncoder().encode('# 角色分工\n负责人：张三'),
    })
    expect(first.drive.getFile(file.id)).toEqual(file)
    expect(first.drive.getVersion(file.currentVersionId)).toBeDefined()
    const content = await first.drive.readVersion(file.currentVersionId)
    expect(new TextDecoder().decode(content.data)).toContain('负责人')
    expect(first.drive.listFiles(folder.id)).toEqual([file])
    expect(first.drive.listVersions(file.id)).toHaveLength(1)
    const classified = await first.drive.updateFileMetadata({
      fileId: file.id, kind: 'safety-protocol', tags: ['协议', '低空安全'],
    })
    expect(classified).toMatchObject({ kind: 'safety-protocol', tags: ['低空安全', '协议'] })

    await first.drive.deleteFile({ fileId: file.id })
    expect(first.drive.listFiles(folder.id)).toEqual([])
    expect(first.drive.listFiles(folder.id, true)[0]?.deletedAt).toBeDefined()
    await first.drive.restoreFile({ fileId: file.id })
    await first.fiber.dispose()

    const second = await harness({ pool: first.pool, root: first.root })
    expect(second.drive.listFolders()).toHaveLength(1)
    expect(second.drive.listFiles(folder.id)).toHaveLength(1)
    expect(new TextDecoder().decode((await second.drive.readVersion(file.currentVersionId)).data))
      .toContain('张三')
    expect(second.drive.listAudit({ targetId: file.id }).map(event => event.operation))
      .toEqual(['file/restore', 'file/delete', 'file/metadata', 'file/import'])
  })

  it('replays an import idempotency key once and rejects conflicting reuse', async () => {
    const result = await harness()
    const input = {
      libraryId: DriveLibraryId('default'), name: 'replay.md', kind: 'general' as const,
      data: new TextEncoder().encode('# replay'), idempotencyKey: 'upload-replay-1',
      mutation: { actor: 'human' as const, correlationId: 'batch-one' as never },
    }
    const first = await result.drive.importFile(input)
    const replay = await result.drive.importFile({
      ...input, mutation: { actor: 'human', correlationId: 'batch-two' as never },
    })
    expect(replay).toEqual(first)
    expect(result.drive.listFiles()).toHaveLength(1)
    expect(result.drive.listVersions(first.id)).toHaveLength(1)
    const event = result.drive.listAudit({ targetId: first.id })[0]
    expect(event).toMatchObject({ operation: 'file/import', correlationId: 'batch-one' })
    expect(event).not.toHaveProperty('idempotencyKey')
    expect(event).not.toHaveProperty('requestDigest')
    const durable = (result.drive as unknown as {
      state?: { audit: Array<{ idempotencyKey?: string; requestDigest?: string }> }
    }).state?.audit.find(candidate => candidate.idempotencyKey === 'upload-replay-1')
    expect(durable?.requestDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    await expect(result.drive.importFile({ ...input, data: new TextEncoder().encode('# changed') }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await expect(result.drive.importFile({ ...input, idempotencyKey: 'bad key' }))
      .rejects.toMatchObject({ code: 'INVALID_METADATA' })

    const internal = result.drive as unknown as {
      state?: Record<string, unknown> & { files: DriveFile[] }
    }
    const savedFiles = internal.state?.files
    if (savedFiles === undefined) throw new Error('Local Drive internal state is unavailable')
    const savedState = internal.state
    internal.state = { ...savedState, files: [] }
    await expect(result.drive.importFile(input)).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    internal.state = { ...savedState, files: savedFiles }
  })

  it('versions a file immutably and deduplicates equal blob bytes', async () => {
    const result = await harness()
    const source = new TextEncoder().encode('# v1')
    const file = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: '规程.md', kind: 'operating-rule', data: source,
    })
    const repeated = await result.drive.createVersion({
      fileId: file.id, data: source, declaredMediaType: 'text/markdown', source: 'agent-publication',
    })
    expect(repeated.id).not.toBe(file.currentVersionId)
    expect(repeated.digest).toBe(result.drive.getVersion(file.currentVersionId)?.digest)
    expect(result.drive.listVersions(file.id)).toHaveLength(2)
    expect(await readFile(blobPath(result.root, repeated.digest))).toEqual(Buffer.from(source))
    expect(result.drive.listAudit({ limit: 0 })).toEqual([])
  })

  it('copies source bytes before queued publication', async () => {
    const result = await harness()
    const bytes = new TextEncoder().encode('# original')
    const pending = result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'copy.md', kind: 'general', data: bytes,
    })
    bytes.fill(0x78)
    const file = await pending
    expect(new TextDecoder().decode((await result.drive.readVersion(file.currentVersionId)).data))
      .toBe('# original')
  })

  it('serializes concurrent sibling creates and rejects the duplicate name', async () => {
    const result = await harness()
    const settled = await Promise.allSettled([
      result.drive.createFolder({ libraryId: DriveLibraryId('default'), name: '同名' }),
      result.drive.createFolder({ libraryId: DriveLibraryId('default'), name: '同名' }),
    ])
    expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(item => item.status === 'rejected')[0]).toMatchObject({
      reason: { code: 'DUPLICATE_NAME' },
    })
  })

  it('rejects folder cycles, missing parents, media changes, and mutation of deleted files', async () => {
    const result = await harness()
    const parent = await result.drive.createFolder({ libraryId: DriveLibraryId('default'), name: '父' })
    const child = await result.drive.createFolder({
      libraryId: DriveLibraryId('default'), parentId: parent.id, name: '子',
    })
    await expect(result.drive.moveFolder({ folderId: parent.id, parentId: child.id }))
      .rejects.toMatchObject({ code: 'INVALID_MOVE' })
    await expect(result.drive.createFolder({
      libraryId: DriveLibraryId('default'), parentId: DriveFolderId('missing'), name: 'x',
    })).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' })
    const file = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'a.md', kind: 'general',
      data: new TextEncoder().encode('# a'),
    })
    await expect(result.drive.createVersion({
      fileId: file.id, data: new TextEncoder().encode('%PDF-1.7'),
    })).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' })
    await result.drive.deleteFile({ fileId: file.id })
    await expect(result.drive.renameFile({ fileId: file.id, name: 'b.md' }))
      .rejects.toMatchObject({ code: 'FILE_DELETED' })
  })

  it('enforces library and audit quotas before publishing metadata', async () => {
    const quota = await harness({ maxLibraryBytes: 6 })
    const first = await quota.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'a.md', kind: 'general',
      data: new TextEncoder().encode('#1234'),
    })
    await expect(quota.drive.createVersion({ fileId: first.id, data: new TextEncoder().encode('xx') }))
      .rejects.toMatchObject({ code: 'LIBRARY_QUOTA_EXCEEDED' })

    const audit = await harness({ maxAuditEvents: 2 })
    await audit.drive.createFolder({ libraryId: DriveLibraryId('default'), name: 'one' })
    await expect(audit.drive.createFolder({ libraryId: DriveLibraryId('default'), name: 'two' }))
      .rejects.toMatchObject({ code: 'AUDIT_LIMIT_EXCEEDED' })
  })

  it('keeps in-memory metadata unchanged when durable metadata commit fails', async () => {
    const pool = new MemoryMediaPool()
    const result = await harness({ pool, backend: failingGlobalBackend(pool, 2) })
    await expect(result.drive.createFolder({ libraryId: DriveLibraryId('default'), name: '失败' }))
      .rejects.toThrow(/selected drive metadata failure/)
    expect(result.drive.listFolders()).toEqual([])
  })

  it('reclaims an orphan blob after a failed metadata commit on restart', async () => {
    const pool = new MemoryMediaPool()
    const result = await harness({ pool, backend: failingGlobalBackend(pool, 2) })
    const data = new TextEncoder().encode('# orphan')
    await expect(result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'orphan.md', kind: 'general', data,
    })).rejects.toThrow(/selected drive metadata failure/)
    const path = blobPath(result.root, digestBytes(data))
    await expect(readFile(path)).resolves.toEqual(Buffer.from(data))
    await result.fiber.dispose()

    const restarted = await harness({ pool, root: result.root })
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(restarted.drive.listFiles()).toEqual([])
  })

  it('rejects a pre-planted symlink at the content-addressed target', async () => {
    if (process.platform === 'win32') return
    const result = await harness()
    const data = new TextEncoder().encode('# protected')
    const digest = digestBytes(data)
    const target = blobPath(result.root, digest)
    const outside = join(result.root, 'outside')
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    await writeFile(outside, 'outside')
    await symlink(outside, target)
    await expect(result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'protected.md', kind: 'general', data,
    })).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    await expect(readFile(outside, 'utf8')).resolves.toBe('outside')
  })

  it('fails startup when durable metadata references a missing blob', async () => {
    const first = await harness()
    const file = await first.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'missing.md', kind: 'general',
      data: new TextEncoder().encode('# missing'),
    })
    const version = first.drive.getVersion(file.currentVersionId)!
    await rm(blobPath(first.root, version.digest))
    await first.fiber.dispose()
    await expect(harness({ pool: first.pool, root: first.root })).rejects.toMatchObject({ code: 'BLOB_MISSING' })
  })

  it('validates runtime metadata from JavaScript and preserves explicit mutation attribution', async () => {
    const result = await harness()
    await expect(result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'bad.md', kind: 'invalid' as never,
      data: new TextEncoder().encode('# bad'),
    })).rejects.toMatchObject({ code: 'INVALID_METADATA' })
    const file = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'agent.md', kind: 'general',
      data: new TextEncoder().encode('# agent'),
      mutation: { actor: 'agent', correlationId: 'correlation-explicit' as never },
    })
    const event = result.drive.listAudit({ targetId: file.id })[0]
    expect(event).toMatchObject({ actor: 'agent', correlationId: 'correlation-explicit' })
    await expect(result.drive.createVersion({
      fileId: file.id, data: new TextEncoder().encode('# invalid source'), source: 'invalid' as never,
    })).rejects.toMatchObject({ code: 'INVALID_METADATA' })
    await expect(result.drive.updateFileMetadata({ fileId: file.id, kind: 'invalid' as never }))
      .rejects.toMatchObject({ code: 'INVALID_METADATA' })
    await expect(result.drive.renameFile({
      fileId: file.id, name: 'agent-2.md', mutation: { actor: 'invalid' as never },
    })).rejects.toMatchObject({ code: 'INVALID_METADATA' })
    await expect(result.drive.renameFile({
      fileId: file.id, name: 'agent-2.md', mutation: { correlationId: '   ' as never },
    })).rejects.toMatchObject({ code: 'INVALID_METADATA' })
  })

  it('rejects unknown ids without mutating state', async () => {
    const result = await harness()
    await expect(result.drive.deleteFile({ fileId: DriveFileId('missing') }))
      .rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
    expect(result.drive.listFiles()).toEqual([])
  })
})

describe('LocalDriveStore public operation matrix', () => {
  it('renames and moves folders in both directions while preserving no-op timestamps', async () => {
    const result = await harness()
    const alpha = await result.drive.createFolder({ libraryId: DriveLibraryId('default'), name: 'Alpha' })
    const beta = await result.drive.createFolder({ libraryId: DriveLibraryId('default'), name: 'Beta' })
    const unchanged = await result.drive.renameFolder({ folderId: alpha.id, name: 'Alpha' })
    expect(unchanged.updatedAt).toBe(alpha.updatedAt)
    const renamed = await result.drive.renameFolder({ folderId: alpha.id, name: 'Gamma' })
    expect(renamed.name).toBe('Gamma')
    expect(renamed.updatedAt > alpha.updatedAt).toBe(true)
    await expect(result.drive.renameFolder({ folderId: renamed.id, name: 'Beta' }))
      .rejects.toMatchObject({ code: 'DUPLICATE_NAME' })
    const nested = await result.drive.moveFolder({ folderId: renamed.id, parentId: beta.id })
    expect(nested.parentId).toBe(beta.id)
    expect((await result.drive.moveFolder({ folderId: renamed.id, parentId: beta.id })).updatedAt)
      .toBe(nested.updatedAt)
    const rooted = await result.drive.moveFolder({ folderId: renamed.id })
    expect(rooted).not.toHaveProperty('parentId')
    await expect(result.drive.moveFolder({ folderId: beta.id, parentId: beta.id }))
      .rejects.toMatchObject({ code: 'INVALID_MOVE' })
    expect(result.drive.listFolders().map(folder => folder.name)).toEqual(['Beta', 'Gamma'])
  })

  it('renames Markdown, PDF, and DOCX files with media-safe extensions', async () => {
    const result = await harness()
    const markdown = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'a.md', kind: 'general', data: new TextEncoder().encode('# a'),
    })
    const pdf = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'a.pdf', kind: 'reference',
      data: new TextEncoder().encode('%PDF-1.7\n'),
    })
    const docx = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'a.docx', kind: 'role-assignment',
      data: zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w:d/>') }, { level: 0 }),
    })
    expect((await result.drive.renameFile({ fileId: markdown.id, name: 'b.markdown' })).name).toBe('b.markdown')
    expect((await result.drive.renameFile({ fileId: pdf.id, name: 'b.pdf' })).name).toBe('b.pdf')
    expect((await result.drive.renameFile({ fileId: docx.id, name: 'b.docx' })).name).toBe('b.docx')
    const noOp = await result.drive.renameFile({ fileId: pdf.id, name: 'b.pdf' })
    expect(noOp.name).toBe('b.pdf')
    await expect(result.drive.renameFile({ fileId: pdf.id, name: 'wrong.md' }))
      .rejects.toMatchObject({ code: 'MEDIA_TYPE_MISMATCH' })
  })

  it('moves files to a folder and root, detects conflicts, and preserves no-op state', async () => {
    const result = await harness()
    const folder = await result.drive.createFolder({ libraryId: DriveLibraryId('default'), name: 'Folder' })
    const file = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'move.md', kind: 'general', data: new TextEncoder().encode('# move'),
    })
    const nested = await result.drive.moveFile({ fileId: file.id, parentId: folder.id })
    expect(nested.parentId).toBe(folder.id)
    expect((await result.drive.moveFile({ fileId: file.id, parentId: folder.id })).updatedAt).toBe(nested.updatedAt)
    await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'move.md', kind: 'general', data: new TextEncoder().encode('# other'),
    })
    await expect(result.drive.moveFile({ fileId: file.id }))
      .rejects.toMatchObject({ code: 'DUPLICATE_NAME' })
    await result.drive.renameFile({ fileId: file.id, name: 'nested.md' })
    const rooted = await result.drive.moveFile({ fileId: file.id })
    expect(rooted).not.toHaveProperty('parentId')
  })

  it('preserves non-target files across version, metadata, and delete commits', async () => {
    const result = await harness()
    const first = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'first.md', kind: 'general',
      data: new TextEncoder().encode('# first'),
    })
    const second = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'second.md', kind: 'general',
      data: new TextEncoder().encode('# second'),
    })
    await result.drive.createVersion({ fileId: first.id, data: new TextEncoder().encode('# first v2') })
    await result.drive.updateFileMetadata({ fileId: first.id, kind: 'reference', tags: ['updated'] })
    await result.drive.deleteFile({ fileId: first.id })
    expect(result.drive.getFile(second.id)).toEqual(second)
    expect(result.drive.listFiles().map(file => file.id)).toEqual([second.id])
  })

  it('handles metadata, delete, restore, and naming idempotence and conflict paths', async () => {
    const result = await harness()
    const file = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'state.md', kind: 'general', tags: ['one'],
      data: new TextEncoder().encode('# state'),
    })
    const noMetadataChange = await result.drive.updateFileMetadata({
      fileId: file.id, kind: 'general', tags: ['one'],
    })
    expect(noMetadataChange.updatedAt).toBe(file.updatedAt)
    const deleted = await result.drive.deleteFile({ fileId: file.id })
    expect((await result.drive.deleteFile({ fileId: file.id })).deletedAt).toBe(deleted.deletedAt)
    await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'state.md', kind: 'general', data: new TextEncoder().encode('# replacement'),
    })
    await expect(result.drive.restoreFile({ fileId: file.id }))
      .rejects.toMatchObject({ code: 'DUPLICATE_NAME' })
    await result.drive.renameFile({
      fileId: result.drive.listFiles().find(candidate => candidate.name === 'state.md')!.id,
      name: 'replacement.md',
    })
    const restored = await result.drive.restoreFile({ fileId: file.id })
    expect(restored).not.toHaveProperty('deletedAt')
    expect((await result.drive.restoreFile({ fileId: file.id })).updatedAt).toBe(restored.updatedAt)
  })

  it('permanently removes selected files, versions, and unreferenced blobs', async () => {
    const result = await harness()
    const file = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'purge.md', kind: 'general', data: new TextEncoder().encode('# purge'),
    })
    const version = result.drive.getVersion(file.currentVersionId)
    if (version === undefined) throw new Error('purge fixture version is missing')
    expect(await readFile(blobPath(result.root, version.digest))).toBeDefined()
    await expect(result.drive.purgeFiles({ fileIds: [file.id] })).resolves.toBe(1)
    expect(result.drive.getFile(file.id)).toBeUndefined()
    expect(result.drive.getVersion(version.id)).toBeUndefined()
    await expect(readFile(blobPath(result.root, version.digest))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.drive.listAudit({ targetId: file.id })[0]?.operation).toBe('file/purge')
  })

  it('validates library/version lookups, bounded audit reads, and read cancellation', async () => {
    const result = await harness()
    await expect(result.drive.createFolder({ libraryId: DriveLibraryId('unknown'), name: 'x' }))
      .rejects.toMatchObject({ code: 'LIBRARY_NOT_FOUND' })
    expect(result.drive.getFile(DriveFileId('unknown'))).toBeUndefined()
    expect(result.drive.getVersion('unknown' as never)).toBeUndefined()
    expect(() => result.drive.listVersions(DriveFileId('unknown')))
      .toThrow(expect.objectContaining({ code: 'FILE_NOT_FOUND' }))
    await expect(result.drive.readVersion('unknown' as never))
      .rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' })
    const file = await result.drive.importFile({
      libraryId: DriveLibraryId('default'), name: 'abort.md', kind: 'general', data: new TextEncoder().encode('# abort'),
    })
    const controller = new AbortController()
    controller.abort(new Error('stop read'))
    await expect(result.drive.readVersion(file.currentVersionId, controller.signal)).rejects.toThrow('stop read')
    expect(result.drive.listAudit({ limit: 999_999 }).length).toBeLessThanOrEqual(result.drive.limits.maxAuditEvents)
  })
})
