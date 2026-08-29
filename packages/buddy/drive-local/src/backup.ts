/** Versioned local Buddy Drive backup format and integrity operations. */

import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { DriveAuditId, DriveError } from '@sospink/dsh-buddy-drive'
import type {
  DriveCorrelationId,
  DriveDigest,
  DriveLimits,
  DriveMutationContext,
} from '@sospink/dsh-buddy-drive'
import { digestBytes, publishBlob, readBlob } from './blob.ts'
import { driveStateSchema } from './spec.ts'
import type { DriveState } from './spec.ts'
import { validateDriveState } from './state.ts'

/** Current on-disk backup format version. */
export const DRIVE_BACKUP_FORMAT_VERSION = 1 as const
/** Fixed top-level marker preventing a backup from being confused with a Drive root. */
export const DRIVE_BACKUP_FORMAT = 'dsh-buddy-drive-backup' as const
/** The metadata file name inside every backup. */
export const DRIVE_BACKUP_METADATA_NAME = 'metadata.json' as const
/** The manifest file name inside every backup. */
export const DRIVE_BACKUP_MANIFEST_NAME = 'manifest.json' as const
/** Maximum metadata bytes read from an untrusted backup directory. */
export const MAX_BACKUP_METADATA_BYTES = 64 * 1024 * 1024

const BACKUP_BLOB_ROOT = join('blobs', 'sha256')
const DIGEST_RE = /^sha256:([0-9a-f]{64})$/u
const PRIVATE_MODE_MASK = 0o077
const MACOS_SYSTEM_PATH_ALIASES = new Set(['/tmp', '/var'])

const nonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const digestSchema = z.string().regex(DIGEST_RE)
const backupBlobSchema = z.object({
  digest: digestSchema,
  bytes: nonNegativeInteger,
}).strict()
const backupManifestSchema = z.object({
  format: z.literal(DRIVE_BACKUP_FORMAT),
  version: z.literal(DRIVE_BACKUP_FORMAT_VERSION),
  libraryId: z.string().min(1),
  createdAt: z.iso.datetime(),
  metadata: z.object({
    path: z.literal(DRIVE_BACKUP_METADATA_NAME),
    digest: digestSchema,
    bytes: nonNegativeInteger,
  }).strict(),
  blobs: z.array(backupBlobSchema),
  counts: z.object({
    folders: nonNegativeInteger,
    files: nonNegativeInteger,
    versions: nonNegativeInteger,
    audit: nonNegativeInteger,
  }).strict(),
}).strict()

type BackupManifest = z.infer<typeof backupManifestSchema>

/** One digest and byte count listed by a backup manifest. */
export interface DriveBackupBlob {
  readonly digest: DriveDigest
  readonly bytes: number
}

/** Public, independently verifiable facts about one local Drive backup. */
export interface DriveBackupSummary {
  readonly path: string
  readonly format: typeof DRIVE_BACKUP_FORMAT
  readonly version: typeof DRIVE_BACKUP_FORMAT_VERSION
  readonly libraryId: string
  readonly createdAt: string
  readonly metadataDigest: DriveDigest
  readonly metadataBytes: number
  readonly blobs: readonly DriveBackupBlob[]
  readonly folderCount: number
  readonly fileCount: number
  readonly versionCount: number
  readonly auditCount: number
  readonly blobBytes: number
}

/** Result of restoring a verified backup into one Local Drive root. */
export interface DriveRestoreSummary extends DriveBackupSummary {
  /** Whether the existing target metadata was explicitly replaced. */
  readonly replaced: boolean
}

/** Input for the local provider's explicit restore operation. */
export interface RestoreDriveBackupInput {
  /** Existing backup directory to validate and restore. */
  readonly source: string
  /** Permit replacing a non-empty target library. Defaults to false. */
  readonly replace?: boolean
  /** Attribution for the resulting `library/restore` audit event. */
  readonly mutation?: DriveMutationContext
}

