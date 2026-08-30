// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
const pdfRuntime = vi.hoisted(() => ({ load: vi.fn(() => new Promise(() => undefined)) }))
vi.mock('../src/client/pdf-runtime.ts', () => ({ loadPdfRuntime: pdfRuntime.load }))
vi.mock('../src/client/DocxPreview.tsx', () => ({
  DocxPreview: () => <div aria-label="DOCX 预览">隔离 DOCX 预览</div>,
}))
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DriveFileId, DriveFolderId, DriveLibraryId, DriveVersionId } from '@sospink/dsh-buddy-drive'
import type { DriveBaseline, DriveFile } from '@sospink/dsh-buddy-api-drive/types'
import { DriveOverlay, type DriveOverlayProps } from '../src/client/DriveOverlay.tsx'
import { DriveTrigger, type DriveTriggerProps } from '../src/client/DriveTrigger.tsx'
import { zh } from '../src/client/locales.ts'
import { BuddyDriveClient, type BuddyDriveClientOptions } from '../src/client/service.ts'
import type { UploadTransport } from '../src/client/upload.ts'

const now = '2026-08-29T00:00:00.000Z'
const folder = {
  id: DriveFolderId('folder'), libraryId: DriveLibraryId('default'), name: '角色资料',
  createdAt: now, updatedAt: now,
}
const file: DriveFile = {
  id: DriveFileId('file'), libraryId: folder.libraryId, parentId: folder.id,
  name: '角色分工.md', kind: 'role-assignment', mediaType: 'text/markdown',
  currentVersionId: DriveVersionId('version'), tags: ['角色'], createdAt: now, updatedAt: now,
}
const deleted: DriveFile = { ...file, id: DriveFileId('deleted'), name: '旧协议.pdf', mediaType: 'application/pdf', deletedAt: now }
const baseline: DriveBaseline = {
  library: { id: folder.libraryId, title: '资料云盘', createdAt: now, updatedAt: now },
  folders: [folder],
  files: [file, deleted],
}

function client(options: BuddyDriveClientOptions = {}) {
  const api = {
    baseline: vi.fn(async () => ({ ok: true as const, value: baseline })),
    createFolder: vi.fn(async () => ({ ok: true as const, value: { folder } })),
    updateFileMetadata: vi.fn(async () => ({ ok: true as const, value: { file } })),
    deleteFile: vi.fn(async () => ({ ok: true as const, value: { file: deleted } })),
    restoreFile: vi.fn(async () => ({ ok: true as const, value: { file } })),
    purgeFiles: vi.fn(async () => ({ ok: true as const, value: { count: 1 } })),
  }
  const value = new BuddyDriveClient(new Context(), api as never, options)
  value.replace(baseline)
  return { value, api }
}

const t = makeTranslate(zh)

const globalProps = {
  useSessions: (() => undefined) as DriveOverlayProps['useSessions'],
  useSessionPendingInteraction: (() => undefined) as DriveOverlayProps['useSessionPendingInteraction'],
  useWorkspaces: (() => undefined) as DriveOverlayProps['useWorkspaces'],
}

function triggerProps(value: BuddyDriveClient, wide: boolean): DriveTriggerProps {
  return { ...globalProps, wide, client: value, t }
}

