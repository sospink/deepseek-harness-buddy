/** Host-authoritative admission for Markdown, PDF, and DOCX source bytes. */

import { unzipSync, type UnzipFileInfo } from 'fflate'
import { DriveError } from '@sospink/dsh-buddy-drive'
import type { DriveLimits, DriveMediaType } from '@sospink/dsh-buddy-drive'

const DOCX_MEDIA = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Compute one ZIP entry expansion ratio, including zero-byte edge cases. */
export function driveZipCompressionRatio(compressedBytes: number, expandedBytes: number): number {
  if (compressedBytes === 0) return expandedBytes === 0 ? 1 : Number.POSITIVE_INFINITY
  return expandedBytes / compressedBytes
}

/** Result of authoritative source-document admission. */
export interface AdmittedDriveDocument {
  readonly mediaType: DriveMediaType
  readonly normalizedName: string
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

const SUSPICIOUS_INNER_EXTENSION = /\.(?:pdf|docx|docm|dotm|zip|html?|svg|exe|dmg|sh|bat|cmd)$/iu

function rejectDoubleExtension(name: string, extension: string): void {
  const stem = name.slice(0, -extension.length)
  if (SUSPICIOUS_INNER_EXTENSION.test(stem)) {
    throw new DriveError('UNSUPPORTED_FILE_TYPE', 'Documents with a suspicious double extension are not accepted.')
  }
}

/** Normalize an untrusted display leaf without interpreting it as a path. */
export function normalizeDriveName(raw: string): string {
  const stripped = raw.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  if (stripped === '' || stripped === '.' || stripped === '..' || /[\\/]/u.test(stripped)) {
    throw new DriveError('INVALID_NAME', 'Drive names must be non-empty single path segments.')
  }
  const bytes = Buffer.byteLength(stripped)
  if (bytes > 255) throw new DriveError('INVALID_NAME', 'Drive names must not exceed 255 UTF-8 bytes.')
  return stripped
}

/** Normalize a small tag set for deterministic storage and comparisons. */
export function normalizeDriveTags(tags: readonly string[] | undefined): readonly string[] {
  if (tags === undefined) return []
  const normalized = [...new Set(tags.map(tag => tag.trim()).filter(tag => tag !== ''))].sort()
  if (normalized.length > 32 || normalized.some(tag => Buffer.byteLength(tag) > 64)) {
    throw new DriveError('INVALID_NAME', 'Drive tags exceed the supported count or UTF-8 byte limit.')
  }
  return normalized
}

function declaredMatches(declared: string | undefined, mediaType: DriveMediaType): boolean {
  if (declared === undefined || declared === '' || declared === 'application/octet-stream') return true
  return declared.toLowerCase().split(';', 1)[0]?.trim() === mediaType
}

function admitMarkdown(data: Uint8Array): void {
  const head = data.subarray(0, Math.min(data.byteLength, 8))
  const binary = (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)
    || (head[0] === 0x50 && head[1] === 0x4b)
    || (head[0] === 0x4d && head[1] === 0x5a)
    || (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46)
  if (binary) throw new DriveError('INVALID_DOCUMENT', 'Markdown content carries a known binary signature.')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch (cause) {
    throw new DriveError('INVALID_DOCUMENT', 'Markdown files must be valid UTF-8.', { cause })
  }
  if (text.includes('\u0000')) throw new DriveError('INVALID_DOCUMENT', 'Markdown files must not contain NUL bytes.')
  let controls = 0
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (code < 32 && char !== '\n' && char !== '\r' && char !== '\t') controls += 1
  }
  if (controls > Math.max(4, Math.floor(text.length / 100))) {
    throw new DriveError('INVALID_DOCUMENT', 'Markdown contains too many binary control characters.')
  }
}

function admitPdf(data: Uint8Array): void {
  if (data.length < 8 || new TextDecoder().decode(data.subarray(0, 5)) !== '%PDF-') {
    throw new DriveError('INVALID_DOCUMENT', 'PDF files must start with a valid PDF signature.')
  }
  const version = new TextDecoder().decode(data.subarray(5, 8))
  if (!/^\d\.\d$/u.test(version)) throw new DriveError('INVALID_DOCUMENT', 'PDF version header is malformed.')
}

