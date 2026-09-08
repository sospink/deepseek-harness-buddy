/** Buddy Drive browser plugin: Remote mount, state stream, sidebar entry, and standalone overlay. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import driveRemote from '@sospink/dsh-buddy-api-drive/remote'
import type {} from '@sospink/dsh-buddy-api-drive/remote'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import { DriveOverlay } from './DriveOverlay.tsx'
import { DriveTrigger } from './DriveTrigger.tsx'
import { en, zh, type BuddyDriveKey } from './locales.ts'
import { BuddyDriveClient, createBuddyDriveStream } from './service.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PrototypeCanvas } from './PrototypeCanvas.tsx'
import { PrototypeToolRow, type PrototypeToolRowInjected } from './PrototypeToolRow.tsx'
import { en as prototypeEn, zh as prototypeZh, type PrototypeKey } from './prototype-locales.ts'

interface PrototypeConversation { openView(view: string, focus: string): void }

export { DriveOverlay } from './DriveOverlay.tsx'
export { DriveTrigger } from './DriveTrigger.tsx'
export { UploadQueue } from './UploadQueue.tsx'
export { BuddyDriveClient, createBuddyDriveStream } from './service.ts'
export type { BuddyDriveSnapshot, BuddyDriveSource, DriveUploadItem, DriveUploadStatus } from './service.ts'
export { DRIVE_UPLOAD_QUEUE_CONCURRENCY, DRIVE_UPLOAD_QUEUE_MAX_ITEMS, startDriveUpload } from './upload.ts'
export type { UploadDriveFileInput, UploadProgress, UploadTransportInput, UploadRequest, UploadTransport } from './upload.ts'
export type { BuddyDriveKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'buddy-drive': BuddyDriveKey
    'buddy-prototype': PrototypeKey
  }
}

const NS = 'buddy-drive'

/** Required Client services; target slots are resolved declaration-safely through slots.inject. */
export const inject = ['remote', 'slots', 'locale', 'sessions']

/** Mount the generated Drive Remote namespace and its standalone browser surface. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(driveRemote)
  let client: BuddyDriveClient | undefined
  let stream: ReturnType<typeof createBuddyDriveStream> | undefined
  try {
    const drive = ctx.get('remote.drive') as TypertClientRemote['drive'] | undefined
    if (drive === undefined) throw new Error('buddy-client-ui-drive: mounted Remote contribution provided no drive namespace')
    client = new BuddyDriveClient(ctx, drive)
    stream = createBuddyDriveStream({
      drive,
      $stream: options => ctx.remote.$stream(options),
    }, client)
    stream.start()
    const mountedClient = client
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'buddy-client-ui-drive: dictionaries')
    ctx.effect(() => ctx.locale.register('buddy-prototype', { zh: prototypeZh, en: prototypeEn }), 'buddy-prototype: dictionaries')
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
      name: 'conversation.view', id: 'prototype', order: 20,
      label: () => ctx.locale.bind('buddy-prototype')('view'), locale: 'buddy-prototype',
    }, PrototypeCanvas))
    for (const key of ['generate_prototype', 'update_prototype']) {
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview', key, locale: 'buddy-prototype',
        inject: (sessionId: SessionId): PrototypeToolRowInjected => ({
          openPrototype: (focus) => {
            const conversation = ctx.sessions.scope(sessionId)?.get('conversation') as PrototypeConversation | undefined
            if (conversation === undefined) throw new Error(`buddy-prototype: conversation unavailable for session "${sessionId}"`)
            conversation.openView('prototype', focus)
          },
        }),
      }, PrototypeToolRow))
    }
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'buddy-drive',
      order: 20,
      label: () => ctx.locale.bind(NS)('trigger'),
      locale: NS,
      inject: () => ({ client: mountedClient }),
    }, DriveTrigger))
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'buddy-drive',
      order: 10,
      locale: NS,
      inject: () => ({ client: mountedClient }),
    }, DriveOverlay))
    void client.refresh().catch((error: unknown) => { client?.failed(error) })
    return async () => {
      await stream?.dispose()
      await disposeRemote()
    }
  } catch (error) {
    await stream?.dispose()
    await disposeRemote()
    throw error
  }
}
