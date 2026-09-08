/** Dedicated replay-stable tool row for prototype generation and updates. */

import { useEffect } from 'react'
import { IconSparkle16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './PrototypeToolRow.module.css'

export interface PrototypeToolRowInjected { openPrototype(focus: string): void }
type Props = ToolCallViewProps & PropsLocale<'buddy-prototype'> & InjectFace<PrototypeToolRowInjected>

/** Render one prototype tool call with a compact generation status.
 * @param props - Durable tool slice and localized copy.
 * @returns Prototype generation row.
 */
export function PrototypeToolRow({ callId, toolName, block, openPrototype, t }: Props) {
  const settled = 'kind' in block
  const failed = settled && block.isError
  useEffect(() => {
    if (!settled || failed || toolName !== 'generate_prototype') return
    const key = `buddy.prototype.opened.${callId}`
    if (sessionStorage.getItem(key) === '1') return
    sessionStorage.setItem(key, '1')
    openPrototype(callId)
  }, [callId, failed, openPrototype, settled, toolName])
  return (
    <button type="button" className={css.row} data-state={failed ? 'error' : settled ? 'ready' : 'running'} onClick={() => { if (settled && !failed) openPrototype(callId) }}>
      <span className={css.icon}>{failed ? <StateDot state="error" /> : <IconSparkle16 size={15} />}</span>
      <span className={css.title}>{t(toolName === 'generate_prototype' ? 'rowGenerate' : 'rowUpdate')}</span>
      <span className={css.status}>{t(settled ? 'rowReady' : 'rowRunning')}</span>
    </button>
  )
}
