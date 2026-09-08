// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { AgentRoleSeat, type AgentRoleSeatProps } from '../src/client/AgentRoleSeat.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

describe('professional-role selector', () => {
  it('shows the current role and all grouped choices, then selects one', async () => {
    const store = createSnapshotStore({ current: 'general' as const, busy: false, error: null })
    const select = vi.fn(async () => undefined)
    render(<AgentRoleSeat {...({
      useAgentRoleSeat: bindSnapshotSelector(store),
      sync: vi.fn(), select,
      t: (key: keyof typeof zh) => zh[key],
    } as unknown as AgentRoleSeatProps)} />)

    fireEvent.click(screen.getByRole('button', { name: /通用 Agent/ }))
    expect(screen.getByText('产品')).toBeTruthy()
    expect(screen.getByText('技术')).toBeTruthy()
    expect(screen.getByText('质量')).toBeTruthy()
    expect(screen.getByText('业务需求分析师')).toBeTruthy()
    expect(screen.getByText('产品方案设计师')).toBeTruthy()
    expect(screen.getByText('原型设计师')).toBeTruthy()
    expect(screen.getByText('软件架构师')).toBeTruthy()
    expect(screen.getByText('AI 应用工程师')).toBeTruthy()
    expect(screen.getByText('区块链工程师')).toBeTruthy()
    fireEvent.click(screen.getByText('代码审查专家'))
    await waitFor(() => { expect(select).toHaveBeenCalledWith('code-review-expert') })
  })
})