function admitDocx(data: Uint8Array, limits: DriveLimits): void {
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new DriveError('INVALID_DOCUMENT', 'DOCX files must be OOXML ZIP containers.')
  }
  let entries = 0
  let expandedBytes = 0
  const names = new Set<string>()
  const inspect = new Set<string>()
  const filter = (entry: UnzipFileInfo): boolean => {
    entries += 1
    if (entries > limits.maxDocxEntries) {
      throw new DriveError('INVALID_DOCUMENT', 'DOCX contains too many ZIP entries.')
    }
    expandedBytes += entry.originalSize
    if (expandedBytes > limits.maxDocxExpandedBytes) {
      throw new DriveError('INVALID_DOCUMENT', 'DOCX expanded content exceeds the configured limit.')
    }
    const ratio = driveZipCompressionRatio(entry.size, entry.originalSize)
    if (ratio > limits.maxDocxCompressionRatio) {
      throw new DriveError('INVALID_DOCUMENT', 'DOCX compression ratio exceeds the configured limit.')
    }
    if (entry.name.startsWith('/') || entry.name.split('/').includes('..')) {
      throw new DriveError('INVALID_DOCUMENT', 'DOCX contains an unsafe ZIP member path.')
    }
    names.add(entry.name)
    if (/^(?:word\/)?vbaProject\.bin$/iu.test(entry.name) || entry.name.endsWith('/vbaProject.bin')
      || /^word\/afchunk/iu.test(entry.name)) {
      throw new DriveError('INVALID_DOCUMENT', 'Macro-enabled or AltChunk DOCX content is not accepted.')
    }
    const shouldInspect = entry.name === '[Content_Types].xml' || entry.name.endsWith('.rels')
    if (shouldInspect) inspect.add(entry.name)
    return shouldInspect
  }
  let selected: Record<string, Uint8Array>
  try {
    selected = unzipSync(data, { filter })
  } catch (cause) {
    if (cause instanceof DriveError) throw cause
    throw new DriveError('INVALID_DOCUMENT', 'DOCX central directory is malformed or unsupported.', { cause })
  }
  if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) {
    throw new DriveError('INVALID_DOCUMENT', 'DOCX is missing required OOXML Word entries.')
  }
  for (const name of inspect) {
    const bytes = selected[name] as Uint8Array
    let xml: string
    try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch (cause) {
      throw new DriveError('INVALID_DOCUMENT', 'DOCX relationship metadata is not valid UTF-8 XML.', { cause })
    }
    if (/TargetMode\s*=\s*["']External["']/iu.test(xml)
      || /application\/vnd\.ms-office\.vbaProject/iu.test(xml)
      || /macroEnabled/iu.test(xml)) {
      throw new DriveError('INVALID_DOCUMENT', 'DOCX external relationships and macro-enabled content are not accepted.')
    }
  }
}

/** Admit one source document from its normalized extension and verified bytes. */
export function admitDriveDocument(input: {
  readonly name: string
  readonly data: Uint8Array
  readonly declaredMediaType?: string
  readonly limits: DriveLimits
}): AdmittedDriveDocument {
  const normalizedName = normalizeDriveName(input.name)
  if (input.data.byteLength === 0) throw new DriveError('INVALID_DOCUMENT', 'Empty documents are not accepted.')
  if (input.data.byteLength > input.limits.maxFileBytes) {
    throw new DriveError('FILE_TOO_LARGE', 'Document exceeds the configured encoded-byte limit.')
  }
  const extension = extensionOf(normalizedName)
  rejectDoubleExtension(normalizedName, extension)
  let mediaType: DriveMediaType
  if (extension === '.md' || extension === '.markdown') {
    mediaType = 'text/markdown'
    admitMarkdown(input.data)
  } else if (extension === '.pdf') {
    mediaType = 'application/pdf'
    admitPdf(input.data)
  } else if (extension === '.docx') {
    mediaType = DOCX_MEDIA
    admitDocx(input.data, input.limits)
  } else {
    throw new DriveError('UNSUPPORTED_FILE_TYPE', 'Only Markdown, PDF, and DOCX files are accepted.')
  }
  if (!declaredMatches(input.declaredMediaType, mediaType)) {
    throw new DriveError('MEDIA_TYPE_MISMATCH', 'Declared media type does not match the admitted document type.')
  }
  return { mediaType, normalizedName }
}
