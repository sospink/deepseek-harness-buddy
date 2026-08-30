/** Stable drive failure vocabulary. @module @sospink/dsh-buddy-drive/error */

/** Machine-readable business and integrity failures from the drive seam. */
export type DriveErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_METADATA'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'MEDIA_TYPE_MISMATCH'
  | 'INVALID_DOCUMENT'
  | 'FILE_TOO_LARGE'
  | 'LIBRARY_QUOTA_EXCEEDED'
  | 'AUDIT_LIMIT_EXCEEDED'
  | 'LIBRARY_NOT_FOUND'
  | 'FOLDER_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'PURGE_EMPTY'
  | 'VERSION_NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_MOVE'
  | 'FILE_DELETED'
  | 'BLOB_MISSING'
  | 'BLOB_CORRUPT'
  | 'STORAGE_INCONSISTENT'
  | 'BACKUP_INVALID'
  | 'BACKUP_EXISTS'
  | 'RESTORE_TARGET_NOT_EMPTY'

/** Typed drive error; callers branch on {@link code}, never message text. */
export class DriveError extends Error {
  override readonly name = 'DriveError'

  /**
   * @param code - stable failure code.
   * @param message - human-readable diagnostic without secret content.
   * @param options - optional causal error.
   */
  constructor(readonly code: DriveErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
  }
}
