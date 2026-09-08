import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { DriveFolderId, DriveLibraryId } from '@sospink/dsh-buddy-drive'
import * as ToolDrive from '../src/index.ts'
import { jsonBytes, utf8Bytes } from '../src/budget.ts'
import { renderDriveList, renderDriveRead, renderDriveSearch } from '../src/render.ts'
import type { DriveListValue, DriveReadValue, DriveSearchValue } from '../src/types.ts'
import { fixtureFile, toolHarness } from './helpers.ts'

const signal = new AbortController().signal
const now = '2026-08-29T00:00:00.000Z'

function text(result: ToolExecutionResult): string {
  const block = result.content[0]
  return block?.type === 'text' ? block.text : JSON.stringify(result.content)
}

async function execute(ctx: Context, name: string, args: unknown): Promise<ToolExecutionResult> {
  return ctx.tools.execute({ signal, callId: ToolCallId(`${name}-call`), name, arguments: args })
}

afterEach(() => { vi.restoreAllMocks() })

describe('Buddy Drive tool registration and config', () => {
  it('registers the three read-only Drive tools plus controlled prototype tools', async () => {
    const secret = 'DO-NOT-INJECT-THIS-DOCUMENT'
    const { ctx } = await toolHarness([fixtureFile({ id: 'role', name: 'role.md', text: secret })])
    expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual([
      'drive_list', 'drive_read', 'drive_search', 'generate_prototype', 'update_prototype',
    ])
    const list = ctx.tools.get('drive_list')!
    const search = ctx.tools.get('drive_search')!
    const read = ctx.tools.get('drive_read')!
    expect(list.isConcurrencySafe?.({})).toBe(true)
    expect(search.isConcurrencySafe?.({ query: 'x' })).toBe(false)
    expect(list.presentCall?.({ kind: 'general' })).toMatchObject({ kind: 'read' })
    expect(search.presentCall?.({ query: 'x' })).toMatchObject({ kind: 'search' })
    expect(read.presentCall?.({ file_id: 'f', version_id: 'v' })).toMatchObject({
      kind: 'read', rawInput: { fileId: 'f', versionId: 'v', startLine: 1 },
    })
    expect(read.presentCall?.({ file_id: 'f', version_id: 'v', start_line: 3 })).toMatchObject({
      rawInput: { startLine: 3 },
    })
    expect(ctx.tools.schemas().flatMap(schema => Object.keys(schema.parameters.properties ?? {}))).not.toContain('path')
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).toContain('untrusted evidence')
    expect(prompt).toContain('No document is loaded automatically')
    expect(prompt).not.toContain(secret)
    await ctx.fiber.dispose()
  })

  it('presents the packaged prototype and validates controlled edits', async () => {
    const { ctx } = await toolHarness([])
    const generated = await execute(ctx, 'generate_prototype', {
      prototype_id: 'zhiyu-city', pages: ['home', 'user-management'], brief: '城市治理工作台',
    })
    expect(generated).toMatchObject({ isError: false })
    expect(!generated.isError && generated.value).toMatchObject({
      prototypeId: 'zhiyu-city', pages: ['home', 'user-management'], brief: '城市治理工作台',
    })
    const updated = await execute(ctx, 'update_prototype', {
      canvas_id: 'canvas-1', operations: [{ type: 'set-text', node_id: 'canvas-title', value: '智御全城' }],
    })
    expect(updated).toMatchObject({ isError: false })
    expect(await execute(ctx, 'generate_prototype', {
      prototype_id: 'zhiyu-city', pages: [], brief: 'x',
    })).toMatchObject({ isError: true })
    expect(await execute(ctx, 'update_prototype', {
      canvas_id: 'canvas-1', operations: [{ type: 'set-color', node_id: 'canvas-accent', value: '' }],
    })).toMatchObject({ isError: true })
    await ctx.fiber.dispose()
  })

  it('resolves defaults and rejects unsafe runtime config values', () => {
    expect(ToolDrive.resolveConfig({})).toMatchObject({ maxListItems: 100, maxReadLines: 200, maxWorkerHeapMb: 128 })
    for (const [field, value] of [
      ['maxCatalogFolders', 0], ['maxCatalogFiles', -1], ['maxListItems', 1.5],
      ['maxSearchFiles', Number.NaN], ['maxSearchResults', Number.MAX_SAFE_INTEGER + 1],
      ['maxQueryBytes', 0], ['maxSnippetBytes', 0], ['maxSourceBytes', 0],
      ['maxExtractTextBytes', 0], ['maxReadLines', 0], ['maxValueBytes', 100],
      ['maxRenderBytes', 100], ['extractionTimeoutMs', 0], ['maxWorkerHeapMb', 8],
    ] as const) {
      expect(() => ToolDrive.resolveConfig({ [field]: value })).toThrow(field)
    }
    expect(() => ToolDrive.resolveConfig({ extractionTimeoutMs: 2_147_483_647, maxSearchFiles: 2 }))
      .toThrow('timer limit')
  })
})

