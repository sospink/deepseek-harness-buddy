import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { DriveFileId, DriveLibraryId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import type { DriveBaseline, DriveFile } from '@sospink/dsh-buddy-api-drive/types'
import { BuddyDriveClient } from '../src/client/service.ts'

const now = '2026-08-29T00:00:00.000Z'
const library = { id: DriveLibraryId('default'), title: 'Drive', createdAt: now, updatedAt: now }
const file: DriveFile = {
  id: DriveFileId('file'), libraryId: library.id, name: 'file.md', kind: 'general',
  mediaType: 'text/markdown', currentVersionId: DriveVersionId('version'), tags: [],
  createdAt: now, updatedAt: now,
}
const baseline: DriveBaseline = { library, folders: [], files: [file] }

function ok<T>(value: T): Promise<RemoteResult<T>> { return Promise.resolve({ ok: true, value }) }
function failed<T>(code = 'failed'): Promise<RemoteResult<T>> {
  return Promise.resolve({ ok: false, error: { code, message: 'failure', details: {} } })
}

function remote(overrides: Record<string, unknown> = {}) {
  return {
    baseline: vi.fn(() => ok(baseline)),
    createFolder: vi.fn(() => ok({ folder: {
      id: 'folder', libraryId: library.id, name: 'Folder', createdAt: now, updatedAt: now,
    } })),
    updateFileMetadata: vi.fn(() => ok({ file })),
    deleteFile: vi.fn(() => ok({ file: { ...file, deletedAt: now } })),
    restoreFile: vi.fn(() => ok({ file })),
    ...overrides,
  }
}

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe('BuddyDriveClient', () => {
  it('opens, replaces, reports failures, closes, and restores focus', async () => {
    const client = new BuddyDriveClient(new Context(), remote() as never)
    const focus = vi.fn()
    client.open({ focus } as unknown as HTMLElement)
    expect(client.source.getSnapshot().open).toBe(true)
    client.replace(baseline)
    expect(client.source.getSnapshot()).toMatchObject({ state: 'ready', data: baseline })
    client.failed('broken')
    expect(client.source.getSnapshot()).toMatchObject({ state: 'failed', error: 'broken' })
    client.close()
    await Promise.resolve()
    expect(client.source.getSnapshot().open).toBe(false)
    expect(focus).toHaveBeenCalledOnce()
  })

  it('runs refresh and all metadata commands, including optional parents', async () => {
    const api = remote()
    const client = new BuddyDriveClient(new Context(), api as never)
    await client.refresh()
    await client.createFolder('Root')
    await client.createFolder('Child', 'parent' as never)
    await client.updateMetadata(file.id, 'reference', ['tag'])
    await client.deleteFile(file.id)
    await client.restoreFile(file.id)
    expect(api.createFolder).toHaveBeenNthCalledWith(1, { name: 'Root' })
    expect(api.createFolder).toHaveBeenNthCalledWith(2, { name: 'Child', parentId: 'parent' })
    expect(api.updateFileMetadata).toHaveBeenCalledWith({ fileId: file.id, kind: 'reference', tags: ['tag'] })
    expect(client.source.getSnapshot().state).toBe('ready')
  })

  it.each(['baseline', 'createFolder', 'updateFileMetadata', 'deleteFile', 'restoreFile'])(
    'rejects a Remote business failure from %s',
    async (method) => {
      const api = remote({ [method]: vi.fn(() => failed()) })
      const client = new BuddyDriveClient(new Context(), api as never)
      const operation: Record<string, () => Promise<unknown>> = {
        baseline: () => client.refresh(),
        createFolder: () => client.createFolder('x'),
        updateFileMetadata: () => client.updateMetadata(file.id, 'general', []),
        deleteFile: () => client.deleteFile(file.id),
        restoreFile: () => client.restoreFile(file.id),
      }
      await expect(operation[method]?.()).rejects.toThrow('failed: failure')
    },
  )

  it('uploads raw bytes, includes optional query values, refreshes, and resets uploading', async () => {
    const api = remote()
    const client = new BuddyDriveClient(new Context(), api as never)
    const response = new Response(JSON.stringify({ kind: 'file', file }), {
      status: 201, headers: { 'content-type': 'application/json' },
    })
    globalThis.fetch = vi.fn(async () => response)
    const uploaded = await client.upload({
      file: new File(['# file'], 'role file.md', { type: 'text/markdown' }),
      kind: 'role-assignment', parentId: 'parent' as never, tags: ['a', 'b'],
    })
    expect(uploaded).toEqual(file)
    const fetchMock = vi.mocked(globalThis.fetch)
    const target = fetchMock.mock.calls[0]?.[0]
    const url = typeof target === 'string' ? target : target instanceof URL ? target.href : target?.url
    expect(url).toContain('name=role+file.md')
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(File)
    expect(client.source.getSnapshot().uploading).toBe(false)
    expect(api.baseline).toHaveBeenCalled()
  })

  it('surfaces upload HTTP and malformed-response failures and resets uploading', async () => {
    const client = new BuddyDriveClient(new Context(), remote() as never)
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'bad', message: 'upload rejected' },
    }), { status: 400 }))
    await expect(client.upload({ file: new File(['x'], 'x.md'), kind: 'general' }))
      .rejects.toThrow('bad: upload rejected')
    expect(client.source.getSnapshot().uploading).toBe(false)

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: {} }), { status: 400 }))
    await expect(client.upload({ file: new File(['x'], 'x.md'), kind: 'general' }))
      .rejects.toThrow('upload-failed: Upload failed.')

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ kind: 'other' }), { status: 201 }))
    await expect(client.upload({ file: new File(['x'], 'x.md'), kind: 'general' }))
      .rejects.toThrow('invalid response')
  })

  it('formats immutable content URLs', () => {
    const client = new BuddyDriveClient(new Context(), remote() as never)
    expect(client.contentUrl(file)).toBe('/api/buddy-drive/content/version')
  })
})

