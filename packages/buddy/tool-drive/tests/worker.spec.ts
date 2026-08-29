import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendPdfPageText, extractDocxText, extractPdfText, pdfPageText,
  runExtractionWorker, workerTextPrefix, workerWarnings,
} from '../src/worker.ts'
import type { ExtractWorkerInput } from '../src/protocol.ts'

function pdfFixture(text: string): Uint8Array {
  const escaped = text.replace(/[()\\]/gu, value => `\\${value}`)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${String(Buffer.byteLength(`BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`))} >>\nstream\nBT /F1 12 Tf 72 720 Td (${escaped}) Tj ET\nendstream`,
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source))
    source += `${String(index + 1)} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(source)
  source += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, '0')} 00000 n \n`
  source += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`
  return new TextEncoder().encode(source)
}

function input(mediaType: ExtractWorkerInput['mediaType'], data: Uint8Array, maxTextBytes = 4096): ExtractWorkerInput {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return { mediaType, buffer, maxTextBytes }
}

describe('Buddy Drive extraction Worker', () => {
  it('projects PDF text items and caps Worker warnings', () => {
    expect(pdfPageText([{ str: 'a' }, { type: 'marked' }, { str: 'b' }])).toBe('a b')
    expect(appendPdfPageText('', 1, 'one')).toBe('[PDF page 1]\none')
    expect(appendPdfPageText('[PDF page 1]\none', 2, 'two')).toBe('[PDF page 1]\none\n\n[PDF page 2]\ntwo')
    expect(workerWarnings(Array.from({ length: 12 }, (_, index) => ({ message: `w${String(index)}` })))).toHaveLength(10)
  })

  it('truncates UTF-8 text at valid scalar boundaries', () => {
    expect(workerTextPrefix('A界B', 99)).toEqual({ text: 'A界B', truncated: false })
    expect(workerTextPrefix('A界B', 4)).toEqual({ text: 'A界', truncated: true })
    expect(workerTextPrefix('界', 2)).toEqual({ text: '', truncated: true })
  })

  it('extracts PDF text with page provenance and applies the output budget', async () => {
    const value = await extractPdfText(input('application/pdf', pdfFixture('Position safety target')))
    expect(value).toMatchObject({ ok: true, truncated: false, warnings: [] })
    expect(value.ok && value.text).toContain('[PDF page 1]')
    expect(value.ok && value.text).toContain('Position safety target')
    const cut = await extractPdfText(input('application/pdf', pdfFixture('Long target text'), 16))
    expect(cut).toMatchObject({ ok: true, truncated: true })
  })

  it('extracts DOCX raw text without HTML conversion', async () => {
    const require = createRequire(import.meta.url)
    const mammothRoot = dirname(require.resolve('mammoth/package.json'))
    const data = new Uint8Array(await readFile(join(mammothRoot, 'test/test-data/single-paragraph.docx')))
    const value = await extractDocxText(input(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data,
    ))
    expect(value).toEqual({ ok: true, text: 'Walking on imported air\n\n', truncated: false, warnings: [] })
    const cut = await extractDocxText(input(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data, 8,
    ))
    expect(cut).toMatchObject({ ok: true, text: 'Walking ', truncated: true })
  })

  it('dispatches valid PDF and DOCX requests through the Worker router', async () => {
    const pdf = await runExtractionWorker(input('application/pdf', pdfFixture('routed pdf')))
    expect(pdf.ok && pdf.text).toContain('routed pdf')
    const require = createRequire(import.meta.url)
    const mammothRoot = dirname(require.resolve('mammoth/package.json'))
    const data = new Uint8Array(await readFile(join(mammothRoot, 'test/test-data/single-paragraph.docx')))
    const docx = await runExtractionWorker(input(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data,
    ))
    expect(docx.ok && docx.text).toContain('Walking on imported air')
  })

  it('validates requests and rejects unsupported or malformed sources', async () => {
    await expect(runExtractionWorker({ mediaType: 'application/pdf', buffer: 'bad', maxTextBytes: 1 } as never))
      .resolves.toEqual({ ok: false, message: 'Invalid extraction request.' })
    await expect(runExtractionWorker({ mediaType: 'application/pdf', buffer: new ArrayBuffer(1), maxTextBytes: 0 }))
      .resolves.toEqual({ ok: false, message: 'Invalid extraction request.' })
    await expect(runExtractionWorker({ mediaType: 'text/markdown', buffer: new ArrayBuffer(1), maxTextBytes: 1 } as never))
      .resolves.toEqual({ ok: false, message: 'Unsupported extraction media type.' })
    await expect(extractPdfText(input('application/pdf', new TextEncoder().encode('not pdf')))).rejects.toThrow()
    await expect(extractDocxText(input(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Uint8Array([1, 2, 3]),
    ))).rejects.toThrow()
  })
})
