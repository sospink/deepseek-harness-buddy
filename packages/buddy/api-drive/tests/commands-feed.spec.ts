import { afterEach, describe, expect, it } from 'vitest'
import { DriveFileId } from '@sospink/dsh-buddy-drive'
import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import { DriveCommands } from '../src/commands.ts'
import { DriveFeed, driveBaseline } from '../src/feed.ts'
import type { DriveFollowFrame } from '../src/types.ts'
import type { DriveHarness } from './helpers.ts'
import { driveHarness } from './helpers.ts'

let active: DriveHarness[] = []

type DriveIterator = AsyncIterator<DriveFollowFrame, undefined>

function driveIterator(iterable: AsyncIterable<DriveFollowFrame>): DriveIterator {
  return iterable[Symbol.asyncIterator]()
}
afterEach(async () => {
  await Promise.all(active.map(item => item.dispose()))
  active = []
})

async function harness(): Promise<DriveHarness> {
  const value = await driveHarness()
  active.push(value)
  return value
}

describe('DriveCommands', () => {
  it('projects baseline and executes every metadata command', async () => {
    const { ctx } = await harness()
    const commands = new DriveCommands(ctx)
    const parent = (await commands.createFolder({ name: 'Parent' })).folder
    const folder = (await commands.createFolder({ parentId: parent.id, name: 'Folder' })).folder
    const file = await ctx.drive.importFile({
      libraryId: ctx.drive.library().id, parentId: folder.id,
      name: 'file.md', kind: 'general', data: new TextEncoder().encode('# file'),
    })
    expect(commands.baseline().folders.map(item => item.id)).toEqual([parent.id, folder.id])
    expect(commands.baseline().files).toEqual([file])
    expect((await commands.renameFolder({ folderId: folder.id, name: 'Renamed' })).folder.name).toBe('Renamed')
    expect((await commands.moveFolder({ folderId: folder.id, parentId: parent.id })).folder.parentId).toBe(parent.id)
    expect((await commands.renameFile({ fileId: file.id, name: 'renamed.md' })).file.name).toBe('renamed.md')
    expect((await commands.moveFile({ fileId: file.id, parentId: parent.id })).file.parentId).toBe(parent.id)
    expect((await commands.updateFileMetadata({
      fileId: file.id, kind: 'reference', tags: ['tag'],
    })).file).toMatchObject({ kind: 'reference', tags: ['tag'] })
    expect((await commands.versions({ fileId: file.id })).versions).toHaveLength(1)
    expect((await commands.audit()).events.length).toBeGreaterThan(0)
    expect((await commands.deleteFile({ fileId: file.id })).file.deletedAt).toBeDefined()
    expect((await commands.restoreFile({ fileId: file.id })).file).not.toHaveProperty('deletedAt')
    await expect(commands.purgeFiles({ fileIds: [file.id] })).resolves.toEqual({ count: 1 })
    expect(commands.baseline().files).toEqual([])
  })

  it('maps Drive business failures and preserves unrelated errors', async () => {
    const { ctx } = await harness()
    const commands = new DriveCommands(ctx)
    await expect(commands.deleteFile({ fileId: DriveFileId('missing') })).rejects.toMatchObject({
      name: 'TypertRemoteFailure', failure: { code: 'FILE_NOT_FOUND' },
    })
    const original = ctx.drive.deleteFile.bind(ctx.drive)
    ctx.drive.deleteFile = () => Promise.reject(new Error('unexpected'))
    await expect(commands.deleteFile({ fileId: DriveFileId('missing') })).rejects.toThrow('unexpected')
    ctx.drive.deleteFile = () => Promise.reject(new TypertRemoteFailure({
      code: 'preserved', message: 'preserved', details: {},
    }))
    await expect(commands.deleteFile({ fileId: DriveFileId('missing') })).rejects.toMatchObject({
      failure: { code: 'preserved' },
    })
    ctx.drive.deleteFile = original
  })
})

describe('DriveFeed', () => {
  it('publishes a complete baseline and a complete snapshot after mutation', async () => {
    const { ctx } = await harness()
    const parent = await ctx.drive.createFolder({ libraryId: ctx.drive.library().id, name: 'Parent' })
    await ctx.drive.createFolder({ libraryId: ctx.drive.library().id, parentId: parent.id, name: 'Nested' })
    const feed = new DriveFeed(ctx)
    const controller = new AbortController()
    const iterator = driveIterator(feed.follow(controller.signal))
    const baseline = await iterator.next()
    expect(baseline.value).toEqual({ type: 'baseline', value: driveBaseline(ctx) })
    if (baseline.value?.type !== 'baseline') throw new Error('expected drive baseline')
    expect(baseline.value.value.folders.map(folder => folder.name)).toEqual(['Parent', 'Nested'])
    const pending: Promise<IteratorResult<DriveFollowFrame, undefined>> = iterator.next()
    await ctx.drive.createFolder({ libraryId: ctx.drive.library().id, name: 'Changed' })
    const frame = await pending
    if (frame.value?.type !== 'snapshot') throw new Error('expected drive snapshot')
    expect(frame.value.value.folders.map(folder => folder.name)).toEqual(['Changed', 'Parent', 'Nested'])
    controller.abort()
    await iterator.return?.()
  })

  it('yields an already queued snapshot without entering the wait path', async () => {
    const { ctx } = await harness()
    const feed = new DriveFeed(ctx)
    const controller = new AbortController()
    const iterator = driveIterator(feed.follow(controller.signal))
    await iterator.next()
    await ctx.drive.createFolder({ libraryId: ctx.drive.library().id, name: 'Queued one' })
    await ctx.drive.createFolder({ libraryId: ctx.drive.library().id, name: 'Queued two' })
    const first = await iterator.next()
    const second = await iterator.next()
    expect(first.value?.type).toBe('snapshot')
    expect(second.value?.type).toBe('snapshot')
    controller.abort()
    await iterator.return?.()
  })

  it('closes a waiting generation when the owning context disposes', async () => {
    const value = await harness()
    const feed = new DriveFeed(value.ctx)
    const iterator = driveIterator(feed.follow(new AbortController().signal))
    await iterator.next()
    const pending = iterator.next()
    await value.ctx.fiber.dispose()
    await expect(pending).resolves.toMatchObject({ done: true })
    await iterator.return?.()
    active = active.filter(item => item !== value)
  })

  it('rejects an already-aborted generation', async () => {
    const { ctx } = await harness()
    const feed = new DriveFeed(ctx)
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    const iterator = driveIterator(feed.follow(controller.signal))
    await expect(iterator.next()).rejects.toThrow('stopped')
  })
})
