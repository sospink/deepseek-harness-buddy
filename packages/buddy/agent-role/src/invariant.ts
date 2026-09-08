/** Package-owned invariants for durable Buddy professional roles. */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { AGENT_ROLE_IDS } from '@sospink/dsh-buddy-agent-role'

const PACKAGE_NAME = '@sospink/dsh-buddy-agent-role'
export const name = 'buddy-agent-role-invariant'
export const inject = ['invariants']

function validateSession(session: Session, events: readonly SessionEvent[], fail: InvariantFailure): void {
  let started = false
  for (const event of events) {
    if (event.type === 'turn/start') started = true
    if (event.type !== 'agent-role/selected') continue
    if (!AGENT_ROLE_IDS.includes(event.data.agentRole)) {
      fail(`agent-role/selected names unknown role ${JSON.stringify(event.data.agentRole)}`)
    }
    if (started) fail(`session ${JSON.stringify(session.id)} changes professional role after its first turn started`)
  }
}

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) validateSession(session, session.events, fail)
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session] = args as [Session, SessionEvent]
    validateSession(session, session.events, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/** Register validation for loaded and newly appended role facts. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
