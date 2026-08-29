import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  blobFileOperations,
  blobPath,
  digestBytes,
  publishBlob,
  readBlob,
  reconcileBlobs,
  type BlobFileOperations,
} from '../src/blob.ts'

let roots: string[] = []

function operations(overrides: Partial<BlobFileOperations>): BlobFileOperations {
  return { ...blobFileOperations, ...overrides }
}

function errno(code: string, message = code): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code })
}
afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  roots = []
})

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'buddy-drive-blob-'))
  roots.push(path)
  return path
}

describe('Buddy Drive content-addressed blobs', () => {
  it('derives deterministic paths and rejects malformed digests', async () => {
    const base = await root()
    const digest = digestBytes(new TextEncoder().encode('hello'))
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(blobPath(base, digest)).toBe(join(base, 'blobs', 'sha256', digest.slice(7, 9), digest.slice(7)))
    expect(() => blobPath(base, 'sha256:bad'))
      .toThrow(expect.objectContaining({ code: 'STORAGE_INCONSISTENT' }))
  })

  it('publishes owner-only files, reuses a valid object, and handles concurrent equal writes', async () => {
    const base = await root()
    const data = new TextEncoder().encode('same')
    const digest = digestBytes(data)
    const [first, second] = await Promise.all([
      publishBlob(base, digest, data),
      publishBlob(base, digest, data),
    ])
    expect(first).toBe(second)
    expect(await readFile(first)).toEqual(Buffer.from(data))
    if (process.platform !== 'win32') {
      expect((await stat(first)).mode & 0o777).toBe(0o600)
      expect((await stat(dirname(first))).mode & 0o777).toBe(0o700)
    }
    await expect(publishBlob(base, digest, data)).resolves.toBe(first)
  })

  it('rejects corrupt and symbolic-link existing objects', async () => {
    const base = await root()
    const data = new TextEncoder().encode('expected')
    const digest = digestBytes(data)
    const target = blobPath(base, digest)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    await writeFile(target, 'wrong', { mode: 0o600 })
    await expect(publishBlob(base, digest, data)).rejects.toMatchObject({ code: 'BLOB_CORRUPT' })
    await rm(target)
    if (process.platform !== 'win32') {
      const outside = join(base, 'outside')
      await writeFile(outside, 'outside')
      await symlink(outside, target)
      await expect(publishBlob(base, digest, data)).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    }
  })

  it('does not apply POSIX ownership bits under the Windows policy', async () => {
    const base = await root()
    const data = new TextEncoder().encode('windows-policy')
    const digest = digestBytes(data)
    const windows = operations({ platform: 'win32', uid: undefined })
    await expect(publishBlob(base, digest, data, windows)).resolves.toContain(digest.slice(7))
  })

  it('rejects an unsafe root component and non-owner-only POSIX directory', async () => {
    const base = await root()
    const data = new TextEncoder().encode('x')
    const digest = digestBytes(data)
    const fileRoot = join(base, 'file-root')
    await writeFile(fileRoot, 'not a directory')
    await expect(publishBlob(fileRoot, digest, data)).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    if (process.platform !== 'win32') {
      const openRoot = join(base, 'open-root')
      await mkdir(openRoot, { mode: 0o777 })
      await chmod(openRoot, 0o777)
      await expect(publishBlob(openRoot, digest, data)).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    }
  })

  it('verifies reads, detects corruption and missing objects, and honors cancellation', async () => {
    const base = await root()
    const data = new TextEncoder().encode('content')
    const digest = digestBytes(data)
    const target = await publishBlob(base, digest, data)
    await expect(readBlob(base, digest, data.byteLength)).resolves.toEqual(Buffer.from(data))
    await expect(readBlob(base, digest, data.byteLength, new AbortController().signal))
      .resolves.toEqual(Buffer.from(data))
    await expect(readBlob(base, digest, data.byteLength + 1)).rejects.toMatchObject({ code: 'BLOB_CORRUPT' })
    await writeFile(target, 'changed')
    await expect(readBlob(base, digest, data.byteLength)).rejects.toMatchObject({ code: 'BLOB_CORRUPT' })
    await rm(target)
    await expect(readBlob(base, digest, data.byteLength)).rejects.toMatchObject({ code: 'BLOB_MISSING' })
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(readBlob(base, digest, data.byteLength, controller.signal)).rejects.toThrow('cancelled')
  })

  it('propagates unrelated directory setup errors and rejects mocked non-directories', async () => {
    const base = await root()
    const data = new TextEncoder().encode('x')
    const digest = digestBytes(data)
    const denied = operations({ mkdir: vi.fn(async () => { throw errno('EACCES') }) })
    await expect(publishBlob(base, digest, data, denied)).rejects.toMatchObject({ code: 'EACCES' })

    const notDirectory = operations({
      mkdir: vi.fn(async () => undefined),
      lstat: vi.fn(async () => ({
        uid: 0, mode: 0, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false,
      })),
    })
    await expect(publishBlob(base, digest, data, notDirectory))
      .rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
  })

  it('propagates unexpected existing-object lookup failures', async () => {
    const base = await root()
    const data = new TextEncoder().encode('x')
    const digest = digestBytes(data)
    let calls = 0
    const ops = operations({
      lstat: vi.fn(async (path: string) => {
        calls += 1
        if (calls === 5) throw errno('EIO')
        return blobFileOperations.lstat(path)
      }),
    })
    await expect(publishBlob(base, digest, data, ops)).rejects.toMatchObject({ code: 'EIO' })
  })

  it('closes and removes the temporary object when write or sync fails', async () => {
    const base = await root()
    const data = new TextEncoder().encode('x')
    const digest = digestBytes(data)
    const close = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    const writeFailure = operations({
      open: vi.fn(async () => ({
        writeFile: async () => { throw errno('ENOSPC') }, sync: async () => undefined, close,
      })),
      rm: remove,
    })
    await expect(publishBlob(base, digest, data, writeFailure)).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(close).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()

    const syncFailure = operations({
      open: vi.fn(async () => ({
        writeFile: async () => undefined, sync: async () => { throw errno('EIO') }, close,
      })),
      rm: remove,
    })
    await expect(publishBlob(base, digest, data, syncFailure)).rejects.toMatchObject({ code: 'EIO' })
  })

  it('revalidates an EEXIST link race and propagates other link failures after cleanup', async () => {
    const base = await root()
    const data = new TextEncoder().encode('race')
    const digest = digestBytes(data)
    const target = blobPath(base, digest)
    const ordinaryOpen = blobFileOperations.open
    let targetLookups = 0
    const race = operations({
      lstat: vi.fn(async (path: string) => {
        if (path === target) {
          targetLookups += 1
          if (targetLookups === 1) throw errno('ENOENT')
        }
        return blobFileOperations.lstat(path)
      }),
      link: vi.fn(async (_temp: string, final: string) => {
        await writeFile(final, data, { mode: 0o600 })
        throw errno('EEXIST')
      }),
      open: ordinaryOpen,
    })
    await expect(publishBlob(base, digest, data, race)).resolves.toBe(target)

    const cleanup = vi.fn(blobFileOperations.rm)
    const linkFailure = operations({ link: vi.fn(async () => { throw errno('EPERM') }), rm: cleanup })
    await expect(publishBlob(await root(), digest, data, linkFailure)).rejects.toMatchObject({ code: 'EPERM' })
    expect(cleanup).toHaveBeenCalled()
  })

  it('distinguishes read lstat/read failures and rejects mocked non-regular objects', async () => {
    const base = await root()
    const data = new TextEncoder().encode('read')
    const digest = digestBytes(data)
    const target = await publishBlob(base, digest, data)
    const lstatFailure = operations({ lstat: vi.fn(async () => { throw errno('EACCES') }) })
    await expect(readBlob(base, digest, data.length, undefined, lstatFailure))
      .rejects.toMatchObject({ code: 'EACCES' })
    const nonFile = operations({
      lstat: vi.fn(async () => ({
        uid: 0, mode: 0, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
      })),
    })
    await expect(readBlob(base, digest, data.length, undefined, nonFile))
      .rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    const vanished = operations({
      readFile: vi.fn(async () => { throw errno('ENOENT') }),
    })
    await expect(readBlob(base, digest, data.length, undefined, vanished))
      .rejects.toMatchObject({ code: 'BLOB_MISSING' })
    const denied = operations({ readFile: vi.fn(async () => { throw errno('EACCES') }) })
    await expect(readBlob(base, digest, data.length, undefined, denied))
      .rejects.toMatchObject({ code: 'EACCES' })
    expect(target).toContain(digest.slice(7))
  })

  it('removes temporary and orphan objects while retaining referenced objects', async () => {
    const base = await root()
    const keptData = new TextEncoder().encode('kept')
    const orphanData = new TextEncoder().encode('orphan')
    const kept = digestBytes(keptData)
    const orphan = digestBytes(orphanData)
    await publishBlob(base, kept, keptData)
    const orphanPath = await publishBlob(base, orphan, orphanData)
    const temp = join(dirname(orphanPath), '.partial.tmp')
    await writeFile(temp, 'temp')
    await reconcileBlobs(base, new Map([[kept, keptData.byteLength]]))
    await expect(readFile(blobPath(base, kept))).resolves.toEqual(Buffer.from(keptData))
    await expect(readFile(orphanPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(temp)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unexpected prefix and object entries during reconciliation', async () => {
    const base = await root()
    const objectRoot = join(base, 'blobs', 'sha256')
    await mkdir(objectRoot, { recursive: true, mode: 0o700 })
    await writeFile(join(objectRoot, 'unexpected'), 'x')
    await expect(reconcileBlobs(base, new Map())).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    await rm(join(objectRoot, 'unexpected'))

    const prefix = join(objectRoot, 'aa')
    await mkdir(prefix, { mode: 0o700 })
    await mkdir(join(prefix, 'directory-object'))
    await expect(reconcileBlobs(base, new Map())).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
    await rm(join(prefix, 'directory-object'), { recursive: true })
    await writeFile(join(prefix, 'not-a-digest'), 'x')
    await expect(reconcileBlobs(base, new Map())).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
  })

  it('rejects a symlinked object prefix on POSIX', async () => {
    if (process.platform === 'win32') return
    const base = await root()
    const objectRoot = join(base, 'blobs', 'sha256')
    const outside = join(base, 'outside-dir')
    await mkdir(objectRoot, { recursive: true, mode: 0o700 })
    await mkdir(outside)
    await symlink(outside, join(objectRoot, 'aa'))
    await expect(reconcileBlobs(base, new Map())).rejects.toMatchObject({ code: 'STORAGE_INCONSISTENT' })
  })
})
