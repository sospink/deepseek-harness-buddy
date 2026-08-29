/** Real, bounded Markdown source/render preview using the Harness Markdown primitive. */

import { useEffect, useMemo, useState } from 'react'
import { Button, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DriveOverlayProps } from './DriveOverlay.tsx'
import { deactivateMarkdownImages, loadMarkdownSource } from './markdown-preview.ts'
import css from './DriveOverlay.module.css'

type PreviewState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly source: string }
  | { readonly state: 'failed'; readonly message: string }

/** Markdown viewer with rendered/source modes, cancellation, retry, and remote-image deactivation. */
export function MarkdownPreview({ url, t }: { url: string; t: DriveOverlayProps['t'] }) {
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const [revision, setRevision] = useState(0)
  const [preview, setPreview] = useState<PreviewState>({ state: 'loading' })
  const labels = useMemo(() => ({
    code: { copyLabel: t('preview.copy'), copiedLabel: t('preview.copied') },
    footnotes: t('preview.footnotes'),
  }), [t])

  useEffect(() => {
    const controller = new AbortController()
    setPreview({ state: 'loading' })
    void loadMarkdownSource(url, controller.signal).then(
      (source) => { setPreview({ state: 'ready', source }) },
      (error) => {
        if (!controller.signal.aborted) {
          setPreview({ state: 'failed', message: error instanceof Error ? error.message : String(error) })
        }
      },
    )
    return () => { controller.abort() }
  }, [revision, url])

  return (
    <section className={css.preview} aria-label={t('preview.title')}>
      <div className={css.previewToolbar}>
        <div role="group" aria-label={t('preview.mode')}>
          <button type="button" className={mode === 'rendered' ? css.previewModeActive : undefined} onClick={() => { setMode('rendered') }}>
            {t('preview.rendered')}
          </button>
          <button type="button" className={mode === 'source' ? css.previewModeActive : undefined} onClick={() => { setMode('source') }}>
            {t('preview.source')}
          </button>
        </div>
        <span>{t('preview.imagesBlocked')}</span>
      </div>
      <div className={css.previewViewport}>
        {preview.state === 'loading' && <div className={css.previewStatus}>{t('preview.loading')}</div>}
        {preview.state === 'failed' && (
          <div className={css.previewStatus}>
            <span>{t('preview.failed')}</span>
            <small>{preview.message}</small>
            <Button size="sm" variant="outline" onClick={() => { setRevision(value => value + 1) }}>{t('retry')}</Button>
          </div>
        )}
        {preview.state === 'ready' && mode === 'source' && <pre className={css.previewSource}>{preview.source}</pre>}
        {preview.state === 'ready' && mode === 'rendered' && (
          <div className={css.previewMarkdown}><MarkdownText text={deactivateMarkdownImages(preview.source)} labels={labels} /></div>
        )}
      </div>
    </section>
  )
}
