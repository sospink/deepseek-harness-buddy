/** Host/Worker protocol for bounded PDF and DOCX plain-text extraction. */

import type { DriveMediaType } from '@sospink/dsh-buddy-drive'

export interface ExtractWorkerInput {
  readonly mediaType: Exclude<DriveMediaType, 'text/markdown'>
  readonly buffer: ArrayBuffer
  readonly maxTextBytes: number
}

export type ExtractWorkerOutput =
  | { readonly ok: true; readonly text: string; readonly truncated: boolean; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly message: string }

export function parseWorkerOutput(value: unknown): ExtractWorkerOutput | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.ok === false && typeof record.message === 'string') return { ok: false, message: record.message }
  if (record.ok !== true || typeof record.text !== 'string' || typeof record.truncated !== 'boolean'
    || !Array.isArray(record.warnings) || record.warnings.some(item => typeof item !== 'string')) return undefined
  return { ok: true, text: record.text, truncated: record.truncated, warnings: [...record.warnings] as string[] }
}
