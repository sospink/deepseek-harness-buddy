/** Real Loader composition proof for Buddy Drive metadata and blob persistence. */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Storage from '@deepseek-ai/dsh-storage'
import { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { DriveLibraryId } from '@sospink/dsh-buddy-drive'
import LocalDriveStore from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class MemoryStoragePlugin extends Storage {
  static pool = new MemoryMediaPool()

  constructor(ctx: Context) {
    super(ctx)
    const backend = new MemoryStorageBackend(MemoryStoragePlugin.pool)
    ctx.effect(() => {
      const unregister = this.backend.register('memory', backend)
      return async () => {
        unregister()
        await backend.close()
      }
    })
    ctx.provide(storageBackendServiceKey('memory'), backend)
  }
}

class MemoryDomainPlugin extends DomainFacility {
  static inject = ['storage', storageBackendServiceKey('memory')]

  constructor(ctx: Context) {
    super(ctx, { backend: 'memory', routes: {} })
    ctx.effect(() => ctx.storage.mount('domain', this))
    ctx.provide('storageDomain', this)
  }
}

async function loadComposition(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'buddy-drive-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@test/buddy-storage'",
    "- name: '@test/buddy-domain'",
    "- name: '@sospink/dsh-buddy-drive-local'",
    '  config:',
    `    root: ${JSON.stringify(join(root, 'drive'))}`,
    '    maxFileBytes: 1048576',
    '    maxLibraryBytes: 4194304',
    '    maxDocxEntries: 100',
    '    maxDocxExpandedBytes: 4194304',
    '    maxDocxCompressionRatio: 100',
    '    maxAuditEvents: 1000',
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@test/buddy-storage', MemoryStoragePlugin],
    ['@test/buddy-domain', MemoryDomainPlugin],
    ['@sospink/dsh-buddy-drive-local', LocalDriveStore],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

describe('Buddy Drive real Loader composition through cordis.yml', () => {
  it('loads the shipped plugin form and persists a document through the composed service', async () => {
    const loaded = await loadComposition()
    const unloaded = [...loaded.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const folder = await loaded.drive.createFolder({
      libraryId: DriveLibraryId('default'), name: 'Loader 资料',
    })
    const file = await loaded.drive.importFile({
      libraryId: DriveLibraryId('default'), parentId: folder.id,
      name: '角色.md', kind: 'role-assignment', data: new TextEncoder().encode('# Loader'),
    })
    expect(new TextDecoder().decode((await loaded.drive.readVersion(file.currentVersionId)).data))
      .toBe('# Loader')
    const updated = await loaded.drive.updateFileMetadata({
      fileId: file.id, kind: 'safety-protocol', tags: ['Loader'],
    })
    expect(updated.kind).toBe('safety-protocol')
    await loaded.drive.deleteFile({ fileId: file.id })
    expect(loaded.drive.listFiles(folder.id)).toEqual([])
    await loaded.drive.restoreFile({ fileId: file.id })
    expect(loaded.drive.listFiles(folder.id)).toHaveLength(1)

    await loaded.fiber.dispose()
    context = undefined
    expect(loaded.get('drive')).toBeUndefined()
  })
})
