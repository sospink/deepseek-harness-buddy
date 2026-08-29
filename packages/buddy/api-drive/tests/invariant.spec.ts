import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply } from '../src/invariant.ts'

describe('Buddy API Drive invariant ownership', () => {
  it('registers and disposes the package companion', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const dispose = await apply(ctx)
    expect(dispose).toBeTypeOf('function')
    dispose()
  })
})