/** A validated backup with its metadata state available to the provider. */
export interface ValidatedDriveBackup {
  readonly summary: DriveBackupSummary
  readonly state: DriveState
  readonly blobs: readonly DriveBackupBlob[]
}

function backupInvalid(message: string, cause?: unknown): DriveError {
  return new DriveError('BACKUP_INVALID', message, cause === undefined ? undefined : { cause })
}

function digestHex(value: string): string {
  const match = DIGEST_RE.exec(value)
  if (match?.[1] === undefined) throw backupInvalid('Backup contains a malformed digest.')
  return match[1]
}

function isWithin(parent: string, candidate: string): boolean {
  const child = relative(resolve(parent), resolve(candidate))
  return child === '' || (child !== '..' && !child.startsWith(`..${requireSeparator()}`) && !isAbsolute(child))
}

function requireSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/'
}

function assertDisjoint(left: string, right: string, message: string): void {
  if (isWithin(left, right) || isWithin(right, left)) throw backupInvalid(message)
}

async function canonicalPath(path: string): Promise<string> {
  const missing: string[] = []
  let cursor = resolve(path)
  while (true) {
    try {
      const parent = await realpath(cursor)
      return join(parent, ...missing)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw backupInvalid('Backup path cannot be resolved safely.', error)
      }
      const parent = dirname(cursor)
      if (parent === cursor) throw backupInvalid('Backup path cannot be resolved safely.', error)
      missing.unshift(basename(cursor))
      cursor = parent
    }
  }
}

async function assertPhysicallyDisjoint(left: string, right: string, message: string): Promise<void> {
  const [canonicalLeft, canonicalRight] = await Promise.all([canonicalPath(left), canonicalPath(right)])
  if (isWithin(canonicalLeft, canonicalRight) || isWithin(canonicalRight, canonicalLeft)) throw backupInvalid(message)
}

