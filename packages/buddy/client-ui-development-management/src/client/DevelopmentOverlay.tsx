import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import {
  Button,
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCloseOutline16,
  IconCodeOutline16,
  IconDownloadOutline16,
  IconFolderClose16,
  IconFolderOpenOutline16,
  IconProjectAddOutline16,
  IconSearchOutline16,
  Menu,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  DevelopmentDiscipline,
  DevelopmentArtifact,
  DevelopmentRole,
  DevelopmentTask,
  DeliveryReview,
} from '@sospink/dsh-buddy-development-management/types'
import type { DevelopmentUiInjected } from './DevelopmentTrigger.tsx'
import type { DevelopmentManagementClient } from './service.ts'
import css from './DevelopmentOverlay.module.css'

export type DevelopmentOverlayProps = PropsRuntime<'shell.overlay'> & PropsLocale<'buddy.developmentManagement'> & InjectFace<DevelopmentUiInjected>

const ROLES = ['product-manager', 'blockchain-architect-engineer', 'algorithm-engineer', 'agent-application-development-engineer'] as const satisfies readonly DevelopmentRole[]
const DISCIPLINES = ['blockchain', 'algorithm', 'agent-application'] as const satisfies readonly DevelopmentDiscipline[]
const ASSIGNEE: Record<DevelopmentDiscipline, Exclude<DevelopmentRole, 'product-manager'>> = {
  blockchain: 'blockchain-architect-engineer', algorithm: 'algorithm-engineer', 'agent-application': 'agent-application-development-engineer',
}

function requirementHint(role: DevelopmentRole, t: DevelopmentOverlayProps['t']): string {
  if (role === 'product-manager') return t('requiredFilesProduct')
  if (role === 'blockchain-architect-engineer') return t('requiredFilesBlockchain')
  if (role === 'algorithm-engineer') return t('requiredFilesAlgorithm')
  return t('requiredFilesAgent')
}

function accepts(role: DevelopmentRole): string | undefined {
  if (role === 'product-manager') return '.png,.pdf,.html,.htm,.md,.txt,.docx'
  return undefined
}

function formatBytes(bytes: number, t: DevelopmentOverlayProps['t']): string {
  if (bytes < 1024) return `${String(bytes)} ${t('unitBytes')}`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} ${t('unitKilobytes')}`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} ${t('unitMegabytes')}`
  return `${(bytes / 1024 ** 3).toFixed(1)} ${t('unitGigabytes')}`
}

interface ArtifactTreeDirectory {
  readonly kind: 'directory'
  readonly path: string
  readonly name: string
  readonly children: readonly ArtifactTreeNode[]
}

interface ArtifactTreeFile {
  readonly kind: 'file'
  readonly path: string
  readonly name: string
  readonly artifact: DevelopmentArtifact
}

type ArtifactTreeNode = ArtifactTreeDirectory | ArtifactTreeFile

interface MutableArtifactDirectory {
  kind: 'directory'
  path: string
  name: string
  children: Map<string, MutableArtifactDirectory | ArtifactTreeFile>
}

function artifactTree(artifacts: readonly DevelopmentArtifact[]): readonly ArtifactTreeNode[] {
  const root: MutableArtifactDirectory = { kind: 'directory', path: '', name: '', children: new Map() }
  for (const artifact of artifacts) {
    const segments = [artifact.rootName, ...artifact.relativePath.split('/')].filter(Boolean)
    if (segments.includes('.git')) continue
    let directory = root
    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join('/')
      const last = index === segments.length - 1
      if (last) {
        directory.children.set(`file:${segment}`, { kind: 'file', path, name: segment, artifact })
        continue
      }
      const key = `directory:${segment}`
      const existing = directory.children.get(key)
      if (existing?.kind === 'directory') {
        directory = existing
      } else {
        const next: MutableArtifactDirectory = { kind: 'directory', path, name: segment, children: new Map() }
        directory.children.set(key, next)
        directory = next
      }
    }
  }
  const freeze = (directory: MutableArtifactDirectory): readonly ArtifactTreeNode[] => [...directory.children.values()]
    .map((node): ArtifactTreeNode => node.kind === 'file'
      ? node
      : { kind: 'directory', path: node.path, name: node.name, children: freeze(node) })
    .sort((left, right) => left.kind === right.kind
      ? left.name.localeCompare(right.name)
      : left.kind === 'directory' ? -1 : 1)
  return freeze(root)
}

