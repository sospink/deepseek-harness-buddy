import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { AgentRoleId } from '@sospink/dsh-buddy-agent-role/types'
import { describe, expect, it, vi } from 'vitest'
import { AgentRoleSeatController } from '../src/client/store.ts'

function session(
  id: string, blank: boolean, agentRole?: AgentRoleId,
): Pick<SessionSummary, 'id' | 'blank' | 'projectionValues'> {
  return {
    id: SessionId(id), blank,
    projectionValues: agentRole === undefined ? {} : { agentRole },
  }
}

describe('professional-role seat controller', () => {
  it('stages without a session, then commits when a blank session arrives', async () => {
    let current: ReturnType<typeof session> | undefined = undefined
    const select = vi.fn(async (_id, role) => ({ ok: true as const, value: role }))
    const controller = new AgentRoleSeatController({ select } as never, () => current)

    await controller.select('prototype-designer')
    expect(controller.store.getSnapshot().current).toBe('prototype-designer')
    expect(select).not.toHaveBeenCalled()

    current = session('blank', true, 'general')
    controller.sync()
    await vi.waitFor(() => { expect(select).toHaveBeenCalledWith(SessionId('blank'), 'prototype-designer') })
    expect(controller.store.getSnapshot()).toMatchObject({ current: 'prototype-designer', busy: false })
  })

  it('restores a projected role and never changes a started session', async () => {
    let current = session('started', false, 'software-architect')
    const select = vi.fn()
    const controller = new AgentRoleSeatController({ select } as never, () => current)

    controller.sync()
    expect(controller.store.getSnapshot().current).toBe('software-architect')
    await controller.select('blockchain-engineer')
    expect(select).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot().current).toBe('software-architect')

    current = session('next', true, 'general')
    controller.sync()
    expect(controller.store.getSnapshot().current).toBe('general')
  })

  it('rolls back to the projection when the host refuses a selection', async () => {
    const current = session('blank', true, 'general')
    const controller = new AgentRoleSeatController({
      select: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'agent-role-locked', message: 'role is locked', details: {} },
      })),
    } as never, () => current)

    expect(await controller.select('code-review-expert')).toBe('role is locked')
    expect(controller.store.getSnapshot()).toMatchObject({ current: 'general', error: 'role is locked' })
  })
})
