/** Durable metadata schema for the local Buddy Drive provider. */

import { z } from 'zod'
import {
  DriveAuditId,
  DriveCorrelationId,
  DriveFileId,
  DriveFolderId,
  DriveLibraryId,
  DriveVersionId,
} from '@sospink/dsh-buddy-drive'
import type {
  DriveAuditEvent, DriveDigest,
  DriveFile,
  DriveFolder,
  DriveLibrary,
  DriveVersion,
} from '@sospink/dsh-buddy-drive'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'

const nonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.iso.datetime()
const libraryId = z.string().min(1).transform(DriveLibraryId)
const folderId = z.string().min(1).transform(DriveFolderId)
const fileId = z.string().min(1).transform(DriveFileId)
const versionId = z.string().min(1).transform(DriveVersionId)
const auditId = z.string().min(1).transform(DriveAuditId)
const correlationId = z.string().min(1).transform(DriveCorrelationId)
const actor = z.union([z.literal('human'), z.literal('agent')])
const fileKind = z.union([
  z.literal('role-assignment'),
  z.literal('safety-protocol'),
  z.literal('operating-rule'),
  z.literal('reference'),
  z.literal('general'),
])
const mediaType = z.union([
  z.literal('text/markdown'),
  z.literal('application/pdf'),
  z.literal('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
])
const preview = z.union([
  z.literal('pending'), z.literal('ready'), z.literal('unsupported'), z.literal('failed'),
])
const source = z.union([z.literal('upload'), z.literal('agent-publication')])
const operation = z.union([
  z.literal('library/create'), z.literal('library/restore'), z.literal('folder/create'), z.literal('folder/rename'),
  z.literal('folder/move'), z.literal('file/import'), z.literal('file/version'),
  z.literal('file/rename'), z.literal('file/move'), z.literal('file/metadata'),
  z.literal('file/delete'), z.literal('file/restore'),
])
const targetType = z.union([
  z.literal('library'), z.literal('folder'), z.literal('file'), z.literal('version'),
])

/** Local-only replay metadata; never projected through the provider-neutral audit API. */
export interface LocalDriveAuditEvent extends DriveAuditEvent {
  readonly idempotencyKey?: string
  readonly requestDigest?: DriveDigest
}

/** Runtime schema for one library snapshot. */
export const driveLibrarySchema = z.object({
  id: libraryId,
  title: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
}) as z.ZodType<DriveLibrary>

/** Runtime schema for one folder snapshot. */
export const driveFolderSchema = z.object({
  id: folderId,
  libraryId,
  parentId: folderId.optional(),
  name: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
}) as z.ZodType<DriveFolder>

/** Runtime schema for one logical file snapshot. */
export const driveFileSchema = z.object({
  id: fileId,
  libraryId,
  parentId: folderId.optional(),
  name: z.string(),
  kind: fileKind,
  mediaType,
  currentVersionId: versionId,
  tags: z.array(z.string()),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.optional(),
}) as z.ZodType<DriveFile>

/** Runtime schema for one immutable version snapshot. */
export const driveVersionSchema = z.object({
  id: versionId,
  fileId,
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  bytes: nonNegativeInteger,
  createdAt: timestamp,
  actor,
  source,
  preview,
}) as z.ZodType<DriveVersion>

/** Runtime schema for one immutable audit snapshot. */
export const driveAuditSchema = z.object({
  id: auditId,
  correlationId,
  actor,
  operation,
  targetType,
  targetId: z.string().min(1),
  createdAt: timestamp,
  previousVersionId: versionId.optional(),
  versionId: versionId.optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
  requestDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u).optional(),
}) as z.ZodType<LocalDriveAuditEvent>

/** Complete metadata state committed in one durable domain-global write. */
export const driveStateSchema = z.object({
  library: driveLibrarySchema,
  folders: z.array(driveFolderSchema),
  files: z.array(driveFileSchema),
  versions: z.array(driveVersionSchema),
  audit: z.array(driveAuditSchema),
})

/** Complete durable metadata state. */
export type DriveState = z.infer<typeof driveStateSchema>

/** Storage-domain declaration for the atomic Buddy Drive metadata document. */
export const driveDomainSpec = defineDomain({
  name: 'buddy_drive',
  version: 0,
  global: {
    schema: driveStateSchema,
    initial: {
      library: {
        id: DriveLibraryId('default'),
        title: '资料云盘',
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
      folders: [],
      files: [],
      versions: [],
      audit: [],
    },
  },
  tables: {},
})
