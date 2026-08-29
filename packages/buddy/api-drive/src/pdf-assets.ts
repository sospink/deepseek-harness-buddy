/** Pinned PDF.js browser assets exposed through authenticated same-origin routes. */

import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('pdfjs-dist/package.json'))
const cmapRoot = join(packageRoot, 'cmaps')

/** Exact PDF.js worker bytes served from the local installed dependency. */
export const PDF_WORKER_SOURCE = readFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'))

const cmapNames = new Set(readdirSync(cmapRoot).filter(name => /^[A-Za-z0-9_.-]+\.bcmap$/u.test(name)))
const cmapCache = new Map<string, Buffer>()

/** Read one allowlisted packed CMap; arbitrary paths and unknown assets are absent. */
export function readPdfCMap(name: string): Buffer | undefined {
  if (!cmapNames.has(name)) return undefined
  const cached = cmapCache.get(name)
  if (cached !== undefined) return cached
  const content = readFileSync(join(cmapRoot, name))
  cmapCache.set(name, content)
  return content
}
