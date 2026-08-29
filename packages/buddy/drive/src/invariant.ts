/** Package-owned invariant companion for `@sospink/dsh-buddy-drive`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-drive'

/** Cordis companion plugin name. */
export const name = 'buddy-drive-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/** No runtime invariant: provider implementations own durable state relations behind this interface. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
