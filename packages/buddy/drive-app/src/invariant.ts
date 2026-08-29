/** Package-owned invariant companion for `@sospink/dsh-buddy-drive-app`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-drive-app'
export const name = 'buddy-drive-app-invariant'
export const inject = ['invariants']
/** No runtime invariant: the bundle is a declarative patch over independently checked packages. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
