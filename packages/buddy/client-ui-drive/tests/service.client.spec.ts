import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { DriveFileId, DriveLibraryId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import type { DriveBaseline, DriveFile } from '@sospink/dsh-buddy-api-drive/types'
import { BuddyDriveClient } from '../src/client/service.ts'
import { DRIVE_UPLOAD_QUEUE_MAX_ITEMS, type UploadProgress, type UploadTransport } from '../src/client/upload.ts'

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

afterEach(() => { vi.restoreAllMocks() })

interface ControlledUpload {
  readonly input: Parameters<UploadTransport>[0]
  readonly progress: (value: UploadProgress) => void
  readonly resolve: (value: DriveFile) => void
  readonly reject: (reason: unknown) => void
  readonly abort: ReturnType<typeof vi.fn>
}

function idFactory(): () => string {
  let value = 0
  return () => { value += 1; return `upload-${String(value)}` }
}

function controlledTransport(): { readonly calls: ControlledUpload[]; readonly start: UploadTransport } {
  const calls: ControlledUpload[] = []
  return {
    calls,
    start(input, progress) {
      let resolve!: (value: DriveFile) => void
      let reject!: (reason: unknown) => void
      const promise = new Promise<DriveFile>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })
      const abort = vi.fn()
      calls.push({ input, progress, resolve, reject, abort })
      return { promise, abort }
    },
  }
}

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

  it('bounds the queue before starting requests and treats empty selection as a no-op', () => {
    const transport = controlledTransport()
    const client = new BuddyDriveClient(new Context(), remote() as never, { uploadTransport: transport.start, createUploadId: idFactory() })
    expect(client.enqueueUploads([])).toEqual([])
    const tooMany = Array.from({ length: DRIVE_UPLOAD_QUEUE_MAX_ITEMS + 1 }, (_, index) => ({
      file: new File(['x'], `file-${String(index)}.md`), kind: 'general' as const,
    }))
    expect(() => client.enqueueUploads(tooMany)).toThrow('at most 100 items')
    expect(transport.calls).toHaveLength(0)
    expect(client.source.getSnapshot().uploadQueue).toEqual([])
  })

  it('runs at most two uploads, publishes progress, continues after failure, and refreshes once', async () => {
    const api = remote()
    const transport = controlledTransport()
    const client = new BuddyDriveClient(new Context(), api as never, { uploadTransport: transport.start, createUploadId: idFactory() })
    const files = ['one.md', 'two.md', 'three.md'].map(name => new File(['abc'], name, { type: 'text/markdown' }))
    const ids = client.enqueueUploads(files.map(file => ({ file, kind: 'reference' })))
    expect(ids).toEqual(['upload-1', 'upload-2', 'upload-3'])
    expect(transport.calls.map(call => call.input.file.name)).toEqual(['one.md', 'two.md'])
    transport.calls[0]?.progress({ loaded: 2, total: 3 })
    expect(client.source.getSnapshot().uploadQueue[0]).toMatchObject({ status: 'uploading', loaded: 2, total: 3 })
    transport.calls[0]?.resolve({ ...file, id: DriveFileId('one') })
    await vi.waitFor(() => { expect(transport.calls).toHaveLength(3) })
    transport.calls[1]?.reject(new Error('second failed'))
    transport.calls[2]?.resolve({ ...file, id: DriveFileId('three') })
    await vi.waitFor(() => { expect(client.source.getSnapshot().uploading).toBe(false) })
    expect(client.source.getSnapshot().uploadQueue.map(item => [item.status, item.error])).toEqual([
      ['succeeded', undefined], ['failed', 'second failed'], ['succeeded', undefined],
    ])
    await vi.waitFor(() => { expect(api.baseline).toHaveBeenCalledOnce() })
  })

  it('cancels queued and active rows, ignores late completions, retries, and clears only terminal clean rows', async () => {
    const transport = controlledTransport()
    const client = new BuddyDriveClient(new Context(), remote() as never, { uploadTransport: transport.start, createUploadId: idFactory() })
    const ids = client.enqueueUploads(['one.md', 'two.md', 'three.md'].map(name => ({
      file: new File(['x'], name), kind: 'general' as const,
    })))
    client.cancelUpload(ids[2] as string)
    expect(client.source.getSnapshot().uploadQueue[2]?.status).toBe('cancelled')
    client.cancelUpload(ids[0] as string)
    expect(transport.calls[0]?.abort).toHaveBeenCalledOnce()
    expect(client.source.getSnapshot().uploadQueue[0]?.status).toBe('cancelled')
    transport.calls[0]?.progress({ loaded: 1, total: 1 })
    transport.calls[0]?.resolve({ ...file, id: DriveFileId('late') })
    await Promise.resolve()
    expect(client.source.getSnapshot().uploadQueue[0]?.status).toBe('cancelled')

    const staleFailureTransport = controlledTransport()
    const staleFailure = new BuddyDriveClient(new Context(), remote() as never, {
      uploadTransport: staleFailureTransport.start, createUploadId: idFactory(),
    })
    const staleId = staleFailure.enqueueUploads([{ file: new File(['x'], 'stale.md'), kind: 'general' }])[0] as string
    staleFailure.cancelUpload(staleId)
    staleFailureTransport.calls[0]?.reject(new Error('late failure'))
    await Promise.resolve()
    expect(staleFailure.source.getSnapshot().uploadQueue[0]?.status).toBe('cancelled')

    client.retryUpload(ids[0] as string)
    await vi.waitFor(() => { expect(transport.calls).toHaveLength(3) })
    expect(transport.calls[0]?.input.uploadId).toBe(ids[0])
    expect(transport.calls[2]?.input.uploadId).toBe(ids[0])
    transport.calls[1]?.reject('string failure')
    await vi.waitFor(() => { expect(client.source.getSnapshot().uploadQueue[1]?.status).toBe('failed') })
    client.retryUpload(ids[1] as string)
    await vi.waitFor(() => { expect(transport.calls).toHaveLength(4) })
    transport.calls[2]?.resolve({ ...file, id: DriveFileId('retry-one') })
    transport.calls[3]?.resolve({ ...file, id: DriveFileId('retry-two') })
    await vi.waitFor(() => { expect(client.source.getSnapshot().uploading).toBe(false) })
    client.clearFinishedUploads()
    expect(client.source.getSnapshot().uploadQueue).toEqual([])
    client.clearFinishedUploads()
    client.cancelUpload('missing')
    client.retryUpload('missing')
  })

  it('keeps committed success when refresh fails and contains synchronous transport failure', async () => {
    const api = remote({ baseline: vi.fn(() => failed('refresh-failed')) })
    const transport = controlledTransport()
    const client = new BuddyDriveClient(new Context(), api as never, { uploadTransport: transport.start, createUploadId: idFactory() })
    const first = client.enqueueUploads([{ file: new File(['x'], 'one.md'), kind: 'general' }])[0] as string
    transport.calls[0]?.resolve({ ...file, id: DriveFileId('committed') })
    await vi.waitFor(() => { expect(client.source.getSnapshot().error).toContain('refresh-failed') })
    expect(client.source.getSnapshot().uploadQueue[0]).toMatchObject({ status: 'succeeded', fileId: 'committed' })
    client.retryUpload(first)
    expect(transport.calls).toHaveLength(1)

    const stringTransport = controlledTransport()
    const stringClient = new BuddyDriveClient(new Context(), remote() as never, {
      uploadTransport: stringTransport.start, createUploadId: idFactory(),
    })
    vi.spyOn(stringClient, 'refresh').mockRejectedValue('string refresh failure')
    stringClient.enqueueUploads([{ file: new File(['x'], 'string.md'), kind: 'general' }])
    stringTransport.calls[0]?.resolve({ ...file, id: DriveFileId('string') })
    await vi.waitFor(() => { expect(stringClient.source.getSnapshot().error).toBe('string refresh failure') })

    const throwing = new BuddyDriveClient(new Context(), remote() as never, {
      createUploadId: idFactory(),
      uploadTransport: () => { throw new Error('transport constructor failed') },
    })
    throwing.enqueueUploads([{ file: new File(['x'], 'bad.md'), kind: 'general' }])
    await vi.waitFor(() => { expect(throwing.source.getSnapshot().uploadQueue[0]).toMatchObject({
      status: 'failed', error: 'transport constructor failed',
    }) })
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