function ArtifactTree({ files, client, t }: {
  files: readonly DevelopmentArtifact[]
  client: DevelopmentManagementClient
  t: DevelopmentOverlayProps['t']
}) {
  const tree = useMemo(() => artifactTree(files), [files])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (path: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  const renderNode = (node: ArtifactTreeNode, depth: number) => {
    if (node.kind === 'directory') {
      const closed = collapsed.has(node.path)
      return <div key={node.path} className={css.treeBranch}>
        <button
          type="button"
          className={css.treeDirectory}
          style={{ '--tree-depth': depth } as React.CSSProperties}
          aria-expanded={!closed}
          onClick={() => { toggle(node.path) }}
        >
          <IconChevronRightOutline14 className={clsx(css.treeChevron, !closed && css.treeChevronOpen)} />
          {closed ? <IconFolderClose16 /> : <IconFolderOpenOutline16 />}
          <span>{node.name}</span>
          <small>{t('treeItems', { count: node.children.length })}</small>
        </button>
        {!closed && <div>{node.children.map(child => renderNode(child, depth + 1))}</div>}
      </div>
    }
    const file = node.artifact
    return <a
      key={file.id}
      className={css.treeFile}
      style={{ '--tree-depth': depth } as React.CSSProperties}
      href={client.artifactUrl(file.id)}
      download={file.name}
      title={node.path}
    >
      <IconCodeOutline16 className={css.treeFileIcon} />
      <span>{node.name}</span>
      <small>{t(`role.${file.uploaderRole}`)} · {formatBytes(file.bytes, t)}</small>
      <IconDownloadOutline16 className={css.treeDownload} />
    </a>
  }
  return <div className={css.artifactTree}>{tree.map(node => renderNode(node, 0))}</div>
}

function RoleSelect({ role, busy, t, onSelect }: {
  role: DevelopmentRole
  busy: boolean
  t: DevelopmentOverlayProps['t']
  onSelect: (role: DevelopmentRole) => void
}) {
  const [open, setOpen] = useState(false)
  const label = t(`role.${role}`)
  return (
    <div className={css.roleSelect}>
      <span>{t('role')}</span>
      <Menu
        open={open}
        portal
        dense
        align="end"
        items={ROLES.map(value => ({ id: value, label: t(`role.${value}`) }))}
        selectedId={role}
        onClose={() => { setOpen(false) }}
        onSelect={(value) => {
          setOpen(false)
          onSelect(value as DevelopmentRole)
        }}
        anchor={(
          <button
            type="button"
            className={css.roleButton}
            aria-label={`${t('role')}: ${label}`}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy}
            onClick={() => { setOpen(value => !value) }}
          >
            <span>{label}</span>
            <IconChevronDownOutline14 className={clsx(css.roleChevron, open && css.roleChevronOpen)} />
          </button>
        )}
      />
    </div>
  )
}

