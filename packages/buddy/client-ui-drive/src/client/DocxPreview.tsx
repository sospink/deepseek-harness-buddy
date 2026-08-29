/** Worker-preflighted DOCX preview rendered only inside an opaque-origin sandbox iframe. */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { DriveOverlayProps } from './DriveOverlay.tsx'
import {
  DOCX_PREVIEW_MAX_BYTES,
  DOCX_RENDER_TIMEOUT_MS,
  docxFrameHtml,
  inspectDocxBuffer,
  loadBoundedBytes,
  loadDocxRuntime,
  parseDocxFrameMessage,
  type DocxPreflightResult,
} from './docx-preview.ts'
import css from './DriveOverlay.module.css'

interface DocxFrameState {
  readonly srcDoc: string
  readonly nonce: string
  readonly result: DocxPreflightResult
}

type DocxLoadState =
  | { readonly state: 'loading'; readonly stage: 'download' | 'preflight'; readonly progress?: string }
  | { readonly state: 'frame'; readonly frame: DocxFrameState }
  | { readonly state: 'failed'; readonly message: string }

type DocxRenderState =
  | { readonly state: 'rendering' }
  | { readonly state: 'ready'; readonly pages?: number }

/** Isolated DOCX viewer: parent never receives Word text or rendered DOM. */
export function DocxPreview({ url, t }: { url: string; t: DriveOverlayProps['t'] }) {
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<DocxLoadState>({ state: 'loading', stage: 'download' })
  const [rendering, setRendering] = useState<DocxRenderState>({ state: 'rendering' })
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setView({ state: 'loading', stage: 'download' })
    setRendering({ state: 'rendering' })
    void Promise.all([
      loadBoundedBytes(url, controller.signal, DOCX_PREVIEW_MAX_BYTES),
      loadDocxRuntime(controller.signal),
    ]).then(async ([bytes, runtime]) => {
      setView({ state: 'loading', stage: 'preflight' })
      const transferable = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(transferable).set(bytes)
      const result = await inspectDocxBuffer(transferable, controller.signal, {
        onProgress: (progress) => {
          setView({ state: 'loading', stage: 'preflight', progress: `${String(progress.checked)} / ${String(progress.total)}` })
        },
      })
      if (controller.signal.aborted) return
      const nonce = randomUUID()
      setView({ state: 'frame', frame: { srcDoc: docxFrameHtml(runtime, nonce), nonce, result } })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setView({ state: 'failed', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { controller.abort() }
  }, [revision, url])

  const frame = view.state === 'frame' ? view.frame : undefined
  useEffect(() => {
    if (frame === undefined) return
    let sent = false
    const timeout = setTimeout(() => {
      setView({ state: 'failed', message: 'DOCX rendering timed out.' })
    }, DOCX_RENDER_TIMEOUT_MS)
    const message = (event: MessageEvent<unknown>): void => {
      const iframe = iframeRef.current
      const contentWindow = iframe?.contentWindow
      if (contentWindow === null || contentWindow === undefined || event.source !== contentWindow) return
      const received = parseDocxFrameMessage(event.data, frame.nonce)
      if (received === undefined) return
      if (received.type === 'boot' && !sent) {
        sent = true
        contentWindow.postMessage({
          channel: received.channel, nonce: frame.nonce, type: 'render', buffer: frame.result.buffer,
        }, '*', [frame.result.buffer])
      } else if (received.type === 'ready') {
        clearTimeout(timeout)
        setRendering({ state: 'ready', ...(received.pages === undefined ? {} : { pages: received.pages }) })
      } else if (received.type === 'failure') {
        clearTimeout(timeout)
        setView({ state: 'failed', message: received.message ?? 'DOCX rendering failed.' })
      }
    }
    window.addEventListener('message', message)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('message', message)
    }
  }, [frame])

  return (
    <section className={css.docxPreview} aria-label={t('docx.title')}>
      {view.state === 'loading' && (
        <div className={css.previewStatus}>
          {view.stage === 'download' ? t('docx.loading') : t('docx.inspecting')}
          {view.progress === undefined ? null : <small>{view.progress}</small>}
        </div>
      )}
      {view.state === 'failed' && (
        <div className={css.previewStatus}>
          <span>{t('docx.failed')}</span><small>{view.message}</small>
          <Button size="sm" variant="outline" onClick={() => { setRevision(value => value + 1) }}>{t('retry')}</Button>
        </div>
      )}
      {view.state === 'frame' && (
        <>
          {rendering.state === 'rendering' && <div className={css.docxRendering}>{t('docx.rendering')}</div>}
          {rendering.state === 'ready' && (
            <small className={css.docxSafe}>
              {t('docx.isolated')}{rendering.pages === undefined ? '' : ` · ${String(rendering.pages)} ${t('docx.pages')}`}
            </small>
          )}
          <iframe
            ref={iframeRef}
            className={css.docxFrame}
            sandbox="allow-scripts"
            title={t('docx.frameTitle')}
            srcDoc={view.frame.srcDoc}
          />
        </>
      )}
    </section>
  )
}
