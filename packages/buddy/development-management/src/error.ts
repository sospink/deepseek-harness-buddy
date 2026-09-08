/** Stable business error used by Remote and HTTP adapters. */

/** Development-management failure with a stable code. */
export class DevelopmentManagementError extends Error {
  /** @param code - Stable machine-readable failure code. @param message - Operator-facing diagnostic. */
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'DevelopmentManagementError'
  }
}
