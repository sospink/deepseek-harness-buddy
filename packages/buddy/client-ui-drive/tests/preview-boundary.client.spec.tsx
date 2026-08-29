// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PreviewBoundary } from '../src/client/PreviewBoundary.tsx'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)
const suppressReactBoundaryError = (event: ErrorEvent): void => { event.preventDefault() }
beforeEach(() => { window.addEventListener('error', suppressReactBoundaryError) })

afterEach(() => { window.removeEventListener('error', suppressReactBoundaryError); cleanup(); vi.restoreAllMocks() })

function Thrower({ failure }: { readonly failure: unknown }): null {
  if (failure !== undefined) throw failure
  return null
}

describe('PreviewBoundary', () => {
  it('contains an Error, retries after recovery, and leaves sibling controls mounted', () => {
    let failure: unknown = new Error('renderer exploded')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(
      <div>
        <PreviewBoundary resetKey="version-one" t={t}><Thrower failure={failure} /></PreviewBoundary>
        <a href="/original" download>下载</a>
      </div>,
    )
    expect(screen.getByText('文档预览发生意外错误')).not.toBeNull()
    expect(screen.getByText('renderer exploded')).not.toBeNull()
    expect(screen.getByRole('link', { name: '下载' })).not.toBeNull()
    failure = undefined
    view.rerender(
      <div>
        <PreviewBoundary resetKey="version-one" t={t}><Thrower failure={failure} /></PreviewBoundary>
        <a href="/original" download>下载</a>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.queryByText('文档预览发生意外错误')).toBeNull()
  })

  it('reports non-Error failures and resets when the immutable version changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(
      <PreviewBoundary resetKey="version-one" t={t}><Thrower failure="string failure" /></PreviewBoundary>,
    )
    expect(screen.getByText('string failure')).not.toBeNull()
    view.rerender(<PreviewBoundary resetKey="version-two" t={t}><Thrower failure={undefined} /></PreviewBoundary>)
    expect(screen.queryByText('string failure')).toBeNull()
  })
})
