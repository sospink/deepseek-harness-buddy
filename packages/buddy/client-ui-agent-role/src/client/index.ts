/** Browser plugin mounting the Buddy role Remote and Hero selector. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import agentRolesRemote from '@sospink/dsh-buddy-agent-role/remote'
import type {} from '@sospink/dsh-buddy-agent-role/remote'
import { AgentRoleSeat, type AgentRoleSeatInjected } from './AgentRoleSeat.tsx'
import { en, zh, type AgentRoleKey } from './locales.ts'
import { AgentRoleSeatController } from './store.ts'

export { AgentRoleSeat } from './AgentRoleSeat.tsx'
export type { AgentRoleSeatInjected, AgentRoleSeatProps } from './AgentRoleSeat.tsx'
export type { AgentRoleKey } from './locales.ts'
export { AgentRoleSeatController } from './store.ts'
export type { AgentRoleSeatState } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'buddy.agentRole': AgentRoleKey
  }
}

export const inject = ['remote', 'slots', 'locale', 'sessions']

/** Mount the Host Remote contribution and register the new-session role seat. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(agentRolesRemote)
  try {
    const remote = ctx.get('remote.agentRoles') as TypertClientRemote['agentRoles'] | undefined
    if (remote === undefined) throw new Error('buddy-client-ui-agent-role: role Remote did not mount')
    ctx.effect(() => ctx.locale.register('buddy.agentRole', { zh, en }), 'buddy-agent-role: dictionaries')
    ctx.inject(['conversation'], (scope: ClientContext) => {
      const controller = new AgentRoleSeatController(remote, () => {
        const state = scope.sessions.list.getSnapshot()
        return state.current === undefined ? undefined : state.byId[state.current]
      })
      const injected = (): AgentRoleSeatInjected => ({
        hooks: { agentRoleSeat: controller.store },
        sync: () => { controller.sync() },
        select: role => controller.select(role),
      })
      scope.effect(() => {
        const stop = scope.sessions.list.subscribe(() => { controller.sync() })
        controller.sync()
        const seat = scope.slots.register({
          name: 'conversation.hero.agentRole',
          locale: 'buddy.agentRole',
          inject: injected,
        }, AgentRoleSeat)
        return () => { stop(); seat() }
      }, 'buddy-agent-role: Hero selector')
    })
    return async () => { await disposeRemote() }
  } catch (error) {
    await disposeRemote()
    throw error
  }
}
