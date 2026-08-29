/** Upload queue projection and controls; mutable transport handles stay in the Client service. */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DriveOverlayProps } from './DriveOverlay.tsx'
import type { BuddyDriveClient, DriveUploadItem } from './service.ts'
import css from './DriveOverlay.module.css'

function percent(item: DriveUploadItem): number {
  if (item.total <= 0) return item.status === 'succeeded' ? 100 : 0
  return Math.min(100, Math.round(item.loaded / item.total * 100))
}

function queuePercent(items: readonly DriveUploadItem[]): number {
  const total = items.reduce((sum, item) => sum + item.total, 0)
  if (total <= 0) return items.every(item => item.status === 'succeeded') ? 100 : 0
  const loaded = items.reduce((sum, item) => sum + item.loaded, 0)
  return Math.min(100, Math.round(loaded / total * 100))
}

/** Compact bounded queue with per-item progress and explicit recovery actions. */
export function UploadQueue({ client, items, t }: {
  readonly client: BuddyDriveClient
  readonly items: readonly DriveUploadItem[]
  readonly t: DriveOverlayProps['t']
}) {
  if (items.length === 0) return null
  const active = items.filter(item => item.status === 'queued' || item.status === 'uploading').length
  const done = items.filter(item => item.status === 'succeeded').length
  const clearable = items.some(item => item.status === 'succeeded' || item.status === 'cancelled')
  const overall = queuePercent(items)
  return (
    <section className={css.uploadQueue} aria-label={t('upload.queue')}>
      <div className={css.uploadQueueHeader}>
        <div>
          <strong>{t('upload.queue')}</strong>
          <span>{String(done)} / {String(items.length)} {t('upload.completed')} · {String(active)} {t('upload.active')}</span>
        </div>
        {clearable && <Button size="sm" variant="ghost" onClick={() => { client.clearFinishedUploads() }}>{t('upload.clear')}</Button>}
      </div>
      <progress className={css.uploadOverall} value={overall} max={100} aria-label={t('upload.overall')} />
      <div className={css.uploadRows}>
        {items.map((item) => {
          const progress = percent(item)
          return (
            <div key={item.id} className={css.uploadRow} data-upload-status={item.status}>
              <div className={css.uploadRowMain}>
                <span className={css.uploadName}>{item.name}</span>
                <span className={css.uploadState}>{t(`upload.status.${item.status}`)}</span>
              </div>
              <progress value={progress} max={100} aria-label={`${item.name} ${String(progress)}%`} />
              {item.error === undefined ? null : <small className={css.uploadError}>{item.error}</small>}
              <div className={css.uploadActions}>
                {(item.status === 'queued' || item.status === 'uploading') && (
                  <button type="button" onClick={() => { client.cancelUpload(item.id) }}>
                    {t('upload.cancel')} {item.name}
                  </button>
                )}
                {(item.status === 'failed' || item.status === 'cancelled') && (
                  <button type="button" onClick={() => { client.retryUpload(item.id) }}>
                    {t('upload.retry')} {item.name}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