function overlayProps(value: BuddyDriveClient): DriveOverlayProps {
  return { ...globalProps, client: value, t }
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('DriveTrigger', () => {
  it('opens and refreshes from wide and rail buttons', async () => {
    const wide = client()
    render(<DriveTrigger {...triggerProps(wide.value, true)} />)
    fireEvent.click(screen.getByRole('button', { name: '资料云盘' }))
    expect(wide.value.source.getSnapshot().open).toBe(true)
    await waitFor(() => { expect(wide.api.baseline).toHaveBeenCalled() })
    expect(screen.getByText('资料云盘')).not.toBeNull()
    cleanup()
    const rail = client()
    vi.spyOn(rail.value, 'refresh').mockRejectedValue(new Error('refresh failed'))
    render(<DriveTrigger {...triggerProps(rail.value, false)} />)
    fireEvent.click(screen.getByRole('button', { name: '资料云盘' }))
    await waitFor(() => { expect(rail.value.source.getSnapshot().error).toBe('refresh failed') })
  })
})

describe('DriveOverlay keyboard boundary', () => {
  it('focuses upload, invokes the hidden input, and wraps first/last focus', async () => {
    const b = client()
    b.value.open()
    render(<DriveOverlay {...overlayProps(b.value)} />)
    const dialog = screen.getByRole('dialog', { name: '资料云盘' })
    const upload = screen.getByRole('button', { name: '上传文件' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const openPicker = vi.spyOn(input, 'click')
    await waitFor(() => { expect(document.activeElement).toBe(upload) })
    fireEvent.click(upload)
    expect(openPicker).toHaveBeenCalledOnce()
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )]
    const second = focusable[1]
    const last = focusable.at(-1)
    if (second === undefined || last === undefined) throw new Error('dialog focus roster is incomplete')

    upload.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(upload)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(upload)
    second.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(b.value.source.getSnapshot().open).toBe(true)
  })

  it('recovers focus entering from outside in both directions and closes on Escape', () => {
    const b = client()
    b.value.open()
    render(<DriveOverlay {...overlayProps(b.value)} />)
    const dialog = screen.getByRole('dialog', { name: '资料云盘' })
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )]
    const first = focusable[0]
    const last = focusable.at(-1)
    if (first === undefined || last === undefined) throw new Error('dialog focus roster is empty')
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    outside.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    outside.remove()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(b.value.source.getSnapshot().open).toBe(false)
  })
})

