/** ConversationRoot full-canvas state contracts that jsdom cannot animate. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/skeleton/ConversationRoot.module.css', import.meta.url)),
  'utf8',
)
const declarationText = css.replace(/\/\*[\s\S]*?\*\//g, ' ')

function declarations(selector: string): string[] {
  const escaped = selector.replace(/[.[\]():*+^$\\]/g, '\\$&')
  const rule = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^{}]*)\\}`).exec(declarationText)
  if (rule === null) throw new Error(`ConversationRoot.module.css has no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

describe('ConversationRoot.module.css welcome layout', () => {
  it('cancels the blank-session sidebar offset before showing Welcome', () => {
    expect(declarations('.root[data-welcome] .composerHero')).toEqual(expect.arrayContaining([
      'gap: 0',
      'transform: none',
      'transition: none',
    ]))
  })
})
