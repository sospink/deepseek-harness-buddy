import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DevelopmentManagementError } from '../src/error.ts'
import { digestArtifactFile, DevelopmentManagementStore } from '../src/service.ts'
import type { DevelopmentRole, DevelopmentTask } from '../src/types.ts'

const run = promisify(execFile)
const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(options: { readonly maxFileBytes?: number; readonly maxTaskBytes?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'buddy-development-management-'))
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'buddy-development-repositories-'))
  roots.push(root, repositoryRoot)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  const store = new DevelopmentManagementStore(ctx, {
    root,
    repositoryRoots: [repositoryRoot],
    maxFileBytes: options.maxFileBytes ?? 1024 * 1024,
    maxTaskBytes: options.maxTaskBytes ?? 4 * 1024 * 1024,
    maxCommandOutputBytes: 64 * 1024,
    commandTimeoutMs: 20_000,
    checkCommands: ['git diff --check'],
    integrationProvider: 'none',
  })
  await store.initialize()
  return { ctx, root, repositoryRoot, store }
}

async function createAssignedTask(
  store: DevelopmentManagementStore,
  role: Exclude<DevelopmentRole, 'product-manager'> = 'agent-application-development-engineer',
): Promise<DevelopmentTask> {
  const discipline = role === 'blockchain-architect-engineer' ? 'blockchain' : role === 'algorithm-engineer' ? 'algorithm' : 'agent-application'
  const task = await store.createTask({
    title: '低空告警策略交付', discipline, priority: 1,
    description: '实现告警策略并交付完整工程。', acceptanceCriteria: '代码检查、测试和构建全部通过。',
  })
  await store.submitReview({ taskId: task.id })
  await store.assignTask({ taskId: task.id, assigneeRole: role })
  return task
}

async function upload(
  store: DevelopmentManagementStore,
  taskId: string,
  role: DevelopmentRole,
  relativePath: string,
  body = 'delivery',
) {
  const bytes = Buffer.byteLength(body)
  const transaction = await store.beginUpload({
    taskId, role, rootName: 'repository', relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    mediaType: 'application/octet-stream', declaredBytes: bytes,
  })
  await writeFile(transaction.temporaryPath, body)
  const digest = await digestArtifactFile(transaction.temporaryPath)
  return transaction.commit(digest.digest, digest.bytes)
}

async function approveResults(
  store: DevelopmentManagementStore,
  taskId: string,
  role: Exclude<DevelopmentRole, 'product-manager'> = 'agent-application-development-engineer',
): Promise<void> {
  await store.submitAcceptance({ taskId, summary: '已完成开发、自测和成果文件整理。' })
  await store.selectRole('product-manager')
  await store.reviewAcceptance({ taskId, decision: 'approve', comment: '符合需求验收标准。' })
  await store.selectRole(role)
}

async function repository(root: string): Promise<string> {
  const path = join(root, 'project')
  await run('git', ['init', '-b', 'main', path])
  await run('git', ['-C', path, 'config', 'user.email', 'buddy@example.invalid'])
  await run('git', ['-C', path, 'config', 'user.name', 'Buddy Test'])
  await writeFile(join(path, 'README.md'), '# baseline\n')
  await run('git', ['-C', path, 'add', 'README.md'])
  await run('git', ['-C', path, 'commit', '-m', 'baseline'])
  await run('git', ['-C', path, 'switch', '-c', 'feature/delivery'])
  await writeFile(join(path, 'feature.ts'), 'export const ready = true\n')
  await run('git', ['-C', path, 'add', 'feature.ts'])
  await run('git', ['-C', path, 'commit', '-m', 'delivery'])
  return path
}

