/** Renderer fault boundary that keeps file metadata and original download controls alive. */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DriveOverlayProps } from './DriveOverlay.tsx'
import css from './DriveOverlay.module.css'

interface PreviewBoundaryProps {
  readonly children: ReactNode
  readonly resetKey: string
  readonly t: DriveOverlayProps['t']
}

interface PreviewBoundaryState {
  readonly error: string | undefined
}

/** Contain an unexpected synchronous viewer failure without taking down file details or download. */
export class PreviewBoundary extends Component<PreviewBoundaryProps, PreviewBoundaryState> {
  override state: PreviewBoundaryState = { error: undefined }

  static getDerivedStateFromError(error: unknown): PreviewBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  override componentDidUpdate(previous: PreviewBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== undefined) {
      this.setState({ error: undefined })
    }
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // The visible fallback is the product-owned report; do not widen this boundary into telemetry.
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children
    return (
      <div className={css.previewStatus} role="status">
        <span>{this.props.t('preview.unexpectedFailed')}</span>
        <small>{this.state.error}</small>
        <Button size="sm" variant="outline" onClick={() => { this.setState({ error: undefined }) }}>
          {this.props.t('retry')}
        </Button>
      </div>
    )
  }
}
