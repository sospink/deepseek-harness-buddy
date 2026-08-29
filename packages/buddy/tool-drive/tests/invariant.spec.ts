import { describe, expect, it } from 'vitest'
import * as Invariant from '../src/invariant.ts'

class Registry {
  seen: string | undefined
  register(name: string): () => void { this.seen = name; return () => { this.seen = undefined } }
}

describe('Buddy Drive tool invariant companion', () => {
  it('registers the package identity and disposes it', async () => {
    const registry = new Registry()
    const dispose = await Invariant.apply({ invariants: registry } as never)
    expect(registry.seen).toBe('@sospink/dsh-buddy-tool-drive')
    dispose()
    expect(registry.seen).toBeUndefined()
  })
})