async function assertNoSymlinkAncestors(path: string): Promise<void> {
  let cursor = resolve(path)
  let isRequestedPath = true
  while (true) {
    try {
      const info = await lstat(cursor)
      if (info.isSymbolicLink()) {
        if (isRequestedPath || process.platform !== 'darwin' || !MACOS_SYSTEM_PATH_ALIASES.has(cursor)) {
          throw backupInvalid('Backup path contains a symbolic-link ancestor.')
        }
      } else if (!info.isDirectory()) {
        throw backupInvalid('Backup path contains a non-directory ancestor.')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = dirname(cursor)
    if (parent === cursor) return
    cursor = parent
    isRequestedPath = false
  }
}

function assertPrivateMode(mode: number): void {
  if (process.platform !== 'win32' && (mode & PRIVATE_MODE_MASK) !== 0) {
    throw backupInvalid('Backup directories and files must be owner-only.')
  }
}

function assertPrivateOwner(uid: number): void {
  const currentUid = process.getuid?.()
  if (process.platform !== 'win32' && currentUid !== undefined && uid !== currentUid) {
    throw backupInvalid('Backup directories and files must belong to the current user.')
  }
}

async function assertPrivateDirectory(path: string): Promise<void> {
  let info
  try { info = await lstat(path) } catch (cause) { throw backupInvalid('Backup directory is unavailable.', cause) }
  if (!info.isDirectory() || info.isSymbolicLink()) throw backupInvalid('Backup contains a non-directory or symbolic-link directory.')
  assertPrivateMode(info.mode)
  assertPrivateOwner(info.uid)
}

async function assertPrivateRegular(path: string): Promise<{ size: number }> {
  let info
  try { info = await lstat(path) } catch (cause) { throw backupInvalid('Backup file is unavailable.', cause) }
  if (!info.isFile() || info.isSymbolicLink()) throw backupInvalid('Backup contains a non-regular or symbolic-link file.')
  assertPrivateMode(info.mode)
  assertPrivateOwner(info.uid)
  return { size: info.size }
}

async function names(path: string): Promise<string[]> {
  try { return await readdir(path) } catch (cause) { throw backupInvalid('Backup directory cannot be read.', cause) }
}

function assertExactNames(actual: readonly string[], expected: ReadonlySet<string>): void {
  if (actual.length !== expected.size || actual.some(name => !expected.has(name))) {
    throw backupInvalid('Backup contains missing or redundant directory entries.')
  }
}

async function readBounded(path: string, maxBytes: number): Promise<Buffer> {
  const stat = await assertPrivateRegular(path)
  if (stat.size > maxBytes) throw backupInvalid('Backup metadata exceeds the configured read limit.')
  try {
    const data = await readFile(path)
    if (data.byteLength !== stat.size) throw backupInvalid('Backup file changed while it was being read.')
    return data
  } catch (error) {
    if (error instanceof DriveError) throw error
    throw backupInvalid('Backup file cannot be read.', error)
  }
}

function parseJson(text: Buffer): unknown {
  try { return JSON.parse(text.toString('utf8')) as unknown } catch (cause) {
    throw backupInvalid('Backup JSON is malformed.', cause)
  }
}

function serializeState(state: DriveState): Buffer {
  return Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function serializeManifest(manifest: BackupManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function backupBlobs(state: DriveState): readonly DriveBackupBlob[] {
  const byDigest = new Map<DriveDigest, number>()
  for (const version of state.versions) {
    const previous = byDigest.get(version.digest)
    if (previous !== undefined && previous !== version.bytes) {
      throw new DriveError('STORAGE_INCONSISTENT', 'Drive versions disagree about a shared blob length.')
    }
    byDigest.set(version.digest, version.bytes)
  }
  return [...byDigest].sort(([left], [right]) => left.localeCompare(right)).map(([digest, bytes]) => ({ digest, bytes }))
}

function blobBytes(blobs: readonly DriveBackupBlob[]): number {
  const total = blobs.reduce((sum, blob) => sum + blob.bytes, 0)
  if (!Number.isSafeInteger(total)) throw backupInvalid('Backup blob byte total exceeds the safe integer range.')
  return total
}

function summaryOf(
  path: string,
  manifest: BackupManifest,
  blobs: readonly DriveBackupBlob[],
  metadataDigest: DriveDigest,
  metadataBytes: number,
): DriveBackupSummary {
  return Object.freeze({
    path,
    format: DRIVE_BACKUP_FORMAT,
    version: DRIVE_BACKUP_FORMAT_VERSION,
    libraryId: manifest.libraryId,
    createdAt: manifest.createdAt,
    metadataDigest,
    metadataBytes,
    blobs: Object.freeze(blobs.map(blob => Object.freeze({ ...blob }))),
    folderCount: manifest.counts.folders,
    fileCount: manifest.counts.files,
    versionCount: manifest.counts.versions,
    auditCount: manifest.counts.audit,
    blobBytes: blobBytes(blobs),
  })
}

async function verifyObjectTree(root: string, blobs: readonly DriveBackupBlob[]): Promise<void> {
  const blobRoot = join(root, 'blobs')
  const objectRoot = join(root, BACKUP_BLOB_ROOT)
  await assertPrivateDirectory(blobRoot)
  await assertPrivateDirectory(objectRoot)
  assertExactNames(await names(blobRoot), new Set(['sha256']))
  const byPrefix = new Map<string, Set<string>>()
  for (const blob of blobs) {
    const hex = digestHex(blob.digest)
    const expected = byPrefix.get(hex.slice(0, 2)) ?? new Set<string>()
    expected.add(hex)
    byPrefix.set(hex.slice(0, 2), expected)
  }
  const prefixes = await names(objectRoot)
  assertExactNames(prefixes, new Set(byPrefix.keys()))
  for (const prefix of prefixes) {
    await assertPrivateDirectory(join(objectRoot, prefix))
    const entries = await names(join(objectRoot, prefix))
    assertExactNames(entries, byPrefix.get(prefix) ?? new Set())
    for (const entry of entries) await assertPrivateRegular(join(objectRoot, prefix, entry))
  }
}

function parseManifest(value: unknown): BackupManifest {
  const parsed = backupManifestSchema.safeParse(value)
  if (!parsed.success) throw backupInvalid('Backup manifest does not match the supported format.')
  let previous: string | undefined
  const seen = new Set<string>()
  for (const blob of parsed.data.blobs) {
    if (seen.has(blob.digest)) throw backupInvalid('Backup manifest repeats a blob digest.')
    if (previous !== undefined && previous >= blob.digest) throw backupInvalid('Backup manifest blobs are not in canonical order.')
    seen.add(blob.digest)
    previous = blob.digest
  }
  return parsed.data
}

function assertManifestMatchesState(manifest: BackupManifest, state: DriveState, metadata: Buffer): readonly DriveBackupBlob[] {
  const metadataDigest = digestBytes(metadata)
  if (manifest.libraryId !== state.library.id
    || manifest.metadata.bytes !== metadata.byteLength
    || manifest.metadata.digest !== metadataDigest
    || manifest.counts.folders !== state.folders.length
    || manifest.counts.files !== state.files.length
    || manifest.counts.versions !== state.versions.length
    || manifest.counts.audit !== state.audit.length) {
    throw backupInvalid('Backup manifest does not match its metadata.')
  }
  const expected = backupBlobs(state)
  if (expected.length !== manifest.blobs.length) throw backupInvalid('Backup manifest blob count is inconsistent.')
  for (let index = 0; index < expected.length; index += 1) {
    const actual = manifest.blobs[index]
    const wanted = expected[index]
    if (actual?.digest !== wanted?.digest || actual?.bytes !== wanted?.bytes) {
      throw backupInvalid('Backup manifest blob inventory is inconsistent.')
    }
  }
  return expected
}

function assertVersionLimits(state: DriveState, limits: DriveLimits): void {
  if (state.versions.some(version => version.bytes > limits.maxFileBytes)) {
    throw backupInvalid('Backup contains a version larger than the configured file limit.')
  }
}

/** Validate one backup directory without opening or mutating a Drive provider. */
export async function inspectDriveBackup(source: string, limits: DriveLimits): Promise<ValidatedDriveBackup> {
  const root = resolve(source)
  await assertNoSymlinkAncestors(root)
  await assertPrivateDirectory(root)
  const topNames = await names(root)
  assertExactNames(topNames, new Set([DRIVE_BACKUP_MANIFEST_NAME, DRIVE_BACKUP_METADATA_NAME, 'blobs']))
  const manifestBytes = await readBounded(join(root, DRIVE_BACKUP_MANIFEST_NAME), MAX_BACKUP_METADATA_BYTES)
  const manifest = parseManifest(parseJson(manifestBytes))
  if (!serializeManifest(manifest).equals(manifestBytes)) throw backupInvalid('Backup manifest is not canonical.')
  const metadataBytes = await readBounded(join(root, DRIVE_BACKUP_METADATA_NAME), MAX_BACKUP_METADATA_BYTES)
  if (manifest.metadata.bytes !== metadataBytes.byteLength || manifest.metadata.digest !== digestBytes(metadataBytes)) {
    throw backupInvalid('Backup metadata digest or byte count is invalid.')
  }
  const parsed = driveStateSchema.safeParse(parseJson(metadataBytes))
  if (!parsed.success) throw backupInvalid('Backup metadata does not match the Drive state format.')
  const canonical = serializeState(parsed.data)
  if (!canonical.equals(metadataBytes)) throw backupInvalid('Backup metadata is not canonical.')
  try { validateDriveState(parsed.data, limits) } catch (cause) { throw backupInvalid('Backup metadata relations are invalid.', cause) }
  assertVersionLimits(parsed.data, limits)
  const blobs = assertManifestMatchesState(manifest, parsed.data, metadataBytes)
  await verifyObjectTree(root, blobs)
  for (const blob of blobs) {
    try { await readBlob(root, blob.digest, blob.bytes) } catch (cause) {
      throw backupInvalid('Backup content failed digest or byte-length verification.', cause)
    }
  }
  const summary = summaryOf(root, manifest, blobs, manifest.metadata.digest, metadataBytes.byteLength)
  return { summary, state: parsed.data, blobs }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, constants.O_RDONLY)
    try { await handle.sync() } finally { await handle.close() }
  } catch (cause) {
    throw backupInvalid('Backup directory could not be synchronized.', cause)
  }
}

async function writeDurable(path: string, data: Buffer): Promise<void> {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(data)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, path)
    await syncDirectory(dirname(path))
  } catch (cause) {
    await handle?.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw cause
  }
}