describe('drive_list', () => {
  it('lists current metadata with folder paths, provenance, filters, caps, and bounded render', async () => {
    const folders = [{
      id: DriveFolderId('roles'), libraryId: DriveLibraryId('default'), name: '角色资料',
      createdAt: now, updatedAt: now,
    }]
    const role = fixtureFile({
      id: 'role', name: '角色分工.md', text: '# 角色', parentId: 'roles',
      kind: 'role-assignment', tags: ['定位'],
    })
    const protocol = fixtureFile({ id: 'protocol', name: '协议.md', text: '# 协议', kind: 'safety-protocol' })
    const deleted = fixtureFile({ id: 'deleted', name: '旧.md', text: 'old', deleted: true })
    const { ctx } = await toolHarness([role, protocol, deleted], folders)
    const result = await execute(ctx, 'drive_list', {})
    expect(result.isError).toBe(false)
    const value = !result.isError ? result.value as unknown as DriveListValue : undefined
    expect(value).toMatchObject({ totalFiles: 2, truncated: false })
    expect(value?.files.map(file => [file.name, file.folderPath, file.versionId])).toEqual([
      ['协议.md', '/', 'protocol-v1'], ['角色分工.md', '/角色资料', 'role-v1'],
    ])
    expect(text(result)).toContain('metadata only; document contents were not read')
    expect(text(result)).toContain('File-ID: role')
    expect(jsonBytes(value)).toBeLessThanOrEqual(64 * 1024)
    expect(utf8Bytes(text(result))).toBeLessThanOrEqual(48 * 1024)

    const filtered = await execute(ctx, 'drive_list', { kind: 'role-assignment', max_results: 1 })
    expect(!filtered.isError && (filtered.value as unknown as DriveListValue).files.map(file => file.name))
      .toEqual(['角色分工.md'])
    for (const max_results of [0, 101, 1.5]) {
      expect(await execute(ctx, 'drive_list', { max_results })).toMatchObject({ isError: true })
    }
    await ctx.fiber.dispose()
  })

  it('marks traversal and output caps without emitting partial items', async () => {
    const fixtures = Array.from({ length: 8 }, (_, index) => fixtureFile({
      id: `f${String(index)}`, name: `${String(index)}-${'界'.repeat(20)}.md`, text: 'x',
    }))
    const { ctx } = await toolHarness(fixtures, [], {
      maxCatalogFiles: 3, maxListItems: 8, maxValueBytes: 1_024, maxRenderBytes: 1_024,
    })
    const result = await execute(ctx, 'drive_list', {})
    const value = !result.isError ? result.value as unknown as DriveListValue : undefined
    expect(value?.truncated).toBe(true)
    expect(value?.files.length).toBeLessThanOrEqual(3)
    await ctx.fiber.dispose()
  })
})

describe('drive_search', () => {
  it('finds metadata before reading content and finds bounded content snippets', async () => {
    const meta = fixtureFile({ id: 'meta', name: '低空安全协议.md', text: 'not needed', kind: 'safety-protocol' })
    const content = fixtureFile({ id: 'content', name: '角色.md', text: '第一行\n安全负责人是张三\n第三行', kind: 'role-assignment' })
    const missing = fixtureFile({ id: 'broken', name: 'broken.md', text: 'needle' })
    const { ctx, drive } = await toolHarness([meta, content, missing])
    drive.readFailures.add(missing.version.id)
    const metadata = await execute(ctx, 'drive_search', { query: '低空安全' })
    expect(!metadata.isError && (metadata.value as unknown as DriveSearchValue).hits[0]).toMatchObject({
      fileId: 'meta', match: 'metadata', versionId: 'meta-v1',
    })
    const contentResult = await execute(ctx, 'drive_search', { query: '张三' })
    const value = !contentResult.isError ? contentResult.value as unknown as DriveSearchValue : undefined
    expect(value).toMatchObject({ inspectedFiles: 3, skippedFiles: 1, truncated: false })
    expect(value?.hits[0]).toMatchObject({ fileId: 'content', match: 'content', snippet: '安全负责人是张三' })
    expect(text(contentResult)).toContain('UNTRUSTED DOCUMENT EVIDENCE')
    expect(text(contentResult)).toContain('Use drive_read with the cited File-ID and Version-ID')
    await ctx.fiber.dispose()
  })

  it('validates query/result caps, filters kind, marks scan limits, and propagates cancellation', async () => {
    const fixtures = [
      fixtureFile({ id: 'one', name: 'one.md', text: 'needle', kind: 'general' }),
      fixtureFile({ id: 'two', name: 'two.md', text: 'needle', kind: 'reference' }),
      fixtureFile({ id: 'three', name: 'three.md', text: 'needle', kind: 'reference' }),
    ]
    const { ctx, drive } = await toolHarness(fixtures, [], { maxSearchFiles: 1, maxSearchResults: 1, maxQueryBytes: 4 })
    expect((await execute(ctx, 'drive_search', { query: 'need', kind: 'reference' })).isError).toBe(false)
    const capped = await execute(ctx, 'drive_search', { query: 'need' })
    expect(!capped.isError && (capped.value as unknown as DriveSearchValue).truncated).toBe(true)
    for (const args of [{ query: '' }, { query: '界界' }, { query: 'x', max_results: 0 }, { query: 'x', max_results: 2 }]) {
      expect(await execute(ctx, 'drive_search', args)).toMatchObject({ isError: true })
    }
    const directController = new AbortController()
    drive.beforeRead = () => { directController.abort(new Error('direct cancel')) }
    const definition = ctx.tools.get('drive_search')
    if (definition === undefined) throw new Error('drive_search definition missing')
    await expect(definition.execute({ query: 'need' }, {
      signal: directController.signal,
    } as never)).rejects.toThrow('direct cancel')
    delete drive.beforeRead

    const controller = new AbortController(); controller.abort(new Error('cancel search'))
    await expect(ctx.tools.execute({
      signal: controller.signal, callId: ToolCallId('cancel'), name: 'drive_search', arguments: { query: 'x' },
    })).resolves.toMatchObject({ isError: true })
    drive.readFailures.clear()
    const activeController = new AbortController()
    drive.beforeRead = () => { activeController.abort(new Error('cancel during read')) }
    const active = await ctx.tools.execute({
      signal: activeController.signal, callId: ToolCallId('active-cancel'),
      name: 'drive_search', arguments: { query: 'needle' },
    })
    expect(active).toMatchObject({ isError: true })
    await ctx.fiber.dispose()
  })
})

