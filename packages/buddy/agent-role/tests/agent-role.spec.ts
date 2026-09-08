import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { TypertRemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it } from 'vitest'
import AgentRoleService, {
  agentRoleProjectionDefinition, effectiveAgentRole, renderAgentRoleContext,
} from '../src/index.ts'

function asAgent(session: Session): Agent {
  return { id: session.id, session } as Agent
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(AgentRoleService)
  return ctx
}

describe('Buddy professional roles', () => {
  it('records and projects the general role on a fresh session', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('fresh-role'))

    expect(session.events.find(event => event.type === 'agent-role/selected')?.data)
      .toEqual({ agentRole: 'general' })
    expect(ctx.sessionProjections.snapshot(session).values.agentRole).toBe('general')
  })

  it('selects a specialized role before the first turn and exposes its model context', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('prototype-role'))
    const agent = asAgent(session)

    expect(ctx.agentRoles.select(agent, 'prototype-designer')).toBe('prototype-designer')
    expect(effectiveAgentRole(session.events)).toBe('prototype-designer')
    expect(ctx.sessionProjections.snapshot(session).values.agentRole).toBe('prototype-designer')

    const prompt = await ctx.systemPrompt.assemble({ agent } as never)
    expect(prompt.contexts).toContainEqual({
      name: 'buddy:agent-role',
      text: expect.stringContaining('Professional role: Prototype Designer.'),
    })
  })

  it('rejects unknown roles and changes after the first turn begins', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('locked-role'))
    const agent = asAgent(session)

    expect(() => ctx.agentRoles.select(agent, 'astronaut')).toThrow(TypertRemoteFailure)
    session.append('turn/start', { turn: 1 })
    expect(() => ctx.agentRoles.select(agent, 'software-architect')).toThrow(TypertRemoteFailure)
    expect(effectiveAgentRole(session.events)).toBe('general')
  })

  it('folds the latest logged role and keeps general context empty', () => {
    const state = agentRoleProjectionDefinition.apply('general', {
      type: 'agent-role/selected', seq: 2, time: 2,
      data: { agentRole: 'code-review-expert' },
    })
    expect(state).toBe('code-review-expert')
    expect(renderAgentRoleContext('general')).toBe('')
    expect(renderAgentRoleContext('code-review-expert')).toContain('correctness')
  })
})
