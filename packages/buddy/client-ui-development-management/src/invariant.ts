/** Package-owned invariant companion for Development Management browser UI. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-client-ui-development-management'
export const name = 'buddy-client-ui-development-management-invariant'
export const inject = ['invariants']
/** Slot ownership and generated Remote codecs fail loud during Client activation. */
const install: InvariantInstaller = () => {
  // No runtime invariant: Remote mounting and slot registration are lifecycle
  // operations whose failures already reject Client activation synchronously.
}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
