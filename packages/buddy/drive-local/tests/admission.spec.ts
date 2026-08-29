import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { DriveLimits } from '@sospink/dsh-buddy-drive'
import {
  admitDriveDocument, driveZipCompressionRatio, normalizeDriveName, normalizeDriveTags,
} from '../src/admission.ts'

const limits: DriveLimits = {
  maxFileBytes: 1024 * 1024,
  maxLibraryBytes: 4 * 1024 * 1024,
  maxDocxEntries: 16,
  maxDocxExpandedBytes: 2 * 1024 * 1024,
  maxDocxCompressionRatio: 100,
  maxAuditEvents: 1_000,
}

function docx(extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8('<w:document/>'),
    ...extra,
  }, { level: 0 })
}

describe('Buddy Drive name and tag admission', () => {
  it('computes ZIP ratios for empty, impossible, and ordinary entries', () => {
    expect(driveZipCompressionRatio(0, 0)).toBe(1)
    expect(driveZipCompressionRatio(0, 1)).toBe(Number.POSITIVE_INFINITY)
    expect(driveZipCompressionRatio(2, 6)).toBe(3)
  })

  it('normalizes display values without interpreting paths', () => {
    expect(normalizeDriveName('  角色分工.md  ')).toBe('角色分工.md')
    expect(normalizeDriveTags(['beta', ' alpha ', 'beta', ''])).toEqual(['alpha', 'beta'])
  })

  it.each(['', '.', '..', '../escape.md', 'a/b.md', 'a\\b.md'])(
    'rejects unsafe display name %j',
    (name) => { expect(() => normalizeDriveName(name)).toThrow(/single path segments/) },
  )
})

