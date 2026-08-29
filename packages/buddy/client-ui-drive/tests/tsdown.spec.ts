import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Buddy Drive client build', () => {
  it('pins dynamic format runtimes into the one Loader-owned client artifact', () => {
    const source = readFileSync(new URL('../tsdown.config.ts', import.meta.url), 'utf8')
    expect(source).toContain("config.name === '@sospink/dsh-buddy-client-ui-drive/client'")
    expect(source).toContain('codeSplitting: false')
    expect(source).toContain("clientBundle('@sospink/dsh-buddy-client-ui-drive'")
  })
})
