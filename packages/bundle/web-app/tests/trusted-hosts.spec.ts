/** Web trust resolution for the /api browser-trust fence (`resolveWebTrust`). */

import { describe, expect, it } from 'vitest'
import { resolveWebTrust } from '../src/index.ts'

describe('resolveWebTrust', () => {
  it('preserves explicit proxy authorities without deriving direct LAN authorities', () => {
    expect(resolveWebTrust('127.0.0.1', ['harness.internal:3080']))
      .toEqual({ trustedHosts: ['harness.internal:3080'] })
  })

  it('rejects any unsupported bind host', () => {
    expect(() => resolveWebTrust('0.0.0.0', [])).toThrow(/unsupported WebServer bind host/)
  })

  it('keeps the loopback-only result empty when no proxy authority is declared', () => {
    expect(resolveWebTrust('127.0.0.1', [])).toEqual({ trustedHosts: [] })
    expect(resolveWebTrust('127.0.0.1', ['lab.internal']))
      .toEqual({ trustedHosts: ['lab.internal'] })
  })
})