async function makePrivateTree(path: string): Promise<void> {
  await assertNoSymlinkAncestors(path)
  try { await mkdir(path, { recursive: true, mode: 0o700 }) } catch (cause) {
    throw backupInvalid('Backup directory cannot be created.', cause)
  }
  const parts: string[] = []
  let cursor = resolve(path)
  while (true) {
    parts.unshift(cursor)
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
    if (parts.length > 1024) throw backupInvalid('Backup path is too deep.')
  }
  for (const part of parts) {
    try {
      const info = await lstat(part)
      const systemAlias = process.platform === 'darwin' && MACOS_SYSTEM_PATH_ALIASES.has(part)
      if ((!info.isDirectory() && !(info.isSymbolicLink() && systemAlias)) || (info.isSymbolicLink() && !systemAlias)) {
        throw backupInvalid('Backup directory contains an unsafe path component.')
      }
      if (part === resolve(path)) assertPrivateMode(info.mode)
    } catch (error) {
      if (error instanceof DriveError) throw error
      throw backupInvalid('Backup directory cannot be checked.', error)
    }
  }
}

async function ensureSafeDirectory(path: string): Promise<void> {
  await assertNoSymlinkAncestors(path)
  try { await mkdir(path, { recursive: true, mode: 0o700 }) } catch (cause) {
    throw backupInvalid('Backup parent directory cannot be created.', cause)
  }
  let info
  try { info = await lstat(path) } catch (cause) { throw backupInvalid('Backup parent directory cannot be checked.', cause) }
  if (!info.isDirectory() || info.isSymbolicLink()) throw backupInvalid('Backup parent path is not a regular directory.')
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await lstat(path)
    throw new DriveError('BACKUP_EXISTS', 'Backup destination already exists.')
  } catch (error) {
    if (error instanceof DriveError) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw backupInvalid('Backup destination cannot be checked.', error)
  }
}