describe('DriveOverlay', () => {
  it('renders the three-column workspace, searches, selects, previews, classifies, downloads, and deletes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('# 定位安全 Agent'))
    const b = client()
    b.value.open()
    const update = vi.spyOn(b.value, 'updateMetadata').mockResolvedValue()
    const purge = vi.spyOn(b.value, 'purgeFiles').mockResolvedValue()
    render(<DriveOverlay {...overlayProps(b.value)} />)
    expect(screen.getByRole('dialog', { name: '资料云盘' })).not.toBeNull()
    expect(screen.getByText('全部文件')).not.toBeNull()
    fireEvent.click(screen.getByText('角色资料'))
    expect(screen.getByText('角色分工.md')).not.toBeNull()
    fireEvent.change(screen.getByPlaceholderText('搜索文件'), { target: { value: '不存在' } })
    expect(screen.getByText('当前目录还没有文件')).not.toBeNull()
    fireEvent.change(screen.getByPlaceholderText('搜索文件'), { target: { value: '' } })
    fireEvent.click(screen.getByText('角色分工.md'))
    expect(await screen.findByRole('heading', { name: '定位安全 Agent' })).not.toBeNull()
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects.at(-1)!, { target: { value: 'reference' } })
    fireEvent.click(screen.getByRole('button', { name: '保存分类' }))
    await waitFor(() => { expect(update).toHaveBeenCalledWith(file.id, 'reference', ['角色']) })
    expect(screen.getByRole('link', { name: '下载' }).getAttribute('href')).toBe('/api/buddy-drive/content/version')
    fireEvent.click(screen.getAllByRole('button', { name: '永久删除' }).at(-1)!)
    const confirmation = screen.getByRole('dialog', { name: '永久删除文件' })
    fireEvent.click(screen.getByLabelText('我确认永久删除这些文件及其内容'))
    fireEvent.click(confirmation.querySelector('button[data-risk-confirm]') ?? screen.getByRole('button', { name: '确认永久删除' }))
    await waitFor(() => { expect(purge).toHaveBeenCalledWith([file.id]) })
  })

  it('creates a folder, uploads selected files, exposes deleted files, retries, and closes with Escape', async () => {
    const b = client()
    b.value.open()
    const createFolder = vi.spyOn(b.value, 'createFolder').mockResolvedValue()
    const enqueue = vi.spyOn(b.value, 'enqueueUploads').mockReturnValue(['upload-1'])
    render(<DriveOverlay {...overlayProps(b.value)} />)
    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }))
    fireEvent.change(screen.getByPlaceholderText('文件夹名称'), { target: { value: '新目录' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => { expect(createFolder).toHaveBeenCalledWith('新目录', undefined) })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const selected = new File(['# test'], 'test.md', { type: 'text/markdown' })
    fireEvent.change(input, { target: { files: [selected] } })
    expect(enqueue).toHaveBeenCalledWith([{ file: selected, kind: 'general' }])

    fireEvent.click(screen.getByRole('button', { name: '显示已删除文件' }))
    fireEvent.click(screen.getByText('角色资料'))
    expect(screen.getByText('旧协议.pdf')).not.toBeNull()
    fireEvent.click(screen.getByText('旧协议.pdf'))
    expect(screen.getByLabelText('PDF 预览')).not.toBeNull()
    fireEvent.keyDown(screen.getByRole('dialog', { name: '资料云盘' }), { key: 'Escape' })
    expect(b.value.source.getSnapshot().open).toBe(false)
  })

  it('covers nested folders, DOCX details, cancel/blank folder, upload kind, restore, and close button', async () => {
    const b = client()
    const nested = { ...folder, id: DriveFolderId('nested'), parentId: folder.id, name: '子目录' }
    const sibling = { ...folder, id: DriveFolderId('sibling'), name: '其他资料' }
    const docx: DriveFile = {
      ...file, id: DriveFileId('docx'), parentId: nested.id, name: '说明.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', tags: [], deletedAt: now,
    }
    b.value.replace({ ...baseline, folders: [sibling, folder, nested], files: [file, docx] })
    b.value.open()
    const restore = vi.spyOn(b.value, 'restoreFile').mockResolvedValue()
    const enqueue = vi.spyOn(b.value, 'enqueueUploads').mockReturnValue(['upload-1'])
    const close = vi.spyOn(b.value, 'close')
    render(<DriveOverlay {...overlayProps(b.value)} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.click(screen.getByText('全部文件'))
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }))
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'reference' } })
    fireEvent.click(screen.getByText('子目录'))
    fireEvent.click(screen.getByRole('button', { name: '显示已删除文件' }))
    fireEvent.click(screen.getByText('说明.docx'))
    expect(screen.getAllByText('DOCX')).toHaveLength(2)
    expect(screen.getByLabelText('DOCX 预览')).not.toBeNull()
    expect(screen.getByText('—')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    await waitFor(() => { expect(restore).toHaveBeenCalledWith(docx.id) })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const selected = new File(['# x'], 'x.md', { type: 'text/markdown' })
    fireEvent.change(input, { target: { files: [selected] } })
    await waitFor(() => {
      expect(enqueue).toHaveBeenCalledWith([{ file: selected, kind: 'reference', parentId: nested.id }])
    })
    fireEvent.change(input, { target: { files: null } })
    fireEvent.click(screen.getByRole('button', { name: '关闭资料云盘' }))
    expect(close).toHaveBeenCalled()
  })

  it('shows active queue while keeping file selection available and handles non-Error action failures', async () => {
    let resolveUpload!: (value: DriveFile) => void
    const uploadTransport: UploadTransport = () => ({
      promise: new Promise((resolve) => { resolveUpload = resolve }),
      abort: vi.fn(),
    })
    const b = client({ uploadTransport })
    b.value.open()
    b.value.enqueueUploads([{ file: new File(['# x'], 'x.md'), kind: 'general' }])
    const create = vi.spyOn(b.value, 'createFolder').mockRejectedValue('string failure')
    render(<DriveOverlay {...overlayProps(b.value)} />)
    expect(screen.getByRole('region', { name: '上传队列' })).not.toBeNull()
    expect(screen.getByText('上传中')).not.toBeNull()
    const uploadInput = screen.getByLabelText('上传文件')
    if (!(uploadInput instanceof HTMLInputElement)) throw new Error('upload control is not an input')
    expect(uploadInput.disabled).toBe(false)
    expect(screen.getByRole('button', { name: '上传文件' }).textContent).toContain('1')
    resolveUpload(file)
    await waitFor(() => { expect(screen.getByText('已上传')).not.toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }))
    fireEvent.change(screen.getByPlaceholderText('文件夹名称'), { target: { value: '失败目录' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => { expect(create).toHaveBeenCalled() })
    expect((await screen.findByRole('alert')).textContent).toContain('string failure')
  })

  it('renders loading, failure, and operation errors honestly', async () => {
    const b = client()
    b.value.open()
    b.value.failed(new Error('无法连接'))
    const refresh = vi.spyOn(b.value, 'refresh').mockRejectedValue(new Error('仍然失败'))
    const view = render(<DriveOverlay {...overlayProps(b.value)} />)
    expect(screen.getByText('无法连接')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(refresh).toHaveBeenCalled() })
    expect((await screen.findByRole('alert')).textContent).toContain('仍然失败')
    view.unmount()

    const loading = new BuddyDriveClient(new Context(), {} as never)
    loading.open()
    render(<DriveOverlay {...overlayProps(loading)} />)
    expect(screen.getByText('正在加载资料云盘…')).not.toBeNull()
  })
})
