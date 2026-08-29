/** Reconnect-safe full-snapshot feed for the Buddy Drive browser. */

import type { Context } from '@deepseek-ai/cordis'
import type { DriveVersion } from '@sospink/dsh-buddy-drive/types'
import type { DriveBaseline, DriveFollowFrame, DriveVersionView } from './types.ts'


/** Project one provider version into the Typert-compatible browser value. */
export function driveVersionView(version: DriveVersion): DriveVersionView {
  return {
    id: version.id,
    fileId: version.fileId,
    digest: version.digest,
    bytes: version.bytes,
    createdAt: version.createdAt,
    actor: version.actor,
    source: version.source,
    preview: version.preview,
  }
}

/** Project the provider-neutral service into detached browser values. */
export function driveBaseline(ctx: Context): DriveBaseline {
  const library = ctx.drive.library()
  return {
    library,
    folders: collectFolders(ctx),
    files: collectFiles(ctx),
  }
}

function collectFolders(ctx: Context): DriveBaseline['folders'] {
  const collected = [...ctx.drive.listFolders()]
  for (let index = 0; index < collected.length; index += 1) {
    collected.push(...ctx.drive.listFolders(collected[index]?.id))
  }
  return collected
}

function collectFiles(ctx: Context): DriveBaseline['files'] {
  const folders = collectFolders(ctx)
  return [
    ...ctx.drive.listFiles(undefined, true),
    ...folders.flatMap(folder => ctx.drive.listFiles(folder.id, true)),
  ]
}

/** Owns full drive projections and all active follow generations. */
export class DriveFeed {
  private readonly followers = new Set<DriveFollower>()

  /** @param ctx - Host context containing the authoritative Drive service. */
  constructor(private readonly ctx: Context) {
    ctx.on('drive/changed', () => {
      const frame: DriveFollowFrame = { type: 'snapshot', value: driveBaseline(ctx) }
      for (const follower of this.followers) follower.push(frame)
    })
    ctx.effect(() => () => {
      for (const follower of this.followers) follower.close()
      this.followers.clear()
    }, 'buddy-api-drive.feed')
  }

  /** Open one generation beginning with a complete baseline. */
  async *follow(signal: AbortSignal): AsyncIterable<DriveFollowFrame> {
    signal.throwIfAborted()
    const follower = new DriveFollower()
    this.followers.add(follower)
    try {
      yield { type: 'baseline', value: driveBaseline(this.ctx) }
      yield* follower.read(signal)
    } finally {
      this.followers.delete(follower)
      follower.close()
    }
  }
}

class DriveFollower {
  private readonly frames: DriveFollowFrame[] = []
  private waiting: (() => void) | undefined
  private closed = false

  push(frame: DriveFollowFrame): void {
    this.frames.push(frame)
    this.waiting?.()
  }

  close(): void {
    this.closed = true
    this.waiting?.()
  }

  async *read(signal: AbortSignal): AsyncIterable<DriveFollowFrame> {
    while (!this.closed && !signal.aborted) {
      const frame = this.frames.shift()
      if (frame !== undefined) {
        yield frame
        continue
      }
      await this.wait(signal)
    }
  }

  private wait(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        signal.removeEventListener('abort', finish)
        this.waiting = undefined
        resolve()
      }
      this.waiting = finish
      signal.addEventListener('abort', finish, { once: true })
    })
  }
}
