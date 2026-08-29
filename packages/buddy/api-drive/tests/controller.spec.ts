import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import BuddyDriveController from '../src/index.ts'
import type { DriveHarness } from './helpers.ts'
import { driveHarness } from './helpers.ts'

let active: DriveHarness[] = []
afterEach(async () => {
  await Promise.all(active.map(item => item.dispose()))
  active = []
})

async function fixture() {
  const harness = await driveHarness()
  active.push(harness)
  const routes = new Map<string, WebRoute>()
  const dispose = vi.fn<(path: string) => void>()
  harness.ctx.provide('typert', {} as never)
  harness.ctx.provide('webServer', {
    register(route: WebRoute) {
      routes.set(route.path, route)
      return () => { routes.delete(route.path); dispose(route.path) }
    },
  } as never)
  const fiber = await harness.ctx.plugin(BuddyDriveController)
  return { ...harness, routes, dispose, fiber, controller: harness.ctx.buddyDriveController }
}

describe('BuddyDriveController', () => {
  it('registers routes, forwards every Remote method, follows snapshots, and disposes', async () => {
    const value = await fixture()
    expect([...value.routes.keys()].sort()).toEqual([
      '/api/buddy-drive/content', '/api/buddy-drive/upload',
    ])
    expect(value.controller.baseline()).toMatchObject({ library: { id: 'default' }, folders: [], files: [] })
    const root = (await value.controller.createFolder({ name: 'Root' })).folder
    const child = (await value.controller.createFolder({ parentId: root.id, name: 'Child' })).folder
    expect((await value.controller.renameFolder({ folderId: child.id, name: 'Renamed' })).folder.name).toBe('Renamed')
    expect((await value.controller.moveFolder({ folderId: child.id })).folder).not.toHaveProperty('parentId')
    const file = await value.ctx.drive.importFile({
      libraryId: value.ctx.drive.library().id, parentId: root.id,
      name: 'file.md', kind: 'general', data: new TextEncoder().encode('# file'),
    })
    expect((await value.controller.renameFile({ fileId: file.id, name: 'renamed.md' })).file.name).toBe('renamed.md')
    expect((await value.controller.moveFile({ fileId: file.id })).file).not.toHaveProperty('parentId')
    expect((await value.controller.updateFileMetadata({ fileId: file.id, kind: 'reference' })).file.kind).toBe('reference')
    expect((await value.controller.versions({ fileId: file.id })).versions).toHaveLength(1)
    expect((await value.controller.audit()).events.length).toBeGreaterThan(0)
    expect((await value.controller.deleteFile({ fileId: file.id })).file.deletedAt).toBeDefined()
    expect((await value.controller.restoreFile({ fileId: file.id })).file).not.toHaveProperty('deletedAt')

    const abort = new AbortController()
    const iterator = value.controller.follow(abort.signal)[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'baseline' } })
    abort.abort()
    await iterator.return?.()

    await value.fiber.dispose()
    expect(value.routes.size).toBe(0)
    expect(value.dispose).toHaveBeenCalledTimes(2)
  })
})
