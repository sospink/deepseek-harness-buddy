import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import {
  Button,
  IconArchiveOutline20,
  IconCloseOutline16,
  IconDownloadOutline16,
  IconFolderClose16,
  IconProjectAddOutline16,
  IconSearchOutline16,
  IconTrashOutline16,
  Input,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  DriveFile, DriveFileKind, DriveFolder, DriveFolderId,
} from '@sospink/dsh-buddy-api-drive/types'
import type { BuddyDriveClient } from './service.ts'
import type { DriveUiInjected } from './DriveTrigger.tsx'
import { MarkdownPreview } from './MarkdownPreview.tsx'
import css from './DriveOverlay.module.css'

export type DriveOverlayProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'buddy-drive'> & InjectFace<DriveUiInjected>

const KINDS: readonly DriveFileKind[] = [
  'role-assignment', 'safety-protocol', 'operating-rule', 'reference', 'general',
]

function folderDepth(folder: DriveFolder, byId: ReadonlyMap<DriveFolderId, DriveFolder>): number {
  let depth = 0
  let parent = folder.parentId
  while (parent !== undefined) {
    depth += 1
    parent = byId.get(parent)?.parentId
  }
  return depth
}

function mediaLabel(mediaType: DriveFile['mediaType']): string {
  if (mediaType === 'text/markdown') return 'Markdown'
  if (mediaType === 'application/pdf') return 'PDF'
  return 'DOCX'
}

/** Full-window standalone drive workspace. */
export function DriveOverlay({ client, t }: DriveOverlayProps) {
  const snapshot = useSyncExternalStore(
    listener => client.source.subscribe(listener),
    () => client.source.getSnapshot(),
  )
  const [folderId, setFolderId] = useState<DriveFolderId | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [newFolder, setNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [uploadKind, setUploadKind] = useState<DriveFileKind>('general')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!snapshot.open) return
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') client.close()
    }
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('keydown', escape) }
  }, [client, snapshot.open])

  const data = snapshot.data
  const folderMap = useMemo(() => new Map(data?.folders.map(folder => [folder.id, folder]) ?? []), [data?.folders])
  const folders = useMemo(() => [...(data?.folders ?? [])].sort((left, right) =>
    folderDepth(left, folderMap) - folderDepth(right, folderMap) || left.name.localeCompare(right.name)), [data?.folders, folderMap])
  const files = useMemo(() => (data?.files ?? []).filter(file =>
    file.parentId === folderId
    && (showDeleted || file.deletedAt === undefined)
    && (search.trim() === '' || file.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))),
  [data?.files, folderId, search, showDeleted])
  const selected = data?.files.find(file => file.id === selectedId)

  if (!snapshot.open) return null

  const run = async (operation: () => Promise<void>): Promise<void> => {
    setError(undefined)
    try { await operation() } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className={css.overlay} role="dialog" aria-modal="true" aria-label={t('title')}>
      <header className={css.header}>
        <div>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <div className={css.headerActions}>
          <label className={clsx(css.uploadButton, snapshot.uploading && css.uploadDisabled)}>
            <IconProjectAddOutline16 size={16} />
            <span>{snapshot.uploading ? t('uploading') : t('upload')}</span>
            <input
              className={css.hiddenInput}
              type="file"
              multiple
              disabled={snapshot.uploading}
              aria-label={snapshot.uploading ? t('uploading') : t('upload')}
              accept=".md,.markdown,.pdf,.docx"
              onChange={(event) => {
                const list = [...(event.currentTarget.files ?? [])]
                event.currentTarget.value = ''
                void run(async () => {
                  for (const file of list) {
                    await client.upload({
                      file, kind: uploadKind,
                      ...(folderId === undefined ? {} : { parentId: folderId }),
                    })
                  }
                })
              }}
            />
          </label>
          <button type="button" className={css.close} aria-label={t('close')} onClick={() => { client.close() }}>
            <IconCloseOutline16 size={16} />
          </button>
        </div>
      </header>

      {error !== undefined && <div className={css.error}><strong>{t('error')}</strong><span>{error}</span></div>}

      <div className={css.workspace}>
        <aside className={css.folders}>
          <div className={css.sectionTitle}>
            <span>{t('folders')}</span>
            <button type="button" aria-label={t('newFolder')} onClick={() => { setNewFolder(true) }}>
              <IconProjectAddOutline16 size={16} />
            </button>
          </div>
          {newFolder && (
            <form
              className={css.folderForm}
              onSubmit={(event) => {
                event.preventDefault()
                const name = folderName.trim()
                if (name === '') return
                void run(async () => {
                  await client.createFolder(name, folderId)
                  setFolderName('')
                  setNewFolder(false)
                })
              }}
            >
              <input value={folderName} placeholder={t('folderName')} onChange={(event) => { setFolderName(event.target.value) }} autoFocus />
              <div><button type="submit">{t('create')}</button><button type="button" onClick={() => { setNewFolder(false) }}>{t('cancel')}</button></div>
            </form>
          )}
          <button
            type="button"
            className={clsx(css.folderRow, folderId === undefined && css.active)}
            onClick={() => { setFolderId(undefined); setSelectedId(undefined) }}
          >
            <IconArchiveOutline20 size={16} /><span>{t('root')}</span>
          </button>
          {folders.map(folder => (
            <button
              key={folder.id}
              type="button"
              className={clsx(css.folderRow, folder.id === folderId && css.active)}
              style={{ paddingLeft: 12 + folderDepth(folder, folderMap) * 16 }}
              onClick={() => { setFolderId(folder.id); setSelectedId(undefined) }}
            >
              <IconFolderClose16 size={16} /><span>{folder.name}</span>
            </button>
          ))}
        </aside>

        <main className={css.files}>
          <div className={css.toolbar}>
            <Input icon={<IconSearchOutline16 size={16} />} value={search} placeholder={t('search')} onChange={(event) => { setSearch(event.target.value) }} />
            <select value={uploadKind} aria-label={t('kind')} onChange={(event) => { setUploadKind(event.target.value as DriveFileKind) }}>
              {KINDS.map(kind => <option key={kind} value={kind}>{t(`kind.${kind}`)}</option>)}
            </select>
            <button type="button" onClick={() => { setShowDeleted(value => !value) }}>
              {showDeleted ? t('hideDeleted') : t('showDeleted')}
            </button>
          </div>
          <div className={css.fileList}>
            {snapshot.state === 'loading' && <div className={css.empty}>{t('loading')}</div>}
            {snapshot.state === 'failed' && (
              <div className={css.empty}><span>{snapshot.error}</span><Button size="sm" onClick={() => { void run(() => client.refresh()) }}>{t('retry')}</Button></div>
            )}
            {snapshot.state === 'ready' && files.length === 0 && (
              <div className={css.empty}><strong>{t('empty')}</strong><span>{t('emptyHint')}</span></div>
            )}
            {files.map(file => (
              <button
                key={file.id}
                type="button"
                className={clsx(css.fileRow, selectedId === file.id && css.selected)}
                onClick={() => { setSelectedId(file.id) }}
              >
                <span className={css.fileType}>{mediaLabel(file.mediaType)}</span>
                <span className={css.fileName}>{file.name}</span>
                <span className={css.fileKind}>{t(`kind.${file.kind}`)}</span>
                {file.deletedAt !== undefined && <span className={css.deleted}>{t('deleted')}</span>}
              </button>
            ))}
          </div>
        </main>

        <aside className={css.details}>
          <div className={css.sectionTitle}>{t('details')}</div>
          {selected === undefined ? <div className={css.empty}>{t('selectFile')}</div> : (
            <FileDetails client={client} file={selected} run={run} t={t} />
          )}
        </aside>
      </div>
    </section>
  )
}