describe('drive_read', () => {
  it('requires exact file/version provenance and returns a replayable untrusted line window', async () => {
    const file = fixtureFile({
      id: 'role', versionId: 'role-v7', name: '角色分工.md', kind: 'role-assignment',
      text: '标题\n安全负责人：张三\n定位负责人：李四\n结束', tags: ['正式'],
    })
    const other = fixtureFile({ id: 'other', name: 'other.md', text: 'other' })
    const deleted = fixtureFile({ id: 'deleted', name: 'deleted.md', text: 'deleted', deleted: true })
    const { ctx } = await toolHarness([file, other, deleted])
    const result = await execute(ctx, 'drive_read', {
      file_id: file.file.id, version_id: file.version.id, start_line: 2, line_count: 2,
    })
    const value = !result.isError ? result.value as unknown as DriveReadValue : undefined
    expect(value).toMatchObject({
      startLine: 2, endLine: 3, totalLines: 4,
      text: '安全负责人：张三\n定位负责人：李四',
      source: { fileId: 'role', versionId: 'role-v7', digest: file.version.digest },
    })
    expect(text(result)).toContain('BEGIN UNTRUSTED DOCUMENT TEXT')
    expect(text(result)).toContain('Version-ID: role-v7')
    expect(text(result)).toContain('安全负责人：张三')
    expect(renderDriveRead(value!)).toBe(text(result))

    for (const args of [
      { file_id: 'missing', version_id: file.version.id },
      { file_id: deleted.file.id, version_id: deleted.version.id },
      { file_id: file.file.id, version_id: 'missing' },
      { file_id: file.file.id, version_id: other.version.id },
      { file_id: file.file.id, version_id: file.version.id, start_line: 0 },
      { file_id: file.file.id, version_id: file.version.id, start_line: 99 },
      { file_id: file.file.id, version_id: file.version.id, line_count: 0 },
      { file_id: file.file.id, version_id: file.version.id, line_count: 201 },
    ]) expect(await execute(ctx, 'drive_read', args)).toMatchObject({ isError: true })
    await ctx.fiber.dispose()
  })

  it('marks extraction/window truncation and keeps render/value within deployment budgets', async () => {
    const file = fixtureFile({ id: 'long', name: 'long.md', text: Array.from({ length: 80 }, (_, i) => `${String(i)} ${'界'.repeat(20)}`).join('\n') })
    const { ctx } = await toolHarness([file], [], { maxReadLines: 80, maxValueBytes: 1_024, maxRenderBytes: 1_024 })
    const result = await execute(ctx, 'drive_read', { file_id: file.file.id, version_id: file.version.id, line_count: 80 })
    const value = !result.isError ? result.value as unknown as DriveReadValue : undefined
    expect(value?.windowTruncated).toBe(true)
    expect(jsonBytes(value)).toBeLessThanOrEqual(1_024)
    expect(utf8Bytes(text(result))).toBeLessThanOrEqual(1_024)
    expect(renderDriveList({ libraryId: 'x', libraryTitle: 'x', files: [], totalFiles: 0, truncated: false })).toContain('metadata only')
    expect(renderDriveSearch({ query: 'x', hits: [], inspectedFiles: 0, totalFiles: 0, skippedFiles: 0, truncated: false })).toContain('UNTRUSTED')
    await ctx.fiber.dispose()
  })
})