async function conflictingRepository(root: string): Promise<string> {
  const path = join(root, 'conflicting-project')
  await run('git', ['init', '-b', 'main', path])
  await run('git', ['-C', path, 'config', 'user.email', 'buddy@example.invalid'])
  await run('git', ['-C', path, 'config', 'user.name', 'Buddy Test'])
  await writeFile(join(path, 'policy.ts'), 'export const threshold = 1\n')
  await run('git', ['-C', path, 'add', 'policy.ts'])
  await run('git', ['-C', path, 'commit', '-m', 'baseline'])
  await run('git', ['-C', path, 'switch', '-c', 'feature/conflict'])
  await writeFile(join(path, 'policy.ts'), 'export const threshold = 2\n')
  await run('git', ['-C', path, 'commit', '-am', 'feature changes policy'])
  await run('git', ['-C', path, 'switch', 'main'])
  await writeFile(join(path, 'policy.ts'), 'export const threshold = 3\n')
  await run('git', ['-C', path, 'commit', '-am', 'main changes policy'])
  await run('git', ['-C', path, 'switch', 'feature/conflict'])
  return path
}

describe('DevelopmentManagementStore', () => {
  it('enforces the role workflow and persists task history across reloads', async () => {
    const { ctx, root, repositoryRoot, store } = await fixture()
    const task = await createAssignedTask(store, 'algorithm-engineer')

    await expect(store.startTask({ taskId: task.id })).rejects.toMatchObject({ code: 'forbidden' })
    await store.selectRole('algorithm-engineer')
    const started = await store.startTask({ taskId: task.id })
    expect(started.status).toBe('in-progress')
    await upload(store, task.id, 'algorithm-engineer', 'models/risk.pt', 'model-weights')

    const reloaded = new DevelopmentManagementStore(ctx, {
      ...store.config, root, repositoryRoots: [repositoryRoot],
    })
    await reloaded.initialize()
    expect(reloaded.baseline()).toMatchObject({
      activeRole: 'algorithm-engineer',
      tasks: [{ id: task.id, status: 'in-progress', assigneeRole: 'algorithm-engineer' }],
      artifacts: [{ taskId: task.id, relativePath: 'models/risk.pt' }],
    })
    expect(reloaded.baseline().audit.map(event => event.action)).toEqual(expect.arrayContaining([
      'task/create', 'task/status/pending-review', 'task/assign', 'task/status/in-progress', 'artifact/upload',
    ]))
    expect(JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))).toMatchObject({ version: 1 })
  })

  it('accepts complete engineering trees while retaining product attachment and quota controls', async () => {
    const { store } = await fixture({ maxFileBytes: 20, maxTaskBytes: 30 })
    const product = await store.createTask({
      title: '原型附件', discipline: 'blockchain', priority: 2,
      description: '上传需求原型。', acceptanceCriteria: '原型可以下载。',
    })
    await expect(upload(store, product.id, 'product-manager', 'malware.exe')).rejects.toMatchObject({ code: 'unsupported-file-type' })
    await expect(upload(store, product.id, 'product-manager', '.git/HEAD')).rejects.toMatchObject({
      code: 'repository-metadata-not-allowed',
    })
    await upload(store, product.id, 'product-manager', 'prototype/index.html', '<main />')
    await store.submitReview({ taskId: product.id })
    await store.assignTask({ taskId: product.id, assigneeRole: 'blockchain-architect-engineer' })
    await store.selectRole('blockchain-architect-engineer')

    await upload(store, product.id, 'blockchain-architect-engineer', 'contracts/Guard.sol', 'contract')
    await upload(store, product.id, 'blockchain-architect-engineer', 'assets/logo.svg', '<svg/>')
    await expect(upload(store, product.id, 'blockchain-architect-engineer', 'weights.bin', 'x'.repeat(21))).rejects.toMatchObject({ code: 'file-too-large' })
    expect(store.baseline().artifacts.map(value => value.relativePath)).toEqual([
      'prototype/index.html', 'contracts/Guard.sol', 'assets/logo.svg',
    ])
  })

  it('gates delivery checks behind durable Product Manager result acceptance and supports return-and-resubmit', async () => {
    const { ctx, root, repositoryRoot, store } = await fixture()
    const task = await createAssignedTask(store, 'algorithm-engineer')
    await store.selectRole('algorithm-engineer')
    await store.startTask({ taskId: task.id })

    await expect(store.submitAcceptance({ taskId: task.id, summary: '已完成。' })).rejects.toMatchObject({ code: 'artifacts-required' })
    await upload(store, task.id, 'algorithm-engineer', 'src/inference.py', 'print("ready")')
    await expect(store.submitAcceptance({ taskId: task.id, summary: '   ' })).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(store.requestDeliveryCheck({ taskId: task.id })).rejects.toMatchObject({ code: 'invalid-status' })

    const submitted = await store.submitAcceptance({ taskId: task.id, summary: '完成低空风险推理链路与单元验证。' })
    expect(submitted).toMatchObject({
      status: 'pending-acceptance',
      acceptanceSubmission: { summary: '完成低空风险推理链路与单元验证。' },
    })
    await store.selectRole('product-manager')
    await expect(store.reviewAcceptance({ taskId: task.id, decision: 'reject' })).rejects.toMatchObject({ code: 'invalid-input' })
    const rejected = await store.reviewAcceptance({ taskId: task.id, decision: 'reject', comment: '补充边界场景验证记录。' })
    expect(rejected).toMatchObject({
      status: 'acceptance-rejected',
      acceptanceReview: { decision: 'reject', comment: '补充边界场景验证记录。' },
    })

    await store.selectRole('algorithm-engineer')
    await upload(store, task.id, 'algorithm-engineer', 'tests/boundary.py', 'assert True')
    await store.submitAcceptance({ taskId: task.id, summary: '已补充边界场景验证并重新提交。' })
    await store.selectRole('product-manager')
    const approved = await store.reviewAcceptance({ taskId: task.id, decision: 'approve', comment: '验证材料齐全，通过。' })
    expect(approved.status).toBe('acceptance-approved')

    const reloaded = new DevelopmentManagementStore(ctx, { ...store.config, root, repositoryRoots: [repositoryRoot] })
    await reloaded.initialize()
    expect(reloaded.baseline().tasks[0]).toMatchObject({
      status: 'acceptance-approved',
      acceptanceSubmission: { summary: '已补充边界场景验证并重新提交。' },
      acceptanceReview: { decision: 'approve', comment: '验证材料齐全，通过。' },
    })
    expect(reloaded.baseline().audit.map(event => event.action)).toEqual(expect.arrayContaining([
      'acceptance/submit', 'acceptance/reject', 'acceptance/approve',
    ]))
  })

  it('accepts the explicit file matrix for every delivery role', async () => {
    const { store } = await fixture()
    const productFiles = await store.createTask({
      title: '产品附件矩阵', discipline: 'agent-application', priority: 2,
      description: '上传需求与原型附件。', acceptanceCriteria: 'PNG、PDF 和 HTML 均可持久化。',
    })
    await upload(store, productFiles.id, 'product-manager', 'requirements/brief.png', 'png')
    await upload(store, productFiles.id, 'product-manager', 'requirements/specification.pdf', 'pdf')
    await upload(store, productFiles.id, 'product-manager', 'prototype/index.html', '<main />')

    const blockchain = await createAssignedTask(store, 'blockchain-architect-engineer')
    await store.selectRole('blockchain-architect-engineer')
    await store.startTask({ taskId: blockchain.id })
    await upload(store, blockchain.id, 'blockchain-architect-engineer', 'contracts/Guard.sol', 'contract')

    await store.selectRole('product-manager')
    const algorithm = await createAssignedTask(store, 'algorithm-engineer')
    await store.selectRole('algorithm-engineer')
    await store.startTask({ taskId: algorithm.id })
    await upload(store, algorithm.id, 'algorithm-engineer', 'src/inference.py', 'print("ready")')
    await upload(store, algorithm.id, 'algorithm-engineer', 'models/risk.pt', 'weights')

    await store.selectRole('product-manager')
    const application = await createAssignedTask(store)
    await store.selectRole('agent-application-development-engineer')
    await store.startTask({ taskId: application.id })
    await upload(store, application.id, 'agent-application-development-engineer', 'frontend/src/App.tsx', 'export default 1')
    await upload(store, application.id, 'agent-application-development-engineer', 'backend/src/main/java/Alert.java', 'class Alert {}')

    expect(store.baseline().artifacts.map(value => value.relativePath)).toEqual(expect.arrayContaining([
      'requirements/brief.png',
      'requirements/specification.pdf',
      'prototype/index.html',
      'contracts/Guard.sol',
      'src/inference.py',
      'models/risk.pt',
      'frontend/src/App.tsx',
      'backend/src/main/java/Alert.java',
    ]))
  })

  it('runs real Git analysis and checks, then keeps both merge transitions behind human evidence', async () => {
    const { repositoryRoot, store } = await fixture()
    const task = await createAssignedTask(store)
    await store.selectRole('agent-application-development-engineer')
    await store.startTask({ taskId: task.id })
    await upload(store, task.id, 'agent-application-development-engineer', 'src/feature.ts')
    const path = await repository(repositoryRoot)
    await store.configureDelivery({ taskId: task.id, repositoryPath: path, sourceRef: 'feature/delivery', targetRef: 'main' })
    await approveResults(store, task.id)
    await store.requestDeliveryCheck({ taskId: task.id })
    const review = await store.runDeliveryCheck({ taskId: task.id })

    expect(review).toMatchObject({
      currentBranch: 'feature/delivery', conclusion: 'recommend-merge',
      mergeRequest: { status: 'draft', sourceRef: 'feature/delivery', targetRef: 'main' },
    })
    expect(review.changedFiles).toContainEqual({ path: 'feature.ts', status: 'A', additions: 1, deletions: 0 })
    expect(review.checks).toContainEqual(expect.objectContaining({ command: 'git diff --check', status: 'passed', exitCode: 0 }))
    expect(store.baseline().tasks[0]?.status).toBe('awaiting-human-confirmation')

    await store.selectRole('product-manager')
    await expect(store.confirmMergeRequest({ taskId: task.id })).rejects.toMatchObject({ code: 'integration-not-configured' })
    expect(store.baseline().tasks[0]?.status).toBe('awaiting-human-confirmation')
    const submitted = await store.confirmMergeRequest({ taskId: task.id, manualRemoteUrl: 'https://git.example/mr/42' })
    expect(submitted.mergeRequest).toMatchObject({ provider: 'manual', status: 'submitted', remoteUrl: 'https://git.example/mr/42' })
    expect(store.baseline().tasks[0]?.status).toBe('mr-submitted')

    await expect(store.mergeTask({ taskId: task.id })).rejects.toMatchObject({ code: 'merge-evidence-required' })
    const merged = await store.mergeTask({ taskId: task.id, manualMergedUrl: 'https://git.example/mr/42' })
    expect(merged.task.status).toBe('merged')
    expect(merged.review.mergeRequest.status).toBe('merged')
  })

  it('pauses merge when a real check fails and never exposes confirmation prematurely', async () => {
    const value = await fixture()
    const store = new DevelopmentManagementStore(value.ctx, { ...value.store.config, checkCommands: ['git diff --check', 'git command-that-does-not-exist'] })
    await store.initialize()
    const task = await createAssignedTask(store)
    await store.selectRole('agent-application-development-engineer')
    await store.startTask({ taskId: task.id })
    await upload(store, task.id, 'agent-application-development-engineer', 'src/index.ts')
    const path = await repository(value.repositoryRoot)
    await store.configureDelivery({ taskId: task.id, repositoryPath: path, sourceRef: 'feature/delivery', targetRef: 'main' })
    await approveResults(store, task.id)
    await store.requestDeliveryCheck({ taskId: task.id })
    const review = await store.runDeliveryCheck({ taskId: task.id })
    expect(review.conclusion).toBe('pause-merge')
    expect(review.checks.some(check => check.status === 'failed')).toBe(true)
    expect(store.baseline().tasks[0]?.status).toBe('merge-paused')
    await store.selectRole('product-manager')
    await expect(store.confirmMergeRequest({ taskId: task.id, manualRemoteUrl: 'https://git.example/mr/blocked' }))
      .rejects.toBeInstanceOf(DevelopmentManagementError)
  })

  it('reports a real dual-branch edit as a suspected conflict with cause and remediation', async () => {
    const { repositoryRoot, store } = await fixture()
    const task = await createAssignedTask(store)
    await store.selectRole('agent-application-development-engineer')
    await store.startTask({ taskId: task.id })
    await upload(store, task.id, 'agent-application-development-engineer', 'src/policy.ts')
    const path = await conflictingRepository(repositoryRoot)
    await store.configureDelivery({ taskId: task.id, repositoryPath: path, sourceRef: 'feature/conflict', targetRef: 'main' })
    await approveResults(store, task.id)
    await store.requestDeliveryCheck({ taskId: task.id })
    const review = await store.runDeliveryCheck({ taskId: task.id })

    expect(review.conclusion).toBe('pause-merge')
    expect(review.suspectedConflicts).toHaveLength(1)
    expect(review.suspectedConflicts[0]?.path).toBe('policy.ts')
    expect(review.suspectedConflicts[0]?.reason).toContain('目标分支与交付分支')
    expect(review.suspectedConflicts[0]?.suggestion).toContain('重新执行测试与构建')
    expect(review.mergeRequest.description).toContain('policy.ts')
    expect(store.baseline().tasks[0]?.status).toBe('merge-paused')
  })

  it('creates and merges a real GitLab MR through the configured HTTP integration', async () => {
    const value = await fixture()
    const task = await createAssignedTask(value.store)
    await value.store.selectRole('agent-application-development-engineer')
    await value.store.startTask({ taskId: task.id })
    await upload(value.store, task.id, 'agent-application-development-engineer', 'src/feature.ts')
    const path = await repository(value.repositoryRoot)
    await value.store.configureDelivery({ taskId: task.id, repositoryPath: path, sourceRef: 'feature/delivery', targetRef: 'main' })
    await approveResults(value.store, task.id)
    await value.store.requestDeliveryCheck({ taskId: task.id })
    await value.store.runDeliveryCheck({ taskId: task.id })

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ iid: 42, web_url: 'https://gitlab.internal/group/project/-/merge_requests/42' }), {
        status: 201, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: 'merged', web_url: 'https://gitlab.internal/group/project/-/merge_requests/42' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const integrated = new DevelopmentManagementStore(value.ctx, {
      ...value.store.config,
      integrationProvider: 'gitlab', integrationBaseUrl: 'https://gitlab.internal',
      integrationProject: 'group/project', integrationToken: 'private-token',
    })
    await integrated.initialize()
    await integrated.selectRole('product-manager')
    const submitted = await integrated.confirmMergeRequest({ taskId: task.id })
    expect(submitted.mergeRequest).toMatchObject({ provider: 'gitlab', status: 'submitted', remoteId: '42' })
    const createCall = fetchMock.mock.calls[0]
    const createUrl = createCall?.[0]
    expect(createUrl instanceof URL ? createUrl.href : createUrl).toBe(
      'https://gitlab.internal/api/v4/projects/group%2Fproject/merge_requests',
    )
    expect(createCall?.[1]?.method).toBe('POST')
    expect(createCall?.[1]?.headers).toMatchObject({ 'private-token': 'private-token' })
    const createBody = createCall?.[1]?.body
    expect(JSON.parse(typeof createBody === 'string' ? createBody : '') as unknown).toMatchObject({
      source_branch: 'feature/delivery', target_branch: 'main', title: '[研发需求 #1] 低空告警策略交付',
    })

    const merged = await integrated.mergeTask({ taskId: task.id })
    expect(merged.task.status).toBe('merged')
    const mergeCall = fetchMock.mock.calls[1]
    const mergeUrl = mergeCall?.[0]
    expect(mergeUrl instanceof URL ? mergeUrl.href : mergeUrl).toBe(
      'https://gitlab.internal/api/v4/projects/group%2Fproject/merge_requests/42/merge',
    )
    expect(mergeCall?.[1]?.method).toBe('PUT')
  })
})
