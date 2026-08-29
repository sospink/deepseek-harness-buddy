import { describe, expect, it } from 'vitest'
import { DriveFileId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import type { DriveVersion } from '@sospink/dsh-buddy-drive'
import { compareDriveNamed, compareDriveVersions } from '../src/ordering.ts'

const version = (id: string, createdAt: string): DriveVersion => ({
  id: DriveVersionId(id), fileId: DriveFileId('file'), digest: `sha256:${'a'.repeat(64)}`,
  bytes: 1, createdAt, actor: 'human', source: 'upload', preview: 'pending',
})

describe('Buddy Drive stable ordering', () => {
  it('uses ids when names or timestamps tie', () => {
    expect(compareDriveNamed({ name: 'same', id: 'a' }, { name: 'same', id: 'b' })).toBeLessThan(0)
    expect(compareDriveNamed({ name: 'a', id: 'z' }, { name: 'b', id: 'a' })).toBeLessThan(0)
    expect(compareDriveVersions(version('b', '2026-08-29T00:00:00.000Z'), version('a', '2026-08-29T00:00:00.000Z')))
      .toBeLessThan(0)
    expect(compareDriveVersions(version('a', '2026-08-30T00:00:00.000Z'), version('b', '2026-08-29T00:00:00.000Z')))
      .toBeLessThan(0)
  })
})