function FileDetails({ client, file, run, t }: {
  client: BuddyDriveClient
  file: DriveFile
  run: (operation: () => Promise<void>) => Promise<void>
  t: DriveOverlayProps['t']
}) {
  const [kind, setKind] = useState<DriveFileKind>(file.kind)
  useEffect(() => { setKind(file.kind) }, [file.id, file.kind])
  return (
    <div className={css.detailBody}>
      {file.mediaType === 'text/markdown'
        ? <MarkdownPreview url={client.contentUrl(file)} t={t} />
        : <div className={css.previewPlaceholder}><span>{t('previewPending')}</span></div>}
      <h2>{file.name}</h2>
      <dl>
        <div><dt>{t('fileType')}</dt><dd>{mediaLabel(file.mediaType)}</dd></div>
        <div><dt>{t('updatedAt')}</dt><dd>{new Date(file.updatedAt).toLocaleString()}</dd></div>
        <div><dt>{t('tags')}</dt><dd>{file.tags.join(', ') || '—'}</dd></div>
      </dl>
      <label className={css.kindControl}>
        <span>{t('kind')}</span>
        <select value={kind} onChange={(event) => { setKind(event.target.value as DriveFileKind) }}>
          {KINDS.map(value => <option key={value} value={value}>{t(`kind.${value}`)}</option>)}
        </select>
      </label>
      <Button size="sm" variant="outline" onClick={() => { void run(() => client.updateMetadata(file.id, kind, file.tags)) }}>
        {t('saveKind')}
      </Button>
      <div className={css.detailActions}>
        <a className={css.download} href={client.contentUrl(file)} download={file.name}>
          <IconDownloadOutline16 size={16} />{t('download')}
        </a>
        {file.deletedAt === undefined ? (
          <Button size="sm" variant="ghost" icon={<IconTrashOutline16 size={16} />} onClick={() => { void run(() => client.deleteFile(file.id)) }}>
            {t('delete')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => { void run(() => client.restoreFile(file.id)) }}>{t('restore')}</Button>
        )}
      </div>
    </div>
  )
}
