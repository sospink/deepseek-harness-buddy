import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import * as ToolDrive from '../src/index.ts'
import * as ReadOnlyPolicy from '../src/policy.ts'
import { FakeDrive } from './helpers.ts'

const echo = defineTool({
  name: 'global_write', description: 'global mutable capability', parameters: {},
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: async () => 'should not run',
})

async function harness() {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  new FakeDrive(ctx)
  return ctx
}

describe('Positioning Safety Agent inherited-tool policy', () => {
  it('hides every inherited tool while preserving scope-local Drive tools', async () => {
    const ctx = await harness()
    ctx.tools.register(echo)
    const agent = ctx.agentLoop.create(SessionId('safety'), { provider: 'missing', model: 'missing' })
    ToolDrive.apply(agent.ctx, {})
    ReadOnlyPolicy.apply(agent.ctx)
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['global_write'])
    ctx.tools.register({ ...echo, name: 'late_global' })
    expect(ctx.tools.schemas(agent).map(tool => tool.name).sort()).toEqual(['drive_list', 'drive_read', 'drive_search'])
    const allowed = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: 'allowed' as never,
      name: 'drive_list',
      arguments: {},
      agent,
    })
    expect(allowed).toMatchObject({ isError: false })

    const denied = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: 'denied' as never,
      name: 'global_write',
      arguments: {},
      agent,
    })
    expect(denied).toMatchObject({ isError: true })
    expect(denied.content[0]).toMatchObject({
      type: 'text',
      text: 'Error: Positioning Safety Agent permits only drive_list, drive_search, drive_read.',
    })
    await ctx.fiber.dispose()
  })

  it('fails loudly when mounted outside an Agent scope', async () => {
    const ctx = await harness()
    expect(() => ReadOnlyPolicy.apply(ctx)).toThrow('requires an Agent scope')
    await ctx.fiber.dispose()
  })
})
