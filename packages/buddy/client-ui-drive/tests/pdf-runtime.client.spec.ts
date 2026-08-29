// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist', () => ({ version: 'test-runtime' }))

describe('loadPdfRuntime', () => {
  it('loads the PDF.js module only when explicitly requested', async () => {
    const { loadPdfRuntime } = await import('../src/client/pdf-runtime.ts')
    await expect(loadPdfRuntime()).resolves.toEqual({ version: 'test-runtime' })
  })
})
