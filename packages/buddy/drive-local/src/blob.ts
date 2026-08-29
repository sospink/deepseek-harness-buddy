/** Content-addressed local blob publication and verification. */

import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import type { Dirent } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { link, lstat, mkdir, open, opendir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DriveError } from '@sospink/dsh-buddy-drive'
import type { DriveDigest } from '@sospink/dsh-buddy-drive'

/** Minimal writable file handle used by content publication. */
export type BlobFileHandle = Pick<FileHandle, 'writeFile' | 'sync' | 'close'>

/** Stat fields the provider actually consumes. */
export interface BlobFileStat {
  readonly uid: number
  readonly mode: number
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

/** Async directory iteration used by startup reconciliation. */
export interface BlobDirectory extends AsyncIterable<Dirent> {}

/** Injectable filesystem boundary for deterministic failure-path tests. */
export interface BlobFileOperations {
  readonly link: (existingPath: string, newPath: string) => Promise<void>
  readonly lstat: (path: string) => Promise<BlobFileStat>
  readonly mkdir: (path: string, options: { recursive: true; mode: number }) => Promise<string | undefined>
  readonly open: (path: string, flags: string | number, mode?: number) => Promise<BlobFileHandle>
  readonly opendir: (path: string) => Promise<BlobDirectory>
  readonly readFile: (path: string, options?: { signal?: AbortSignal }) => Promise<Buffer>
  readonly rm: (path: string, options: { force: boolean; recursive?: boolean }) => Promise<void>
  readonly platform: NodeJS.Platform
  readonly uid: number | undefined
}

/** Production filesystem operations. */
export const blobFileOperations: BlobFileOperations = {
  link: (existingPath, newPath) => link(existingPath, newPath),
  lstat: path => lstat(path),
  mkdir: (path, options) => mkdir(path, options),
  open: (path, flags, mode) => open(path, flags, mode),
  opendir: path => opendir(path),
  readFile: (path, options) => readFile(path, options),
  rm: (path, options) => rm(path, options),
  platform: process.platform,
  uid: process.getuid?.(),
}

/** SHA-256 digest over one source document. */
export function digestBytes(data: Uint8Array): DriveDigest {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`
}

function digestHex(digest: DriveDigest): string {
  const match = /^sha256:([0-9a-f]{64})$/u.exec(digest)
  if (match?.[1] === undefined) throw new DriveError('STORAGE_INCONSISTENT', 'Drive digest is malformed.')
  return match[1]
}

/** Absolute object path for one digest under a provider-owned root. */
export function blobPath(root: string, digest: DriveDigest): string {
  const hex = digestHex(digest)
  return join(root, 'blobs', 'sha256', hex.slice(0, 2), hex)
}

async function syncDirectory(path: string, ops: BlobFileOperations): Promise<void> {
  const handle = await ops.open(path, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
}

async function ensurePrivateDirectory(path: string, ops: BlobFileOperations): Promise<void> {
  try {
    await ops.mkdir(path, { recursive: true, mode: 0o700 })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST' || (cause as NodeJS.ErrnoException).code === 'ENOTDIR') {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob path contains a non-directory component.', { cause })
    }
    throw cause
  }
  const info = await ops.lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob path contains a non-directory or symbolic-link component.')
  }
  if (ops.platform !== 'win32') {
    if (info.uid !== ops.uid || (info.mode & 0o077) !== 0) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob directories must be owner-only.')
    }
  }
}

async function readExistingObject(
  target: string, digest: DriveDigest, bytes: number, ops: BlobFileOperations,
): Promise<Buffer | undefined> {
  let info
  try { info = await ops.lstat(target) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob object path is not a regular file.')
  }
  const existing = await ops.readFile(target)
  if (existing.byteLength !== bytes || digestBytes(existing) !== digest) {
    throw new DriveError('BLOB_CORRUPT', 'Existing content-addressed object does not match its digest.')
  }
  return existing
}

/** Publish bytes once; an existing digest object is verified before reuse. */
export async function publishBlob(
  root: string, digest: DriveDigest, data: Uint8Array, ops: BlobFileOperations = blobFileOperations,
): Promise<string> {
  const target = blobPath(root, digest)
  const objectRoot = join(root, 'blobs', 'sha256')
  const parent = dirname(target)
  await ensurePrivateDirectory(root, ops)
  await ensurePrivateDirectory(join(root, 'blobs'), ops)
  await ensurePrivateDirectory(objectRoot, ops)
  await ensurePrivateDirectory(parent, ops)
  if (await readExistingObject(target, digest, data.byteLength, ops) !== undefined) return target
  const temp = join(parent, `.${digestHex(digest)}.${randomBytes(8).toString('hex')}.tmp`)
  const handle = await ops.open(temp, 'wx', 0o600)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } catch (error) {
    await handle.close()
    await ops.rm(temp, { force: true })
    throw error
  }
  await handle.close()
  try {
    await ops.link(temp, target)
    await ops.rm(temp, { force: true })
    await syncDirectory(parent, ops)
  } catch (error) {
    await ops.rm(temp, { force: true })
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      await readExistingObject(target, digest, data.byteLength, ops)
      return target
    }
    throw error
  }
  return target
}

/** Read and verify one content-addressed object. */
export async function readBlob(
  root: string, digest: DriveDigest, bytes: number, signal?: AbortSignal,
  ops: BlobFileOperations = blobFileOperations,
): Promise<Uint8Array> {
  signal?.throwIfAborted()
  const path = blobPath(root, digest)
  const info = await ops.lstat(path).catch((cause: unknown) => {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DriveError('BLOB_MISSING', 'Drive content object is missing.', { cause })
    }
    throw cause
  })
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob object path is not a regular file.')
  }
  let data: Buffer
  try {
    data = await ops.readFile(path, signal === undefined ? undefined : { signal })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DriveError('BLOB_MISSING', 'Drive content object is missing.', { cause })
    }
    throw cause
  }
  if (data.byteLength !== bytes || digestBytes(data) !== digest) {
    throw new DriveError('BLOB_CORRUPT', 'Drive content object failed byte-length or digest verification.')
  }
  return data
}


/** Verify every referenced object and remove provider-owned temporary or orphan files. */
export async function reconcileBlobs(
  root: string,
  referenced: ReadonlyMap<DriveDigest, number>,
  ops: BlobFileOperations = blobFileOperations,
): Promise<void> {
  const objectRoot = join(root, 'blobs', 'sha256')
  await ensurePrivateDirectory(root, ops)
  await ensurePrivateDirectory(join(root, 'blobs'), ops)
  await ensurePrivateDirectory(objectRoot, ops)
  for (const [digest, bytes] of referenced) await readBlob(root, digest, bytes, undefined, ops)
  const prefixes = await ops.opendir(objectRoot)
  for await (const prefix of prefixes) {
    const prefixPath = join(objectRoot, prefix.name)
    const prefixStat = await ops.lstat(prefixPath)
    if (!prefixStat.isDirectory() || prefixStat.isSymbolicLink() || !/^[0-9a-f]{2}$/u.test(prefix.name)) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob root contains an unexpected entry.')
    }
    const entries = await ops.opendir(prefixPath)
    for await (const entry of entries) {
      const entryPath = join(prefixPath, entry.name)
      const entryStat = await ops.lstat(entryPath)
      if (!entryStat.isFile() || entryStat.isSymbolicLink()) {
        throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob prefix contains a non-regular entry.')
      }
      if (entry.name.startsWith('.')) {
        await ops.rm(entryPath, { force: true })
        continue
      }
      if (!/^[0-9a-f]{64}$/u.test(entry.name) || entry.name.slice(0, 2) !== prefix.name) {
        throw new DriveError('STORAGE_INCONSISTENT', 'Drive blob prefix contains a malformed object name.')
      }
      const digest: DriveDigest = `sha256:${entry.name}`
      if (!referenced.has(digest)) await ops.rm(entryPath, { force: true })
    }
  }
}