describe('createBuddyDriveStream', () => {
  function generation() {
    return { getSnapshot: () => ({ id: 1 }), subscribe: () => () => {} }
  }

  it('applies baseline and snapshot frames and becomes quiescent on dispose', async () => {
    const { RemoteStream } = await import('@deepseek-ai/dsh-api-gateway/client')
    const client = new BuddyDriveClient(new Context(), remote() as never)
    const changed: DriveBaseline = { ...baseline, files: [{ ...file, name: 'changed.md' }] }
    const remoteOwner = {
      drive: {
        async * follow(signal: AbortSignal) {
          yield { type: 'baseline' as const, value: baseline }
          yield { type: 'snapshot' as const, value: changed }
          await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
        },
      },
      $stream<Item>(options: ConstructorParameters<typeof RemoteStream<Item>>[1]) {
        return new RemoteStream<Item>({ generation: generation() } as never, options)
      },
    }
    const { createBuddyDriveStream } = await import('../src/client/service.ts')
    const stream = createBuddyDriveStream(remoteOwner as never, client)
    stream.start()
    await vi.waitFor(() => { expect(client.source.getSnapshot().data).toEqual(changed) })
    await stream.dispose()
  })

  it('publishes an opener failure and classifies normal endings before or after baseline', async () => {
    const { RemoteStream } = await import('@deepseek-ai/dsh-api-gateway/client')
    const { createBuddyDriveStream } = await import('../src/client/service.ts')
    for (const mode of ['throw', 'empty', 'baseline'] as const) {
      const client = new BuddyDriveClient(new Context(), remote() as never)
      const remoteOwner = {
        drive: {
          async * follow() {
            if (mode === 'throw') throw new Error('stream failed')
            if (mode === 'baseline') yield { type: 'baseline' as const, value: baseline }
          },
        },
        $stream<Item>(options: ConstructorParameters<typeof RemoteStream<Item>>[1]) {
          return new RemoteStream<Item>({ generation: generation() } as never, options)
        },
      }
      const stream = createBuddyDriveStream(remoteOwner as never, client)
      stream.start()
      await vi.waitFor(() => { expect(client.source.getSnapshot().state).toBe('failed') })
      const message = client.source.getSnapshot().error
      expect(message).toContain(mode === 'throw'
        ? 'stream failed'
        : mode === 'baseline' ? 'after its baseline' : 'before its baseline')
      await stream.dispose()
    }
  })
})
