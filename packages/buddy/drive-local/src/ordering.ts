/** Stable ordering helpers for Buddy Drive projections. */

import type { DriveVersion } from '@sospink/dsh-buddy-drive'

/** Sort named rows by display name, then stable identity. */
export function compareDriveNamed(left: { name: string; id: string }, right: { name: string; id: string }): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

/** Sort immutable versions newest first, then by stable identity. */
export function compareDriveVersions(left: DriveVersion, right: DriveVersion): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
}
