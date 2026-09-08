/** Browser plugin mounting Development Management Remote, sidebar entry, and workspace. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import developmentRemote from '@sospink/dsh-buddy-development-management/remote'
import type {} from '@sospink/dsh-buddy-development-management/remote'
import { DevelopmentOverlay } from './DevelopmentOverlay.tsx'
import { DevelopmentTrigger } from './DevelopmentTrigger.tsx'
import { en, zh, type DevelopmentManagementKey } from './locales.ts'
import { DevelopmentManagementClient } from './service.ts'

export { DevelopmentManagementClient } from './service.ts'
export { DevelopmentOverlay } from './DevelopmentOverlay.tsx'
export { DevelopmentTrigger } from './DevelopmentTrigger.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'buddy.developmentManagement': DevelopmentManagementKey } }

export const inject = ['remote', 'slots', 'locale']

/** Mount the generated Remote and product workspace. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(developmentRemote)
  try {
    const remote = ctx.get('remote.developmentManagement') as TypertClientRemote['developmentManagement'] | undefined
    if (remote === undefined) throw new Error('development-management: Remote namespace did not mount')
    const client = new DevelopmentManagementClient(ctx, remote)
    ctx.effect(() => ctx.locale.register('buddy.developmentManagement', { zh, en }), 'development-management: dictionaries')
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'development-management', order: 10, label: () => ctx.locale.bind('buddy.developmentManagement')('trigger'), locale: 'buddy.developmentManagement', inject: () => ({ client }) }, DevelopmentTrigger))
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'development-management', order: 5, locale: 'buddy.developmentManagement', inject: () => ({ client }) }, DevelopmentOverlay))
    void client.refresh().catch((error: unknown) => { client.failed(error) })
    return async () => { await disposeRemote() }
  } catch (error) { await disposeRemote(); throw error }
}
