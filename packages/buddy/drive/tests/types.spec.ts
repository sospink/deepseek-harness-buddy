import { describe, expect, it } from 'vitest'
import {
  DriveAuditId,
  DriveCorrelationId,
  DriveFileId,
  DriveFolderId,
  DriveLibraryId,
  DriveVersionId,
} from '../src/index.ts'

describe('Buddy Drive id factories', () => {
  it('preserves opaque wire strings at runtime', () => {
    expect([
      DriveLibraryId('library'),
      DriveFolderId('folder'),
      DriveFileId('file'),
      DriveVersionId('version'),
      DriveAuditId('audit'),
      DriveCorrelationId('correlation'),
    ]).toEqual(['library', 'folder', 'file', 'version', 'audit', 'correlation'])
  })
})
