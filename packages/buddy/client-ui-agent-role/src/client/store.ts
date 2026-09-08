/** Staged professional-role state for the next blank Session. */

import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { AgentRoleId } from '@sospink/dsh-buddy-agent-role/types'

/** Role-picker snapshot rendered by the Hero seat. */
export interface AgentRoleSeatState {
  current: AgentRoleId
  busy: boolean
  error: string | null
}

type AgentRolesRemote = TypertClientRemote['agentRoles']

/** Stages and commits one role while the receiving Session is blank. */
export class AgentRoleSeatController {
  readonly store: SnapshotStore<AgentRoleSeatState> = createSnapshotStore({
    current: 'general', busy: false, error: null,
  })

  private staged: AgentRoleId | undefined

  constructor(
    private readonly remote: AgentRolesRemote,
    private readonly currentSession: () => Pick<SessionSummary, 'id' | 'blank' | 'projectionValues'> | undefined,
  ) {}

  private set(patch: Partial<AgentRoleSeatState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /** Synchronize the displayed role with the current Session. */
  sync(): void {
    if (this.staged !== undefined) {
      void this.apply()
      return
    }
    const current = roleOf(this.currentSession())
    if (current !== this.store.getSnapshot().current) this.set({ current })
  }

  /** Stage a role and apply it immediately when a blank Session exists. */
  async select(role: AgentRoleId): Promise<string | undefined> {
    if (this.store.getSnapshot().busy) return undefined
    this.staged = role
    this.set({ current: role, error: null })
    await this.apply()
    return this.store.getSnapshot().error ?? undefined
  }

  /** Apply the staged role to the current blank Session. */
  async apply(): Promise<void> {
    if (this.store.getSnapshot().busy) return
    const staged = this.staged
    const session = this.currentSession()
    if (staged === undefined || session === undefined) return
    if (!session.blank) {
      this.staged = undefined
      this.set({ current: roleOf(session) })
      return
    }
    if (roleOf(session) === staged) {
      this.staged = undefined
      return
    }
    this.set({ busy: true, error: null })
    try {
      const result = await this.remote.select(session.id, staged)
      this.staged = undefined
      if (!result.ok) {
        this.set({ busy: false, current: roleOf(session), error: failureMessage(result.error) })
        return
      }
      this.set({ busy: false, current: result.value })
    } catch (error) {
      this.staged = undefined
      this.set({
        busy: false,
        current: roleOf(session),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function roleOf(session: Pick<SessionSummary, 'projectionValues'> | undefined): AgentRoleId {
  const role = session?.projectionValues?.agentRole
  return typeof role === 'string' ? role as AgentRoleId : 'general'
}

function failureMessage(failure: RemoteFailure): string {
  return failure.message
}
