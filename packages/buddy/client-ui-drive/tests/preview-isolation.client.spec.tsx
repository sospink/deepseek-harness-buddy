// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const previewMocks = vi.hoisted(() => ({ failMarkdown: true }))
vi.mock('../src/client/MarkdownPreview.tsx', () => ({
  MarkdownPreview: () => {
    if (previewMocks.failMarkdown) throw new Error('markdown renderer crashed')
    return <div>Markdown recovered</div>
  },
}))
vi.mock('../src/client/PdfPreview.tsx', () => ({ PdfPreview: () => <div>PDF preview healthy</div> }))
vi.mock('../src/client/DocxPreview.tsx', () => ({ DocxPreview: () => <div>DOCX preview healthy</div> }))
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DriveFileId, DriveLibraryId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import type { DriveBaseline, DriveFile } from '@sospink/dsh-buddy-api-drive/types'
import { DriveOverlay, type DriveOverlayProps } from '../src/client/DriveOverlay.tsx'
import { zh } from '../src/client/locales.ts'
import { BuddyDriveClient } from '../src/client/service.ts'

const NOW = '2026-08-29T00:00:00.000Z'
const libraryId = DriveLibraryId('default')
const markdown: DriveFile = {
  id: DriveFileId('markdown'), libraryId, name: 'broken.md', kind: 'general', mediaType: 'text/markdown',
  currentVersionId: DriveVersionId('markdown-version'), tags: [], createdAt: NOW, updatedAt: NOW,
}
const pdf: DriveFile = {
  ...markdown, id: DriveFileId('pdf'), name: 'healthy.pdf', mediaType: 'application/pdf',
  currentVersionId: DriveVersionId('pdf-version'),
}
const baseline: DriveBaseline = {
  library: { id: libraryId, title: '资料云盘', createdAt: NOW, updatedAt: NOW },
  folders: [],
  files: [markdown, pdf],
}
const globalProps = {
  useSessions: (() => undefined) as DriveOverlayProps['useSessions'],
  useSessionPendingInteraction: (() => undefined) as DriveOverlayProps['useSessionPendingInteraction'],
  useWorkspaces: (() => undefined) as DriveOverlayProps['useWorkspaces'],
}
const t = makeTranslate(zh)
const suppressReactBoundaryError = (event: ErrorEvent): void => { event.preventDefault() }
beforeEach(() => { window.addEventListener('error', suppressReactBoundaryError) })

afterEach(() => {
  window.removeEventListener('error', suppressReactBoundaryError)
  cleanup()
  vi.restoreAllMocks()
  previewMocks.failMarkdown = true
})

describe('Drive preview failure isolation', () => {
  it('keeps metadata/download alive and lets another file preview normally', () => {
    const client = new BuddyDriveClient(new Context(), {} as never)
    client.replace(baseline)
    client.open()
    render(<DriveOverlay {...globalProps} client={client} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /broken\.md/ }))
    expect(screen.getByText('文档预览发生意外错误')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'broken.md' })).not.toBeNull()
    expect(screen.getByRole('link', { name: '下载' }).getAttribute('href'))
      .toBe('/api/buddy-drive/content/markdown-version')

    fireEvent.click(screen.getByRole('button', { name: /healthy\.pdf/ }))
    expect(screen.getByText('PDF preview healthy')).not.toBeNull()
    expect(screen.queryByText('文档预览发生意外错误')).toBeNull()
    expect(screen.getByRole('link', { name: '下载' }).getAttribute('href'))
      .toBe('/api/buddy-drive/content/pdf-version')
  })
})
