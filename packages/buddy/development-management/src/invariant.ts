/** Runtime invariant for the development-management package. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

export const name = 'buddy-development-management-invariant'
const PACKAGE_NAME = '@sospink/dsh-buddy-development-management'
export const inject = ['invariants']

/** Register state relationship checks when the controller exists. */
const install: InvariantInstaller = (scope, fail) => {
  const controller = scope.get('developmentManagement')
  if (controller === undefined) return
  const baseline = controller.store.baseline()
  const taskIds = new Set(baseline.tasks.map(task => task.id))
  if (baseline.artifacts.some(artifact => !taskIds.has(artifact.taskId)) || baseline.reviews.some(review => !taskIds.has(review.taskId))) {
    fail('artifact or review references an unknown task')
  }
}

export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
