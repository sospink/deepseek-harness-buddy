// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { DriveUploadItem } from '../src/client/service.ts'
import { UploadQueue } from '../src/client/UploadQueue.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function item(status: DriveUploadItem['status'], input: Partial<DriveUploadItem> = {}): DriveUploadItem {
  return {
    id: `${status}-${input.name ?? 'file'}`,
    name: input.name ?? `${status}.md`,
    bytes: input.bytes ?? 10,
    loaded: input.loaded ?? 5,
    total: input.total ?? 10,
    status,
    ...(input.error === undefined ? {} : { error: input.error }),
    ...(input.fileId === undefined ? {} : { fileId: input.fileId }),
  }
}

function client() {
  return {
    cancelUpload: vi.fn(), retryUpload: vi.fn(), clearFinishedUploads: vi.fn(),
  }
}

describe('UploadQueue', () => {
  it('renders nothing for an empty queue', () => {
    const view = render(<UploadQueue client={client() as never} items={[]} t={t} />)
    expect(view.container.childElementCount).toBe(0)
  })

  it('projects all statuses, progress/error, and invokes cancel/retry/clear', () => {
    const value = client()
    const items = [
      item('queued'), item('uploading', { loaded: 15, total: 10 }), item('succeeded'),
      item('failed', { error: 'rejected' }), item('cancelled', { loaded: 0 }),
    ]
    render(<UploadQueue client={value as never} items={items} t={t} />)
    expect(screen.getByRole('region', { name: '上传队列' })).not.toBeNull()
    expect(screen.getByText('1 / 5 已完成 · 2 进行中')).not.toBeNull()
    expect(screen.getByText('rejected')).not.toBeNull()
    expect(screen.getByLabelText('uploading.md 100%')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消 queued.md' }))
    fireEvent.click(screen.getByRole('button', { name: '取消 uploading.md' }))
    fireEvent.click(screen.getByRole('button', { name: '重试 failed.md' }))
    fireEvent.click(screen.getByRole('button', { name: '重试 cancelled.md' }))
    fireEvent.click(screen.getByRole('button', { name: '清理已完成' }))
    expect(value.cancelUpload).toHaveBeenCalledTimes(2)
    expect(value.retryUpload).toHaveBeenCalledTimes(2)
    expect(value.clearFinishedUploads).toHaveBeenCalledOnce()
  })

  it('handles zero-byte overall and per-file progress without clear actions', () => {
    const failed = item('failed', { name: 'zero-failed.md', bytes: 0, loaded: 0, total: 0 })
    const succeeded = item('succeeded', { name: 'zero-ok.md', bytes: 0, loaded: 0, total: 0 })
    const first = render(<UploadQueue client={client() as never} items={[failed]} t={t} />)
    expect(screen.getByLabelText('zero-failed.md 0%')).not.toBeNull()
    expect(screen.getByLabelText('上传总体进度').getAttribute('value')).toBe('0')
    expect(screen.queryByRole('button', { name: '清理已完成' })).toBeNull()
    first.unmount()
    render(<UploadQueue client={client() as never} items={[succeeded]} t={t} />)
    expect(screen.getByLabelText('zero-ok.md 100%')).not.toBeNull()
    expect(screen.getByLabelText('上传总体进度').getAttribute('value')).toBe('100')
  })
})
