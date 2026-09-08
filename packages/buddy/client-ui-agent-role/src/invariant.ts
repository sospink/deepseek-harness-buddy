/** Package-owned invariant companion for the Buddy role picker. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sospink/dsh-buddy-client-ui-agent-role'
export const name = 'buddy-client-ui-agent-role-invariant'
export const inject = ['invariants']
/** No runtime invariant: the Host role service owns its durable events. */
const install: InvariantInstaller = () => {}
/** Reserve package ownership with the shared invariant registry. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
