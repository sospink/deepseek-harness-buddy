// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DevelopmentBaseline } from '@sospink/dsh-buddy-development-management/types'
import { DevelopmentOverlay, type DevelopmentOverlayProps } from '../src/client/DevelopmentOverlay.tsx'
import { DevelopmentTrigger, type DevelopmentTriggerProps } from '../src/client/DevelopmentTrigger.tsx'
import { zh } from '../src/client/locales.ts'
import { DevelopmentManagementClient } from '../src/client/service.ts'
import type { DevelopmentManagementKey } from '../src/client/locales.ts'

const baseline: DevelopmentBaseline = {
  activeRole: 'product-manager',
  tasks: [{
    id: 'task', sequence: 7, title: '低空告警策略', discipline: 'agent-application', priority: 1, status: 'draft',
    description: '实现告警策略。', acceptanceCriteria: '检查全部通过。', creatorRole: 'product-manager', reviewerRole: 'product-manager',
    phase: '需求编制', createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
  }],
  artifacts: [
    {
      id: 'artifact-index', taskId: 'task', uploaderRole: 'agent-application-development-engineer',
      rootName: 'low-altitude-agent', relativePath: 'src/index.ts', name: 'index.ts', mediaType: 'text/typescript', bytes: 384,
      digest: 'index-digest', createdAt: '2026-09-07T00:00:00.000Z',
    },
    {
      id: 'artifact-contract', taskId: 'task', uploaderRole: 'blockchain-architect-engineer',
      rootName: 'low-altitude-agent', relativePath: 'contracts/Guard.sol', name: 'Guard.sol', mediaType: 'text/plain', bytes: 2048,
      digest: 'contract-digest', createdAt: '2026-09-07T00:00:00.000Z',
    },
    {
      id: 'artifact-git-head', taskId: 'task', uploaderRole: 'agent-application-development-engineer',
      rootName: 'low-altitude-agent', relativePath: '.git/HEAD', name: 'HEAD', mediaType: 'text/plain', bytes: 21,
      digest: 'git-digest', createdAt: '2026-09-07T00:00:00.000Z',
    },
  ], reviews: [], audit: [],
  integration: { provider: 'none', configured: false, label: '未配置远程 Git 集成' },
  uploadLimits: { maxFileBytes: 1024, maxTaskBytes: 4096 },
}

afterEach(cleanup)

function client(value: DevelopmentBaseline = baseline) {
  const remote = { baseline: vi.fn(async () => ({ ok: true as const, value })) }
  return { value: new DevelopmentManagementClient(new Context(), remote as never), remote }
}

const t: Translate<DevelopmentManagementKey> = (key, params) => {
  let value: string = zh[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}

describe('Development Management UI', () => {
  it('opens from the sidebar trigger and renders the ZenTao-density task list', async () => {
    const value = client()
    const triggerProps = { wide: true, client: value.value, t } as unknown as DevelopmentTriggerProps
    render(<DevelopmentTrigger {...triggerProps} />)
    fireEvent.click(screen.getByRole('button', { name: '开发管理' }))
    expect(value.value.source.getSnapshot().open).toBe(true)

    await value.value.refresh()
    const overlayProps = { client: value.value, t } as unknown as DevelopmentOverlayProps
    render(<DevelopmentOverlay {...overlayProps} />)
    expect(screen.getByRole('dialog', { name: '开发管理' })).toBeTruthy()
    expect(screen.getByText('低空告警策略')).toBeTruthy()
    expect(screen.getByText('研发需求名称')).toBeTruthy()
    expect(screen.getByText('指派给')).toBeTruthy()
    expect(screen.getByText('阶段')).toBeTruthy()
    expect(screen.getByRole('button', { name: '当前角色: 产品经理' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '当前角色: 产品经理' }))
    expect(screen.getByRole('menuitem', { name: '智能体应用开发工程师' })).toBeTruthy()
  })

  it('provides the product requirement form and closes the workspace with Escape', async () => {
    const value = client()
    await value.value.refresh()
    value.value.open()
    await value.value.refresh()
    const overlayProps = { client: value.value, t } as unknown as DevelopmentOverlayProps
    render(<DevelopmentOverlay {...overlayProps} />)
    fireEvent.click(screen.getByRole('button', { name: /提出研发需求/ }))
    expect(screen.getByRole('heading', { name: '提出研发需求' })).toBeTruthy()
    expect(screen.getByLabelText('需求名称')).toBeTruthy()
    expect(screen.getByLabelText('需求描述')).toBeTruthy()
    expect(screen.getByLabelText('验收标准')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(value.value.source.getSnapshot().open).toBe(false)
  })

  it('renders task artifacts as a collapsible directory tree and hides repository metadata', async () => {
    const value = client()
    await value.value.refresh()
    value.value.open()
    await value.value.refresh()
    const overlayProps = { client: value.value, t } as unknown as DevelopmentOverlayProps
    render(<DevelopmentOverlay {...overlayProps} />)

    fireEvent.click(screen.getByText('低空告警策略'))
    const root = screen.getByRole('button', { name: /low-altitude-agent/ })
    expect(root.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /contracts/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /src/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Guard\.sol/ }).getAttribute('href')).toContain('artifact-contract')
    expect(screen.queryByText('.git')).toBeNull()
    expect(screen.queryByText('HEAD')).toBeNull()

    fireEvent.click(root)
    expect(root.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /contracts/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Guard\.sol/ })).toBeNull()
  })

  it('shows the submit-acceptance action and result-summary dialog to the assigned engineer', async () => {
    const engineering: DevelopmentBaseline = {
      ...baseline,
      activeRole: 'agent-application-development-engineer',
      tasks: [{
        ...baseline.tasks[0]!, status: 'in-progress', phase: '研发中',
        assigneeRole: 'agent-application-development-engineer',
      }],
    }
    const value = client(engineering)
    value.value.open()
    await value.value.refresh()
    render(<DevelopmentOverlay {...({ client: value.value, t } as unknown as DevelopmentOverlayProps)} />)

    fireEvent.click(screen.getByText('低空告警策略'))
    fireEvent.click(screen.getByRole('button', { name: '提交验收' }))
    expect(screen.getByRole('heading', { name: '提交验收' })).toBeTruthy()
    expect(screen.getByLabelText('成果说明')).toBeTruthy()
    expect(screen.getByText('已上传 2 个研发成果文件')).toBeTruthy()
  })

  it('shows submitted results and approve/return controls to the Product Manager', async () => {
    const pending: DevelopmentBaseline = {
      ...baseline,
      tasks: [{
        ...baseline.tasks[0]!, status: 'pending-acceptance', phase: '待成果验收',
        assigneeRole: 'agent-application-development-engineer',
        acceptanceSubmission: { summary: '已完成告警策略与边界场景测试。', submittedAt: '2026-09-07T01:00:00.000Z' },
      }],
    }
    const value = client(pending)
    value.value.open()
    await value.value.refresh()
    render(<DevelopmentOverlay {...({ client: value.value, t } as unknown as DevelopmentOverlayProps)} />)

    fireEvent.click(screen.getByText('低空告警策略'))
    fireEvent.click(screen.getByRole('button', { name: '审核成果' }))
    expect(screen.getAllByText('已完成告警策略与边界场景测试。')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '验收通过' })).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '退回修改' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('审核意见'), { target: { value: '请补充验证截图' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '退回修改' }).disabled).toBe(false)
  })
})
