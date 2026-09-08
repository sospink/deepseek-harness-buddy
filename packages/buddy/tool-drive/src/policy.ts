/** Scope-only inherited-tool denial for the Positioning Safety Agent preset. */

import type { Context } from '@deepseek-ai/cordis'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'buddy-drive-read-only-policy'
export const inject = ['tools']

/** Tool names permitted by the Positioning Safety Agent Drive policy. */
export const DRIVE_TOOL_NAMES = [
  'drive_list', 'drive_search', 'drive_read', 'generate_prototype', 'update_prototype',
] as const
const driveNames = new Set<string>(DRIVE_TOOL_NAMES)

/**
 * Hide every current/future inherited tool and deny any non-Drive execution.
 * Mount after the scope-local Drive tools: a restriction filters inherited
 * registrations, never this standing scope's own tool layer.
 */
export function apply(ctx: Context): void {
  if (scopeOf(ctx) === undefined) throw new Error('buddy-tool-drive policy requires an Agent scope')
  const denied = new Set<string>()
  let liftRestriction: (() => void) | undefined
  let syncing = false
  const sync = (): void => {
    if (syncing) return
    const candidates = ctx.tools.schemas().map(tool => tool.name).filter(tool => !driveNames.has(tool))
    const additions = candidates.filter(tool => !denied.has(tool))
    if (additions.length === 0) return
    syncing = true
    try {
      for (const tool of additions) denied.add(tool)
      const next = ctx.tools.restrict({ deny: [...denied].sort() })
      liftRestriction?.()
      liftRestriction = next
    } finally {
      syncing = false
    }
  }
  sync()
  ctx.on('tools/change', sync)
  ctx.tools.guard(exec => driveNames.has(exec.name)
    ? undefined
    : `Positioning Safety Agent permits only ${DRIVE_TOOL_NAMES.join(', ')}.`)
  ctx.effect(() => () => { liftRestriction?.() }, 'buddy-tool-drive.policy-restriction')
}
