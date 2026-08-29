/** Package-owned invariant companion for `@sospink/dsh-buddy-tool-drive`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-tool-drive'
export const name = 'buddy-tool-drive-invariant'
export const inject = ['invariants']
/** No runtime invariant: this read-only Consumer owns no mutable data relationship. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