/** Full-window development workflow workspace. */
export function DevelopmentOverlay({ client, t }: DevelopmentOverlayProps) {
  const snapshot = useSyncExternalStore(listener => client.source.subscribe(listener), () => client.source.getSnapshot())
  const [selectedId, setSelectedId] = useState<string>()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'unclosed'>('unclosed')
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const dialogRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (!snapshot.open) return
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
    const keyboard = (event: KeyboardEvent): void => { if (event.key === 'Escape') client.close() }
    document.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('keydown', keyboard) }
  }, [client, snapshot.open])

  const role = snapshot.data?.activeRole ?? 'product-manager'
  const tasks = useMemo(() => (snapshot.data?.tasks ?? []).filter((task) => {
    if (search.trim() !== '' && !task.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false
    if (filter === 'mine' && task.assigneeRole !== role) return false
    if (filter === 'unclosed' && ['merged'].includes(task.status)) return false
    return role === 'product-manager' || task.assigneeRole === role
  }).sort((a, b) => b.sequence - a.sequence), [filter, role, search, snapshot.data?.tasks])
  const selected = snapshot.data?.tasks.find(task => task.id === selectedId)

  if (!snapshot.open) return null

  const run = async (operation: () => Promise<void>, success?: string): Promise<void> => {
    setError(undefined)
    try {
      await operation()
      if (success !== undefined) setNotice(success)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section ref={dialogRef} className={css.overlay} role="dialog" aria-modal="true" aria-label={t('title')}>
      <header className={css.header}>
        <div className={css.brand}><span className={css.brandIcon}><IconCodeOutline16 size={18} /></span><div><h1>{t('title')}</h1><p>{t('subtitle')}</p></div></div>
        <div className={css.headerActions}>
          <RoleSelect
            role={role}
            busy={snapshot.busy}
            t={t}
            onSelect={(value) => { void run(() => client.selectRole(value)) }}
          />
          <span className={clsx(css.integration, snapshot.data?.integration.configured && css.connected)}>
            {snapshot.data?.integration.label}
          </span>
          <button type="button" className={css.close} aria-label={t('close')} onClick={() => { client.close() }}><IconCloseOutline16 /></button>
        </div>
      </header>
      {error !== undefined && <Toast text={`${t('error')}: ${error}`} onDone={() => { setError(undefined) }} />}
      {notice !== undefined && <Toast text={notice} icon={<IconCheckOutline16 />} onDone={() => { setNotice(undefined) }} />}
      {snapshot.busy && <div className={css.progress}><span style={{ width: snapshot.uploadProgress > 0 ? `${String(snapshot.uploadProgress)}%` : '38%' }} /></div>}

      {snapshot.data === undefined ? (
        <main className={css.listPage}><div className={css.empty}>{t('loading')}</div></main>
      ) : selected === undefined ? (
        <TaskList tasks={tasks} role={role} search={search} filter={filter} busy={snapshot.busy} t={t}
          onSearch={setSearch} onFilter={setFilter} onOpen={setSelectedId} onCreate={() => { setCreateOpen(true) }} />
      ) : (
        <TaskDetail
          task={selected} role={role} client={client} data={snapshot.data} busy={snapshot.busy} t={t}
          onBack={() => { setSelectedId(undefined) }} run={run}
        />
      )}
      {createOpen && snapshot.data !== undefined
        && <CreateTaskDialog t={t} client={client} onClose={() => { setCreateOpen(false) }} run={run} />}
    </section>
  )
}

function TaskList({ tasks, role, search, filter, busy, t, onSearch, onFilter, onOpen, onCreate }: {
  tasks: readonly DevelopmentTask[]
  role: DevelopmentRole
  search: string
  filter: 'all' | 'mine' | 'unclosed'
  busy: boolean
  t: DevelopmentOverlayProps['t']
  onSearch: (value: string) => void
  onFilter: (value: 'all' | 'mine' | 'unclosed') => void
  onOpen: (value: string) => void
  onCreate: () => void
}) {
  return <main className={css.listPage}>
    <div className={css.toolbar}>
      <div className={css.tabs}>{(['all', 'unclosed', 'mine'] as const).map(value => <button key={value} className={filter === value ? css.activeTab : undefined} onClick={() => { onFilter(value) }}>{t(value)}</button>)}</div>
      <label className={css.search}><IconSearchOutline16 /><input value={search} placeholder={t('search')} onChange={(event) => { onSearch(event.target.value) }} /></label>
      {role === 'product-manager' && <button disabled={busy} className={css.primary} onClick={onCreate}><IconProjectAddOutline16 />{t('create')}</button>}
    </div>
    <div className={css.tableWrap}>
      <table className={css.table}><thead><tr><th>{t('id')}</th><th>{t('name')}</th><th>{t('priority')}</th><th>{t('status')}</th><th>{t('creator')}</th><th>{t('assignee')}</th><th>{t('reviewer')}</th><th>{t('phase')}</th><th>{t('updated')}</th></tr></thead>
        <tbody>{tasks.map(task => <tr key={task.id} onClick={() => { onOpen(task.id) }}><td>#{task.sequence}</td><td><strong>{task.title}</strong><span>{t(`discipline.${task.discipline}`)}</span></td><td><i data-priority={task.priority}>{t('priorityPrefix')}{task.priority}</i></td><td><em data-status={task.status}>{t(`status.${task.status}`)}</em></td><td>{t('role.product-manager')}</td><td>{task.assigneeRole === undefined ? '—' : t(`role.${task.assigneeRole}`)}</td><td>{t('role.product-manager')}</td><td>{task.phase}</td><td>{new Date(task.updatedAt).toLocaleString()}</td></tr>)}</tbody>
      </table>
      {tasks.length === 0 && <div className={css.empty}>{t('empty')}</div>}
    </div>
  </main>
}

function TaskDetail({ task, role, client, data, busy, t, onBack, run }: {
  task: DevelopmentTask
  role: DevelopmentRole
  client: DevelopmentManagementClient
  data: ReturnType<DevelopmentManagementClient['source']['getSnapshot']>['data']
  busy: boolean
  t: DevelopmentOverlayProps['t']
  onBack: () => void
  run: (operation: () => Promise<void>, success?: string) => Promise<void>
}) {
  const files = data?.artifacts.filter(value => value.taskId === task.id) ?? []
  const audit = data?.audit.filter(value => value.taskId === task.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? []
  const review = task.latestReviewId === undefined ? undefined : data?.reviews.find(value => value.id === task.latestReviewId)
  const fileRef = useRef<HTMLInputElement>(null)
  const directoryRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [repoOpen, setRepoOpen] = useState(false)
  const [submitAcceptanceOpen, setSubmitAcceptanceOpen] = useState(false)
  const [reviewAcceptanceOpen, setReviewAcceptanceOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const canUpload = role === 'product-manager' ? ['draft', 'pending-review', 'assigned'].includes(task.status) : role === task.assigneeRole && ['assigned', 'in-progress', 'acceptance-rejected', 'merge-paused'].includes(task.status)

  return <main className={css.detailPage}>
    <div className={css.detailTop}><button className={css.back} onClick={onBack}>← {t('back')}</button><div><span>#{task.sequence}</span><h2>{task.title}</h2></div><em data-status={task.status}>{t(`status.${task.status}`)}</em></div>
    <div className={css.actionBar}>
      {role === 'product-manager' && task.status === 'draft' && <Button variant="primary" disabled={busy} onClick={() => { void run(() => client.submitReview({ taskId: task.id })) }}>{t('submitReview')}</Button>}
      {role === 'product-manager' && task.status === 'pending-review' && <Button variant="primary" disabled={busy} onClick={() => { void run(() => client.assignTask({ taskId: task.id, assigneeRole: ASSIGNEE[task.discipline] })) }}>{t('assign')}</Button>}
      {role === task.assigneeRole && task.status === 'assigned' && <Button variant="primary" disabled={busy} onClick={() => { void run(() => client.startTask({ taskId: task.id })) }}>{t('accept')}</Button>}
      {role === task.assigneeRole && ['in-progress', 'acceptance-rejected'].includes(task.status) && <Button variant="primary" disabled={busy} onClick={() => { setSubmitAcceptanceOpen(true) }}>{t('submitAcceptance')}</Button>}
      {role === 'product-manager' && task.status === 'pending-acceptance' && <Button variant="primary" disabled={busy} onClick={() => { setReviewAcceptanceOpen(true) }}>{t('reviewAcceptance')}</Button>}
      {role === task.assigneeRole && ['assigned', 'in-progress', 'pending-acceptance', 'acceptance-approved', 'acceptance-rejected', 'merge-paused'].includes(task.status) && <Button variant="outline" disabled={busy} onClick={() => { setRepoOpen(true) }}>{t('configureRepo')}</Button>}
      {role === task.assigneeRole && ['acceptance-approved', 'merge-paused'].includes(task.status) && <Button variant="outline" disabled={busy} onClick={() => { void run(() => client.requestDeliveryCheck({ taskId: task.id })) }}>{t('requestCheck')}</Button>}
      {role === task.assigneeRole && task.status === 'pending-delivery-check' && <Button variant="primary" disabled={busy} onClick={() => { void run(() => client.runDeliveryCheck({ taskId: task.id })) }}>{t('runCheck')}</Button>}
      {role === 'product-manager' && task.status === 'awaiting-human-confirmation' && <><input className={css.urlInput} value={manualUrl} placeholder={t('manualMrUrl')} onChange={(event) => { setManualUrl(event.target.value) }} /><Button variant="primary" disabled={busy} onClick={() => { void run(() => client.confirmMergeRequest({ taskId: task.id, ...(manualUrl.trim() === '' ? {} : { manualRemoteUrl: manualUrl.trim() }) })) }}>{t('confirmMr')}</Button></>}
      {role === 'product-manager' && task.status === 'mr-submitted' && <><input className={css.urlInput} value={manualUrl} placeholder={t('manualMergedUrl')} onChange={(event) => { setManualUrl(event.target.value) }} /><Button variant="primary" disabled={busy} onClick={() => { void run(() => client.mergeTask({ taskId: task.id, ...(manualUrl.trim() === '' ? {} : { manualMergedUrl: manualUrl.trim() }) })) }}>{t('markMerged')}</Button></>}
    </div>
    <div className={css.detailGrid}>
      <div className={css.detailMain}>
        <section><h3>{t('description')}</h3><p>{task.description}</p></section>
        <section><h3>{t('acceptance')}</h3><p>{task.acceptanceCriteria}</p></section>
        {(task.acceptanceSubmission !== undefined || task.acceptanceReview !== undefined) && <section className={css.acceptanceResult}>
          <h3>{t('acceptanceResult')}</h3>
          {task.acceptanceSubmission !== undefined && <div><strong>{t('acceptanceSubmission')}</strong><p>{task.acceptanceSubmission.summary}</p><small>{new Date(task.acceptanceSubmission.submittedAt).toLocaleString()}</small></div>}
          {task.acceptanceReview !== undefined && <div data-decision={task.acceptanceReview.decision}><strong>{task.acceptanceReview.decision === 'approve' ? t('acceptanceApproved') : t('acceptanceRejected')}</strong><p>{task.acceptanceReview.comment || t('noReviewComment')}</p><small>{new Date(task.acceptanceReview.reviewedAt).toLocaleString()}</small></div>}
        </section>}
        <section><div className={css.sectionHead}><div><h3>{t('artifacts')}</h3><p>{requirementHint(role, t)}</p></div>{canUpload && <div className={css.uploadActions}><button onClick={() => fileRef.current?.click()}>{t('upload')}</button><button onClick={() => directoryRef.current?.click()}>{t('uploadDirectory')}</button></div>}</div>
          <input ref={fileRef} hidden type="file" multiple {...(accepts(role) === undefined ? {} : { accept: accepts(role) })} onChange={(event) => { const list = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ''; void run(() => client.upload(task.id, role, list)) }} />
          <input ref={directoryRef} hidden type="file" multiple {...{ webkitdirectory: '', directory: '' }} onChange={(event) => { const list = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ''; void run(() => client.upload(task.id, role, list)) }} />
          {files.length === 0
            ? <div className={css.sectionEmpty}>{t('noArtifacts')}</div>
            : <ArtifactTree files={files} client={client} t={t} />}
        </section>
        <ReviewSection review={review} t={t} />
      </div>
      <aside className={css.timeline}><h3>{t('history')}</h3><form onSubmit={(event) => { event.preventDefault(); const value = note.trim(); if (value === '') return; void run(async () => { await client.addNote(task.id, value); setNote('') }) }}><textarea value={note} placeholder={t('notePlaceholder')} onChange={(event) => { setNote(event.target.value) }} /><button disabled={busy}>{t('addNote')}</button></form>{audit.map((event, index) => <div key={event.id} className={css.event}><span>{audit.length - index}</span><p>{event.detail}<small>{new Date(event.createdAt).toLocaleString()} · {event.actorRole === 'delivery-agent' ? t('deliveryAgent') : t(`role.${event.actorRole}`)}</small></p></div>)}</aside>
    </div>
    {repoOpen && <RepositoryDialog task={task} client={client} t={t} run={run} onClose={() => { setRepoOpen(false) }} />}
    {submitAcceptanceOpen && <SubmitAcceptanceDialog
      task={task} files={files} client={client} t={t} run={run}
      onClose={() => { setSubmitAcceptanceOpen(false) }}
    />}
    {reviewAcceptanceOpen && <ReviewAcceptanceDialog
      task={task} client={client} t={t} run={run}
      onClose={() => { setReviewAcceptanceOpen(false) }}
    />}
  </main>
}

function SubmitAcceptanceDialog({ task, files, client, t, run, onClose }: {
  task: DevelopmentTask
  files: readonly DevelopmentArtifact[]
  client: DevelopmentManagementClient
  t: DevelopmentOverlayProps['t']
  run: (operation: () => Promise<void>, success?: string) => Promise<void>
  onClose: () => void
}) {
  const [summary, setSummary] = useState(task.acceptanceSubmission?.summary ?? '')
  const ownFiles = files.filter(file => file.uploaderRole === task.assigneeRole).length
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (summary.trim() === '') return
    void run(async () => {
      await client.submitAcceptance({ taskId: task.id, summary: summary.trim() })
      onClose()
    }, t('acceptanceSubmitted'))
  }
  return <div className={css.modalBackdrop}>
    <form className={css.modal} onSubmit={submit}>
      <div><h2>{t('submitAcceptance')}</h2><button type="button" onClick={onClose}><IconCloseOutline16 /></button></div>
      <div className={css.acceptanceHint}><IconCheckOutline16 /><span>{t('acceptanceFileCount', { count: ownFiles })}</span></div>
      <label>{t('acceptanceSummary')}<textarea required value={summary} placeholder={t('acceptanceSummaryPlaceholder')} onChange={(event) => { setSummary(event.target.value) }} autoFocus /></label>
      <footer><Button type="button" onClick={onClose}>{t('cancel')}</Button><Button type="submit" variant="primary" disabled={ownFiles === 0 || summary.trim() === ''}>{t('submitAcceptance')}</Button></footer>
    </form>
  </div>
}

function ReviewAcceptanceDialog({ task, client, t, run, onClose }: {
  task: DevelopmentTask
  client: DevelopmentManagementClient
  t: DevelopmentOverlayProps['t']
  run: (operation: () => Promise<void>, success?: string) => Promise<void>
  onClose: () => void
}) {
  const [comment, setComment] = useState('')
  const review = (decision: 'approve' | 'reject'): void => {
    if (decision === 'reject' && comment.trim() === '') return
    void run(async () => {
      await client.reviewAcceptance({ taskId: task.id, decision, ...(comment.trim() === '' ? {} : { comment: comment.trim() }) })
      onClose()
    }, decision === 'approve' ? t('acceptanceApprovedNotice') : t('acceptanceRejectedNotice'))
  }
  return <div className={css.modalBackdrop}>
    <div className={css.modal} role="dialog" aria-label={t('reviewAcceptance')}>
      <div><h2>{t('reviewAcceptance')}</h2><button type="button" onClick={onClose}><IconCloseOutline16 /></button></div>
      <div className={css.submissionPreview}><strong>{t('acceptanceSubmission')}</strong><p>{task.acceptanceSubmission?.summary}</p></div>
      <label>{t('reviewComment')}<textarea value={comment} placeholder={t('reviewCommentPlaceholder')} onChange={(event) => { setComment(event.target.value) }} autoFocus /></label>
      <p className={css.reviewHelp}>{t('rejectReasonRequired')}</p>
      <footer><Button type="button" onClick={onClose}>{t('cancel')}</Button><button type="button" className={css.rejectButton} disabled={comment.trim() === ''} onClick={() => { review('reject') }}>{t('rejectAcceptance')}</button><Button type="button" variant="primary" onClick={() => { review('approve') }}>{t('approveAcceptance')}</Button></footer>
    </div>
  </div>
}

function ReviewSection({ review, t }: { review: DeliveryReview | undefined; t: DevelopmentOverlayProps['t'] }) {
  const [copied, setCopied] = useState(false)
  if (review === undefined) return <section><h3>{t('delivery')}</h3><div className={css.sectionEmpty}>{t('noReview')}</div></section>
  return <section className={css.review}><div className={css.reviewTitle}><div><h3>{t('result')}</h3><p>{review.summary}</p></div><strong data-conclusion={review.conclusion}>{review.conclusion === 'recommend-merge' ? t('recommend') : t('pause')}</strong></div>
    <div className={css.reviewGrid}><div><h4>{t('changedFiles')} · {review.changedFiles.length}</h4>{review.changedFiles.map(file => <p key={file.path}><code>{file.status}</code>{file.path}<span>+{file.additions} / -{file.deletions}</span></p>)}</div><div><h4>{t('conflicts')} · {review.suspectedConflicts.length}</h4>{review.suspectedConflicts.map(value => <p key={value.path}><strong>{value.path}</strong>{value.reason}<small>{value.suggestion}</small></p>)}</div></div>
    <div className={css.checks}><h4>{t('checks')}</h4>{review.checks.map(value => <details key={value.command}><summary><span data-check={value.status}>{value.status === 'passed' ? '✓' : value.status === 'failed' ? '×' : '–'}</span><code>{value.command}</code><small>{t('checkMeta', { duration: value.durationMs, exitCode: value.exitCode })}</small></summary><pre>{value.stdout}{value.stderr}</pre></details>)}</div>
    <div className={css.mr}><div><h4>{t('mrDraft')}</h4><button onClick={() => { void navigator.clipboard.writeText(`# ${review.mergeRequest.title}\n\n${review.mergeRequest.description}`).then(() => { setCopied(true) }) }}>{copied ? t('copied') : t('copy')}</button></div><h5>{review.mergeRequest.title}</h5><pre>{review.mergeRequest.description}</pre></div>
  </section>
}

function CreateTaskDialog({ t, client, onClose, run }: { t: DevelopmentOverlayProps['t']; client: DevelopmentManagementClient; onClose: () => void; run: (operation: () => Promise<void>, success?: string) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [discipline, setDiscipline] = useState<DevelopmentDiscipline>('agent-application')
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(2)
  const [description, setDescription] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void run(async () => {
      await client.createTask({ title, discipline, priority, description, acceptanceCriteria: acceptance })
      onClose()
    })
  }
  return <div className={css.modalBackdrop}>
    <form className={css.modal} onSubmit={submit}>
      <div><h2>{t('create')}</h2><button type="button" onClick={onClose}><IconCloseOutline16 /></button></div>
      <label>{t('taskTitle')}<input value={title} onChange={(event) => { setTitle(event.target.value) }} autoFocus /></label>
      <div className={css.formRow}>
        <label>{t('discipline')}<select value={discipline} onChange={(event) => { setDiscipline(event.target.value as DevelopmentDiscipline) }}>
          {DISCIPLINES.map(value => <option key={value} value={value}>{t(`discipline.${value}`)}</option>)}
        </select></label>
        <label>{t('priority')}<select value={priority} onChange={(event) => { setPriority(Number(event.target.value) as 1 | 2 | 3 | 4) }}>
          {[1, 2, 3, 4].map(value => <option key={value} value={value}>{t('priorityValue', { priority: value })}</option>)}
        </select></label>
      </div>
      <label>{t('formDescription')}<textarea value={description} onChange={(event) => { setDescription(event.target.value) }} /></label>
      <label>{t('formAcceptance')}<textarea value={acceptance} onChange={(event) => { setAcceptance(event.target.value) }} /></label>
      <footer><Button type="button" onClick={onClose}>{t('cancel')}</Button><Button type="submit" variant="primary">{t('save')}</Button></footer>
    </form>
  </div>
}

function RepositoryDialog({ task, client, t, run, onClose }: { task: DevelopmentTask; client: DevelopmentManagementClient; t: DevelopmentOverlayProps['t']; run: (operation: () => Promise<void>, success?: string) => Promise<void>; onClose: () => void }) {
  const [path, setPath] = useState(task.repository?.path ?? '')
  const [source, setSource] = useState(task.repository?.sourceRef ?? 'HEAD')
  const [target, setTarget] = useState(task.repository?.targetRef ?? 'main')
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void run(async () => {
      await client.configureDelivery({ taskId: task.id, repositoryPath: path, sourceRef: source, targetRef: target })
      onClose()
    })
  }
  return <div className={css.modalBackdrop}>
    <form className={css.modal} onSubmit={submit}>
      <div><h2>{t('configureRepo')}</h2><button type="button" onClick={onClose}><IconCloseOutline16 /></button></div>
      <label>{t('repositoryPath')}<input value={path} onChange={(event) => { setPath(event.target.value) }} autoFocus /></label>
      <div className={css.formRow}>
        <label>{t('sourceRef')}<input value={source} onChange={(event) => { setSource(event.target.value) }} /></label>
        <label>{t('targetRef')}<input value={target} onChange={(event) => { setTarget(event.target.value) }} /></label>
      </div>
      <footer><Button type="button" onClick={onClose}>{t('cancel')}</Button><Button type="submit" variant="primary">{t('apply')}</Button></footer>
    </form>
  </div>
}
