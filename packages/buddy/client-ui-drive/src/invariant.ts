/** Package-owned invariant companion for `@sospink/dsh-buddy-client-ui-drive`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-client-ui-drive'
export const name = 'buddy-client-ui-drive-invariant'
export const inject = ['invariants']
/** No runtime invariant: generated Remote codecs own wire validation and Slot ownership fails loud. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
