/** Bounded Markdown loading and image deactivation for the Drive preview surface. */

import type { Nodes } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'

/** Largest Markdown source the browser preview will retain for source mode. */
export const MARKDOWN_PREVIEW_MAX_BYTES = 2 * 1024 * 1024
/** Largest UTF-8 prefix admitted to rich Markdown parsing and DOM rendering. */
export const MARKDOWN_RENDER_MAX_BYTES = 256 * 1024
/** Largest number of source lines admitted to rich Markdown rendering. */
export const MARKDOWN_RENDER_MAX_LINES = 4_000

export interface BoundedMarkdownRender {
  readonly source: string
  readonly truncated: boolean
}

/** Bound rich rendering separately from the larger, single-text-node source view. */
export function boundedMarkdownRenderSource(
  source: string,
  maxBytes = MARKDOWN_RENDER_MAX_BYTES,
  maxLines = MARKDOWN_RENDER_MAX_LINES,
): BoundedMarkdownRender {
  const encoded = new TextEncoder().encode(source)
  let rendered = source
  let truncated = false
  if (encoded.byteLength > maxBytes) {
    let end = maxBytes
    while (end > 0 && ((encoded[end] as number) >>> 6) === 0b10) end -= 1
    rendered = new TextDecoder('utf-8', { fatal: true }).decode(encoded.subarray(0, end))
    truncated = true
  }
  let lines = 1
  for (let index = 0; index < rendered.length; index += 1) {
    if (rendered.charCodeAt(index) !== 10) continue
    lines += 1
    if (lines <= maxLines) continue
    rendered = rendered.slice(0, index)
    truncated = true
    break
  }
  return { source: rendered, truncated }
}

function contentLength(response: Response): number | undefined {
  const raw = response.headers.get('content-length')
  if (raw === null) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** Load one immutable Markdown version without buffering beyond the preview budget. */
export async function loadMarkdownSource(
  url: string,
  signal: AbortSignal,
  maxBytes = MARKDOWN_PREVIEW_MAX_BYTES,
): Promise<string> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Markdown preview request failed (${String(response.status)}).`)
  const declared = contentLength(response)
  if (declared !== undefined && declared > maxBytes) throw new Error(`Markdown preview exceeds ${String(maxBytes)} bytes.`)
  if (response.body === null) {
    const body = new Uint8Array(await response.arrayBuffer())
    if (body.byteLength > maxBytes) throw new Error(`Markdown preview exceeds ${String(maxBytes)} bytes.`)
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > maxBytes) throw new Error(`Markdown preview exceeds ${String(maxBytes)} bytes.`)
      chunks.push(part.value)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

function collectImageOffsets(node: Nodes, offsets: number[]): void {
  if ((node.type === 'image' || node.type === 'imageReference') && node.position?.start.offset !== undefined) {
    offsets.push(node.position.start.offset)
  }
  if ('children' in node) for (const child of node.children) collectImageOffsets(child, offsets)
}

/**
 * Escape image markers before handing untrusted Drive Markdown to Harness MarkdownText.
 * Links remain explicit and clickable, but no document-authored image URL is fetched.
 */
export function deactivateMarkdownImages(source: string): string {
  const root = fromMarkdown(source, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  })
  const offsets: number[] = []
  collectImageOffsets(root, offsets)
  let output = source
  for (const offset of offsets.sort((left, right) => right - left)) {
    output = `${output.slice(0, offset)}\\${output.slice(offset)}`
  }
  return output
}
