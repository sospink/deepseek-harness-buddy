import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { Context, Service } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { DriveLibraryId } from '@sospink/dsh-buddy-drive'
import type { DriveBaseline, DriveFollowFrame } from '@sospink/dsh-buddy-api-drive/types'
import { apply, inject } from '../src/client/index.ts'
import { DriveOverlay } from '../src/client/DriveOverlay.tsx'
import { DriveTrigger } from '../src/client/DriveTrigger.tsx'
import type { DriveUiInjected } from '../src/client/DriveTrigger.tsx'

const now = '2026-08-29T00:00:00.000Z'
const baseline: DriveBaseline = {
  library: { id: DriveLibraryId('default'), title: 'Drive', createdAt: now, updatedAt: now },
  folders: [], files: [],
}

class RemoteDouble extends Service {
  readonly mounted: TypertRemoteContribution[] = []
  readonly unmounted: TypertRemoteContribution[] = []
  followBaseline: boolean = true
  readonly drive = {
    baseline: vi.fn<() => Promise<RemoteResult<DriveBaseline>>>(async () => ({ ok: true, value: baseline })),
    follow: (signal: AbortSignal): AsyncIterable<DriveFollowFrame> => this.follow(signal),
  }
  readonly generation = { getSnapshot: () => ({ id: 1 }), subscribe: () => () => {} }

  constructor(ctx: Context) { super(ctx, 'remote') }

  private async * follow(signal: AbortSignal): AsyncIterable<DriveFollowFrame> {
    if (this.followBaseline) yield { type: 'baseline', value: baseline }
    await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
  }

  async $mount(contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
    this.mounted.push(contribution)
    this.ctx.root.provide('remote.drive', this.drive)
    return async () => { this.unmounted.push(contribution) }
  }

  $stream<Item>(options: ConstructorParameters<typeof RemoteStream<Item>>[1]): RemoteStream<Item> {
    return new RemoteStream<Item>({ generation: this.generation } as never, options)
  }
}

async function bench(declareBefore: boolean, initialFailure = false) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const remote = new RemoteDouble(ctx)
  if (initialFailure) {
    remote.followBaseline = false
    remote.drive.baseline.mockResolvedValueOnce({
      ok: false, error: { code: 'offline', message: 'not available', details: {} },
    })
  }
  const declare = () => ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  if (declareBefore) declare()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  if (!declareBefore) declare()
  await Promise.resolve()
  return { ctx, locale, remote, fiber }
}

describe('buddy-client-ui-drive apply', () => {
  it('declares the exact services it uses', () => {
    expect(inject).toEqual(['remote', 'slots', 'locale'])
  })

  it.each([true, false])('mounts Remote and fills slots when declarations exist before=%s', async (before) => {
    const b = await bench(before)
    expect(b.remote.mounted).toHaveLength(1)
    const trigger = b.ctx.slots.entries('sidebar.footer.action')[0]!
    const overlay = b.ctx.slots.entries('shell.overlay')[0]!
    expect(trigger.component).toBe(DriveTrigger)
    expect(trigger.options).toMatchObject({ id: 'buddy-drive', order: 20 })
    expect(overlay.component).toBe(DriveOverlay)
    expect(overlay.options).toMatchObject({ id: 'buddy-drive', order: 10 })
    expect(trigger.locale).toBe('buddy-drive')
    expect(b.locale.bind('buddy-drive')('trigger')).toBe('资料云盘')
    expect(resolveSlotLabel(trigger.options.label)).toBe('资料云盘')
    const injected = (trigger.inject as unknown as () => DriveUiInjected)()
    const overlayInjected = (overlay.inject as unknown as () => DriveUiInjected)()
    expect(overlayInjected.client).toBe(injected.client)
    expect(injected.client.source.getSnapshot().data).toEqual(baseline)
    await b.fiber.dispose()
    expect(b.remote.unmounted).toHaveLength(1)
    expect(b.ctx.slots.entries('sidebar.footer.action')).toEqual([])
    expect(b.ctx.slots.entries('shell.overlay')).toEqual([])
  })

  it('publishes initial refresh failures on the mounted client', async () => {
    const b = await bench(true, true)
    const trigger = b.ctx.slots.entries('sidebar.footer.action')[0]!
    const injected = (trigger.inject as unknown as () => DriveUiInjected)()
    await vi.waitFor(() => {
      expect(injected.client.source.getSnapshot()).toMatchObject({
        state: 'failed', error: 'offline: not available',
      })
    })
    await b.fiber.dispose()
  })

  it('unmounts a contribution that provides no drive namespace', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    class MissingNamespaceRemote extends RemoteDouble {
      override async $mount(contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
        this.mounted.push(contribution)
        return async () => { this.unmounted.push(contribution) }
      }
    }
    const remote = new MissingNamespaceRemote(ctx)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await expect(fiber).rejects.toThrow('provided no drive namespace')
    expect(remote.unmounted).toHaveLength(1)
    await fiber.dispose()
  })

  it('unmounts the Remote contribution when stream construction fails', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    class FailingRemote extends RemoteDouble {
      override $stream<Item>(): RemoteStream<Item> { throw new Error('stream construction failed') }
    }
    const remote = new FailingRemote(ctx)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await expect(fiber).rejects.toThrow('stream construction failed')
    expect(remote.unmounted).toHaveLength(1)
    await fiber.dispose()
  })
})
