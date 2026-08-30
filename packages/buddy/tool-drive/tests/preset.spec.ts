import { readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Group from '@deepseek-ai/cordis-plugin-group'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import LlmRuntime, {
  LlmAdapter, ToolCallId, createUserMessage,
  type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import * as Persona from '@deepseek-ai/dsh-persona'
import * as ToolPresentation from '@deepseek-ai/dsh-agent-tool-presentation'
import * as ToolDrive from '../src/index.ts'
import * as ReadOnlyPolicy from '../src/policy.ts'
import { FakeDrive, fixtureFile } from './helpers.ts'

const packageRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const presetRoot = join(packageRoot, 'presets')
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function installedHarnessBase(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'buddy-tool-preset-harness-'))
  temporaryRoots.push(root)
  for (const name of [
    '@deepseek-ai/dsh-persona',
    '@deepseek-ai/dsh-agent-tool-presentation',
  ]) {
    const directory = join(root, 'node_modules', ...name.split('/'))
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '0.0.0', type: 'module' }))
  }
  return root
}

const globalWrite = defineTool({
  name: 'global_write', description: 'mutable global tool', parameters: {},
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: async () => 'no',
})

async function harness(options: { adapter?: LlmAdapter; files?: ReturnType<typeof fixtureFile>[] } = {}): Promise<Context> {
  const root = await installedHarnessBase()
  const testPresetRoot = join(root, 'presets')
  await cp(presetRoot, testPresetRoot, { recursive: true })
  await mkdir(join(root, 'lib'), { recursive: true })
  await writeFile(join(root, 'lib/index.js'), '')
  await writeFile(join(root, 'lib/policy.js'), '')
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.builtins.group = Group
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-persona', Persona],
    ['@deepseek-ai/dsh-agent-tool-presentation', ToolPresentation],
    ['../../lib/index.js', ToolDrive],
    ['../../lib/policy.js', ReadOnlyPolicy],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected preset import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: 'GLOBAL PERSONA MUST BE SHADOWED' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  new FakeDrive(ctx, options.files ?? [])
  ctx.tools.register(globalWrite)
  if (options.adapter !== undefined) ctx.llm.registerAdapter(['mock'], options.adapter)
  await ctx.plugin(AgentPresets, {
    default: 'positioning-safety',
    roots: [{ path: testPresetRoot, trust: 'system' }],
    includeShippedRoot: false,
    includeUserRoot: false,
  })
  return ctx
}

async function createAgent(ctx: Context): Promise<Agent> {
  const handle = await ctx.agents.create({
    sessionId: SessionId('positioning-safety-test'),
    setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'positioning-safety'),
  })
  return handle.agent
}

class PresetAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly script: StreamChunk[][]) { super() }
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('PresetAdapter script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

function driveReadCall(fileId: string, versionId: string): StreamChunk[] {
  const id = ToolCallId('preset-drive-read')
  const args = JSON.stringify({ file_id: fileId, version_id: versionId, start_line: 1, line_count: 20 })
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'drive_read', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'drive_read', arguments: args } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function answer(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') { dispose(); resolve() }
    })
  })
}

describe('Positioning Safety Agent preset', () => {
  it('ships healthy metadata and a composition without mutation/team/workspace rows', async () => {
    const metadata = readFileSync(join(presetRoot, 'positioning-safety/preset.yml'), 'utf8')
    const composition = readFileSync(join(presetRoot, 'positioning-safety/agent.cordis.yml'), 'utf8')
    expect(metadata).toContain('定位安全 Agent')
    const rowNames = [...composition.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/gmu)]
      .map(match => match[1])
    expect(rowNames).toEqual([
      '@deepseek-ai/dsh-persona',
      '../../lib/index.js',
      '../../lib/policy.js',
      '@deepseek-ai/dsh-agent-tool-presentation',
    ])
    expect(composition).toContain('../../lib/policy.js')
    expect(composition).toContain('../../lib/index.js')
  })

  it('is discovered and mounts only three read-only tools under its complete persona', async () => {
    const ctx = await harness()
    const listed = await ctx.agentPresets.list()
    expect(listed).toEqual([expect.objectContaining({
      id: 'positioning-safety', trust: 'system', name: '定位安全 Agent',
    })])
    expect('broken' in listed[0]!).toBe(false)
    const agent = await createAgent(ctx)
    expect(ctx.tools.schemas(agent).map(tool => tool.name).sort()).toEqual(['drive_list', 'drive_read', 'drive_search'])
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['global_write'])
    const assembly = await ctx.systemPrompt.assemble({ scope: agent })
    const prompt = renderPrompt(assembly)
    expect(prompt).toContain('You are the Positioning Safety Agent.')
    expect(prompt).toContain('No document content is loaded automatically')
    expect(prompt).toContain('untrusted evidence')
    expect(prompt).not.toContain('GLOBAL PERSONA MUST BE SHADOWED')
    expect(assembly.tools.map(tool => tool.name).sort()).toEqual(['drive_list', 'drive_read', 'drive_search'])
    await ctx.fiber.dispose()
  })

  it('answers from an explicit immutable role version and preserves the exact replay source', async () => {
    const secret = '安全负责人：张三\n定位负责人：李四'
    const file = fixtureFile({
      id: 'preset-role-file', versionId: 'preset-role-v9', name: '角色分工.md',
      text: secret, kind: 'role-assignment', tags: ['正式'],
    })
    const final = `安全负责人是张三。来源：角色分工.md / File-ID preset-role-file / Version-ID preset-role-v9 / ${file.version.digest}`
    const adapter = new PresetAdapter([driveReadCall(file.file.id, file.version.id), answer(final)])
    const ctx = await harness({ adapter, files: [file] })
    const handle = await ctx.agents.create({
      sessionId: SessionId('positioning-safety-e2e'),
      agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'positioning-safety'),
    })
    const agent = handle.agent
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: '根据角色分工文档回答安全负责人，并引用来源。' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[0]?.tools?.map(tool => tool.name).sort()).toEqual(['drive_list', 'drive_read', 'drive_search'])
    expect(JSON.stringify(adapter.requests[0])).not.toContain(secret)
    expect(adapter.requests[0]?.system).toContain('No document content is loaded automatically')
    const result = agent.session.events.find(event => event.type === 'tool/result')
    const replayText = result?.type === 'tool/result'
      ? result.data.message.content[0]?.type === 'tool-result'
        ? result.data.message.content[0].content.find(block => block.type === 'text')?.text
        : undefined
      : undefined
    expect(replayText).toContain('File-ID: preset-role-file')
    expect(replayText).toContain('Version-ID: preset-role-v9')
    expect(replayText).toContain(file.version.digest)
    expect(replayText).toContain(secret)
    expect(adapter.requests[1]?.messages.flatMap(message => message.content)
      .find(block => block.type === 'tool-result')).toEqual(result?.type === 'tool/result' ? result.data.message.content[0] : undefined)
    const assistant = agent.session.events.findLast(event => event.type === 'assistant/message')
    expect(assistant?.type === 'assistant/message' && assistant.data.message.content[0]).toMatchObject({ type: 'text', text: final })
    await handle.dispose()
    await ctx.fiber.dispose()
  })
})