function manifestFor(state: DriveState, createdAt: string, metadata: Buffer, blobs: readonly DriveBackupBlob[]): BackupManifest {
  return {
    format: DRIVE_BACKUP_FORMAT,
    version: DRIVE_BACKUP_FORMAT_VERSION,
    libraryId: state.library.id,
    createdAt,
    metadata: { path: DRIVE_BACKUP_METADATA_NAME, digest: digestBytes(metadata), bytes: metadata.byteLength },
    blobs: blobs.map(blob => ({ digest: blob.digest, bytes: blob.bytes })),
    counts: {
      folders: state.folders.length,
      files: state.files.length,
      versions: state.versions.length,
      audit: state.audit.length,
    },
  }
}

/** Create a complete backup in a new destination directory. */
export async function createDriveBackup(
  sourceRoot: string,
  state: DriveState,
  limits: DriveLimits,
  destination: string,
): Promise<DriveBackupSummary> {
  validateDriveState(state, limits)
  const source = resolve(sourceRoot)
  const target = resolve(destination)
  assertDisjoint(source, target, 'Backup destination must not be the Drive root or a nested path.')
  await assertNoSymlinkAncestors(source)
  await assertPrivateDirectory(source)
  await assertNoSymlinkAncestors(target)
  await assertPhysicallyDisjoint(source, target, 'Backup destination must not be the Drive root or a nested path.')
  await assertAbsent(target)
  const parent = dirname(target)
  await ensureSafeDirectory(parent)
  const metadata = serializeState(state)
  if (metadata.byteLength > MAX_BACKUP_METADATA_BYTES) throw backupInvalid('Drive metadata exceeds the backup metadata limit.')
  const blobs = backupBlobs(state)
  const createdAt = new Date().toISOString()
  const temporary = join(parent, `.${randomUUID()}.dsh-backup.tmp`)
  let published = false
  try {
    await makePrivateTree(temporary)
    await makePrivateTree(join(temporary, BACKUP_BLOB_ROOT))
    await writeDurable(join(temporary, DRIVE_BACKUP_METADATA_NAME), metadata)
    for (const blob of blobs) {
      const data = await readBlob(source, blob.digest, blob.bytes)
      await publishBlob(temporary, blob.digest, data)
    }
    const manifest = manifestFor(state, createdAt, metadata, blobs)
    await writeDurable(join(temporary, DRIVE_BACKUP_MANIFEST_NAME), serializeManifest(manifest))
    await syncDirectory(temporary)
    const checked = await inspectDriveBackup(temporary, limits)
    await assertAbsent(target)
    await rename(temporary, target)
    published = true
    await syncDirectory(parent)
    return Object.freeze({ ...checked.summary, path: target })
  } catch (error) {
    if (!published) await rm(temporary, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/** Copy a validated backup's content into a provider-owned Drive root. */
export async function restoreDriveBackupContent(
  backup: ValidatedDriveBackup,
  targetRoot: string,
): Promise<void> {
  const target = resolve(targetRoot)
  assertDisjoint(backup.summary.path, target, 'Restore source and Drive root must be separate paths.')
  await assertNoSymlinkAncestors(target)
  await assertPhysicallyDisjoint(backup.summary.path, target, 'Restore source and Drive root must be separate paths.')
  for (const blob of backup.blobs) {
    let data: Uint8Array
    try { data = await readBlob(backup.summary.path, blob.digest, blob.bytes) } catch (cause) {
      throw backupInvalid('Backup changed before restore completed.', cause)
    }
    await publishBlob(target, blob.digest, data)
  }
}

/** Build one updated library snapshot and the audit event for a restore commit. */
export function stateAfterDriveBackupRestore(
  state: DriveState,
  limits: DriveLimits,
  mutation: { readonly actor: 'human' | 'agent'; readonly correlationId: DriveCorrelationId },
): DriveState {
  if (state.audit.length >= limits.maxAuditEvents) {
    throw new DriveError('AUDIT_LIMIT_EXCEEDED', 'Drive audit retention limit has been reached.')
  }
  const restoredAt = new Date(Math.max(Date.now(), Date.parse(state.library.updatedAt) + 1)).toISOString()
  const audit = {
    id: DriveAuditId(randomUUID()),
    correlationId: mutation.correlationId,
    actor: mutation.actor,
    operation: 'library/restore' as const,
    targetType: 'library' as const,
    targetId: state.library.id,
    createdAt: restoredAt,
  }
  return {
    ...state,
    library: { ...state.library, updatedAt: restoredAt },
    audit: [...state.audit, audit],
  }
}

/** Return whether the target contains only the provider-created empty library. */
export function isEmptyDriveState(state: DriveState): boolean {
  return state.folders.length === 0 && state.files.length === 0 && state.versions.length === 0 && state.audit.length <= 1
}

/** Construct a detached summary after the provider adds its restore audit event. */
export function restoredSummary(backup: DriveBackupSummary, replaced: boolean): DriveRestoreSummary {
  return Object.freeze({ ...backup, auditCount: backup.auditCount + 1, replaced })
}
