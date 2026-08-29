import { describe, expect, it } from 'vitest'
import {
  DriveAuditId,
  DriveCorrelationId,
  DriveFileId,
  DriveFolderId,
  DriveLibraryId,
  DriveVersionId,
} from '@sospink/dsh-buddy-drive'
import type { DriveLimits } from '@sospink/dsh-buddy-drive'
import type { DriveState } from '../src/spec.ts'
import { validateDriveState } from '../src/state.ts'

const now = '2026-08-29T00:00:00.000Z'
const limits: DriveLimits = {
  maxFileBytes: 100,
  maxLibraryBytes: 100,
  maxDocxEntries: 10,
  maxDocxExpandedBytes: 100,
  maxDocxCompressionRatio: 10,
  maxAuditEvents: 10,
}

function validState(): DriveState {
  const libraryId = DriveLibraryId('library')
  const folderId = DriveFolderId('folder')
  const fileId = DriveFileId('file')
  const versionId = DriveVersionId('version')
  return {
    library: { id: libraryId, title: 'Drive', createdAt: now, updatedAt: now },
    folders: [{ id: folderId, libraryId, name: 'Folder', createdAt: now, updatedAt: now }],
    files: [{
      id: fileId, libraryId, parentId: folderId, name: 'File.md', kind: 'general',
      mediaType: 'text/markdown', currentVersionId: versionId, tags: [], createdAt: now, updatedAt: now,
    }],
    versions: [{
      id: versionId, fileId, digest: `sha256:${'a'.repeat(64)}`, bytes: 1, createdAt: now,
      actor: 'human', source: 'upload', preview: 'pending',
    }],
    audit: [{
      id: DriveAuditId('audit'), correlationId: DriveCorrelationId('correlation'), actor: 'human',
      operation: 'file/import', targetType: 'file', targetId: fileId, createdAt: now, versionId,
      idempotencyKey: 'upload-state', requestDigest: `sha256:${'b'.repeat(64)}`,
    }],
  }
}

function expectInconsistent(mutate: (state: DriveState) => void, customLimits = limits): void {
  const state = validState()
  mutate(state)
  expect(() => { validateDriveState(state, customLimits) }).toThrow(
    expect.objectContaining({ code: 'STORAGE_INCONSISTENT' }),
  )
}

describe('validateDriveState', () => {
  it('accepts one complete consistent relation', () => {
    expect(() => { validateDriveState(validState(), limits) }).not.toThrow()
  })

  it('rejects duplicate and cross-library folders', () => {
    expectInconsistent((state) => {
      state.folders.push({ ...state.folders[0]! })
    })
    expectInconsistent((state) => {
      state.folders[0] = { ...state.folders[0]!, libraryId: DriveLibraryId('other') }
    })
  })

  it('rejects missing parents and folder cycles', () => {
    expectInconsistent((state) => {
      state.folders[0] = { ...state.folders[0]!, parentId: DriveFolderId('missing') }
    })
    expectInconsistent((state) => {
      state.folders[0] = { ...state.folders[0]!, parentId: state.folders[0]!.id }
    })
  })

  it('rejects duplicate, cross-library, and orphaned files', () => {
    expectInconsistent((state) => {
      state.files.push({ ...state.files[0]! })
    })
    expectInconsistent((state) => {
      state.files[0] = { ...state.files[0]!, libraryId: DriveLibraryId('other') }
    })
    expectInconsistent((state) => {
      state.files[0] = { ...state.files[0]!, parentId: DriveFolderId('missing') }
    })
  })

  it('rejects orphaned and duplicate versions', () => {
    expectInconsistent((state) => {
      state.versions[0] = { ...state.versions[0]!, fileId: DriveFileId('missing') }
    })
    expectInconsistent((state) => {
      state.versions.push({ ...state.versions[0]! })
    })
  })

  it('rejects a current version owned by another file or absent', () => {
    expectInconsistent((state) => {
      state.files[0] = { ...state.files[0]!, currentVersionId: DriveVersionId('missing') }
    })
    expectInconsistent((state) => {
      const otherFileId = DriveFileId('other-file')
      state.files.push({ ...state.files[0]!, id: otherFileId, name: 'Other.md' })
      state.versions.push({
        ...state.versions[0]!, id: DriveVersionId('other-version'), fileId: otherFileId,
      })
      state.files[0] = { ...state.files[0]!, currentVersionId: DriveVersionId('other-version') }
    })
  })

  it('rejects incomplete, misplaced, duplicate, and orphaned import idempotency metadata', () => {
    expectInconsistent((state) => {
      const { requestDigest: _requestDigest, ...event } = state.audit[0]!
      state.audit[0] = event
    })
    expectInconsistent((state) => {
      const { idempotencyKey: _idempotencyKey, ...event } = state.audit[0]!
      state.audit[0] = event
    })
    expectInconsistent((state) => { state.audit[0] = { ...state.audit[0]!, operation: 'file/metadata' } })
    expectInconsistent((state) => { state.audit[0] = { ...state.audit[0]!, targetType: 'folder' } })
    expectInconsistent((state) => { state.audit[0] = { ...state.audit[0]!, targetId: 'missing' } })
    expectInconsistent((state) => { state.audit[0] = { ...state.audit[0]!, versionId: DriveVersionId('missing') } })
    expectInconsistent((state) => {
      state.audit.push({ ...state.audit[0]!, id: DriveAuditId('audit-2') })
    })
  })

  it('rejects retained-byte and audit limits', () => {
    expectInconsistent((state) => {
      state.versions[0] = { ...state.versions[0]!, bytes: 101 }
    })
    expectInconsistent((state) => {
      state.audit.push({ ...state.audit[0]!, id: DriveAuditId('audit-2') })
    }, { ...limits, maxAuditEvents: 1 })
  })

  it('rejects duplicate visible folder/file names but ignores deleted names', () => {
    expectInconsistent((state) => {
      state.folders.push({ ...state.folders[0]!, id: DriveFolderId('folder-2'), name: 'folder' })
    })
    expectInconsistent((state) => {
      const { parentId: _parentId, ...file } = state.files[0]!
      state.files[0] = { ...file, name: 'Folder' }
    })
    const state = validState()
    const { parentId: _parentId, ...file } = state.files[0]!
    state.files[0] = { ...file, name: 'Folder', deletedAt: now }
    expect(() => { validateDriveState(state, limits) }).not.toThrow()
  })
})
