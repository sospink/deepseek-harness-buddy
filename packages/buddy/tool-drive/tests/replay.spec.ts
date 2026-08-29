import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, {
  LlmAdapter, ToolCallId, createUserMessage,
  type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolDrive from '../src/index.ts'
import { fixtureFile, FakeDrive } from './helpers.ts'

function toolCall(fileId: string, versionId: string): StreamChunk[] {
  const id = ToolCallId('drive-read-call')
  const args = JSON.stringify({ file_id: fileId, version_id: versionId, start_line: 1, line_count: 20 })
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'drive_read', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'drive_read', arguments: args } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function finalText(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class ReplayAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly script: StreamChunk[][]) { super() }
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('ReplayAdapter script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') { dispose(); resolve() }
    })
  })
}

async function harness(adapter: ReplayAdapter, file: ReturnType<typeof fixtureFile>) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: 'You are the Positioning Safety Agent.' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  new FakeDrive(ctx, [file])
  await ctx.plugin(ToolDrive, {})
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

describe('Buddy Drive tool-result replay evidence', () => {
  it('injects no document before an explicit read, then persists exact versioned evidence', async () => {
    const secret = '安全负责人：张三\n定位负责人：李四'
    const file = fixtureFile({
      id: 'role-file', versionId: 'role-version-7', name: '角色分工.md',
      text: secret, kind: 'role-assignment', tags: ['正式'],
    })
    const adapter = new ReplayAdapter([
      toolCall(file.file.id, file.version.id),
      finalText('根据已读取版本回答。'),
    ])
    const ctx = await harness(adapter, file)
    const agent = ctx.agentLoop.create(SessionId('safety-agent'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: '读取角色分工并回答负责人。' }], source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(adapter.requests).toHaveLength(2)
    expect(JSON.stringify(adapter.requests[0])).not.toContain(secret)
    expect(adapter.requests[0]?.system).toContain('No document is loaded automatically')
    const second = adapter.requests[1]!
    const resultBlock = second.messages.flatMap(message => message.content)
      .find(block => block.type === 'tool-result')
    expect(resultBlock?.type).toBe('tool-result')
    const replayText = resultBlock?.type === 'tool-result'
      ? resultBlock.content.find(block => block.type === 'text')?.text
      : undefined
    expect(replayText).toContain('File-ID: role-file')
    expect(replayText).toContain('Version-ID: role-version-7')
    expect(replayText).toContain(`Digest: ${file.version.digest}`)
    expect(replayText).toContain(secret)
    expect(replayText).toContain('UNTRUSTED DOCUMENT EVIDENCE')

    const event = agent.session.events.find(candidate => candidate.type === 'tool/result')
    const loggedText = event?.type === 'tool/result'
      ? event.data.message.content[0]?.type === 'tool-result'
        ? event.data.message.content[0].content.find(block => block.type === 'text')?.text
        : undefined
      : undefined
    expect(loggedText).toBe(replayText)
    expect(agent.session.deriveMessages().flatMap(message => message.content)
      .find(block => block.type === 'tool-result')).toEqual(resultBlock)
    await ctx.fiber.dispose()
  })
})
