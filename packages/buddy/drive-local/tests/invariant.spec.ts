import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply as applyDriveInvariant } from '../../drive/src/invariant.ts'
import { apply as applyLocalInvariant } from '../src/invariant.ts'

describe('Buddy Drive invariant ownership', () => {
  it('registers and disposes both package companions', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const drive = await applyDriveInvariant(ctx)
    const local = await applyLocalInvariant(ctx)
    expect(drive).toBeTypeOf('function')
    expect(local).toBeTypeOf('function')
    local()
    drive()
  })
})
