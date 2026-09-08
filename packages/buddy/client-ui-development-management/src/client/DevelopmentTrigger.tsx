import clsx from 'clsx'
import { IconCodeOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DevelopmentManagementClient } from './service.ts'
import css from './DevelopmentTrigger.module.css'

export interface DevelopmentUiInjected { readonly client: DevelopmentManagementClient }
export type DevelopmentTriggerProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'buddy.developmentManagement'> & InjectFace<DevelopmentUiInjected>

/** Sidebar entry for Development Management. */
export function DevelopmentTrigger({ wide, client, t }: DevelopmentTriggerProps) {
  const control = (
    <button type="button" className={clsx(css.trigger, !wide && css.rail)} aria-label={t('trigger')} onClick={(event) => {
      client.open(event.currentTarget)
      void client.refresh().catch((error: unknown) => { client.failed(error) })
    }}>
      <IconCodeOutline16 size={wide ? 16 : 18} />
      {wide && <span>{t('trigger')}</span>}
    </button>
  )
  return wide ? control : <Tooltip label={t('trigger')} side="right" delayMs={500}>{control}</Tooltip>
}