describe('Buddy Drive source-document admission', () => {
  it('admits bounded UTF-8 Markdown, PDF, and minimal DOCX', () => {
    expect(admitDriveDocument({ name: '职责.md', data: strToU8('# 职责'), limits }).mediaType)
      .toBe('text/markdown')
    expect(admitDriveDocument({
      name: '协议.pdf', data: strToU8('%PDF-1.7\n%%EOF'), declaredMediaType: 'application/pdf', limits,
    }).mediaType).toBe('application/pdf')
    expect(admitDriveDocument({ name: '角色.docx', data: docx(), limits }).mediaType)
      .toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  })

  it('rejects overlong names and excessive tags', () => {
    expect(() => normalizeDriveName(`${'界'.repeat(86)}.md`)).toThrow(/255 UTF-8 bytes/)
    expect(() => normalizeDriveTags(Array.from({ length: 33 }, (_, index) => `tag-${index}`)))
      .toThrow(/tag/)
    expect(() => normalizeDriveTags(['x'.repeat(65)])).toThrow(/tag/)
  })

  it('rejects extension and declared-media spoofing', () => {
    expect(() => admitDriveDocument({ name: 'fake.pdf', data: strToU8('# markdown'), limits }))
      .toThrow(/PDF/)
    expect(() => admitDriveDocument({
      name: 'real.md', data: strToU8('# markdown'), declaredMediaType: 'application/pdf', limits,
    })).toThrow(/Declared media type/)
    expect(() => admitDriveDocument({ name: 'archive.zip', data: docx(), limits }))
      .toThrow(/Only Markdown, PDF, and DOCX/)
    expect(() => admitDriveDocument({ name: 'invoice.pdf.md', data: strToU8('# disguised'), limits }))
      .toThrow(/double extension/)
    expect(() => admitDriveDocument({ name: 'macro.docm', data: docx(), limits }))
      .toThrow(/Only Markdown, PDF, and DOCX/)
  })

  it('rejects every recognized binary signature disguised as Markdown', () => {
    for (const data of [
      strToU8('%PDF-1.7'),
      Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
      Uint8Array.of(0x4d, 0x5a, 0x01, 0x02),
      Uint8Array.of(0x7f, 0x45, 0x4c, 0x46),
    ]) {
      expect(() => admitDriveDocument({ name: 'disguised.md', data, limits }))
        .toThrow(/binary signature/)
    }
  })

  it('rejects invalid UTF-8, NUL-heavy text, malformed PDF, and unknown ZIP', () => {
    expect(() => admitDriveDocument({ name: 'bad.md', data: Uint8Array.of(0xff), limits }))
      .toThrow(/valid UTF-8/)
    expect(() => admitDriveDocument({ name: 'bad.md', data: Uint8Array.of(0, 0, 0, 0, 0), limits }))
      .toThrow(/NUL/)
    expect(() => admitDriveDocument({
      name: 'controls.md', data: Uint8Array.of(1, 2, 3, 4, 5, 10, 13, 9), limits,
    })).toThrow(/control characters/)
    expect(() => admitDriveDocument({ name: 'bad.pdf', data: strToU8('%PDF-x.y'), limits }))
      .toThrow(/version header/)
    expect(() => admitDriveDocument({ name: 'bad.docx', data: zipSync({ 'x.txt': strToU8('x') }), limits }))
      .toThrow(/required OOXML/)
    expect(() => admitDriveDocument({ name: 'not-zip.docx', data: strToU8('not zip'), limits }))
      .toThrow(/OOXML ZIP/)
    expect(() => admitDriveDocument({ name: 'broken.docx', data: Uint8Array.of(0x50, 0x4b, 1, 2, 3), limits }))
      .toThrow(/malformed or unsupported/)
    expect(() => admitDriveDocument({ name: 'empty.md', data: new Uint8Array(), limits }))
      .toThrow(/Empty documents/)
    expect(() => admitDriveDocument({ name: 'README', data: strToU8('plain'), limits }))
      .toThrow(/Only Markdown/)
  })

  it('rejects macro, AltChunk, external relationships, unsafe members, and ZIP bombs', () => {
    expect(() => admitDriveDocument({
      name: 'macro.docx', data: docx({ 'word/vbaProject.bin': Uint8Array.of(1) }), limits,
    })).toThrow(/Macro-enabled/)
    expect(() => admitDriveDocument({
      name: 'alt.docx', data: docx({ 'word/afchunk1.html': strToU8('<b>x</b>') }), limits,
    })).toThrow(/AltChunk/)
    expect(() => admitDriveDocument({
      name: 'external.docx',
      data: docx({ 'word/_rels/document.xml.rels': strToU8('<Relationship TargetMode="External"/>') }),
      limits,
    })).toThrow(/external relationships/)
    expect(() => admitDriveDocument({
      name: 'escape.docx', data: docx({ '../escape': Uint8Array.of(1) }), limits,
    })).toThrow(/unsafe ZIP member/)
    expect(() => admitDriveDocument({
      name: 'ratio.docx',
      data: zipSync({
        '[Content_Types].xml': strToU8('<Types/>'),
        'word/document.xml': new Uint8Array(100_000),
      }, { level: 9 }),
      limits: { ...limits, maxDocxCompressionRatio: 2 },
    })).toThrow(/compression ratio/)
    expect(() => admitDriveDocument({
      name: 'entries.docx', data: docx({ a: Uint8Array.of(1), b: Uint8Array.of(1) }),
      limits: { ...limits, maxDocxEntries: 3 },
    })).toThrow(/too many ZIP entries/)
    expect(() => admitDriveDocument({
      name: 'expanded.docx', data: docx({ extra: new Uint8Array(100) }),
      limits: { ...limits, maxDocxExpandedBytes: 10 },
    })).toThrow(/expanded content/)
    expect(() => admitDriveDocument({
      name: 'bad-xml.docx', data: docx({
        'word/_rels/document.xml.rels': Uint8Array.of(0xff),
      }), limits,
    })).toThrow(/valid UTF-8 XML/)
  })

  it('enforces exact encoded-byte limits', () => {
    const data = strToU8('# exact')
    expect(() => admitDriveDocument({ name: 'ok.md', data, limits: { ...limits, maxFileBytes: data.length } }))
      .not.toThrow()
    expect(() => admitDriveDocument({ name: 'large.md', data, limits: { ...limits, maxFileBytes: data.length - 1 } }))
      .toThrow(/encoded-byte limit/)
  })
})
