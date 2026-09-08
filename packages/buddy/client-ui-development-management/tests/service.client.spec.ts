// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevelopmentBaseline } from '@sospink/dsh-buddy-development-management/types'
import { DevelopmentManagementClient } from '../src/client/service.ts'

const now = '2026-09-07T00:00:00.000Z'
const baseline: DevelopmentBaseline = {
  activeRole: 'product-manager', tasks: [], artifacts: [], reviews: [], audit: [],
  integration: { provider: 'none', configured: false, label: '未配置远程 Git 集成' },
  uploadLimits: { maxFileBytes: 1024, maxTaskBytes: 4096 },
}

function ok<T>(value: T): Promise<RemoteResult<T>> { return Promise.resolve({ ok: true, value }) }

function remote(overrides: Readonly<Record<string, unknown>> = {}) {
  const task = {
    id: 'task', sequence: 1, title: '需求', discipline: 'agent-application' as const, priority: 2 as const,
    status: 'draft' as const, description: '描述', acceptanceCriteria: '验收', creatorRole: 'product-manager' as const,
    reviewerRole: 'product-manager' as const, phase: '需求编制', createdAt: now, updatedAt: now,
  }
  return {
    baseline: vi.fn(() => ok(baseline)), selectRole: vi.fn(() => ok(baseline)), createTask: vi.fn(() => ok(task)),
    submitReview: vi.fn(() => ok(task)), assignTask: vi.fn(() => ok(task)), startTask: vi.fn(() => ok(task)),
    submitAcceptance: vi.fn(() => ok(task)), reviewAcceptance: vi.fn(() => ok(task)),
    configureDelivery: vi.fn(() => ok(task)), requestDeliveryCheck: vi.fn(() => ok(task)),
    runDeliveryCheck: vi.fn(), addNote: vi.fn(() => ok(undefined)), confirmMergeRequest: vi.fn(), mergeTask: vi.fn(),
    ...overrides,
  }
}

class FakeXhr {
  static readonly instances: FakeXhr[] = []
  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  responseText = ''
  status = 201
  readonly open = vi.fn((_method: string, _url: string) => {})
  readonly setRequestHeader = vi.fn()
  readonly send = vi.fn(() => { queueMicrotask(() => { this.onload?.() }) })
  constructor() { FakeXhr.instances.push(this) }
}

const originalXhr = globalThis.XMLHttpRequest
afterEach(() => {
  vi.restoreAllMocks()
  globalThis.XMLHttpRequest = originalXhr
  FakeXhr.instances.length = 0
})

describe('DevelopmentManagementClient', () => {
  it('opens, refreshes, restores focus, and surfaces Remote failures', async () => {
    const api = remote()
    const client = new DevelopmentManagementClient(new Context(), api)
    const focus = vi.fn()
    client.open({ focus } as unknown as HTMLElement)
    expect(client.source.getSnapshot()).toMatchObject({ open: true, state: 'loading' })
    expect(client.source.getSnapshot()).not.toHaveProperty('data')
    await client.refresh()
    expect(client.source.getSnapshot()).toMatchObject({ open: true, state: 'ready', data: baseline })
    client.close()
    await Promise.resolve()
    expect(focus).toHaveBeenCalledOnce()

    const failure = new DevelopmentManagementClient(new Context(), remote({
      baseline: vi.fn(async () => ({ ok: false, error: { code: 'offline', message: '不可用', details: {} } })),
    }))
    await expect(failure.refresh()).rejects.toThrow('offline: 不可用')
    failure.failed(new Error('连接失败'))
    expect(failure.source.getSnapshot()).toMatchObject({ state: 'failed', error: '连接失败', busy: false })
  })

  it('forwards role/task commands and always refreshes after successful writes', async () => {
    const api = remote()
    const client = new DevelopmentManagementClient(new Context(), api)
    await client.selectRole('algorithm-engineer')
    await client.createTask({ title: '算法', discipline: 'algorithm', priority: 1, description: '描述', acceptanceCriteria: '验收' })
    await client.submitReview({ taskId: 'task' })
    await client.assignTask({ taskId: 'task', assigneeRole: 'algorithm-engineer' })
    await client.startTask({ taskId: 'task' })
    await client.submitAcceptance({ taskId: 'task', summary: '成果说明' })
    await client.reviewAcceptance({ taskId: 'task', decision: 'approve', comment: '通过' })
    await client.configureDelivery({ taskId: 'task', repositoryPath: '/repo', sourceRef: 'feature', targetRef: 'main' })
    await client.requestDeliveryCheck({ taskId: 'task' })
    await client.addNote('task', '备注')
    expect(api.selectRole).toHaveBeenCalledWith({ role: 'algorithm-engineer' })
    expect(api.submitAcceptance).toHaveBeenCalledWith({ taskId: 'task', summary: '成果说明' })
    expect(api.reviewAcceptance).toHaveBeenCalledWith({ taskId: 'task', decision: 'approve', comment: '通过' })
    expect(api.addNote).toHaveBeenCalledWith({ taskId: 'task', note: '备注' })
    expect(api.baseline).toHaveBeenCalledTimes(10)
    expect(client.source.getSnapshot().busy).toBe(false)
  })

  it('keeps complete directory paths and uploads files sequentially', async () => {
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
    const api = remote()
    const client = new DevelopmentManagementClient(new Context(), api)
    const first = new File(['sol'], 'Guard.sol', { type: 'text/plain' })
    Object.defineProperty(first, 'webkitRelativePath', { value: 'contracts/src/Guard.sol' })
    const second = new File(['svg'], 'logo.svg', { type: 'image/svg+xml' })
    Object.defineProperty(second, 'webkitRelativePath', { value: 'contracts/assets/logo.svg' })
    const metadata = new File(['ref: refs/heads/main'], 'HEAD')
    Object.defineProperty(metadata, 'webkitRelativePath', { value: 'contracts/.git/HEAD' })

    await client.upload('task', 'blockchain-architect-engineer', [first, metadata, second])

    expect(FakeXhr.instances).toHaveLength(2)
    expect(FakeXhr.instances[0]?.open).toHaveBeenCalledWith('POST', expect.stringContaining('rootName=contracts'))
    expect(FakeXhr.instances[0]?.open.mock.calls[0]?.[1]).toContain('relativePath=src%2FGuard.sol')
    expect(FakeXhr.instances[1]?.open.mock.calls[0]?.[1]).toContain('relativePath=assets%2Flogo.svg')
    expect(FakeXhr.instances[0]?.send).toHaveBeenCalledWith(first)
    expect(FakeXhr.instances[1]?.send).toHaveBeenCalledWith(second)
    expect(api.baseline).toHaveBeenCalledOnce()
    expect(client.source.getSnapshot()).toMatchObject({ busy: false, uploadProgress: 0 })
  })
})
