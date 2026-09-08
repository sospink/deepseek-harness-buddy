/** AppFrame layout-state style contracts that jsdom cannot animate. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')
const declarationText = css.replace(/\/\*[\s\S]*?\*\//g, ' ')

function declarations(selector: string): string[] {
  const escaped = selector.replace(/[.[\]():*+^$\\]/g, '\\$&')
  const rule = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^{}]*)\\}`).exec(declarationText)
  if (rule === null) throw new Error(`AppFrame.module.css has no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

describe('AppFrame.module.css welcome layout', () => {
  it('enters the full-width welcome grid without animating the old sidebar track', () => {
    expect(declarations('.frame:has([data-welcome-landing])')).toEqual(expect.arrayContaining([
      'grid-template-columns: 0 minmax(0, 1fr) 0 !important',
      'transition: none',
    ]))
  })
})
