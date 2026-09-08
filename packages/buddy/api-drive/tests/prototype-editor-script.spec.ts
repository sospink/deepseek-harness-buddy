import { describe, expect, it } from 'vitest'
import { prototypeEditorScript } from '../src/prototype-editor-script.ts'

describe('prototype editor bridge', () => {
  it('ships a self-contained direct manipulation surface', () => {
    const source = prototypeEditorScript()
    expect(() => new Function(source)).not.toThrow()
    expect(source).toContain("type:'prototype-selected'")
    expect(source).toContain("type:'prototype-changed'")
    expect(source).toContain("type:'prototype-history'")
    expect(source).toContain('data-handle="')
    expect(source).toContain("operation.type==='set-style'")
    expect(source).toContain("operation.type==='hide'")
    expect(source).toContain("message.type==='prototype-reset'")
  })
})
