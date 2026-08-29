/** Package-owned invariant companion for `@sospink/dsh-buddy-api-drive`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-api-drive'
export const name = 'buddy-api-drive-invariant'
export const inject = ['invariants']
/** No runtime invariant: ctx.drive owns durability; the API projects complete snapshots and authenticated routes. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
