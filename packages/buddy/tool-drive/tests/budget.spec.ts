import { describe, expect, it } from 'vitest'
import { fitItems, fitTextWindow, jsonBytes, normalizeText, utf8Bytes, utf8Prefix } from '../src/budget.ts'

describe('Buddy Drive output budgets', () => {
  it('counts and truncates UTF-8 only at scalar boundaries', () => {
    expect(utf8Bytes('A界')).toBe(4)
    expect(utf8Prefix('A界B', 0)).toBe('')
    expect(utf8Prefix('A界B', 1)).toBe('A')
    expect(utf8Prefix('A界B', 3)).toBe('A')
    expect(utf8Prefix('A界B', 4)).toBe('A界')
    expect(utf8Prefix('A界B', 99)).toBe('A界B')
    expect(jsonBytes({ text: '界' })).toBe(Buffer.byteLength(JSON.stringify({ text: '界' })))
    expect(normalizeText('a\r\nb\rc\0')).toBe('a\nb\nc')
  })

  it('fits whole items against both canonical and rendered budgets', () => {
    const value = fitItems({
      items: ['a', 'b', 'c'], limit: 3, maxValueBytes: 40, maxRenderBytes: 7,
      value: (items, truncated) => ({ items, truncated }),
      render: result => `${result.items.join(',')}|${String(result.truncated)}`,
    })
    expect(value).toEqual({ items: ['a'], truncated: true })
    expect(() => fitItems({
      items: [], limit: 1, maxValueBytes: 1, maxRenderBytes: 100,
      value: (items, truncated) => ({ items, truncated }), render: JSON.stringify,
    })).toThrow('canonical result envelope')
    expect(() => fitItems({
      items: [], limit: 1, maxValueBytes: 100, maxRenderBytes: 1,
      value: (items, truncated) => ({ items, truncated }), render: JSON.stringify,
    })).toThrow('rendered result envelope')
  })

  it('fits complete line windows and marks count/output truncation', () => {
    const value = fitTextWindow({
      lines: ['one', 'two', 'three'], startLine: 2, maxLines: 2,
      maxValueBytes: 200, maxRenderBytes: 9,
      value: (text, endLine, truncated) => ({ text, endLine, truncated }),
      render: result => `${result.endLine}|${String(result.truncated)}|${result.text}`,
    })
    expect(value).toEqual({ text: '', endLine: 1, truncated: true })
    expect(() => fitTextWindow({
      lines: ['x'], startLine: 1, maxLines: 1, maxValueBytes: 1, maxRenderBytes: 100,
      value: (text, endLine, truncated) => ({ text, endLine, truncated }), render: JSON.stringify,
    })).toThrow('canonical result envelope')
  })
})
