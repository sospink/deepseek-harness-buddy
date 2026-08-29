/** Browser-neutral DTOs for read-only Buddy Drive tools. */

import type { DriveFileKind, DriveMediaType } from '@sospink/dsh-buddy-drive'

/** Immutable provenance attached to every file hit and read window. */
export interface DriveToolSource {
  readonly fileId: string
  readonly versionId: string
  readonly digest: string
  readonly name: string
  readonly kind: DriveFileKind
  readonly mediaType: DriveMediaType
  readonly folderPath: string
  readonly tags: string[]
}

/** One current file listed to the model. */
export interface DriveListItem extends DriveToolSource {
  readonly updatedAt: string
  readonly bytes: number
}

export interface DriveListValue {
  readonly libraryId: string
  readonly libraryTitle: string
  readonly files: DriveListItem[]
  readonly totalFiles: number
  readonly truncated: boolean
}

/** One metadata or content search hit. */
export interface DriveSearchHit extends DriveToolSource {
  readonly match: 'metadata' | 'content'
  readonly snippet: string
}

export interface DriveSearchValue {
  readonly query: string
  readonly hits: DriveSearchHit[]
  readonly inspectedFiles: number
  readonly totalFiles: number
  readonly skippedFiles: number
  readonly truncated: boolean
}

/** One line-addressed text window from one explicit immutable version. */
export interface DriveReadValue {
  readonly source: DriveToolSource
  readonly startLine: number
  readonly endLine: number
  readonly totalLines: number
  readonly text: string
  readonly extractionTruncated: boolean
  readonly windowTruncated: boolean
}
