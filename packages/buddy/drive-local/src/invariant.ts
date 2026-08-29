/** Package-owned invariant companion for `@sospink/dsh-buddy-drive-local`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-drive-local'

/** Cordis companion plugin name. */
export const name = 'buddy-drive-local-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/** No runtime invariant: startup and every metadata commit validate the complete durable relation. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
